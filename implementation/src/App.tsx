import { useState } from "react";
import {
  ChartSection,
  DataTable,
  Footer,
  Header,
  MetricsPanel,
} from "./components/index.ts";
import type {
  Agent,
  DashboardProps,
  Metric,
  Series,
  SortDirection,
} from "./components/types.ts";

/**
 * Default props derived from the skill-validation-v1 data-map.
 * All values are injected via props — none are hardcoded in components.
 */
const defaultProps: DashboardProps = {
  header: {
    title: "Pipeline Orchestration Dashboard",
    lastUpdated: "2026-03-26 14:30 UTC",
    version: "v2.4.1",
  },
  metrics: [
    { label: "Active Agents", value: "12", delta: "12%", trend: "up" },
    { label: "Tasks Completed", value: "1,847", delta: "3%", trend: "down" },
    { label: "Avg Cycle Time", value: "4.2h", delta: "", trend: "flat" },
    { label: "Success Rate", value: "94.3%", delta: "1.2%", trend: "up" },
  ] satisfies Metric[],
  agents: [
    {
      name: "agent-alpha",
      status: "Running",
      tasks: 342,
      tokens: "1.2M",
      cost: "$14.20",
      lastRun: "2 min ago",
      sparkData: [10, 14, 12, 18, 15, 20, 17],
    },
    {
      name: "agent-beta",
      status: "Idle",
      tasks: 289,
      tokens: "980K",
      cost: "$11.76",
      lastRun: "15 min ago",
      sparkData: [8, 9, 11, 10, 12, 11, 9],
    },
    {
      name: "agent-gamma",
      status: "Running",
      tasks: 412,
      tokens: "1.5M",
      cost: "$18.00",
      lastRun: "1 min ago",
      sparkData: [15, 18, 20, 22, 19, 25, 23],
    },
  ] satisfies Agent[],
  chartTitle: "Token Usage Over Time",
  chartSubtitle: "Last 7 days",
  chartSeries: [
    {
      name: "agent-alpha",
      color: "#1E40AF",
      data: [800000, 950000, 1100000, 900000, 1200000, 1050000, 1150000],
    },
    {
      name: "agent-beta",
      color: "#6366F1",
      data: [600000, 700000, 650000, 750000, 800000, 720000, 680000],
    },
    {
      name: "agent-gamma",
      color: "#10B981",
      data: [1000000, 1200000, 1400000, 1300000, 1500000, 1350000, 1450000],
    },
  ] satisfies Series[],
  chartXLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  chartYMax: 2000000,
  footerBrand: "Symphony Orchestrator",
  footerYear: "2026",
};

/**
 * SkillValidationDashboard — full page assembled from the
 * skill-validation-v1 design reference bundle.
 *
 * Sections render in order: Header → MetricsPanel → DataTable → ChartSection → Footer
 */
export default function App(props: Partial<DashboardProps> = {}) {
  const p = { ...defaultProps, ...props };
  const [sortColumn, setSortColumn] = useState("Tasks");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  function handleSort(column: string) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  }

  return (
    <div
      style={{
        backgroundColor: "#F8FAFC",
        minHeight: "100vh",
        margin: "0 auto",
        maxWidth: "1440px",
      }}
    >
      {/* Pulse animation for Running status indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <Header
        title={p.header.title}
        lastUpdated={p.header.lastUpdated}
        version={p.header.version}
      />
      <MetricsPanel metrics={p.metrics} />
      <DataTable
        agents={p.agents}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
      />
      <ChartSection
        title={p.chartTitle}
        subtitle={p.chartSubtitle}
        series={p.chartSeries}
        xLabels={p.chartXLabels}
        yMax={p.chartYMax}
      />
      <Footer brand={p.footerBrand} year={p.footerYear} />
    </div>
  );
}
