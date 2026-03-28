/**
 * Reusable placeholder shown inside sections that require 7+ days of data
 * when the report is in cold-start mode (data_span_days < 7).
 * Rebuilt with v5 inline styles (SYMPH-205).
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
        background: "var(--color-surface)",
        border: "var(--border-width) dashed var(--border-color)",
        borderRadius: "var(--border-radius)",
        padding: "var(--spacing-section)",
        textAlign: "center",
        color: "var(--color-text-secondary)",
      }}
    >
      <div
        style={{
          fontSize: "var(--font-size-heading)",
          marginBottom: "var(--spacing-element)",
          lineHeight: "var(--line-height-heading)",
        }}
      >
        📊
      </div>
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: "var(--font-weight-subheading)" as unknown as number,
          fontSize: "var(--font-size-body)",
          color: "var(--color-text)",
          marginBottom: "var(--spacing-element)",
          lineHeight: "var(--line-height-body)",
        }}
      >
        Collecting data&hellip;
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--font-size-small)",
          color: "var(--color-text-secondary)",
          lineHeight: "var(--line-height-body)",
        }}
      >
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
