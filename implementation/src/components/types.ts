/**
 * TypeScript interfaces for the skill-validation-v1 dashboard.
 * All dynamic values are expressed as props — never hardcoded.
 */

export interface HeaderProps {
  title: string;
  lastUpdated: string;
  version: string;
}

export interface Metric {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
}

export interface MetricsPanelProps {
  metrics: Metric[];
}

export interface Agent {
  name: string;
  status: "Running" | "Idle" | "Error";
  tasks: number;
  tokens: string;
  cost: string;
  lastRun: string;
  sparkData: number[];
}

export type SortDirection = "asc" | "desc";

export interface DataTableProps {
  agents: Agent[];
  sortColumn: string;
  sortDirection: SortDirection;
  onSort?: (column: string) => void;
}

export interface Series {
  name: string;
  color: string;
  data: number[];
}

export interface ChartSectionProps {
  title: string;
  subtitle: string;
  series: Series[];
  xLabels: string[];
  yMax: number;
}

export interface FooterProps {
  brand: string;
  year: string;
}

export interface DashboardProps {
  header: HeaderProps;
  metrics: Metric[];
  agents: Agent[];
  chartTitle: string;
  chartSubtitle: string;
  chartSeries: Series[];
  chartXLabels: string[];
  chartYMax: number;
  footerBrand: string;
  footerYear: string;
}
