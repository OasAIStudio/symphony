/**
 * Section 2: Efficiency Scorecard
 * Converted from design reference EfficiencyScorecard.jsx.
 *
 * Note: Failure Rate row removed — now displayed in PipelineHealth component.
 */
import type { EfficiencyScorecard as EfficiencyScorecardData } from "../types.ts";
import { Sparkline, fmtNum } from "./chartUtils.tsx";

function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export interface ScorecardSeries {
  cacheEff?: number[];
  outputRatio?: number[];
  wastedCtx?: number[];
  tokPerTurn?: number[];
  firstPass?: number[];
}

export interface EfficiencyScorecardProps {
  scorecard: EfficiencyScorecardData;
  series?: ScorecardSeries;
  coldStart?: boolean;
}

export default function EfficiencyScorecard({
  scorecard,
  series,
  coldStart,
}: EfficiencyScorecardProps) {
  const sc = scorecard ?? ({} as Partial<EfficiencyScorecardData>);
  const s = series ?? {};

  const rows = [
    {
      name: "Cache Efficiency",
      value: `${round(sc.cache_efficiency?.current ?? 0, 1)}%`,
      sparkline: s.cacheEff,
      stroke: "#58a6ff",
    },
    {
      name: "Output Ratio",
      value: `${round(sc.output_ratio?.current ?? 0, 1)}%`,
      sparkline: s.outputRatio,
      stroke: "#3fb950",
    },
    {
      name: "Wasted Context",
      value: `${round(sc.wasted_context?.current ?? 0, 1)}%`,
      sparkline: s.wastedCtx,
      stroke: "#d29922",
    },
    {
      name: "Tokens / Turn",
      value: fmtNum(sc.tokens_per_turn?.current ?? 0),
      sparkline: s.tokPerTurn,
      stroke: "#bc8cff",
    },
    {
      name: "First-Pass Rate",
      value: `${round(sc.first_pass_rate?.current ?? 0, 1)}%`,
      sparkline: s.firstPass,
      stroke: "#56d364",
    },
  ];

  return (
    <section>
      <h2>Efficiency Scorecard</h2>
      {coldStart && (
        <div
          className="cold-start-scorecard-note"
          style={{
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            marginBottom: "12px",
            fontStyle: "italic",
          }}
        >
          Trend data unavailable — requires 7+ days of history
        </div>
      )}
      {rows.map((row) => (
        <div className="metric-row" key={row.name}>
          <span className="metric-name">{row.name}</span>
          <span className="metric-value">{row.value}</span>
          <span className="metric-sparkline">
            <Sparkline values={row.sparkline} stroke={row.stroke} />
          </span>
        </div>
      ))}
    </section>
  );
}
