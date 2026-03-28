/**
 * Pure SVG chart utility functions shared across chart components.
 * No React/JSX — returns primitives, numbers, and strings only.
 */

/** Standard chart color palette matching Paper design tokens. */
export const STAGE_COLORS = [
  "#58a6ff", // blue
  "#3fb950", // green
  "#d29922", // yellow
  "#f85149", // red
  "#bc8cff", // purple
  "#79c0ff", // light blue
  "#56d364", // bright green
  "#e3b341", // orange
] as const;

/** Design-token colors used in chart chrome. */
export const CHART_TOKENS = {
  gridLine: "#21262d",
  axisText: "#8b949e",
  legendText: "#c9d1d9",
  bg: "#0d1117",
  areaOpacity: 0.15,
  medianStroke: "#58a6ff",
  meanStroke: "#bc8cff",
} as const;

/** Standard chart padding (left, right, top, bottom). */
export interface ChartPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const DEFAULT_PADDING: ChartPadding = {
  left: 55,
  right: 15,
  top: 15,
  bottom: 40,
};

/** Round to N decimal places. */
export function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Linear scale: maps a domain value [domainMin, domainMax] to a range [rangeMin, rangeMax].
 * Clamps output to the range bounds.
 */
export function linearScale(
  value: number,
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): number {
  const domainSpan = domainMax - domainMin || 1;
  const rangeSpan = rangeMax - rangeMin;
  const scaled = rangeMin + ((value - domainMin) / domainSpan) * rangeSpan;
  return Math.max(
    Math.min(scaled, Math.max(rangeMin, rangeMax)),
    Math.min(rangeMin, rangeMax),
  );
}

/**
 * Format a date string (YYYY-MM-DD) into a short label.
 * Returns "MMM DD" format, e.g. "Mar 05".
 */
export function formatDateLabel(dateStr: string): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const monthIdx = Number.parseInt(parts[1], 10) - 1;
  const day = parts[2];
  return `${months[monthIdx] ?? "?"} ${day}`;
}

/**
 * Pick N evenly-spaced indices from an array of length total.
 * Always includes first and last. Returns indices array.
 */
export function pickTickIndices(total: number, maxTicks: number): number[] {
  if (total <= maxTicks) return Array.from({ length: total }, (_, i) => i);
  const step = (total - 1) / (maxTicks - 1);
  const indices: number[] = [];
  for (let i = 0; i < maxTicks; i++) {
    indices.push(Math.round(step * i));
  }
  return indices;
}

/**
 * Compute nice Y-axis grid values given a data range.
 * Returns an array of values from max down to min (for top-to-bottom rendering).
 */
export function computeYGrid(
  minVal: number,
  maxVal: number,
  steps = 4,
): number[] {
  const range = maxVal - minVal || 1;
  const values: number[] = [];
  for (let i = 0; i <= steps; i++) {
    values.push(maxVal - (range / steps) * i);
  }
  return values;
}

/**
 * Format a number for axis labels: uses K suffix for thousands, M for millions.
 */
export function formatAxisValue(n: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${round(n / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `${round(n / 1_000, 1)}K`;
  return `${round(n, 0)}`;
}

/**
 * Build an SVG polyline points string from x,y coordinate pairs.
 */
export function buildPointsString(coords: Array<[number, number]>): string {
  return coords.map(([x, y]) => `${round(x, 1)},${round(y, 1)}`).join(" ");
}

/**
 * Build an SVG polygon points string for a filled area.
 * Creates a closed shape by appending baseline points in reverse.
 */
export function buildAreaString(
  coords: Array<[number, number]>,
  baselineY: number,
): string {
  if (coords.length === 0) return "";
  const top = coords.map(([x, y]) => `${round(x, 1)},${round(y, 1)}`);
  const bottom = [...coords]
    .reverse()
    .map(([x]) => `${round(x, 1)},${round(baselineY, 1)}`);
  return [...top, ...bottom].join(" ");
}

/**
 * Extract and sort all unique dates from per-stage trend data.
 * Handles both Record<string, number> (date-keyed) and scalar daily_avg.
 */
export function extractSortedDates(
  stageData: Record<string, { daily_avg: number | Record<string, number> }>,
): string[] {
  const dates = new Set<string>();
  for (const key of Object.keys(stageData)) {
    const avg = stageData[key].daily_avg;
    if (typeof avg === "object" && avg !== null && !Array.isArray(avg)) {
      for (const d of Object.keys(avg)) {
        dates.add(d);
      }
    }
  }
  return [...dates].sort();
}
