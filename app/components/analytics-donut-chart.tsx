export interface DonutChartProps {
  published: number;
  pending: number;
  rejected: number;
  total: number;
}

export default function AnalyticsDonutChart({
  published,
  pending,
  rejected,
  total,
}: DonutChartProps) {
  const R = 70;
  const STROKE = 18;
  const C = 2 * Math.PI * R;

  const segments =
    total === 0
      ? []
      : [
        { value: published, color: "#5c6ac4" },
        { value: pending, color: "#b8aee8" },
        { value: rejected, color: "#d72c0d" },
      ].filter((s) => s.value > 0);

  let cumulative = 0;

  return (
    <s-section>
      <s-stack direction="block" gap="small-400">
        <s-heading>Review Status</s-heading>
        <s-text color="subdued">
          See the breakdown of your review statuses.
        </s-text>
      </s-stack>

      <s-box padding="base">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingBlock: "12px",
          }}
        >
          <svg viewBox="0 0 200 200" width="180" height="180">
            {/* Background ring */}
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke="#e4e5e7"
              strokeWidth={STROKE}
            />
            {/* Segments */}
            {segments.map((seg, i) => {
              const len = (seg.value / total) * C;
              const offset = -cumulative;
              cumulative += len;
              return (
                <circle
                  key={i}
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={offset}
                  transform="rotate(-90 100 100)"
                  style={{ transition: "stroke-dasharray 0.6s ease" }}
                />
              );
            })}
            {/* Center label */}
            <text
              x="100"
              y="100"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="36"
              fontWeight="600"
              fill="#202223"
              fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            >
              {total}
            </text>
          </svg>
        </div>
      </s-box>
    </s-section>
  );
}
