/**
 * Section 6: Issue Leaderboard
 * Converted from design reference IssueLeaderboard.jsx.
 * Rebuilt with v5 inline styles (SYMPH-201).
 *
 * SYMPH-179: leaderboard data now populated by computeAnalysis() with linear_url.
 */
import type React from "react";
import type { LeaderboardEntry } from "../types.ts";
import { fmtNum } from "./chartUtils.tsx";

export interface IssueLeaderboardProps {
  leaderboard: LeaderboardEntry[];
}

/* ── Inline style objects (SYMPH-201) ── */

const sectionHeadingStyle: React.CSSProperties = {
  color: "var(--text-bright)",
  fontSize: "1.2rem",
  margin: "32px 0 16px",
  paddingBottom: "8px",
  borderBottom: "1px solid var(--border)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginBottom: "16px",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  color: "var(--text-muted)",
  fontSize: "0.8rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
};

const thRightStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text)",
};

const tdRightStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
};

const linkStyle: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "none",
};

export default function IssueLeaderboard({
  leaderboard,
}: IssueLeaderboardProps) {
  const items = Array.isArray(leaderboard) ? leaderboard.slice(0, 25) : [];

  return (
    <section>
      <h2 style={sectionHeadingStyle}>Issue Leaderboard</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Issue</th>
            <th style={thStyle}>Title</th>
            <th style={thRightStyle}>Tokens</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.identifier}>
              <td style={tdStyle}>{i + 1}</td>
              <td style={tdStyle}>
                <a
                  href={item.linear_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkStyle}
                >
                  {item.identifier}
                </a>
              </td>
              <td style={tdStyle}>{item.title}</td>
              <td style={tdRightStyle}>{fmtNum(item.tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
