/**
 * Section 1: Executive Summary
 * Converted from design reference ExecutiveSummary.jsx.
 */
import type { CSSProperties } from "react";
import { WowBadge, fmtNum } from "./chartUtils.tsx";

function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export interface ExecutiveSummaryProps {
  totalTokens: number;
  tokensDelta: number | null;
  tokensPerIssueMedian: number;
  tokensPerIssueMean: number;
  tokPerIssueWow: number | null;
  uniqueIssues: number;
  cacheHitRate: number;
  cacheWow: number | null;
}

export default function ExecutiveSummary({
  totalTokens,
  tokensDelta,
  tokensPerIssueMedian,
  tokensPerIssueMean,
  tokPerIssueWow,
  uniqueIssues,
  cacheHitRate,
  cacheWow,
}: ExecutiveSummaryProps) {
  const kpiGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  };

  const kpiCardStyle: CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    padding: "16px",
  };

  const kpiLabelStyle: CSSProperties = {
    color: "var(--text-muted)",
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const kpiValueStyle: CSSProperties = {
    color: "var(--text-bright)",
    fontSize: "1.6rem",
    fontWeight: 600,
    margin: "4px 0",
  };

  const kpiDeltaStyle: CSSProperties = {
    fontSize: "0.85rem",
  };

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
        Executive Summary
      </h2>
      <div style={kpiGridStyle}>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Total Tokens</div>
          <div style={kpiValueStyle}>{fmtNum(totalTokens)}</div>
          <div style={kpiDeltaStyle}>
            <WowBadge delta={tokensDelta} />
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Tokens / Issue (median)</div>
          <div style={kpiValueStyle}>{fmtNum(tokensPerIssueMedian)}</div>
          <div style={kpiDeltaStyle}>
            mean: {fmtNum(tokensPerIssueMean)}{" "}
            <WowBadge delta={tokPerIssueWow} />
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Issues Processed</div>
          <div style={kpiValueStyle}>{fmtNum(uniqueIssues)}</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Cache Hit Rate</div>
          <div style={kpiValueStyle}>{round(cacheHitRate, 1)}%</div>
          <div style={kpiDeltaStyle}>
            <WowBadge delta={cacheWow} />
          </div>
        </div>
      </div>
    </section>
  );
}
