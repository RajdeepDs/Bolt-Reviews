import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { GET_SUBSCRIPTION_QUERY } from "../utils/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");
  const chargeId = url.searchParams.get("charge_id");

  try {
    // Query the current subscription status from Shopify
    const response = await admin.graphql(GET_SUBSCRIPTION_QUERY);
    const data: any = await response.json();

    const activeSubscriptions =
      data.data?.currentAppInstallation?.activeSubscriptions || [];

    // Find the most recent active subscription
    const activeSubscription = activeSubscriptions.find(
      (sub: any) => sub.status === "ACTIVE",
    );

    if (activeSubscription) {
      // Update the settings with the subscription info
      await prisma.settings.update({
        where: { shopId: session.shop },
        data: {
          activePlan: activeSubscription.name.toLowerCase(),
          subscriptionStatus: "active",
          subscriptionId: activeSubscription.id,
          subscriptionStartDate: new Date(),
          subscriptionEndDate: activeSubscription.currentPeriodEnd
            ? new Date(activeSubscription.currentPeriodEnd)
            : null,
        },
      });

      console.log(
        `✅ Subscription activated for ${session.shop}: ${activeSubscription.name}`,
      );
    } else {
      // Check if subscription was declined
      const pendingOrDeclined = activeSubscriptions.find(
        (sub: any) => sub.status === "PENDING" || sub.status === "DECLINED",
      );

      if (pendingOrDeclined) {
        console.log(
          `⚠️ Subscription ${pendingOrDeclined.status} for ${session.shop}`,
        );
      }
    }
  } catch (error) {
    console.error("Error processing billing callback:", error);
  }

  // Redirect back to the plans page
  return redirect("/plans");
};
