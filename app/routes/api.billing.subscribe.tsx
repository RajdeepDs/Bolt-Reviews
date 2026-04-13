import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { PLANS, CREATE_SUBSCRIPTION_MUTATION } from "../utils/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const planKey = formData.get("plan") as string;

  if (!planKey) {
    return Response.json({ error: "Plan is required" }, { status: 400 });
  }

  const upperPlanKey = planKey.toUpperCase() as keyof typeof PLANS;
  const plan = PLANS[upperPlanKey];

  if (!plan) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Build the return URL for after subscription confirmation
  // Must redirect back to the embedded Shopify Admin URL, not the raw app URL, 
  // otherwise we lose the iframe context and trigger an auth redirect loop
  const returnUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/plans?billing_callback=true&plan=${planKey}`;

  try {
    // Check if this is a development store
    const shopInfoResponse = await admin.graphql(`
      query getShopInfo {
        shop {
          plan {
            partnerDevelopment
            displayName
          }
        }
      }
    `);

    const shopInfoData: any = await shopInfoResponse.json();
    const isDevStore =
      shopInfoData.data?.shop?.plan?.partnerDevelopment === true;

    // Create the subscription via GraphQL
    const response = await admin.graphql(CREATE_SUBSCRIPTION_MUTATION, {
      variables: {
        name: plan.name,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: plan.amount,
                  currencyCode: plan.currencyCode,
                },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
        returnUrl,
        test: isDevStore, // Use test mode for development stores
      },
    });

    const data: any = await response.json();

    if (data.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      const errors = data.data.appSubscriptionCreate.userErrors;
      console.error("Subscription creation errors:", errors);
      return Response.json(
        { error: errors[0]?.message || "Failed to create subscription" },
        { status: 400 },
      );
    }

    const confirmationUrl = data.data?.appSubscriptionCreate?.confirmationUrl;

    if (!confirmationUrl) {
      console.error("No confirmation URL returned:", data);
      return Response.json(
        { error: "Failed to create subscription - no confirmation URL" },
        { status: 500 },
      );
    }

    // Return the confirmation URL for the frontend to redirect to
    return Response.json({ confirmationUrl });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return Response.json(
      { error: "Failed to create subscription" },
      { status: 500 },
    );
  }
};
