export interface KpiData {
  reviewsReceived: number;
  published: number;
  publishRate: number;
  pending: number;
}

function InfoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0, opacity: 0.45 }}
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
      <text
        x="8"
        y="8.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9.5"
        fontWeight="600"
        fontStyle="italic"
        fill="currentColor"
        fontFamily="serif"
      >
        i
      </text>
    </svg>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <s-box padding="base" border="base" borderRadius="large">
      <s-stack direction="block" gap="small">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-text fontWeight="semibold">{label}</s-text>
          <InfoIcon />
        </s-stack>
        <s-heading>{value}</s-heading>
      </s-stack>
    </s-box>
  );
}

export default function AnalyticsKpiCards({ kpi }: { kpi: KpiData }) {
  return (
    <s-grid gap="base" gridTemplateColumns="1fr 1fr 1fr 1fr">
      <KpiCard label="Reviews Received" value={kpi.reviewsReceived} />
      <KpiCard label="Published Reviews" value={kpi.published} />
      <KpiCard label="Publish Rate" value={`${kpi.publishRate}%`} />
      <KpiCard label="Pending Reviews" value={kpi.pending} />
    </s-grid>
  );
}
