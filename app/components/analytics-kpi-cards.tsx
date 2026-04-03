import { Tooltip } from "@shopify/polaris";

export interface KpiData {
  reviewsReceived: number;
  published: number;
  publishRate: number;
  pending: number;
}

function KpiCard({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string | number;
  tooltip: string;
}) {
  return (
    <s-section>
      <s-stack direction="block" gap="small">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-heading>{label}</s-heading>
          <Tooltip content={tooltip}>
            <s-icon type="info" tone="neutral" />
          </Tooltip>
        </s-stack>
        <s-heading>{value}</s-heading>
      </s-stack>
    </s-section>
  );
}

export default function AnalyticsKpiCards({ kpi }: { kpi: KpiData }) {
  return (
    <s-grid gap="base" gridTemplateColumns="1fr 1fr 1fr 1fr">
      <KpiCard
        label="Reviews Received"
        value={kpi.reviewsReceived}
        tooltip="Total number of reviews received during the selected period."
      />
      <KpiCard
        label="Published Reviews"
        value={kpi.published}
        tooltip="Reviews that have been approved and are visible on your store."
      />
      <KpiCard
        label="Publish Rate"
        value={`${kpi.publishRate}%`}
        tooltip="Percentage of received reviews that were published."
      />
      <KpiCard
        label="Pending Reviews"
        value={kpi.pending}
        tooltip="Reviews awaiting moderation or approval."
      />
    </s-grid>
  );
}
