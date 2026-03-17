import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

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
    topProducts,
    recentReviews,
  ] = await Promise.all([
    // Status counts
    prisma.review.groupBy({
      by: ["status"],
      where: { shopId },
      _count: { status: true },
    }),

    // Overall average rating
    prisma.review.aggregate({
      where: { shopId, status: "published" },
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

    // Top 5 products by review count
    prisma.product.findMany({
      where: { shopId, reviewCount: { gt: 0 } },
      orderBy: { reviewCount: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        imageUrl: true,
        reviewCount: true,
        averageRating: true,
        _count: {
          select: {
            reviews: {
              where: { status: "pending" },
            },
          },
        },
      },
    }),

    // 10 most recent reviews
    prisma.review.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        product: {
          select: { id: true, title: true, imageUrl: true },
        },
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
      averageRating: overallStats._avg.rating || 0,
      totalReviews: counts.total,
      publishedReviews: counts.published,
      pendingReviews: counts.pending,
      rejectedReviews: counts.rejected,
      thisMonthReviews: thisMonthCount,
      monthTrend,
    },
    topProducts,
    recentReviews,
  };
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export default function DashboardIndex() {
  const { kpi, topProducts, recentReviews } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Dashboard" inlineSize="base">
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

      {/* TOP PRODUCTS */}
      <s-section padding="none">
        <s-box padding="small">
          <s-heading>Top Reviewed Products</s-heading>
        </s-box>
        {topProducts.length === 0 ? (
          <s-box padding="large">
            <s-text color="subdued">
              No products with reviews yet. Reviews will appear here once
              customers start leaving feedback.
            </s-text>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header>Avg Rating</s-table-header>
              <s-table-header>Reviews</s-table-header>
              <s-table-header listSlot="secondary">Pending</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {topProducts.map((product: any) => (
                <s-table-row key={product.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      {product.imageUrl ? (
                        <s-thumbnail
                          src={product.imageUrl}
                          alt={product.title}
                          size="small"
                        />
                      ) : (
                        <s-thumbnail alt={product.title} size="small" />
                      )}
                      <s-link href={`/reviews?productId=${product.id}`}>
                        {product.title}
                      </s-link>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>
                      {product.averageRating.toFixed(1)} ⭐
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{product.reviewCount}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {product._count.reviews > 0 ? (
                      <s-badge tone="warning">
                        {product._count.reviews}
                      </s-badge>
                    ) : (
                      <s-text>0</s-text>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {/* RECENT REVIEWS */}
      <s-section padding="none">
        <s-box padding="small">
          <s-heading>Recent Reviews</s-heading>
        </s-box>
        {recentReviews.length === 0 ? (
          <s-box padding="large">
            <s-text color="subdued">
              No reviews yet. Reviews will appear here as customers submit them.
            </s-text>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Customer</s-table-header>
              <s-table-header>Product</s-table-header>
              <s-table-header>Rating</s-table-header>
              <s-table-header>Date</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recentReviews.map((review: any) => (
                <s-table-row key={review.id}>
                  <s-table-cell>
                    <s-link href="/reviews">{review.customerName}</s-link>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      {review.product.imageUrl && (
                        <s-thumbnail
                          src={review.product.imageUrl}
                          alt={review.product.title}
                          size="small"
                        />
                      )}
                      <s-text>{review.product.title}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{"⭐".repeat(review.rating)}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{formatDate(review.createdAt.toString())}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={
                        review.status === "published"
                          ? "success"
                          : review.status === "rejected"
                            ? "critical"
                            : "warning"
                      }
                    >
                      {review.status.charAt(0).toUpperCase() +
                        review.status.slice(1)}
                    </s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return (
    <s-page title="Dashboard">
      <s-box padding="400" background="white" border="1px solid #dfe3e8" borderRadius="200">
        <s-text variant="headingLg" color="critical">Dashboard Unavailable</s-text>
        <div style={{ marginTop: '16px' }}>
          <p>The dashboard failed to load. Please try refreshing.</p>
        </div>
      </s-box>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
