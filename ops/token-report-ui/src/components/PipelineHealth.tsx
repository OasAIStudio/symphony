/**
 * Pipeline Health: per-stage failure rate horizontal bars with summary insight.
 * Uses existing FailureRate data from efficiency_scorecard.
 */
import type { FailureRate } from "../types.ts";

export interface PipelineHealthProps {
  failureRate: FailureRate;
}

export default function PipelineHealth({ failureRate }: PipelineHealthProps) {
  const current = failureRate?.current ?? {};
  const trend7d = failureRate?.trend_7d ?? {};

  const stages = Object.keys(current);
  if (stages.length === 0) {
    return (
      <section>
        <h2>Pipeline Health</h2>
        <p style={{ color: "var(--text-muted)" }}>
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
    <section>
      <h2>Pipeline Health</h2>
      <div
        style={{
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          marginBottom: "12px",
          fontStyle: "italic",
        }}
      >
        {insight}
      </div>
      {stages.map((stage) => {
        const rate = current[stage] ?? 0;
        const widthPct = `${Math.round(rate * 100)}%`;
        return (
          <div
            className="pipeline-health-bar"
            key={stage}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "12px 16px",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <span style={{ color: "var(--text-bright)", fontWeight: 600 }}>
                {stage}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                {Math.round(rate * 100)}% failure rate
              </span>
            </div>
            <div
              style={{
                background: "var(--border)",
                borderRadius: "4px",
                height: "8px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: widthPct,
                  height: "100%",
                  background: "var(--red)",
                  borderRadius: "4px",
                }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
