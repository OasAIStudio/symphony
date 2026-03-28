/**
 * Shared SVG chart utilities for the Token Report v2.
 * Converted from chartUtils.jsx design reference.
 */
import { useId } from "react";
import { DEFAULT_PADDING } from "../lib/chart-utils.ts";
import type { StageTrend } from "../types.ts";

function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Format a number with thousands separators.
 */
export function fmtNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "\u2014";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Render a WoW delta badge as a colored span.
 */
export interface WowBadgeProps {
  delta: number | null | undefined;
}

export function WowBadge({ delta }: WowBadgeProps) {
  if (delta == null) {
    return <span style={{ color: "var(--text-muted)" }}>{"\u2014"}</span>;
  }
  const sign = delta > 0 ? "+" : "";
  const color =
    delta > 0 ? "var(--red)" : delta < 0 ? "var(--green)" : "var(--text-muted)";
  return (
    <span style={{ color, fontSize: "0.85em" }}>
      {sign}
      {delta}% WoW
    </span>
  );
}

/**
 * Inline SVG sparkline from an array of numeric values.
 */
export interface SparklineProps {
  values?: number[];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  /** When true, render a gradient fill under the sparkline (stroke color at 20% opacity → 0%). */
  fill?: boolean;
}

export function Sparkline({
  values,
  width = 120,
  height = 30,
  stroke = "var(--accent)",
  strokeWidth = 1.5,
  fill = false,
}: SparklineProps) {
  const gradientId = useId();
  if (!values || values.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Sparkline chart"
        role="img"
      />
    );
  }
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const rangeY = maxY - minY || 1;

  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - minY) / rangeY) * (height - 4) - 2;
    return [round(x, 1), round(y, 1)] as const;
  });

  const points = coords.map(([x, y]) => `${x},${y}`).join(" ");

  // Build polygon points for gradient fill area (line path + baseline return)
  const fillPoints = fill
    ? [
        ...coords.map(([x, y]) => `${x},${y}`),
        `${coords[coords.length - 1][0]},${height}`,
        `${coords[0][0]},${height}`,
      ].join(" ")
    : undefined;

  return (
    <svg
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Sparkline chart"
      role="img"
    >
      {fill && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {fill && <polygon points={fillPoints} fill={`url(#${gradientId})`} />}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Multi-line SVG chart for per-stage trends.
 */
export interface ConfigChange {
  date: string;
}

export interface MultiLineChartProps {
  stageData: Record<string, StageTrend>;
  configChanges?: ConfigChange[];
  width?: number;
  height?: number;
}

export function MultiLineChart({
  stageData,
  configChanges,
  width = 600,
  height = 200,
}: MultiLineChartProps) {
  const colors = [
    "var(--accent)",
    "var(--green)",
    "var(--yellow)",
    "var(--red)",
    "var(--purple)",
    "#79c0ff", // TODO: no v5 token for extended palette color
    "#56d364", // TODO: no v5 token for extended palette color
    "#e3b341", // TODO: no v5 token for extended palette color
  ];

  const allDates = new Set<string>();
  for (const stage of Object.keys(stageData)) {
    const avg = stageData[stage].daily_avg;
    if (typeof avg === "object" && avg !== null && !Array.isArray(avg)) {
      for (const d of Object.keys(avg)) {
        allDates.add(d);
      }
    }
  }
  const sortedDates = [...allDates].sort();

  if (sortedDates.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Insufficient data for trend chart"
        role="img"
      >
        <text x="10" y="20" fill="var(--text-muted)" fontSize="12">
          Insufficient data for trend chart
        </text>
      </svg>
    );
  }

  const stages = Object.keys(stageData);
  const allVals: number[] = [];
  for (const stage of stages) {
    const avg = stageData[stage].daily_avg;
    if (typeof avg === "object" && avg !== null) {
      for (const d of sortedDates) {
        const val = (avg as Record<string, number>)[d];
        if (val != null) allVals.push(val);
      }
    }
  }

  const minY = Math.min(...allVals, 0);
  const maxY = Math.max(...allVals, 1);
  const rangeY = maxY - minY || 1;
  const padL = DEFAULT_PADDING.left;
  const padR = DEFAULT_PADDING.right;
  const padT = DEFAULT_PADDING.top;
  const padB = DEFAULT_PADDING.bottom;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  // Grid lines
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH / 4) * i;
    const val = maxY - (rangeY / 4) * i;
    gridLines.push(
      <g key={`grid-${i}`}>
        <line
          x1={padL}
          y1={y}
          x2={width - padR}
          y2={y}
          stroke="var(--border)"
          strokeWidth="1"
        />
        <text
          x={padL - 5}
          y={y + 4}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          {fmtNum(val)}
        </text>
      </g>,
    );
  }

  // Config change markers
  const markers = (configChanges ?? []).map((cc) => {
    const idx = sortedDates.indexOf(cc.date);
    if (idx < 0) return null;
    const x = padL + (idx / (sortedDates.length - 1)) * chartW;
    return (
      <g key={`cc-${cc.date}`}>
        <line
          x1={x}
          y1={padT}
          x2={x}
          y2={padT + chartH}
          stroke="var(--yellow)"
          strokeWidth="1"
          strokeDasharray="4,4"
        />
        <text
          x={x}
          y={padT - 2}
          fill="var(--yellow)"
          fontSize="9"
          textAnchor="middle"
        >
          {"\u2699"}
        </text>
      </g>
    );
  });

  // Stage polylines
  const lines = stages.map((stage, si) => {
    const avg = stageData[stage].daily_avg;
    if (typeof avg !== "object" || avg === null) return null;
    const avgObj = avg as Record<string, number>;
    const pts: string[] = [];
    for (const d of sortedDates) {
      if (avgObj[d] != null) {
        const x =
          padL + (sortedDates.indexOf(d) / (sortedDates.length - 1)) * chartW;
        const y = padT + chartH - ((avgObj[d] - minY) / rangeY) * chartH;
        pts.push(`${round(x, 1)},${round(y, 1)}`);
      }
    }
    if (pts.length <= 1) return null;
    const color = colors[si % colors.length];
    return (
      <polyline
        key={`line-${stage}`}
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  });

  // Legend
  const legend = stages.map((stage, si) => {
    const x = padL + si * 100;
    const color = colors[si % colors.length];
    return (
      <g key={`legend-${stage}`}>
        <rect
          x={x}
          y={height - 15}
          width="10"
          height="10"
          fill={color}
          rx="2"
        />
        <text x={x + 14} y={height - 6} fill="var(--text)" fontSize="10">
          {stage}
        </text>
      </g>
    );
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: "var(--bg)", borderRadius: "6px" }}
      aria-label="Per-stage token trend chart"
      role="img"
    >
      {gridLines}
      {markers}
      {lines}
      {legend}
    </svg>
  );
}
