/**
 * Pipeline Health — v5 design reference (SYMPH-203)
 *
 * Source of truth for inline styles. Convert mechanically to TSX.
 * Uses v5 CSS variable system exclusively — no hardcoded colors.
 */

// Data placeholders — only styling is defined here
const stages = []; // placeholder: Object.keys(failureRate.current)
const current = {}; // placeholder: failureRate.current
const insight = ""; // placeholder: computed insight string

export default function PipelineHealth() {
  // Empty state
  if (stages.length === 0) {
    return (
      <section style={{ marginBottom: "var(--spacing-section)" }}>
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "var(--font-size-subheading)",
            fontWeight: "var(--font-weight-subheading)",
            lineHeight: "var(--line-height-heading)",
            color: "var(--color-text)",
            margin: 0,
            marginBottom: "var(--spacing-group)",
          }}
        >
          Pipeline Health
        </h2>
        <p style={{ color: "var(--color-text-secondary)" }}>
          No failure rate data available.
        </p>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: "var(--spacing-section)" }}>
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "var(--font-size-subheading)",
          fontWeight: "var(--font-weight-subheading)",
          lineHeight: "var(--line-height-heading)",
          color: "var(--color-text)",
          margin: 0,
          marginBottom: "var(--spacing-group)",
        }}
      >
        Pipeline Health
      </h2>
      <div
        style={{
          color: "var(--color-text-secondary)",
          fontFamily: "var(--font-body)",
          fontSize: "var(--font-size-small)",
          lineHeight: "var(--line-height-body)",
          marginBottom: "var(--spacing-group)",
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
            key={stage}
            style={{
              background: "var(--color-surface)",
              border: "var(--border-width) solid var(--border-color)",
              borderRadius: "var(--border-radius)",
              padding: "var(--spacing-group)",
              marginBottom: "var(--spacing-element)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "var(--spacing-element)",
              }}
            >
              <span
                style={{
                  color: "var(--color-text)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--font-size-body)",
                  fontWeight: "var(--font-weight-subheading)",
                  lineHeight: "var(--line-height-body)",
                }}
              >
                {stage}
              </span>
              <span
                style={{
                  color: "var(--color-text-secondary)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--font-size-small)",
                  lineHeight: "var(--line-height-body)",
                }}
              >
                {Math.round(rate * 100)}% failure rate
              </span>
            </div>
            <div
              style={{
                background: "var(--border-color)",
                borderRadius: "4px",
                height: "8px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: widthPct,
                  height: "100%",
                  background: "var(--color-danger)",
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
