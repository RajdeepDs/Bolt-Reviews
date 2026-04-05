import prisma from "../db.server";
import { PLANS, GET_SHOP_INFO_QUERY } from "./billing.server";

export interface BillingStatus {
  hasActiveSubscription: boolean;
  isDevelopmentStore: boolean;
  activePlan: string | null;
  subscriptionStatus: string;
  canAccessApp: boolean;
  reviewLimit: number;
  reviewsUsed: number;
  isOverLimit: boolean;
}

/**
 * Check if a shop has billing access and get their subscription status
 */
export async function getBillingStatus(
  shopId: string,
  admin: any,
): Promise<BillingStatus> {
  // Get settings from database
  const settings = await prisma.settings.findUnique({
    where: { shopId },
  });

  // Check if this is a development store
  let isDevelopmentStore = false;
  try {
    const response = await admin.graphql(GET_SHOP_INFO_QUERY);
    const data: any = await response.json();
    isDevelopmentStore = data.data?.shop?.plan?.partnerDevelopment === true;
  } catch (error) {
    console.error("Error checking shop plan:", error);
  }

  const hasActiveSubscription = settings?.subscriptionStatus === "active";
  const activePlan = settings?.activePlan || null;
  const subscriptionStatus = settings?.subscriptionStatus || "none";

  // Determine review limit based on plan
  let reviewLimit = 0;
  if (isDevelopmentStore) {
    reviewLimit = Infinity;
  } else if (activePlan) {
    const planKey = activePlan.toUpperCase() as keyof typeof PLANS;
    reviewLimit = PLANS[planKey]?.reviewLimit ?? 0;
  }

  // Count reviews used this billing period (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const reviewsUsed = await prisma.review.count({
    where: {
      shopId,
      createdAt: {
        gte: thirtyDaysAgo,
      },
    },
  });

  const isOverLimit = reviewLimit !== Infinity && reviewsUsed >= reviewLimit;

  // Development stores always have access
  // Shops with active subscriptions have access
  const canAccessApp = isDevelopmentStore || hasActiveSubscription;

  return {
    hasActiveSubscription,
    isDevelopmentStore,
    activePlan,
    subscriptionStatus,
    canAccessApp,
    reviewLimit: reviewLimit === Infinity ? -1 : reviewLimit, // -1 indicates unlimited
    reviewsUsed,
    isOverLimit,
  };
}

/**
 * Check if a shop can add more reviews based on their plan
 */
export async function canAddReview(
  shopId: string,
  admin: any,
): Promise<{ allowed: boolean; reason?: string }> {
  const status = await getBillingStatus(shopId, admin);

  if (status.isDevelopmentStore) {
    return { allowed: true };
  }

  if (!status.hasActiveSubscription) {
    return {
      allowed: false,
      reason:
        "No active subscription. Please subscribe to a plan to add reviews.",
    };
  }

  if (status.isOverLimit) {
    return {
      allowed: false,
      reason: `You have reached your monthly review limit of ${status.reviewLimit}. Please upgrade your plan.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if reviews should be visible on the storefront
 * Reviews are hidden if:
 * - Shop is not a development store AND
 * - Shop has no active subscription
 */
export async function shouldShowReviews(
  shopId: string,
  admin: any,
): Promise<boolean> {
  const status = await getBillingStatus(shopId, admin);
  return status.canAccessApp;
}

/**
 * Get the remaining reviews for a shop in the current billing period
 */
export async function getRemainingReviews(
  shopId: string,
  admin: any,
): Promise<number> {
  const status = await getBillingStatus(shopId, admin);

  if (status.reviewLimit === -1) {
    return -1; // Unlimited
  }

  return Math.max(0, status.reviewLimit - status.reviewsUsed);
}
