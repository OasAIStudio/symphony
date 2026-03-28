import type { DataTableProps } from "./types.ts";

const statusColor: Record<string, string> = {
  Running: "#10B981",
  Idle: "#94A3B8",
  Error: "#EF4444",
};

const columns = ["Agent", "Status", "Tasks", "Tokens", "Cost", "Last Run"];

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const h = 20;
  const w = 60;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map(
      (v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`,
    )
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      role="img"
      aria-label="Cost sparkline"
      style={{ verticalAlign: "middle", marginLeft: "8px" }}
    >
      <title>Cost sparkline</title>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

/**
 * Section 3: Data Table
 * Agent status table with repeating rows, inline sparklines, and sortable columns.
 * Font families: Inter, Mono (per structure.md)
 */
export default function DataTable({
  agents,
  sortColumn,
  sortDirection,
  onSort,
}: DataTableProps) {
  return (
    <section
      style={{
        padding: "0 32px",
        width: "100%",
        maxWidth: "1440px",
        minHeight: "600px",
        boxSizing: "border-box",
        overflow: "auto",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "Inter, sans-serif",
          fontSize: "14px",
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: sort headers are mouse-interactive per design spec
              <th
                key={col}
                onClick={() => onSort?.(col)}
                style={{
                  textAlign: "left",
                  padding: "12px 16px",
                  borderBottom: "2px solid #E2E8F0",
                  fontWeight: 600,
                  color: "#0F172A",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                {col}
                {sortColumn === col && (
                  <span style={{ marginLeft: "4px" }}>
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr
              key={agent.name}
              style={{
                borderBottom: "1px solid #E2E8F0",
                transition: "background 150ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#F1F5F9";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "transparent";
              }}
            >
              <td
                style={{
                  padding: "12px 16px",
                  fontFamily: "monospace",
                  fontSize: "13px",
                }}
              >
                {agent.name}
              </td>
              <td style={{ padding: "12px 16px" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: statusColor[agent.status],
                    marginRight: "8px",
                    ...(agent.status === "Running"
                      ? { animation: "pulse 2s infinite" }
                      : {}),
                  }}
                />
                {agent.status}
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "monospace" }}>
                {agent.tasks}
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "monospace" }}>
                {agent.tokens}
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "monospace" }}>
                {agent.cost}
                <Sparkline
                  data={agent.sparkData}
                  color={statusColor[agent.status]}
                />
              </td>
              <td style={{ padding: "12px 16px", color: "#64748B" }}>
                {agent.lastRun}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
