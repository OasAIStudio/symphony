/**
 * Section 2: Efficiency Scorecard
 * Converted from design reference EfficiencyScorecard.jsx.
 * Rebuilt from v5 efficiency-scorecard.jsx inline styles (SYMPH-197).
 *
 * Note: Failure Rate row removed — now displayed in PipelineHealth component.
 */
import type {
  EfficiencyScorecard as EfficiencyScorecardData,
  MetricWithTrend,
} from "../types.ts";
import { Sparkline, fmtNum } from "./chartUtils.tsx";

function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Format a metric value as a percentage string (SYMPH-189).
 * Most scorecard metrics are stored as decimals (0.72 = 72%);
 * `tokens_per_turn` is an integer and `first_pass_rate` is already a percentage.
 */
function formatPct(value: number, isRawPct: boolean): string {
  if (isRawPct) return `${round(value, 1)}%`;
  return `${round(value * 100, 1)}%`;
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

/**
 * Build range text: "30d: {formatPct(trend_30d)} → {formatPct(current)}" (SYMPH-189).
 */
function rangeText(
  metric: MetricWithTrend | undefined,
  isRawPct: boolean,
  isTokenCount?: boolean,
): string | null {
  if (!metric || metric.trend_30d == null || metric.current == null)
    return null;
  if (isTokenCount) {
    return `30d: ${fmtNum(metric.trend_30d)} → ${fmtNum(metric.current)}`;
  }
  return `30d: ${formatPct(metric.trend_30d, isRawPct)} → ${formatPct(metric.current, isRawPct)}`;
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
      range: rangeText(sc.cache_efficiency, false),
    },
    {
      name: "Output Ratio",
      value: `${round(sc.output_ratio?.current ?? 0, 1)}%`,
      sparkline: s.outputRatio,
      stroke: "#3fb950",
      range: rangeText(sc.output_ratio, false),
    },
    {
      name: "Wasted Context",
      value: `${round(sc.wasted_context?.current ?? 0, 1)}%`,
      sparkline: s.wastedCtx,
      stroke: "#d29922",
      range: rangeText(sc.wasted_context, false),
    },
    {
      name: "Tokens / Turn",
      value: fmtNum(sc.tokens_per_turn?.current ?? 0),
      sparkline: s.tokPerTurn,
      stroke: "#bc8cff",
      range: rangeText(sc.tokens_per_turn, false, true),
    },
    {
      name: "First-Pass Rate",
      value: `${round(sc.first_pass_rate?.current ?? 0, 1)}%`,
      sparkline: s.firstPass,
      stroke: "#56d364",
      range: rangeText(sc.first_pass_rate, true),
    },
  ];

  return (
    <section
      style={{
        marginBottom: "var(--spacing-section)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "var(--font-size-subheading)",
          fontWeight: "var(--font-weight-subheading)" as unknown as number,
          lineHeight: "var(--line-height-heading)",
          color: "var(--color-text)",
          margin: 0,
          marginBottom: "var(--spacing-group)",
        }}
      >
        Efficiency Scorecard
      </h2>
      {coldStart && (
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--font-size-small)",
            color: "var(--color-text-secondary)",
            marginBottom: "var(--spacing-group)",
            fontStyle: "italic",
            lineHeight: "var(--line-height-body)",
          }}
        >
          Trend data unavailable — requires 7+ days of history
        </div>
      )}
      {rows.map((row) => (
        <div
          key={row.name}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--spacing-group)",
            background: "var(--color-surface)",
            border: "var(--border-width) solid var(--border-color)",
            borderRadius: "var(--border-radius)",
            marginBottom: "var(--spacing-element)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-text)",
              fontWeight: "var(--font-weight-subheading)" as unknown as number,
              minWidth: 140,
            }}
          >
            {row.name}
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-text)",
              fontWeight: "var(--font-weight-heading)" as unknown as number,
              minWidth: 60,
              textAlign: "right",
            }}
          >
            {row.value}
          </span>
          {row.range && (
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--font-size-small)",
                color: "var(--color-text-secondary)",
                marginLeft: "var(--spacing-element)",
              }}
            >
              {row.range}
            </span>
          )}
          <span
            style={{
              marginLeft: "var(--spacing-group)",
            }}
          >
            <Sparkline values={row.sparkline} stroke={row.stroke} fill />
          </span>
        </div>
      ))}
    </section>
  );
}
