import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./App.tsx";
import ChartSection from "./components/ChartSection.tsx";
import DataTable from "./components/DataTable.tsx";
import Footer from "./components/Footer.tsx";
import Header from "./components/Header.tsx";
import MetricsPanel from "./components/MetricsPanel.tsx";

/**
 * Tests for skill-validation-v1 implementation.
 * Validates section ordering, typography hierarchy, and dynamic props.
 */

describe("Section ordering", () => {
  it("renders all five sections in correct order: header, metrics, data-table, chart, footer", () => {
    const html = renderToStaticMarkup(createElement(App));

    // All sections present
    expect(html).toContain("<header");
    expect(html).toContain("<footer");
    // Table for data-table section
    expect(html).toContain("<table");
    // SVG for chart section
    expect(html).toContain("<svg");

    // Section ordering: header before metrics panel, metrics before table, table before chart, chart before footer
    const headerIdx = html.indexOf("<header");
    const metricsIdx = html.indexOf("Active Agents");
    const tableIdx = html.indexOf("<table");
    const chartIdx = html.indexOf("Token Usage Over Time");
    const footerIdx = html.indexOf("<footer");

    expect(headerIdx).toBeLessThan(metricsIdx);
    expect(metricsIdx).toBeLessThan(tableIdx);
    expect(tableIdx).toBeLessThan(chartIdx);
    expect(chartIdx).toBeLessThan(footerIdx);
  });
});

describe("Typography hierarchy", () => {
  it("heading (h1) uses 28px font size — larger than body (14px)", () => {
    const html = renderToStaticMarkup(
      createElement(Header, {
        title: "Test Title",
        lastUpdated: "now",
        version: "v1.0",
      }),
    );
    expect(html).toContain("font-size:28px");
    expect(html).toContain("font-weight:700");
  });

  it("subheading (h2) uses 18px font size — smaller than heading, larger than body", () => {
    const html = renderToStaticMarkup(
      createElement(ChartSection, {
        title: "Chart Title",
        subtitle: "Sub",
        series: [],
        xLabels: ["Mon"],
        yMax: 100,
      }),
    );
    expect(html).toContain("font-size:18px");
    expect(html).toContain("font-weight:600");
  });

  it("body text uses 14px font size", () => {
    const html = renderToStaticMarkup(
      createElement(DataTable, {
        agents: [],
        sortColumn: "Tasks",
        sortDirection: "desc",
      }),
    );
    expect(html).toContain("font-size:14px");
  });

  it("caption text uses 12px font size", () => {
    const html = renderToStaticMarkup(
      createElement(Footer, {
        brand: "Test",
        year: "2026",
      }),
    );
    expect(html).toContain("font-size:12px");
  });

  it("uses Inter font family as specified in structure.md", () => {
    const html = renderToStaticMarkup(createElement(App));
    // Inter is the primary font family throughout
    expect(html).toContain("Inter");
  });

  it("uses monospace font family for code-style text as specified in structure.md", () => {
    const html = renderToStaticMarkup(createElement(App));
    // Mono/monospace is used for version badges, agent names, and numeric values
    expect(html).toContain("monospace");
  });
});

describe("Dynamic values as props", () => {
  it("Header renders dynamic props, not hardcoded values", () => {
    const html = renderToStaticMarkup(
      createElement(Header, {
        title: "Custom Title XYZ",
        lastUpdated: "2099-01-01",
        version: "v9.9.9",
      }),
    );
    expect(html).toContain("Custom Title XYZ");
    expect(html).toContain("2099-01-01");
    expect(html).toContain("v9.9.9");
  });

  it("MetricsPanel renders dynamic metric values", () => {
    const html = renderToStaticMarkup(
      createElement(MetricsPanel, {
        metrics: [
          {
            label: "Custom Metric",
            value: "999",
            delta: "50%",
            trend: "up" as const,
          },
        ],
      }),
    );
    expect(html).toContain("Custom Metric");
    expect(html).toContain("999");
    expect(html).toContain("50%");
  });

  it("DataTable renders dynamic agent data", () => {
    const html = renderToStaticMarkup(
      createElement(DataTable, {
        agents: [
          {
            name: "test-agent-xyz",
            status: "Running" as const,
            tasks: 777,
            tokens: "3.3M",
            cost: "$99.99",
            lastRun: "just now",
            sparkData: [1, 2, 3],
          },
        ],
        sortColumn: "Tasks",
        sortDirection: "desc" as const,
      }),
    );
    expect(html).toContain("test-agent-xyz");
    expect(html).toContain("777");
    expect(html).toContain("3.3M");
    expect(html).toContain("$99.99");
  });

  it("ChartSection renders dynamic series data", () => {
    const html = renderToStaticMarkup(
      createElement(ChartSection, {
        title: "Custom Chart Title",
        subtitle: "Custom period",
        series: [
          { name: "custom-series", color: "#FF0000", data: [100, 200, 300] },
        ],
        xLabels: ["A", "B", "C"],
        yMax: 300,
      }),
    );
    expect(html).toContain("Custom Chart Title");
    expect(html).toContain("Custom period");
    expect(html).toContain("custom-series");
  });

  it("Footer renders dynamic brand and year", () => {
    const html = renderToStaticMarkup(
      createElement(Footer, {
        brand: "Custom Brand",
        year: "3000",
      }),
    );
    expect(html).toContain("Custom Brand");
    expect(html).toContain("3000");
  });
});

describe("Design fidelity", () => {
  it("uses correct color tokens from styles.json", () => {
    const html = renderToStaticMarkup(createElement(App));
    // Primary blue
    expect(html).toContain("#1E40AF");
    // Secondary indigo
    expect(html).toContain("#6366F1");
    // Accent green
    expect(html).toContain("#10B981");
    // Text color
    expect(html).toContain("#0F172A");
    // Text secondary
    expect(html).toContain("#64748B");
    // Border color
    expect(html).toContain("#E2E8F0");
  });

  it("uses correct spacing values from styles.json", () => {
    const html = renderToStaticMarkup(createElement(App));
    // Section gap (32px padding) and group gap (16px gap)
    expect(html).toContain("gap:16px");
  });

  it("uses correct border radius from styles.json", () => {
    const html = renderToStaticMarkup(createElement(App));
    // 8px border radius
    expect(html).toContain("border-radius:8px");
  });

  it("includes SVG chart with multiple series lines", () => {
    const html = renderToStaticMarkup(createElement(App));
    // Three path elements for three series
    const pathCount = (html.match(/<path /g) || []).length;
    expect(pathCount).toBeGreaterThanOrEqual(3);
  });

  it("includes sparkline SVGs in data table rows", () => {
    const html = renderToStaticMarkup(createElement(App));
    // Sparklines use polyline elements
    const polylineCount = (html.match(/<polyline /g) || []).length;
    expect(polylineCount).toBeGreaterThanOrEqual(3);
  });

  it("renders status indicators with correct colors", () => {
    const html = renderToStaticMarkup(createElement(App));
    // Running = green, Idle = gray
    expect(html).toContain("#10B981"); // Running
    expect(html).toContain("#94A3B8"); // Idle
  });
});
