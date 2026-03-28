/**
 * Section 8: Per-Product Breakdown
 * Converted from design reference PerProductBreakdown.jsx.
 * Rebuilt with v5 inline styles (SYMPH-205).
 */
import type { ProductData } from "../types.ts";
import { fmtNum } from "./chartUtils.tsx";

function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export interface PerProductBreakdownProps {
  perProduct: Record<string, ProductData>;
}

export default function PerProductBreakdown({
  perProduct,
}: PerProductBreakdownProps) {
  const products = perProduct ?? {};
  const totalTokens =
    Object.values(products).reduce((s, p) => s + (p.total_tokens ?? 0), 0) || 1;

  const sorted = Object.entries(products).sort(
    (a, b) => (b[1].total_tokens ?? 0) - (a[1].total_tokens ?? 0),
  );

  return (
    <section style={{ marginBottom: "var(--spacing-section)" }}>
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "var(--font-size-subheading)",
          fontWeight: "var(--font-weight-subheading)" as unknown as number,
          lineHeight: "var(--line-height-heading)",
          color: "var(--color-text)",
          margin: 0,
          marginBottom: "var(--spacing-group)",
        }}
      >
        Per-Product Breakdown
      </h2>
      <div
        style={{
          background: "var(--color-surface)",
          border: "var(--border-width) solid var(--border-color)",
          borderRadius: "var(--border-radius)",
          overflow: "hidden",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "var(--font-body)",
            fontSize: "var(--font-size-body)",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  color: "var(--color-text-secondary)",
                  fontSize: "var(--font-size-caption)",
                  fontWeight:
                    "var(--font-weight-subheading)" as unknown as number,
                  padding: "var(--spacing-element) var(--spacing-group)",
                  borderBottom: "var(--border-width) solid var(--border-color)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Product
              </th>
              <th
                style={{
                  textAlign: "right",
                  color: "var(--color-text-secondary)",
                  fontSize: "var(--font-size-caption)",
                  fontWeight:
                    "var(--font-weight-subheading)" as unknown as number,
                  padding: "var(--spacing-element) var(--spacing-group)",
                  borderBottom: "var(--border-width) solid var(--border-color)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Tokens
              </th>
              <th
                style={{
                  textAlign: "right",
                  color: "var(--color-text-secondary)",
                  fontSize: "var(--font-size-caption)",
                  fontWeight:
                    "var(--font-weight-subheading)" as unknown as number,
                  padding: "var(--spacing-element) var(--spacing-group)",
                  borderBottom: "var(--border-width) solid var(--border-color)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Stages
              </th>
              <th
                style={{
                  textAlign: "right",
                  color: "var(--color-text-secondary)",
                  fontSize: "var(--font-size-caption)",
                  fontWeight:
                    "var(--font-weight-subheading)" as unknown as number,
                  padding: "var(--spacing-element) var(--spacing-group)",
                  borderBottom: "var(--border-width) solid var(--border-color)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Issues
              </th>
              <th
                style={{
                  textAlign: "left",
                  color: "var(--color-text-secondary)",
                  fontSize: "var(--font-size-caption)",
                  fontWeight:
                    "var(--font-weight-subheading)" as unknown as number,
                  padding: "var(--spacing-element) var(--spacing-group)",
                  borderBottom: "var(--border-width) solid var(--border-color)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([name, data]) => {
              const pct = round((data.total_tokens / totalTokens) * 100, 1);
              return (
                <tr key={name}>
                  <td
                    style={{
                      padding: "var(--spacing-element) var(--spacing-group)",
                      borderBottom:
                        "var(--border-width) solid var(--border-color)",
                      color: "var(--color-text)",
                      fontWeight:
                        "var(--font-weight-subheading)" as unknown as number,
                    }}
                  >
                    {name}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      padding: "var(--spacing-element) var(--spacing-group)",
                      borderBottom:
                        "var(--border-width) solid var(--border-color)",
                      color: "var(--color-text)",
                    }}
                  >
                    {fmtNum(data.total_tokens)}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      padding: "var(--spacing-element) var(--spacing-group)",
                      borderBottom:
                        "var(--border-width) solid var(--border-color)",
                      color: "var(--color-text)",
                    }}
                  >
                    {data.total_stages}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      padding: "var(--spacing-element) var(--spacing-group)",
                      borderBottom:
                        "var(--border-width) solid var(--border-color)",
                      color: "var(--color-text)",
                    }}
                  >
                    {data.unique_issues}
                  </td>
                  <td
                    style={{
                      padding: "var(--spacing-element) var(--spacing-group)",
                      borderBottom:
                        "var(--border-width) solid var(--border-color)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <div
                      className="product-bar"
                      style={{
                        width: `${pct}%`,
                        height: 8,
                        borderRadius: 4,
                        background: "var(--color-primary)",
                        marginBottom: 4,
                      }}
                    />{" "}
                    {pct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
