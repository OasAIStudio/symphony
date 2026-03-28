/**
 * Cold-start graceful degradation tests (SYMPH-146).
 *
 * Verifies that when analysis.json has cold_start: true and data_span_days < 7,
 * sections requiring 7+ days of data show appropriate placeholder messaging
 * instead of empty charts.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ColdStartBanner,
  ColdStartPlaceholder,
  EfficiencyScorecard,
  ExecutiveSummary,
  OutlierAnalysis,
  PerProductBreakdown,
  PerStageTrend,
  PerTicketCostTrend,
  ReportFooter,
  ReportHeader,
  StageEfficiency,
} from "./components/index.ts";
import coldStartData from "./data/cold-start-analysis.json";
import type { AnalysisData } from "./types.ts";

const data = coldStartData as AnalysisData;

/** Strip React SSR comment nodes for cleaner assertions. */
function stripComments(html: string): string {
  return html.replace(/<!-- -->/g, "");
}

describe("cold start: ColdStartBanner", () => {
  it("renders banner with day count and default message", () => {
    const html = stripComments(
      renderToString(<ColdStartBanner dataSpanDays={3} />),
    );
    expect(html).toContain("Limited Data");
    expect(html).toContain("3 days");
    expect(html).toContain("cold-start-banner");
    expect(html).toContain("at least 7 days");
  });

  it("renders banner with custom message", () => {
    const html = stripComments(
      renderToString(
        <ColdStartBanner
          dataSpanDays={2}
          message="Custom cold-start message"
        />,
      ),
    );
    expect(html).toContain("Custom cold-start message");
    expect(html).toContain("2 days");
  });

  it("renders singular day for 1 day", () => {
    const html = stripComments(
      renderToString(<ColdStartBanner dataSpanDays={1} />),
    );
    expect(html).toContain("1 day)");
  });
});

describe("cold start: ColdStartPlaceholder", () => {
  it("shows remaining days needed", () => {
    const html = stripComments(
      renderToString(<ColdStartPlaceholder requiredDays={7} currentDays={3} />),
    );
    expect(html).toContain("cold-start-placeholder");
    expect(html).toContain("Collecting data");
    expect(html).toContain("at least 7 days");
    expect(html).toContain("4 more days needed");
  });

  it("shows singular day when 1 more needed", () => {
    const html = stripComments(
      renderToString(<ColdStartPlaceholder requiredDays={7} currentDays={6} />),
    );
    expect(html).toContain("1 more day needed");
  });
});

describe("cold start: PerStageTrend shows placeholder", () => {
  it("renders placeholder instead of chart when coldStart=true", () => {
    const html = stripComments(
      renderToString(
        <PerStageTrend
          perStageTrend={data.per_stage_trend}
          coldStart={true}
          dataSpanDays={3}
        />,
      ),
    );
    expect(html).toContain("Per-Stage Utilization Trend");
    expect(html).toContain("cold-start-placeholder");
    expect(html).toContain("Collecting data");
    expect(html).toContain("4 more days needed");
    // Should NOT contain chart elements
    expect(html).not.toContain("svg");
    expect(html).not.toContain("polygon");
  });

  it("renders chart normally when coldStart is false", () => {
    const html = renderToString(
      <PerStageTrend
        perStageTrend={data.per_stage_trend}
        coldStart={false}
        dataSpanDays={3}
      />,
    );
    expect(html).toContain("Per-Stage Utilization Trend");
    expect(html).not.toContain("cold-start-placeholder");
  });
});

describe("cold start: PerTicketCostTrend shows placeholder", () => {
  it("renders placeholder instead of sparkline when coldStart=true", () => {
    const html = stripComments(
      renderToString(
        <PerTicketCostTrend
          perTicket={data.per_ticket_trend}
          coldStart={true}
          dataSpanDays={3}
        />,
      ),
    );
    expect(html).toContain("Per-Ticket Cost Trend");
    expect(html).toContain("cold-start-placeholder");
    expect(html).toContain("Collecting data");
    // Should NOT contain the sparkline/stats
    expect(html).not.toContain("Rolling median");
  });

  it("renders sparkline normally when coldStart is false", () => {
    const html = renderToString(
      <PerTicketCostTrend
        perTicket={data.per_ticket_trend}
        coldStart={false}
        dataSpanDays={3}
      />,
    );
    expect(html).toContain("Per-Ticket Cost Trend");
    expect(html).toContain("Rolling median");
    expect(html).not.toContain("cold-start-placeholder");
  });
});

describe("cold start: EfficiencyScorecard shows trend note", () => {
  it("renders trend unavailable note when coldStart=true", () => {
    const html = renderToString(
      <EfficiencyScorecard
        scorecard={data.efficiency_scorecard}
        coldStart={true}
      />,
    );
    expect(html).toContain("Efficiency Scorecard");
    expect(html).toContain("Trend data unavailable");
    expect(html).toContain("7+ days");
    // Still shows current values
    expect(html).toContain("Cache Efficiency");
    expect(html).toContain("Output Ratio");
  });

  it("does not show trend note when coldStart is false", () => {
    const html = renderToString(
      <EfficiencyScorecard
        scorecard={data.efficiency_scorecard}
        coldStart={false}
      />,
    );
    expect(html).not.toContain("Trend data unavailable");
  });
});

describe("cold start: OutlierAnalysis shows placeholder", () => {
  it("renders placeholder when coldStart=true", () => {
    const html = renderToString(
      <OutlierAnalysis outliers={[]} coldStart={true} dataSpanDays={3} />,
    );
    expect(html).toContain("Outlier Analysis");
    expect(html).toContain("cold-start-placeholder");
    expect(html).toContain("Collecting data");
    expect(html).toContain("Outlier detection requires at least 7 days");
    // Should NOT show the normal empty state
    expect(html).not.toContain("No outliers detected");
  });

  it("renders normal empty state when coldStart is false", () => {
    const html = renderToString(
      <OutlierAnalysis outliers={[]} coldStart={false} dataSpanDays={3} />,
    );
    expect(html).toContain("No outliers detected");
    expect(html).not.toContain("cold-start-placeholder");
  });
});

describe("cold start: sections that work without 7 days", () => {
  it("ReportHeader renders normally with cold-start data", () => {
    const html = renderToString(
      <ReportHeader
        today={data.analyzed_at.slice(0, 10)}
        recordCount={data.record_count}
        dataSpanDays={data.data_span_days}
      />,
    );
    expect(html).toContain("Symphony Token Report");
    expect(html).toContain("2026-03-25");
    expect(html).toContain("8");
    expect(html).toContain("3");
  });

  it("ExecutiveSummary renders with cold-start totals", () => {
    const es = data.executive_summary;
    const html = renderToString(
      <ExecutiveSummary
        totalTokens={es.total_tokens.value}
        tokensDelta={null}
        tokensPerIssueMedian={data.per_ticket_trend.median}
        tokensPerIssueMean={data.per_ticket_trend.mean}
        tokPerIssueWow={null}
        uniqueIssues={es.unique_issues.value}
        cacheHitRate={45}
        cacheWow={null}
      />,
    );
    expect(html).toContain("Executive Summary");
    expect(html).toContain("420,000");
    expect(html).toContain("3"); // unique issues
  });

  it("StageEfficiency renders with cold-start stage data", () => {
    const html = renderToString(
      <StageEfficiency perStageSpend={data.per_stage_spend} />,
    );
    expect(html).toContain("Stage Efficiency");
    expect(html).toContain("investigate");
    expect(html).toContain("implement");
  });

  it("PerProductBreakdown renders with cold-start product data", () => {
    const html = renderToString(
      <PerProductBreakdown perProduct={data.per_product} />,
    );
    expect(html).toContain("Per-Product Breakdown");
    expect(html).toContain("symphony-ts");
  });

  it("ReportFooter renders normally", () => {
    const html = renderToString(<ReportFooter />);
    expect(html).toContain("SYMPH-131");
  });
});

describe("cold start: per_stage_trend fixture shape", () => {
  it("has date-keyed daily_avg in per_stage_trend", () => {
    const trend = data.per_stage_trend;
    for (const stage of Object.keys(trend)) {
      const avg = trend[stage].daily_avg;
      expect(typeof avg).toBe("object");
      expect(avg).not.toBeNull();
      const dates = Object.keys(avg as Record<string, number>);
      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("has fewer date entries than warm fixture (cold start = 3 days)", () => {
    const trend = data.per_stage_trend;
    for (const stage of Object.keys(trend)) {
      const avg = trend[stage].daily_avg;
      const dates = Object.keys(avg as Record<string, number>);
      expect(dates.length).toBeLessThanOrEqual(data.data_span_days);
    }
  });
});

describe("cold start: analysis.json fixture shape", () => {
  it("has cold_start: true", () => {
    expect(data.cold_start).toBe(true);
  });

  it("has data_span_days < 7", () => {
    expect(data.data_span_days).toBeLessThan(7);
  });

  it("has cold_start_tier '<7d'", () => {
    expect(data.cold_start_tier).toBe("<7d");
  });

  it("has message about insufficient data", () => {
    expect(data.message).toContain("insufficient data");
  });

  it("inflections have insufficient data status", () => {
    expect(data.inflections).toHaveProperty("status", "insufficient data");
  });

  it("outliers have insufficient data status", () => {
    expect(data.outliers).toHaveProperty("status", "insufficient data");
  });
});
