import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopId = session.shop;

  // Sync app URL to shop metafield in the background
  // This ensures the theme app extension always has the correct URL to fetch from
  admin.graphql(`query { shop { id } }`).then(async (shopResponse: any) => {
    const shopData = await shopResponse.json();
    const shopGid = shopData.data?.shop?.id;
    
    if (shopGid && process.env.SHOPIFY_APP_URL) {
      await admin.graphql(`
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { message }
          }
        }
      `, {
        variables: {
          metafields: [{
            ownerId: shopGid,
            namespace: "bolt_reviews",
            key: "app_url",
            value: process.env.SHOPIFY_APP_URL,
            type: "url"
          }]
        }
      });
    }
  }).catch((e: any) => console.error("Error setting app_url metafield:", e));

  // Get current date boundaries for "this month" stats
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Run all queries in parallel
  const [
    statusCounts,
    overallStats,
    thisMonthCount,
    lastMonthCount,
  ] = await Promise.all([
    // Status counts
    prisma.review.groupBy({
      by: ["status"],
      where: { shopId },
      _count: { status: true },
    }),

    // Overall average rating (all reviews)
    prisma.review.aggregate({
      where: { shopId },
      _avg: { rating: true },
      _count: { id: true },
    }),

    // Reviews this month
    prisma.review.count({
      where: { shopId, createdAt: { gte: startOfMonth } },
    }),

    // Reviews last month
    prisma.review.count({
      where: {
        shopId,
        createdAt: { gte: startOfLastMonth, lt: startOfMonth },
      },
    }),
  ]);

  // Build counts
  const counts = { total: 0, published: 0, pending: 0, rejected: 0 };
  statusCounts.forEach(
    (item: { status: string; _count: { status: number } }) => {
      if (item.status === "pending") counts.pending = item._count.status;
      if (item.status === "published") counts.published = item._count.status;
      if (item.status === "rejected") counts.rejected = item._count.status;
    },
  );
  counts.total = counts.published + counts.pending + counts.rejected;

  // Calculate month-over-month trend
  const monthTrend =
    lastMonthCount > 0
      ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
      : thisMonthCount > 0
        ? 100
        : 0;

  return {
    kpi: {
      averageRating: Number(overallStats._avg.rating ?? 0),
      totalReviews: counts.total,
      publishedReviews: counts.published,
      pendingReviews: counts.pending,
      rejectedReviews: counts.rejected,
      thisMonthReviews: thisMonthCount,
      monthTrend,
    },
  };
};

export default function AnalyticsIndex() {
  const { kpi } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Analytics" inlineSize="base">
      {/* KPI BAR */}
      <s-section accessibilityLabel="KPI bar" padding="none">
        <s-grid gap="none" gridTemplateColumns="1fr 1fr 1fr 1fr">
          <s-box padding="base">
            <s-stack direction="block" gap="small-100">
              <s-text color="subdued">Average Rating</s-text>
              <s-heading>
                {kpi.averageRating > 0
                  ? `${kpi.averageRating.toFixed(1)} ⭐`
                  : "—"}
              </s-heading>
            </s-stack>
          </s-box>
          <div style={{ borderInlineStart: "1px solid var(--s-color-border, #e1e3e5)" }}>
            <s-box padding="base">
              <s-stack direction="block" gap="small-100">
                <s-text color="subdued">Total Reviews</s-text>
                <s-heading>{kpi.totalReviews}</s-heading>
              </s-stack>
            </s-box>
          </div>
          <div style={{ borderInlineStart: "1px solid var(--s-color-border, #e1e3e5)" }}>
            <s-box padding="base">
              <s-stack direction="block" gap="small-100">
                <s-text color="subdued">Pending Reviews</s-text>
                <s-heading>{kpi.pendingReviews}</s-heading>
              </s-stack>
            </s-box>
          </div>
          <div style={{ borderInlineStart: "1px solid var(--s-color-border, #e1e3e5)" }}>
            <s-box padding="base">
              <s-stack direction="block" gap="small-100">
                <s-text color="subdued">This Month</s-text>
                <s-heading>
                  {kpi.thisMonthReviews}
                  {kpi.monthTrend !== 0 && (
                    <s-text color="subdued">
                      {" "}
                      ({kpi.monthTrend > 0 ? "+" : ""}
                      {kpi.monthTrend}%)
                    </s-text>
                  )}
                </s-heading>
              </s-stack>
            </s-box>
          </div>
        </s-grid>
      </s-section>
    </s-page>
  );
}



export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
