/**
 * v5 Design Reference: Issue Leaderboard
 * Source of truth for inline styles — convert mechanically to TypeScript.
 * Uses v5 CSS variables exclusively (no old GitHub-dark palette).
 *
 * Props:
 *   - leaderboard: array of { identifier, title, tokens, linear_url }
 *     Pre-sorted by tokens descending. Only the first 25 are rendered.
 */
import React from "react";
import { fmtNum } from "./chartUtils.jsx";

export default function IssueLeaderboard({ leaderboard }) {
  const items = Array.isArray(leaderboard) ? leaderboard.slice(0, 25) : [];

  return (
    <section>
      <h2
        style={{
          color: "var(--text-bright)",
          fontSize: "1.2rem",
          margin: "32px 0 16px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        Issue Leaderboard
      </h2>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "16px",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              #
            </th>
            <th
              style={{
                textAlign: "left",
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              Issue
            </th>
            <th
              style={{
                textAlign: "left",
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              Title
            </th>
            <th
              style={{
                textAlign: "right",
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              Tokens
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.identifier}>
              <td
                style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                {i + 1}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                <a
                  href={item.linear_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--accent)",
                    textDecoration: "none",
                  }}
                >
                  {item.identifier}
                </a>
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                {item.title}
              </td>
              <td
                style={{
                  textAlign: "right",
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                {fmtNum(item.tokens)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
