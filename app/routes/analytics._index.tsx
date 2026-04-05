import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

import AnalyticsFilterBar from "../components/analytics-filter-bar";
import AnalyticsKpiCards from "../components/analytics-kpi-cards";
import AnalyticsDonutChart from "../components/analytics-donut-chart";
import AnalyticsLineChart from "../components/analytics-line-chart";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopId = session.shop;

  // Sync app URL to shop metafield in the background
  admin
    .graphql(`query { shop { id } }`)
    .then(async (shopResponse: any) => {
      const shopData = await shopResponse.json();
      const shopGid = shopData.data?.shop?.id;

      if (shopGid && process.env.SHOPIFY_APP_URL) {
        await admin.graphql(
          `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors { message }
            }
          }`,
          {
            variables: {
              metafields: [
                {
                  ownerId: shopGid,
                  namespace: "bolt_reviews",
                  key: "app_url",
                  value: process.env.SHOPIFY_APP_URL,
                  type: "url",
                },
              ],
            },
          },
        );
      }
    })
    .catch((e: any) => console.error("Error setting app_url metafield:", e));

  // ── Date ranges (from URL params or default last 30d) ──────
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const now = new Date();
  const periodEnd = toParam ? new Date(toParam + "T23:59:59") : now;
  const periodStart = fromParam
    ? new Date(fromParam + "T00:00:00")
    : new Date(new Date(now).setDate(now.getDate() - 180));

  // Previous period = same duration right before the selected period
  const durationMs = periodEnd.getTime() - periodStart.getTime();
  const prevEnd = new Date(periodStart.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  // ── Parallel queries ────────────────────────────────────────
  const [
    currentPeriodReviews,
    previousPeriodReviews,
    statusCounts,
    publishedCurrent,
    pendingCurrent,
  ] = await Promise.all([
    prisma.review.findMany({
      where: { shopId, createdAt: { gte: periodStart, lte: periodEnd } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.review.findMany({
      where: {
        shopId,
        createdAt: { gte: prevStart, lt: periodStart },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.review.groupBy({
      by: ["status"],
      where: { shopId, createdAt: { gte: periodStart, lte: periodEnd } },
      _count: { status: true },
    }),
    prisma.review.count({
      where: {
        shopId,
        status: "published",
        createdAt: { gte: periodStart },
      },
    }),
    prisma.review.count({
      where: {
        shopId,
        status: "pending",
        createdAt: { gte: periodStart },
      },
    }),
  ]);

  // ── Status distribution ─────────────────────────────────────
  const statuses = { published: 0, pending: 0, rejected: 0 };
  statusCounts.forEach(
    (item: { status: string; _count: { status: number } }) => {
      if (item.status in statuses)
        statuses[item.status as keyof typeof statuses] = item._count.status;
    },
  );

  // ── Daily buckets ───────────────────────────────────────────
  const dailyMap = new Map<string, number>();
  const prevDailyMap = new Map<string, number>();

  for (
    let d = new Date(periodStart);
    d <= periodEnd;
    d.setDate(d.getDate() + 1)
  ) {
    dailyMap.set(d.toISOString().split("T")[0], 0);
  }
  for (
    let d = new Date(prevStart);
    d < new Date(periodStart);
    d.setDate(d.getDate() + 1)
  ) {
    prevDailyMap.set(d.toISOString().split("T")[0], 0);
  }

  currentPeriodReviews.forEach((r: { createdAt: Date }) => {
    const key = new Date(r.createdAt).toISOString().split("T")[0];
    dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
  });
  previousPeriodReviews.forEach((r: { createdAt: Date }) => {
    const key = new Date(r.createdAt).toISOString().split("T")[0];
    prevDailyMap.set(key, (prevDailyMap.get(key) || 0) + 1);
  });

  const currentTotal = currentPeriodReviews.length;
  const publishRate =
    currentTotal > 0 ? Math.round((publishedCurrent / currentTotal) * 100) : 0;

  return {
    kpi: {
      reviewsReceived: currentTotal,
      published: publishedCurrent,
      publishRate,
      pending: pendingCurrent,
    },
    statusDistribution: statuses,
    totalReviews: statuses.published + statuses.pending + statuses.rejected,
    dailyReviews: Array.from(dailyMap.entries()).map(([date, count]) => ({
      date,
      count,
    })),
    dailyReviewsPrev: Array.from(prevDailyMap.entries()).map(
      ([date, count]) => ({ date, count }),
    ),
    dateRange: {
      start: periodStart.toISOString().split("T")[0],
      end: periodEnd.toISOString().split("T")[0],
    },
    prevDateRange: {
      start: prevStart.toISOString().split("T")[0],
      end: prevEnd.toISOString().split("T")[0],
    },
  };
};

/* ═══════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function AnalyticsIndex() {
  const {
    kpi,
    statusDistribution,
    totalReviews,
    dailyReviews,
    dailyReviewsPrev,
    dateRange,
    prevDateRange,
  } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Analytics" inlineSize="base">
      <s-stack direction="block" gap="base">
        {/* Filter bar */}
        <AnalyticsFilterBar />

        {/* KPI cards */}
        <AnalyticsKpiCards kpi={kpi} />

        {/* Charts row */}
        <s-grid gap="base" gridTemplateColumns="1fr 2fr">
          <AnalyticsDonutChart
            published={statusDistribution.published}
            pending={statusDistribution.pending}
            rejected={statusDistribution.rejected}
            total={totalReviews}
          />

          <AnalyticsLineChart
            data={dailyReviews}
            prevData={dailyReviewsPrev}
            dateRange={dateRange}
            prevDateRange={prevDateRange}
          />
        </s-grid>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
