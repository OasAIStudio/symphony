/**
 * Cold-start banner shown when data_span_days < 7.
 * Provides context about limited data and which sections are affected.
 * Rebuilt with v5 inline styles (SYMPH-205).
 */

export interface ColdStartBannerProps {
  dataSpanDays: number;
  message?: string;
}

export default function ColdStartBanner({
  dataSpanDays,
  message,
}: ColdStartBannerProps) {
  return (
    <div
      className="cold-start-banner"
      style={{
        background: "rgba(245, 158, 11, 0.08)",
        border: "var(--border-width) solid var(--color-accent)",
        borderRadius: "var(--border-radius)",
        padding: "var(--spacing-group)",
        marginBottom: "var(--spacing-section)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "var(--font-size-body)",
          color: "var(--color-accent)",
          fontWeight: "var(--font-weight-subheading)" as unknown as number,
          lineHeight: "var(--line-height-heading)",
          marginBottom: "var(--spacing-element)",
        }}
      >
        ⚠ Limited Data ({dataSpanDays} {dataSpanDays === 1 ? "day" : "days"})
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--font-size-body)",
          color: "var(--color-text-secondary)",
          lineHeight: "var(--line-height-body)",
        }}
      >
        {message ??
          "Trend charts, inflection detection, and outlier analysis require at least 7 days of data. These sections will show placeholder messaging until enough data has been collected."}
      </div>
    </div>
  );
}
