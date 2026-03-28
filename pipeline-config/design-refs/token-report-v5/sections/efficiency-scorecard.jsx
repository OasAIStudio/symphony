/**
 * v5 Design Reference: Efficiency Scorecard
 * Source of truth for inline styles — convert mechanically to TypeScript.
 *
 * Uses v5 CSS variables exclusively (no old GitHub-dark palette).
 */

export default function EfficiencyScorecard({ scorecard, series, coldStart }) {
  // Data logic omitted — see TypeScript implementation for full logic.
  const rows = []; // placeholder

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
          fontWeight: "var(--font-weight-subheading)",
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
              fontWeight: "var(--font-weight-subheading)",
              minWidth: 140,
            }}
          >
            {row.name}
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-text)",
              fontWeight: "var(--font-weight-heading)",
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
            {/* <Sparkline values={row.sparkline} stroke={row.stroke} fill /> */}
          </span>
        </div>
      ))}
    </section>
  );
}
