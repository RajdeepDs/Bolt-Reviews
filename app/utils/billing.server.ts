import { BillingInterval } from "@shopify/shopify-app-react-router/server";

// Plan definitions
export const PLANS = {
  BASIC: {
    name: "Basic",
    key: "basic",
    amount: 4.99,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    reviewLimit: 500,
    trialDays: 0,
  },
  PRO: {
    name: "Pro",
    key: "pro",
    amount: 7.99,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    reviewLimit: 1500,
    trialDays: 0,
  },
  ELITE: {
    name: "Elite",
    key: "elite",
    amount: 12.99,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    reviewLimit: Infinity, // Unlimited
    trialDays: 0,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export type PlanName = (typeof PLANS)[PlanKey]["name"];

// Billing configuration for Shopify
export const BILLING_CONFIG = {
  Basic: {
    amount: PLANS.BASIC.amount,
    currencyCode: PLANS.BASIC.currencyCode,
    interval: PLANS.BASIC.interval,
    trialDays: PLANS.BASIC.trialDays,
  },
  Pro: {
    amount: PLANS.PRO.amount,
    currencyCode: PLANS.PRO.currencyCode,
    interval: PLANS.PRO.interval,
    trialDays: PLANS.PRO.trialDays,
  },
  Elite: {
    amount: PLANS.ELITE.amount,
    currencyCode: PLANS.ELITE.currencyCode,
    interval: PLANS.ELITE.interval,
    trialDays: PLANS.ELITE.trialDays,
  },
};

// Helper to get plan by name
export function getPlanByName(name: string) {
  const planEntry = Object.entries(PLANS).find(
    ([_, plan]) => plan.name.toLowerCase() === name.toLowerCase(),
  );
  return planEntry ? planEntry[1] : null;
}

// Helper to get plan by key
export function getPlanByKey(key: string) {
  const upperKey = key.toUpperCase() as PlanKey;
  return PLANS[upperKey] || null;
}

// Helper to get review limit for a plan
export function getReviewLimitForPlan(planKey: string | null): number {
  if (!planKey) return 0; // No plan = no reviews allowed (development stores are free)
  const plan = getPlanByKey(planKey);
  return plan?.reviewLimit ?? 0;
}

// Check if shop is a development store (has unlimited access for free)
export function isDevelopmentStore(shop: string): boolean {
  // Development stores typically have .myshopify.com domain and specific patterns
  // This is checked via the Shopify API in the actual implementation
  return false; // Will be determined by API call
}

// GraphQL mutation for creating app subscription
export const CREATE_SUBSCRIPTION_MUTATION = `
  mutation appSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $test: Boolean
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      test: $test
    ) {
      appSubscription {
        id
        status
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

// GraphQL query to get current subscription
export const GET_SUBSCRIPTION_QUERY = `
  query getAppSubscription {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        currentPeriodEnd
        test
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
            }
          }
        }
      }
    }
  }
`;

// GraphQL mutation to cancel subscription
export const CANCEL_SUBSCRIPTION_MUTATION = `
  mutation appSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// GraphQL query to check if store is a development store
export const GET_SHOP_INFO_QUERY = `
  query getShopInfo {
    shop {
      plan {
        partnerDevelopment
        displayName
      }
    }
  }
`;
