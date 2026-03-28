/**
 * Pipeline Health: per-stage failure rate horizontal bars with summary insight.
 * Rebuilt with v5 inline styles from design-ref pipeline-health.jsx (SYMPH-203).
 * Uses existing FailureRate data from efficiency_scorecard.
 */
import type { FailureRate } from "../types.ts";

export interface PipelineHealthProps {
  failureRate: FailureRate;
}

/* ── v5 inline style objects (SYMPH-203) ── */

const sectionStyle: React.CSSProperties = {
  marginBottom: "var(--spacing-section)",
};

const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontSize: "var(--font-size-subheading)",
  fontWeight: "var(--font-weight-subheading)" as unknown as number,
  lineHeight: "var(--line-height-heading)",
  color: "var(--color-text)",
  margin: 0,
  marginBottom: "var(--spacing-group)",
};

const insightStyle: React.CSSProperties = {
  color: "var(--color-text-secondary)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--font-size-small)",
  lineHeight: "var(--line-height-body)",
  marginBottom: "var(--spacing-group)",
  fontStyle: "italic",
};

const stageCardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "var(--border-width) solid var(--border-color)",
  borderRadius: "var(--border-radius)",
  padding: "var(--spacing-group)",
  marginBottom: "var(--spacing-element)",
};

const stageRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: "var(--spacing-element)",
};

const stageNameStyle: React.CSSProperties = {
  color: "var(--color-text)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--font-size-body)",
  fontWeight: "var(--font-weight-subheading)" as unknown as number,
  lineHeight: "var(--line-height-body)",
};

const stageRateStyle: React.CSSProperties = {
  color: "var(--color-text-secondary)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--font-size-small)",
  lineHeight: "var(--line-height-body)",
};

const barTrackStyle: React.CSSProperties = {
  background: "var(--border-color)",
  borderRadius: "4px",
  height: "8px",
  overflow: "hidden",
};

const barFillBase: React.CSSProperties = {
  height: "100%",
  background: "var(--color-danger)",
  borderRadius: "4px",
};

export default function PipelineHealth({ failureRate }: PipelineHealthProps) {
  const current = failureRate?.current ?? {};
  const trend7d = failureRate?.trend_7d ?? {};

  const stages = Object.keys(current);
  if (stages.length === 0) {
    return (
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Pipeline Health</h2>
        <p style={{ color: "var(--color-text-secondary)" }}>
          No failure rate data available.
        </p>
      </section>
    );
  }

  // Find the stage with the highest current failure rate for the summary insight
  const totalRate = stages.reduce((sum, s) => sum + (current[s] ?? 0), 0);

  let worstStage = stages[0];
  for (const s of stages) {
    if ((current[s] ?? 0) > (current[worstStage] ?? 0)) {
      worstStage = s;
    }
  }

  const worstShare =
    totalRate > 0
      ? Math.round(((current[worstStage] ?? 0) / totalRate) * 100)
      : 0;
  const worstCurrent = current[worstStage] ?? 0;
  const worst7d = trend7d[worstStage] ?? 0;
  const deltaPp = Math.round((worstCurrent - worst7d) * 100);
  const direction = deltaPp <= 0 ? "down" : "up";
  const absDelta = Math.abs(deltaPp);

  const insight = `${worstStage} accounts for ${worstShare}% of all failures — ${direction} ${absDelta}pp vs 7d avg`;

  return (
    <section style={sectionStyle}>
      <h2 style={headingStyle}>Pipeline Health</h2>
      <div style={insightStyle}>{insight}</div>
      {stages.map((stage) => {
        const rate = current[stage] ?? 0;
        const widthPct = `${Math.round(rate * 100)}%`;
        return (
          <div key={stage} style={stageCardStyle}>
            <div style={stageRowStyle}>
              <span style={stageNameStyle}>{stage}</span>
              <span style={stageRateStyle}>
                {Math.round(rate * 100)}% failure rate
              </span>
            </div>
            <div style={barTrackStyle}>
              <div style={{ ...barFillBase, width: widthPct }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
