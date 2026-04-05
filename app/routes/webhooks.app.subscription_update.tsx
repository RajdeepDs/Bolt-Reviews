import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`📬 Received webhook: ${topic} for shop: ${shop}`);

  if (!shop) {
    console.error("No shop in webhook payload");
    return new Response("No shop", { status: 400 });
  }

  try {
    const subscriptionPayload = payload as {
      app_subscription: {
        admin_graphql_api_id: string;
        name: string;
        status: string;
        admin_graphql_api_shop_id: string;
        created_at: string;
        updated_at: string;
        currency: string;
        capped_amount: string | null;
      };
    };

    const subscription = subscriptionPayload.app_subscription;
    const status = subscription.status.toLowerCase();

    console.log(
      `📋 Subscription update for ${shop}: ${subscription.name} - ${status}`,
    );

    // Map Shopify status to our status
    let subscriptionStatus: string;
    let activePlan: string | null = null;

    switch (status) {
      case "active":
        subscriptionStatus = "active";
        activePlan = subscription.name.toLowerCase();
        break;
      case "cancelled":
      case "canceled":
        subscriptionStatus = "cancelled";
        break;
      case "declined":
        subscriptionStatus = "none";
        break;
      case "expired":
        subscriptionStatus = "expired";
        break;
      case "frozen":
        subscriptionStatus = "frozen";
        break;
      case "pending":
        subscriptionStatus = "pending";
        break;
      default:
        subscriptionStatus = status;
    }

    // Update the settings
    await prisma.settings.upsert({
      where: { shopId: shop },
      update: {
        activePlan,
        subscriptionStatus,
        subscriptionId: subscription.admin_graphql_api_id,
        updatedAt: new Date(),
      },
      create: {
        shopId: shop,
        activePlan,
        subscriptionStatus,
        subscriptionId: subscription.admin_graphql_api_id,
        autoPublish: false,
        requireModeration: true,
        allowGuestReviews: true,
        requireVerifiedPurchase: false,
        minRatingToPublish: 1,
        enableReviewImages: true,
        emailNotifications: true,
      },
    });

    console.log(
      `✅ Updated subscription status for ${shop}: ${subscriptionStatus} (plan: ${activePlan})`,
    );

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(`❌ Error processing subscription webhook:`, error);
    return new Response("Error processing webhook", { status: 500 });
  }
};
