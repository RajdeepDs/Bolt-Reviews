import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { CANCEL_SUBSCRIPTION_MUTATION } from "../utils/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Get the current subscription ID from settings
    const settings = await prisma.settings.findUnique({
      where: { shopId: session.shop },
    });

    const subscriptionId = settings?.subscriptionId;

    if (!subscriptionId) {
      return Response.json(
        { error: "No active subscription found" },
        { status: 400 },
      );
    }

    // Cancel the subscription via GraphQL
    const response = await admin.graphql(CANCEL_SUBSCRIPTION_MUTATION, {
      variables: {
        id: subscriptionId,
      },
    });

    const data: any = await response.json();

    if (data.data?.appSubscriptionCancel?.userErrors?.length > 0) {
      const errors = data.data.appSubscriptionCancel.userErrors;
      console.error("Subscription cancellation errors:", errors);
      return Response.json(
        { error: errors[0]?.message || "Failed to cancel subscription" },
        { status: 400 },
      );
    }

    // Update local settings
    await prisma.settings.update({
      where: { shopId: session.shop },
      data: {
        subscriptionStatus: "cancelled",
        subscriptionEndDate: new Date(),
      },
    });

    return Response.json({
      success: true,
      message: "Subscription cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return Response.json(
      { error: "Failed to cancel subscription" },
      { status: 500 },
    );
  }
};
