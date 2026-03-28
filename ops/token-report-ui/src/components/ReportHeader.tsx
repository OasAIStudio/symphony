/**
 * Section 0: Report Header
 * Converted from design reference ReportHeader.jsx.
 * Rebuilt from v5 header.jsx inline styles (SYMPH-195).
 */
import { fmtNum } from "./chartUtils.tsx";

export interface ReportHeaderProps {
  today: string;
  recordCount: number;
  dataSpanDays: number;
}

export default function ReportHeader({
  today,
  recordCount,
  dataSpanDays,
}: ReportHeaderProps) {
  return (
    <header>
      <h1
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "var(--font-size-heading)",
          fontWeight: "var(--font-weight-heading)" as unknown as number,
          lineHeight: "var(--line-height-heading)",
          color: "var(--color-text)",
          margin: 0,
          marginBottom: "var(--spacing-element)",
        }}
      >
        Symphony Token Report
      </h1>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--font-size-body)",
          color: "var(--color-text-secondary)",
          lineHeight: "var(--line-height-body)",
          marginBottom: "var(--spacing-section)",
        }}
      >
        Generated {today} &middot; {fmtNum(recordCount)} records &middot;{" "}
        {dataSpanDays} day span
      </p>
    </header>
  );
}
