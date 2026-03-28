/**
 * v5 Design Reference: Inflection Attribution
 * Source of truth for inline styles — convert mechanically to TypeScript.
 * Uses v5 CSS variables exclusively (no old GitHub-dark palette).
 *
 * Props:
 *   - inflection: { attributions: Array<{type, description}>, llm_insight: string | null }
 */

function typeLabel(type) {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function InflectionAttribution({ inflection }) {
  // Data logic omitted — see TypeScript implementation for full logic.
  const attrs = inflection.attributions ?? [];

  if (attrs.length === 0 && !inflection.llm_insight) return null;

  return (
    <div style={{
      fontFamily: "var(--font-body)",
    }}>
      {attrs.length > 0 && (
        <ul style={{
          listStyle: "none",
          padding: 0,
          margin: `var(--spacing-element) 0 0 0`,
        }}>
          {attrs.map((attr) => (
            <li
              key={`${attr.type}-${attr.description}`}
              style={{
                color: "var(--color-text-secondary)",
                fontSize: "var(--font-size-caption)",
                fontWeight: "var(--font-weight-body)",
                marginBottom: "2px",
                lineHeight: 1.5,
              }}
            >
              <span style={{
                color: "var(--color-primary)",
                fontWeight: "var(--font-weight-subheading)",
                marginRight: "var(--spacing-element)",
              }}>
                {typeLabel(attr.type)}:
              </span>
              {attr.description}
            </li>
          ))}
        </ul>
      )}
      {inflection.llm_insight ? (
        <div style={{
          marginTop: "var(--spacing-element)",
          color: "var(--color-text-secondary)",
          fontSize: "var(--font-size-caption)",
          fontWeight: "var(--font-weight-body)",
          lineHeight: 1.5,
        }}>
          {"💡"} {inflection.llm_insight}
        </div>
      ) : null}
    </div>
  );
}
