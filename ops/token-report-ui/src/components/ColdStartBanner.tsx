/**
 * Cold-start banner shown when data_span_days < 7.
 * Provides context about limited data and which sections are affected.
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
        background: "rgba(210,153,34,0.1)",
        border: "1px solid var(--yellow)",
        borderRadius: "6px",
        padding: "16px",
        marginBottom: "24px",
      }}
    >
      <div
        style={{
          color: "var(--yellow)",
          fontWeight: 600,
          marginBottom: "4px",
        }}
      >
        ⚠ Limited Data ({dataSpanDays} {dataSpanDays === 1 ? "day" : "days"})
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
        {message ??
          "Trend charts, inflection detection, and outlier analysis require at least 7 days of data. These sections will show placeholder messaging until enough data has been collected."}
      </div>
    </div>
  );
}
