import { fmtShort, fmtRange } from "../utils/date-helpers";

export interface LineChartProps {
  data: { date: string; count: number }[];
  prevData: { date: string; count: number }[];
  dateRange: { start: string; end: string };
  prevDateRange: { start: string; end: string };
}

export default function AnalyticsLineChart({
  data,
  prevData,
  dateRange,
  prevDateRange,
}: LineChartProps) {
  const W = 620;
  const H = 220;
  const pad = { top: 16, right: 16, bottom: 14, left: 44 };
  const iW = W - pad.left - pad.right;
  const iH = H - pad.top - pad.bottom;

  const maxY = Math.max(
    ...data.map((d) => d.count),
    ...prevData.map((d) => d.count),
    1,
  );

  const niceMax = maxY <= 5 ? 5 : maxY <= 10 ? 10 : Math.ceil(maxY / 5) * 5;
  const yTicks = [0, Math.round(niceMax / 2), niceMax];

  const xScale = (i: number, len: number) =>
    pad.left + (len > 1 ? (i / (len - 1)) * iW : iW / 2);
  const yScale = (v: number) => pad.top + iH - (v / niceMax) * iH;

  const buildPath = (arr: { count: number }[]) =>
    arr
      .map(
        (d, i) =>
          `${i === 0 ? "M" : "L"} ${xScale(i, arr.length)} ${yScale(d.count)}`,
      )
      .join(" ");

  const step = Math.max(1, Math.floor(data.length / 8));
  const xLabels = data.filter(
    (_, i) => i % step === 0 || i === data.length - 1,
  );

  return (
    <s-box padding="base" border="base" borderRadius="large">
      <s-stack direction="block" gap="small">
        <s-text fontWeight="semibold">Daily Reviews</s-text>
        <s-text color="subdued">
          See how many reviews you're receiving each day.
        </s-text>
      </s-stack>

      <s-box padding="small-100">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block" }}
        >
          {/* Horizontal grid + Y labels */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={pad.left}
                y1={yScale(tick)}
                x2={W - pad.right}
                y2={yScale(tick)}
                stroke="#e4e5e7"
                strokeWidth="1"
              />
              <text
                x={pad.left - 8}
                y={yScale(tick) + 4}
                textAnchor="end"
                fontSize="10"
                fill="#8c9196"
                fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              >
                {tick}
              </text>
            </g>
          ))}

          {/* Previous period (dotted) */}
          {prevData.length > 1 && (
            <path
              d={buildPath(prevData)}
              fill="none"
              stroke="#8c9196"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
          )}

          {/* Current period (solid) */}
          {data.length > 1 && (
            <path
              d={buildPath(data)}
              fill="none"
              stroke="#2c6ecb"
              strokeWidth="2"
            />
          )}

          {/* X-axis labels */}
          {xLabels.map((d) => {
            const idx = data.indexOf(d);
            return (
              <text
                key={d.date}
                x={xScale(idx, data.length)}
                y={H - 1}
                textAnchor="middle"
                fontSize="10"
                fill="#8c9196"
                fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              >
                {fmtShort(d.date)}
              </text>
            );
          })}
        </svg>

        {/* Legend */}
        <s-stack direction="inline" justifyContent="center" gap="large" alignItems="center">
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <svg width="20" height="2">
              <line x1="0" y1="1" x2="20" y2="1" stroke="#2c6ecb" strokeWidth="2" />
            </svg>
            <s-text color="subdued" fontSize="small">
              {fmtRange(dateRange.start, dateRange.end)}
            </s-text>
          </s-stack>
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <svg width="20" height="2">
              <line x1="0" y1="1" x2="20" y2="1" stroke="#8c9196" strokeWidth="1.5" strokeDasharray="3 3" />
            </svg>
            <s-text color="subdued" fontSize="small">
              {fmtRange(prevDateRange.start, prevDateRange.end)}
            </s-text>
          </s-stack>
        </s-stack>
      </s-box>
    </s-box>
  );
}
