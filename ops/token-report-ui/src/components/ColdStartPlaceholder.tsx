/**
 * Reusable placeholder shown inside sections that require 7+ days of data
 * when the report is in cold-start mode (data_span_days < 7).
 */

export interface ColdStartPlaceholderProps {
  /** Minimum days needed for this section to render fully */
  requiredDays: number;
  /** Current data span in days */
  currentDays: number;
}

export default function ColdStartPlaceholder({
  requiredDays,
  currentDays,
}: ColdStartPlaceholderProps) {
  const remaining = requiredDays - currentDays;
  return (
    <div
      className="cold-start-placeholder"
      style={{
        background: "var(--bg-card)",
        border: "1px dashed var(--border)",
        borderRadius: "6px",
        padding: "24px",
        textAlign: "center",
        color: "var(--text-muted)",
      }}
    >
      <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>📊</div>
      <div style={{ fontWeight: 500, marginBottom: "4px" }}>
        Collecting data&hellip;
      </div>
      <div style={{ fontSize: "0.85rem" }}>
        This section requires at least {requiredDays} days of data.{" "}
        {remaining > 0 && (
          <>
            {remaining} more {remaining === 1 ? "day" : "days"} needed.
          </>
        )}
      </div>
    </div>
  );
}
