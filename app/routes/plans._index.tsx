import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import DevelopmentStoreBanner from "../components/development-store-banner";
import {
  GET_SHOP_INFO_QUERY,
  GET_SUBSCRIPTION_QUERY,
} from "../utils/billing.server";
import { Button, DataTable, ProgressBar, Icon } from "@shopify/polaris";
import { DiscountIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  // Check if this is a billing callback
  const isBillingCallback = url.searchParams.get("billing_callback") === "true";
  const callbackPlan = url.searchParams.get("plan");

  let settings = await prisma.settings.findUnique({
    where: { shopId: session.shop },
  });

  // If this is a billing callback, check and update subscription status
  if (isBillingCallback) {
    try {
      const response = await admin.graphql(GET_SUBSCRIPTION_QUERY);
      const data: any = await response.json();

      const activeSubscriptions =
        data.data?.currentAppInstallation?.activeSubscriptions || [];

      const activeSubscription = activeSubscriptions.find(
        (sub: any) => sub.status === "ACTIVE",
      );

      if (activeSubscription) {
        // Update the settings with the subscription info
        settings = await prisma.settings.update({
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
      }
    } catch (error) {
      console.error("Error processing billing callback:", error);
    }
  }

  // Check if user has an active subscription
  const hasActiveSubscription = settings?.subscriptionStatus === "active";
  const activePlan = settings?.activePlan || null;

  // Check if this is a development store
  let isDevelopmentStore = false;
  try {
    const response = await admin.graphql(GET_SHOP_INFO_QUERY);
    const data: any = await response.json();
    isDevelopmentStore = data.data?.shop?.plan?.partnerDevelopment === true;
  } catch (error) {
    console.error("Error checking shop plan:", error);
  }

  // Count reviews used this billing period (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const reviewsUsed = await prisma.review.count({
    where: {
      shopId: session.shop,
      createdAt: {
        gte: thirtyDaysAgo,
      },
    },
  });

  // Calculate reset date (next month's 1st)
  const now = new Date();
  const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const resetDateStr = resetDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return {
    shop: session.shop,
    hasActiveSubscription,
    activePlan,
    isDevelopmentStore,
    reviewsUsed,
    resetDateStr,
  };
};

export default function PlansIndex() {
  const {
    hasActiveSubscription,
    activePlan,
    isDevelopmentStore,
    reviewsUsed,
    resetDateStr,
  } = useLoaderData<typeof loader>();

  const [showAllPlans, setShowAllPlans] = useState(true);

  const plans = [
    {
      key: "basic",
      name: "Basic",
      reviews: "Up to 50",
      reviewLimit: 50,
      price: "$4.99/mo",
    },
    {
      key: "pro",
      name: "Pro",
      reviews: "Up to 500",
      reviewLimit: 500,
      price: "$7.99/mo",
    },
    {
      key: "elite",
      name: "Elite",
      reviews: "Unlimited",
      reviewLimit: Infinity,
      price: "$12.99/mo",
    },
  ];

  const handleSelectPlan = async (planKey: string) => {
    try {
      const formData = new FormData();
      formData.append("plan", planKey);

      const response = await fetch("/api/billing/subscribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.confirmationUrl) {
        window.top!.location.href = data.confirmationUrl;
      } else if (data.error) {
        console.error("Error creating subscription:", data.error);
      }
    } catch (error) {
      console.error("Error selecting plan:", error);
    }
  };

  const handleCancelSubscription = async () => {
    if (
      !confirm(
        "Are you sure you want to cancel your subscription? Your reviews will be hidden when your store is live.",
      )
    ) {
      return;
    }

    try {
      const response = await fetch("/api/billing/cancel", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        window.location.reload();
      } else if (data.error) {
        console.error("Error cancelling subscription:", data.error);
      }
    } catch (error) {
      console.error("Error cancelling subscription:", error);
    }
  };

  const currentPlan = plans.find((p) => p.key === activePlan);
  const nextPlan = !hasActiveSubscription
    ? plans[0]
    : activePlan === "basic"
      ? plans[1]
      : activePlan === "pro"
        ? plans[2]
        : null;

  // Calculate progress for current plan
  const currentLimit =
    currentPlan?.reviewLimit || (isDevelopmentStore ? Infinity : 0);
  const progressPercent =
    currentLimit === Infinity
      ? 0
      : Math.min(100, (reviewsUsed / currentLimit) * 100);

  // Format current cost
  const currentCost =
    hasActiveSubscription && currentPlan
      ? currentPlan.price.replace("/mo", "")
      : "$0";

  // Table rows for plans
  const tableRows = plans.map((plan) => {
    const isCurrentPlan = activePlan === plan.key;
    return [
      <span
        key={`name-${plan.key}`}
        style={{ fontWeight: isCurrentPlan ? 600 : 400 }}
      >
        {plan.name}
        {isCurrentPlan && (
          <span
            style={{
              marginLeft: "8px",
              background: "#e3f1df",
              color: "#1a7f37",
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "10px",
              fontWeight: 500,
            }}
          >
            Current
          </span>
        )}
      </span>,
      plan.reviews,
      plan.price,
      <div key={`action-${plan.key}`} style={{ textAlign: "right" }}>
        {!isCurrentPlan && (
          <Button onClick={() => handleSelectPlan(plan.key)}>
            Select plan
          </Button>
        )}
      </div>,
    ];
  });

  return (
    <>
      <DevelopmentStoreBanner hasActiveSubscription={hasActiveSubscription} />

      <s-page heading="Plan management" inlineSize="small">
        <s-section>
          <div
            style={{
              padding: "24px",
              border: "1px solid var(--s-color-border-default, #e3e3e3)",
              borderRadius: "12px",
              background: "var(--s-color-bg-surface, #fff)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            {/* Current Plan Info */}
            <div
              style={{
                borderBottom:
                  "1px solid var(--s-color-border-default, #e3e3e3)",
                paddingBottom: "20px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "16px" }}
                >
                  <div
                    style={{
                      background: "#f3f0ff",
                      padding: "12px",
                      borderRadius: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "48px",
                      height: "48px",
                    }}
                  >
                    <Icon source={DiscountIcon} tone="base" />
                  </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "18px",
                        color: "#1a1a1a",
                      }}
                    >
                      {hasActiveSubscription && currentPlan
                        ? `${currentPlan.name} Plan`
                        : isDevelopmentStore
                          ? "Development Store (Legacy)"
                          : "No Active Plan"}
                    </div>
                    <div
                      style={{
                        color: "#6b7280",
                        fontSize: "14px",
                        marginTop: "2px",
                      }}
                    >
                      {hasActiveSubscription && currentPlan
                        ? `${currentPlan.reviews} monthly reviews`
                        : isDevelopmentStore
                          ? "Unlimited monthly reviews"
                          : "Subscribe to show reviews"}
                    </div>
                  </div>
                </div>
                <button
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px",
                    borderRadius: "6px",
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle cx="10" cy="4" r="1.5" fill="#6b7280" />
                    <circle cx="10" cy="10" r="1.5" fill="#6b7280" />
                    <circle cx="10" cy="16" r="1.5" fill="#6b7280" />
                  </svg>
                </button>
              </div>

              {/* Progress Bar */}
              {(hasActiveSubscription || isDevelopmentStore) &&
                currentLimit !== Infinity && (
                  <div style={{ marginTop: "20px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                        fontSize: "13px",
                        color: "#6b7280",
                      }}
                    >
                      <span>
                        {reviewsUsed} of {currentLimit} reviews used
                      </span>
                      <span>{Math.round(progressPercent)}%</span>
                    </div>
                    <ProgressBar progress={progressPercent} size="small" />
                  </div>
                )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "20px",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "20px",
                    color: "#1a1a1a",
                  }}
                >
                  {currentCost}
                </div>
                <div style={{ color: "#5c6ac4", fontSize: "14px" }}>
                  Resets on {resetDateStr}
                </div>
              </div>
            </div>

            {/* Next Plan Recommendation */}
            {nextPlan && (
              <div
                style={{
                  border: "1px solid #e9d5ff",
                  borderRadius: "8px",
                  background: "#faf5ff",
                  padding: "16px 20px",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "14px",
                        color: "#1a1a1a",
                      }}
                    >
                      Next plan: {nextPlan.name}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: "14px" }}>
                      {nextPlan.reviews} monthly reviews
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "14px",
                        color: "#1a1a1a",
                      }}
                    >
                      {nextPlan.price}
                    </span>
                    <Button
                      variant="primary"
                      onClick={() => handleSelectPlan(nextPlan.key)}
                    >
                      Upgrade now
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Toggle to show/hide plans */}
            <div style={{ textAlign: "center", margin: "16px 0" }}>
              <button
                onClick={() => setShowAllPlans(!showAllPlans)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#5c6ac4",
                  cursor: "pointer",
                  fontSize: "14px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {showAllPlans ? "Hide all plans" : "Show all plans"}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    transform: showAllPlans ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                >
                  <path
                    d="M2.5 4.5L6 8L9.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            {/* Plans Table */}
            {showAllPlans && (
              <div
                style={{
                  border: "1px solid var(--s-color-border-default, #e3e3e3)",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Plan", "Monthly Reviews", "Monthly Price", ""]}
                  rows={tableRows}
                  hoverable
                />
              </div>
            )}

            {/* Cancel subscription option */}
            {hasActiveSubscription && (
              <div style={{ marginTop: "16px", textAlign: "center" }}>
                <button
                  onClick={handleCancelSubscription}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#6b7280",
                    cursor: "pointer",
                    fontSize: "13px",
                    textDecoration: "underline",
                  }}
                >
                  Cancel subscription
                </button>
              </div>
            )}

            {/* Note */}
            <div
              style={{
                marginTop: "16px",
                color: "#6b7280",
                fontSize: "13px",
              }}
            >
              * All plans are billed monthly. No trial periods apply.
              {isDevelopmentStore &&
                " Development stores have free unlimited access."}
            </div>
          </div>
        </s-section>
      </s-page>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
