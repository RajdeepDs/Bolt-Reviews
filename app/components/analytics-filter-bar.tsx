import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { DatePicker, OptionList } from "@shopify/polaris"

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7d", label: "Last 7d" },
  { value: "last_30d", label: "Last 30d" },
  { value: "last_90d", label: "Last 90d" },
  { value: "last_365d", label: "Last 365d" },
  { value: "last_month", label: "Last month" },
  { value: "last_12_months", label: "Last 12 months" },
  { value: "last_year", label: "Last year" },
];

function computeRange(key: string): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  switch (key) {
    case "today":
      return { from: fmt(now), to: fmt(now) };
    case "yesterday": {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      return { from: fmt(d), to: fmt(d) };
    }
    case "last_7d": {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      return { from: fmt(d), to: fmt(now) };
    }
    case "last_30d": {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return { from: fmt(d), to: fmt(now) };
    }
    case "last_90d": {
      const d = new Date(now); d.setDate(d.getDate() - 90);
      return { from: fmt(d), to: fmt(now) };
    }
    case "last_365d": {
      const d = new Date(now); d.setDate(d.getDate() - 365);
      return { from: fmt(d), to: fmt(now) };
    }
    case "last_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmt(first), to: fmt(last) };
    }
    case "last_12_months": {
      const d = new Date(now); d.setMonth(d.getMonth() - 12);
      return { from: fmt(d), to: fmt(now) };
    }
    case "last_year": {
      const y = now.getFullYear() - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    default:
      return computeRange("last_30d");
  }
}



export default function AnalyticsFilterBar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedPreset = searchParams.get("preset") || "last_30d";

  const [pendingPreset, setPendingPreset] = useState(appliedPreset);
  const [pendingRange, setPendingRange] = useState(() => {
    const f = searchParams.get("from");
    const t = searchParams.get("to");
    return f && t ? { from: f, to: t } : computeRange(appliedPreset);
  });

  // ── DatePicker state (month/year for calendar view) ──────
  const [{ month, year }, setDate] = useState(() => {
    const d = new Date(pendingRange.from + "T00:00:00");
    return { month: d.getMonth(), year: d.getFullYear() };
  });

  // Convert pendingRange strings to Date objects for DatePicker's `selected`
  const selectedDates = {
    start: new Date(pendingRange.from + "T00:00:00"),
    end: new Date(pendingRange.to + "T00:00:00"),
  };

  // Keep a ref so event listeners always read fresh values
  const pendingRef = useRef({ preset: pendingPreset, range: pendingRange });
  useEffect(() => {
    pendingRef.current = { preset: pendingPreset, range: pendingRange };
  }, [pendingPreset, pendingRange]);


  // ── Reset pending state when popover opens ───────────────
  useEffect(() => {
    const popover = document.getElementById("analytics-date-popover");
    if (!popover) return;
    const handler = (e: Event) => {
      if ((e as ToggleEvent).newState === "open") {
        const f = searchParams.get("from");
        const t = searchParams.get("to");
        const preset = searchParams.get("preset") || "last_30d";
        const range = f && t ? { from: f, to: t } : computeRange(preset);
        setPendingPreset(preset);
        setPendingRange(range);
        const d = new Date(range.from + "T00:00:00");
        setDate({ month: d.getMonth(), year: d.getFullYear() });
      }
    };
    popover.addEventListener("toggle", handler);
    return () => popover.removeEventListener("toggle", handler);
  }, [searchParams]);

  // ── Apply button listener ────────────────────────────────
  useEffect(() => {
    const btn = document.getElementById("analytics-apply-btn");
    if (!btn) return;
    const handler = () => {
      const { preset, range } = pendingRef.current;
      setSearchParams({ from: range.from, to: range.to, preset });
      document.getElementById("analytics-date-popover")?.hidePopover();
    };
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
  }, [setSearchParams]);

  // ── DatePicker handlers ──────────────────────────────────
  const handleMonthChange = (newMonth: number, newYear: number) => {
    setDate({ month: newMonth, year: newYear });
  };

  const handleDateChange = (range: { start: Date; end: Date }) => {
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    setPendingRange({ from: fmt(range.start), to: fmt(range.end) });
    setPendingPreset("custom");
  };

  // ── Preset click handler ─────────────────────────────────
  const handlePresetClick = (key: string) => {
    const range = computeRange(key);
    setPendingPreset(key);
    setPendingRange(range);
    const d = new Date(range.from + "T00:00:00");
    setDate({ month: d.getMonth(), year: d.getFullYear() });
  };

  const buttonLabel =
    appliedPreset === "custom"
      ? `${searchParams.get("from")} – ${searchParams.get("to")}`
      : PRESETS.find((p) => p.value === appliedPreset)?.label || "Last 30d";

  return (
    <s-stack direction="inline" justifyContent="space-between" alignItems="center">
      <s-button commandFor="analytics-date-popover" variant="auto" icon="calendar">
        {buttonLabel}
      </s-button>

      <s-popover id="analytics-date-popover">
        <div style={{ width: "750px" }}>
          <s-box padding="none">
            <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
              <div style={{ minWidth: "200px" }}>
                <OptionList
                  options={PRESETS}
                  selected={[pendingPreset]}
                  onChange={(values) => handlePresetClick(values[0])}
                />
              </div>

              <DatePicker
                month={month}
                year={year}
                onChange={handleDateChange}
                onMonthChange={handleMonthChange}
                selected={selectedDates}
                multiMonth
                allowRange
              />
            </div>

            <s-divider />

            <s-stack direction="inline" justifyContent="end" gap="base" padding="small-100">
              <s-button commandFor="analytics-date-popover">Cancel</s-button>
              <s-button id="analytics-apply-btn" variant="primary">Apply</s-button>
            </s-stack>
          </s-box>
        </div>
      </s-popover>

      <s-button variant="auto" icon="filter">
        All products
      </s-button>
    </s-stack>
  );
}
