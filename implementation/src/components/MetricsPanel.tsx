import type { MetricsPanelProps } from "./types.ts";

const trendColor: Record<string, string> = {
  up: "#10B981",
  down: "#EF4444",
  flat: "#64748B",
};
const trendIcon: Record<string, string> = {
  up: "↑",
  down: "↓",
  flat: "—",
};

/**
 * Section 2: Metrics Panel
 * Four KPI cards displaying dynamic numeric values with delta indicators.
 * Font families: Inter (per structure.md)
 */
export default function MetricsPanel({ metrics }: MetricsPanelProps) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "16px",
        padding: "24px 32px",
        width: "100%",
        maxWidth: "1440px",
        minHeight: "280px",
        boxSizing: "border-box",
      }}
    >
      {metrics.map((m) => (
        <div
          key={m.label}
          style={{
            background: "#FFFFFF",
            borderRadius: "8px",
            border: "1px solid #E2E8F0",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            transition: "box-shadow 150ms ease",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow =
              "0 4px 16px rgba(0,0,0,0.12)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow =
              "0 2px 8px rgba(0,0,0,0.08)";
          }}
        >
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "12px",
              fontWeight: 400,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "8px",
            }}
          >
            {m.label}
          </span>
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "32px",
              fontWeight: 700,
              color: "#0F172A",
              lineHeight: "1.2",
            }}
          >
            {m.value}
          </span>
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 500,
              color: trendColor[m.trend],
              marginTop: "8px",
            }}
          >
            {trendIcon[m.trend]} {m.delta}
          </span>
        </div>
      ))}
    </section>
  );
}
