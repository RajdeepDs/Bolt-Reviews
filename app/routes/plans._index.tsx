import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import DevelopmentStoreBanner from "../components/development-store-banner";
import { GET_SHOP_INFO_QUERY } from "../utils/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const settings = await prisma.settings.findUnique({
    where: { shopId: session.shop },
  });

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

  return {
    shop: session.shop,
    hasActiveSubscription,
    activePlan,
    isDevelopmentStore,
  };
};

export default function PlansIndex() {
  const { shop, hasActiveSubscription, activePlan, isDevelopmentStore } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [loading, setLoading] = useState<string | null>(null);

  const plans = [
    { key: "basic", name: "Basic", reviews: "Up to 500", price: "$4.99/mo" },
    { key: "pro", name: "Pro", reviews: "Up to 1,500", price: "$7.99/mo" },
    { key: "elite", name: "Elite", reviews: "Unlimited", price: "$12.99/mo" },
  ];

  const handleSelectPlan = async (planKey: string) => {
    setLoading(planKey);

    try {
      const formData = new FormData();
      formData.append("plan", planKey);

      const response = await fetch("/api/billing/subscribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.confirmationUrl) {
        // Redirect to Shopify's billing confirmation page
        window.top!.location.href = data.confirmationUrl;
      } else if (data.error) {
        console.error("Error creating subscription:", data.error);
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error selecting plan:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setLoading(null);
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

    setLoading("cancel");

    try {
      const response = await fetch("/api/billing/cancel", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        window.location.reload();
      } else if (data.error) {
        console.error("Error cancelling subscription:", data.error);
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const currentPlan = plans.find((p) => p.key === activePlan);
  const nextPlan = plans.find((p) => p.key !== activePlan) || plans[0];

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
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            }}
          >
            {/* Store Info */}
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
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "16px" }}
                >
                  <div
                    style={{
                      background: hasActiveSubscription ? "#dcfce7" : "#f3f0ff",
                      padding: "12px",
                      borderRadius: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "48px",
                      height: "48px",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M20.59 13.41L13.42 20.58C13.2343 20.766 13.0137 20.9135 12.7709 21.0141C12.5281 21.1148 12.2678 21.1666 12.005 21.1666C11.7422 21.1666 11.4819 21.1148 11.2391 21.0141C10.9963 20.9135 10.7757 20.766 10.59 20.58L2 12V2H12L20.59 10.59C20.9625 10.9647 21.1716 11.4716 21.1716 12C21.1716 12.5284 20.9625 13.0353 20.59 13.41Z"
                        stroke={hasActiveSubscription ? "#16a34a" : "#7c3aed"}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M7 7H7.01"
                        stroke={hasActiveSubscription ? "#16a34a" : "#7c3aed"}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "16px" }}>
                      {hasActiveSubscription && currentPlan
                        ? `${currentPlan.name} Plan`
                        : isDevelopmentStore
                          ? "Development Store"
                          : "No Active Plan"}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: "14px" }}>
                      {hasActiveSubscription && currentPlan
                        ? `${currentPlan.reviews} monthly reviews`
                        : isDevelopmentStore
                          ? "Unlimited monthly reviews (free for dev stores)"
                          : "Subscribe to show reviews on your store"}
                    </div>
                  </div>
                </div>
                {hasActiveSubscription && (
                  <button
                    onClick={handleCancelSubscription}
                    disabled={loading === "cancel"}
                    style={{
                      background: "transparent",
                      border: "1px solid #ef4444",
                      color: "#ef4444",
                      cursor: loading === "cancel" ? "not-allowed" : "pointer",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      opacity: loading === "cancel" ? 0.7 : 1,
                    }}
                  >
                    {loading === "cancel" ? "Cancelling..." : "Cancel Plan"}
                  </button>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "18px" }}>
                  {hasActiveSubscription && currentPlan
                    ? currentPlan.price.replace("/mo", "")
                    : "$0"}
                </div>
                <div
                  style={{
                    color: hasActiveSubscription ? "#16a34a" : "#6b7280",
                    fontSize: "14px",
                  }}
                >
                  {hasActiveSubscription ? "Active subscription" : "per month"}
                </div>
              </div>
            </div>

            {/* Next Plan Highlight - show only if not on highest plan */}
            {(!hasActiveSubscription || activePlan !== "elite") && (
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
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>
                      {hasActiveSubscription
                        ? `Upgrade to: ${activePlan === "basic" ? "Pro" : "Elite"}`
                        : `Recommended: ${nextPlan.name}`}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: "14px" }}>
                      {hasActiveSubscription
                        ? activePlan === "basic"
                          ? "Up to 1,500 monthly reviews"
                          : "Unlimited monthly reviews"
                        : nextPlan.reviews + " monthly reviews"}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "14px" }}>
                      {hasActiveSubscription
                        ? activePlan === "basic"
                          ? "$7.99/mo"
                          : "$12.99/mo"
                        : nextPlan.price}
                    </span>
                    <button
                      onClick={() =>
                        handleSelectPlan(
                          hasActiveSubscription
                            ? activePlan === "basic"
                              ? "pro"
                              : "elite"
                            : nextPlan.key,
                        )
                      }
                      disabled={
                        loading ===
                        (hasActiveSubscription
                          ? activePlan === "basic"
                            ? "pro"
                            : "elite"
                          : nextPlan.key)
                      }
                      style={{
                        background: "#7c3aed",
                        color: "white",
                        border: "none",
                        padding: "10px 20px",
                        borderRadius: "6px",
                        cursor:
                          loading ===
                          (hasActiveSubscription
                            ? activePlan === "basic"
                              ? "pro"
                              : "elite"
                            : nextPlan.key)
                            ? "not-allowed"
                            : "pointer",
                        fontWeight: 500,
                        opacity:
                          loading ===
                          (hasActiveSubscription
                            ? activePlan === "basic"
                              ? "pro"
                              : "elite"
                            : nextPlan.key)
                            ? 0.7
                            : 1,
                      }}
                    >
                      {loading ===
                      (hasActiveSubscription
                        ? activePlan === "basic"
                          ? "pro"
                          : "elite"
                        : nextPlan.key)
                        ? "Processing..."
                        : hasActiveSubscription
                          ? "Upgrade now"
                          : "Subscribe now"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Plans Table */}
            <div
              style={{
                border: "1px solid var(--s-color-border-default, #e3e3e3)",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                }}
              >
                <thead
                  style={{
                    background: "var(--s-color-bg-surface-secondary, #f9fafb)",
                  }}
                >
                  <tr
                    style={{
                      borderBottom: "1px solid var(--s-color-border, #e3e3e3)",
                    }}
                  >
                    <th
                      style={{
                        padding: "12px 16px",
                        fontWeight: "normal",
                        width: "20%",
                        color: "#6b7280",
                        fontSize: "14px",
                      }}
                    >
                      Plan
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontWeight: "normal",
                        width: "35%",
                        color: "#6b7280",
                        fontSize: "14px",
                      }}
                    >
                      Monthly Reviews
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        fontWeight: "normal",
                        width: "25%",
                        color: "#6b7280",
                        fontSize: "14px",
                      }}
                    >
                      Monthly Price
                    </th>
                    <th style={{ padding: "12px 16px", width: "20%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan, index) => {
                    const isCurrentPlan = activePlan === plan.key;
                    const isLoading = loading === plan.key;

                    return (
                      <tr
                        key={plan.name}
                        style={{
                          borderBottom:
                            index < plans.length - 1
                              ? "1px solid var(--s-color-border, #e3e3e3)"
                              : "none",
                          background: isCurrentPlan ? "#f0fdf4" : "transparent",
                        }}
                      >
                        <td style={{ padding: "16px" }}>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: "14px",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            {plan.name}
                            {isCurrentPlan && (
                              <span
                                style={{
                                  background: "#16a34a",
                                  color: "white",
                                  fontSize: "11px",
                                  padding: "2px 8px",
                                  borderRadius: "12px",
                                }}
                              >
                                Current
                              </span>
                            )}
                          </span>
                        </td>
                        <td style={{ padding: "16px" }}>
                          <span style={{ color: "#6b7280", fontSize: "14px" }}>
                            {plan.reviews}
                          </span>
                        </td>
                        <td style={{ padding: "16px" }}>
                          <span style={{ fontWeight: 600, fontSize: "14px" }}>
                            {plan.price}
                          </span>
                        </td>
                        <td style={{ padding: "16px", textAlign: "right" }}>
                          {!isCurrentPlan && (
                            <button
                              onClick={() => handleSelectPlan(plan.key)}
                              disabled={isLoading}
                              style={{
                                background: "transparent",
                                border: "1px solid #d1d5db",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                cursor: isLoading ? "not-allowed" : "pointer",
                                fontSize: "14px",
                                opacity: isLoading ? 0.7 : 1,
                              }}
                            >
                              {isLoading
                                ? "Processing..."
                                : hasActiveSubscription
                                  ? "Switch"
                                  : "Select"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
