import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";

import {
  DEFAULT_OBSERVABILITY_REFRESH_MS,
  DEFAULT_OBSERVABILITY_RENDER_INTERVAL_MS,
} from "../config/defaults.js";
import { ERROR_CODES } from "../errors/codes.js";
import type { RuntimeSnapshot } from "../logging/runtime-snapshot.js";

const DEFAULT_SNAPSHOT_TIMEOUT_MS = 1_000;

export interface IssueDetailRunningState {
  session_id: string | null;
  turn_count: number;
  state: string;
  started_at: string;
  last_event: string | null;
  last_message: string | null;
  last_event_at: string | null;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface IssueDetailRetryState {
  attempt: number;
  due_at: string;
  error: string | null;
}

export interface IssueDetailResponse {
  issue_identifier: string;
  issue_id: string;
  status: "claimed" | "released" | "retry_queued" | "running" | "unclaimed";
  workspace: {
    path: string;
  } | null;
  attempts: {
    restart_count: number;
    current_retry_attempt: number | null;
  };
  running: IssueDetailRunningState | null;
  retry: IssueDetailRetryState | null;
  logs: {
    codex_session_logs: Array<{
      label: string;
      path: string;
      url: string | null;
    }>;
  };
  recent_events: Array<{
    at: string;
    event: string;
    message: string | null;
  }>;
  last_error: string | null;
  tracked: Record<string, unknown>;
}

export interface RefreshResponse {
  queued: boolean;
  coalesced: boolean;
  requested_at: string;
  operations: string[];
}

export interface DashboardServerHost {
  getRuntimeSnapshot(): RuntimeSnapshot | Promise<RuntimeSnapshot>;
  getIssueDetails(
    issueIdentifier: string,
  ): IssueDetailResponse | null | Promise<IssueDetailResponse | null>;
  requestRefresh(): RefreshResponse | Promise<RefreshResponse>;
  subscribeToSnapshots?(listener: () => void): () => void;
}

export interface DashboardServerOptions {
  host: DashboardServerHost;
  hostname?: string;
  snapshotTimeoutMs?: number;
  refreshMs?: number;
  renderIntervalMs?: number;
  liveUpdatesEnabled?: boolean;
}

export interface DashboardServerInstance {
  readonly server: Server;
  readonly hostname: string;
  readonly port: number;
  close(): Promise<void>;
}

interface DashboardRenderOptions {
  liveUpdatesEnabled: boolean;
}

class DashboardLiveUpdatesController {
  readonly #host: DashboardServerHost;
  readonly #snapshotTimeoutMs: number;
  readonly #refreshMs: number;
  readonly #renderIntervalMs: number;
  readonly #clients = new Set<ServerResponse<IncomingMessage>>();
  #flushTimer: NodeJS.Timeout | null = null;
  #heartbeatTimer: NodeJS.Timeout | null = null;
  #unsubscribeHost: (() => void) | null = null;
  #closed = false;

  constructor(options: {
    host: DashboardServerHost;
    snapshotTimeoutMs: number;
    refreshMs: number;
    renderIntervalMs: number;
  }) {
    this.#host = options.host;
    this.#snapshotTimeoutMs = options.snapshotTimeoutMs;
    this.#refreshMs = options.refreshMs;
    this.#renderIntervalMs = options.renderIntervalMs;
  }

  start(): void {
    if (typeof this.#host.subscribeToSnapshots === "function") {
      this.#unsubscribeHost = this.#host.subscribeToSnapshots(() => {
        this.scheduleBroadcast();
      });
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#unsubscribeHost?.();
    this.#unsubscribeHost = null;
    this.clearTimers();

    for (const client of this.#clients) {
      client.end();
    }
    this.#clients.clear();
  }

  async handleEventsRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    response.statusCode = 200;
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-cache, no-transform");
    response.setHeader("connection", "keep-alive");
    response.setHeader("x-accel-buffering", "no");
    response.write(`retry: ${this.#refreshMs}\n\n`);

    this.#clients.add(response);
    this.startHeartbeat();

    const cleanup = () => {
      this.#clients.delete(response);
      if (this.#clients.size === 0) {
        this.stopHeartbeat();
      }
    };

    request.on("close", cleanup);
    response.on("close", cleanup);

    await this.writeSnapshot(response);
  }

  scheduleBroadcast(): void {
    if (this.#closed || this.#clients.size === 0 || this.#flushTimer !== null) {
      return;
    }

    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null;
      void this.broadcastSnapshot();
    }, this.#renderIntervalMs);
  }

  private startHeartbeat(): void {
    if (this.#heartbeatTimer !== null) {
      return;
    }

    this.#heartbeatTimer = setInterval(() => {
      this.scheduleBroadcast();
    }, this.#refreshMs);
  }

  private stopHeartbeat(): void {
    if (this.#heartbeatTimer === null) {
      return;
    }

    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
  }

  private clearTimers(): void {
    if (this.#flushTimer !== null) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = null;
    }
    this.stopHeartbeat();
  }

  private async broadcastSnapshot(): Promise<void> {
    const clients = [...this.#clients];
    if (clients.length === 0) {
      return;
    }

    await Promise.allSettled(
      clients.map((client) => this.writeSnapshot(client)),
    );
  }

  private async writeSnapshot(response: ServerResponse): Promise<void> {
    try {
      const snapshot = await readSnapshot(this.#host, this.#snapshotTimeoutMs);
      response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    } catch (error) {
      response.write(
        `event: error\ndata: ${JSON.stringify({
          code: isSnapshotTimeoutError(error)
            ? ERROR_CODES.snapshotTimedOut
            : ERROR_CODES.snapshotUnavailable,
          message: toErrorMessage(error),
        })}\n\n`,
      );
    }
  }
}

export function createDashboardServer(options: DashboardServerOptions): Server {
  const hostname = options.hostname ?? "127.0.0.1";
  const snapshotTimeoutMs =
    options.snapshotTimeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS;
  const liveController = new DashboardLiveUpdatesController({
    host: options.host,
    snapshotTimeoutMs,
    refreshMs: options.refreshMs ?? DEFAULT_OBSERVABILITY_REFRESH_MS,
    renderIntervalMs:
      options.renderIntervalMs ?? DEFAULT_OBSERVABILITY_RENDER_INTERVAL_MS,
  });
  liveController.start();

  const handler = createDashboardRequestHandler({
    ...options,
    hostname,
    snapshotTimeoutMs,
    liveController,
  });
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  server.on("close", () => {
    void liveController.close();
  });
  return server;
}

export async function startDashboardServer(
  options: DashboardServerOptions & {
    port: number;
  },
): Promise<DashboardServerInstance> {
  const server = createDashboardServer(options);
  const hostname = options.hostname ?? "127.0.0.1";

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Dashboard server did not bind to a TCP address.");
  }

  return {
    server,
    hostname,
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

export function createDashboardRequestHandler(
  options: DashboardServerOptions & {
    liveController?: DashboardLiveUpdatesController;
  },
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const hostname = options.hostname ?? "127.0.0.1";
  const snapshotTimeoutMs =
    options.snapshotTimeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS;
  const renderOptions: DashboardRenderOptions = {
    liveUpdatesEnabled: options.liveUpdatesEnabled ?? true,
  };

  return async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${hostname}`);
      const method = request.method ?? "GET";

      if (url.pathname === "/") {
        if (method !== "GET") {
          writeMethodNotAllowed(response, ["GET"]);
          return;
        }

        const snapshot = await readSnapshot(options.host, snapshotTimeoutMs);
        writeHtml(response, 200, renderDashboardHtml(snapshot, renderOptions));
        return;
      }

      if (url.pathname === "/api/v1/state") {
        if (method !== "GET") {
          writeMethodNotAllowed(response, ["GET"]);
          return;
        }

        const snapshot = await readSnapshot(options.host, snapshotTimeoutMs);
        writeJson(response, 200, snapshot);
        return;
      }

      if (url.pathname === "/api/v1/events") {
        if (method !== "GET") {
          writeMethodNotAllowed(response, ["GET"]);
          return;
        }

        if (renderOptions.liveUpdatesEnabled !== true) {
          writeNotFound(response, url.pathname);
          return;
        }

        if (options.liveController === undefined) {
          writeJsonError(response, 503, ERROR_CODES.snapshotUnavailable, {
            message: "Live dashboard updates are unavailable.",
          });
          return;
        }

        await options.liveController.handleEventsRequest(request, response);
        return;
      }

      if (url.pathname === "/api/v1/refresh") {
        if (method !== "POST") {
          writeMethodNotAllowed(response, ["POST"]);
          return;
        }

        await readRequestBody(request);
        const refresh = await options.host.requestRefresh();
        writeJson(response, 202, refresh);
        return;
      }

      if (url.pathname.startsWith("/api/v1/")) {
        if (method !== "GET") {
          writeMethodNotAllowed(response, ["GET"]);
          return;
        }

        const issueIdentifier = decodeURIComponent(
          url.pathname.slice("/api/v1/".length),
        );
        const issue = await options.host.getIssueDetails(issueIdentifier);
        if (issue === null) {
          writeJsonError(response, 404, ERROR_CODES.issueNotFound, {
            message: `Issue '${issueIdentifier}' is not tracked in the current runtime state.`,
          });
          return;
        }

        writeJson(response, 200, issue);
        return;
      }

      writeNotFound(response, url.pathname);
    } catch (error) {
      if (isSnapshotTimeoutError(error)) {
        writeJsonError(response, 504, ERROR_CODES.snapshotTimedOut, {
          message: toErrorMessage(error),
        });
        return;
      }

      writeJsonError(response, 500, ERROR_CODES.snapshotUnavailable, {
        message: toErrorMessage(error),
      });
    }
  };
}

async function readSnapshot(
  host: DashboardServerHost,
  timeoutMs: number,
): Promise<RuntimeSnapshot> {
  return await withTimeout(host.getRuntimeSnapshot(), timeoutMs, () => {
    return new Error(`Runtime snapshot timed out after ${timeoutMs}ms.`);
  });
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(body));
  response.end(body);
}

function writeJsonError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  input: {
    message: string;
    allow?: string[];
  },
): void {
  if (input.allow !== undefined) {
    response.setHeader("allow", input.allow.join(", "));
  }

  writeJson(response, statusCode, {
    error: {
      code,
      message: input.message,
    },
  });
}

function writeMethodNotAllowed(
  response: ServerResponse,
  allow: string[],
): void {
  writeJsonError(response, 405, "method_not_allowed", {
    message: "Method not allowed.",
    allow,
  });
}

function writeHtml(
  response: ServerResponse,
  statusCode: number,
  html: string,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(html));
  response.end(html);
}

function writeNotFound(response: ServerResponse, path: string): void {
  response.statusCode = 404;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(`Not found: ${path}`);
}

async function readRequestBody(request: IncomingMessage): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    request.on("error", reject);
    request.on("end", resolve);
    request.resume();
  });
}

async function withTimeout<T>(
  promise: Promise<T> | T,
  timeoutMs: number,
  createError: () => Error,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(createError());
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function isSnapshotTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Runtime snapshot timed out after ")
  );
}

function renderDashboardHtml(
  snapshot: RuntimeSnapshot,
  options: DashboardRenderOptions,
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Symphony Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: #f4efe7;
        color: #1e1b18;
      }
      body {
        margin: 0;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(198, 110, 66, 0.16), transparent 28rem),
          linear-gradient(180deg, #f8f3eb 0%, #efe4d3 100%);
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
      }
      h1, h2 {
        margin: 0 0 12px;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 252, 247, 0.9);
        border: 1px solid rgba(59, 44, 32, 0.12);
        color: #5f5449;
      }
      .status-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #d26c2f;
      }
      .status-live .status-dot {
        background: #2f8f46;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin: 20px 0 28px;
      }
      .card, section {
        background: rgba(255, 252, 247, 0.9);
        border: 1px solid rgba(59, 44, 32, 0.12);
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(74, 46, 20, 0.08);
      }
      .card {
        padding: 18px;
      }
      .metric {
        font-size: 2rem;
        font-weight: 700;
      }
      section {
        padding: 20px;
        margin-bottom: 18px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid rgba(59, 44, 32, 0.12);
        vertical-align: top;
      }
      th {
        font-size: 0.875rem;
        color: #5f5449;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
      }
      .muted {
        color: #6e6256;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="header">
        <div>
          <h1>Symphony Dashboard</h1>
          <p id="generated-at" class="muted">Generated at ${escapeHtml(snapshot.generated_at)}</p>
        </div>
        <div id="live-status" class="status${
          options.liveUpdatesEnabled ? " status-live" : ""
        }">
          <span class="status-dot"></span>
          <span>${
            options.liveUpdatesEnabled
              ? "Live updates connected"
              : "Static snapshot"
          }</span>
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <div class="muted">Running</div>
          <div id="metric-running" class="metric">${snapshot.counts.running}</div>
        </div>
        <div class="card">
          <div class="muted">Retrying</div>
          <div id="metric-retrying" class="metric">${snapshot.counts.retrying}</div>
        </div>
        <div class="card">
          <div class="muted">Input Tokens</div>
          <div id="metric-input" class="metric">${snapshot.codex_totals.input_tokens}</div>
        </div>
        <div class="card">
          <div class="muted">Output Tokens</div>
          <div id="metric-output" class="metric">${snapshot.codex_totals.output_tokens}</div>
        </div>
        <div class="card">
          <div class="muted">Total Tokens</div>
          <div id="metric-total" class="metric">${snapshot.codex_totals.total_tokens}</div>
        </div>
        <div class="card">
          <div class="muted">Seconds Running</div>
          <div id="metric-seconds" class="metric">${snapshot.codex_totals.seconds_running.toFixed(1)}</div>
        </div>
      </div>

      <section>
        <h2>Running Sessions</h2>
        <table>
          <thead>
            <tr>
              <th>Issue</th>
              <th>State</th>
              <th>Session</th>
              <th>Turns</th>
              <th>Last Event</th>
              <th>Last Message</th>
              <th>Last Event At</th>
            </tr>
          </thead>
          <tbody id="running-rows">${renderRunningRows(snapshot)}</tbody>
        </table>
      </section>

      <section>
        <h2>Retry Queue</h2>
        <table>
          <thead>
            <tr>
              <th>Issue</th>
              <th>Attempt</th>
              <th>Due At</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody id="retry-rows">${renderRetryRows(snapshot)}</tbody>
        </table>
      </section>

      <section>
        <h2>Rate Limits</h2>
        <pre id="rate-limits">${escapeHtml(
          JSON.stringify(snapshot.rate_limits, null, 2) ?? "null",
        )}</pre>
      </section>
    </main>
    <script>
      window.__SYMPHONY_SNAPSHOT__ = ${JSON.stringify(snapshot)};
      window.__SYMPHONY_LIVE_UPDATES__ = ${JSON.stringify(
        options.liveUpdatesEnabled,
      )};
      (function () {
        const snapshot = window.__SYMPHONY_SNAPSHOT__;
        const liveUpdatesEnabled = window.__SYMPHONY_LIVE_UPDATES__ === true;

        function escapeHtml(value) {
          return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
        }

        function renderRunningRows(next) {
          if (!next.running || next.running.length === 0) {
            return '<tr><td colspan="7">No active sessions.</td></tr>';
          }

          return next.running.map(function (row) {
            return '<tr>' +
              '<td>' + escapeHtml(row.issue_identifier) + '</td>' +
              '<td>' + escapeHtml(row.state) + '</td>' +
              '<td>' + escapeHtml(row.session_id || '-') + '</td>' +
              '<td>' + row.turn_count + '</td>' +
              '<td>' + escapeHtml(row.last_event || '-') + '</td>' +
              '<td>' + escapeHtml(row.last_message || '-') + '</td>' +
              '<td>' + escapeHtml(row.last_event_at || '-') + '</td>' +
              '</tr>';
          }).join('');
        }

        function renderRetryRows(next) {
          if (!next.retrying || next.retrying.length === 0) {
            return '<tr><td colspan="4">No queued retries.</td></tr>';
          }

          return next.retrying.map(function (row) {
            return '<tr>' +
              '<td>' + escapeHtml(row.issue_identifier || row.issue_id) + '</td>' +
              '<td>' + row.attempt + '</td>' +
              '<td>' + escapeHtml(row.due_at) + '</td>' +
              '<td>' + escapeHtml(row.error || '-') + '</td>' +
              '</tr>';
          }).join('');
        }

        function setStatus(text, live) {
          const element = document.getElementById('live-status');
          if (!element) return;
          element.className = live ? 'status status-live' : 'status';
          const label = element.querySelector('span:last-child');
          if (label) {
            label.textContent = text;
          }
        }

        function render(next) {
          document.getElementById('generated-at').textContent = 'Generated at ' + next.generated_at;
          document.getElementById('metric-running').textContent = String(next.counts.running);
          document.getElementById('metric-retrying').textContent = String(next.counts.retrying);
          document.getElementById('metric-input').textContent = String(next.codex_totals.input_tokens);
          document.getElementById('metric-output').textContent = String(next.codex_totals.output_tokens);
          document.getElementById('metric-total').textContent = String(next.codex_totals.total_tokens);
          document.getElementById('metric-seconds').textContent = Number(next.codex_totals.seconds_running).toFixed(1);
          document.getElementById('running-rows').innerHTML = renderRunningRows(next);
          document.getElementById('retry-rows').innerHTML = renderRetryRows(next);
          document.getElementById('rate-limits').textContent = JSON.stringify(next.rate_limits, null, 2) || 'null';
        }

        render(snapshot);
        if (!liveUpdatesEnabled || typeof window.EventSource !== 'function') {
          return;
        }

        const source = new window.EventSource('/api/v1/events');
        source.addEventListener('open', function () {
          setStatus('Live updates connected', true);
        });
        source.addEventListener('snapshot', function (event) {
          try {
            const next = JSON.parse(event.data);
            render(next);
            setStatus('Live updates connected', true);
          } catch (_error) {
            setStatus('Live updates degraded', false);
          }
        });
        source.addEventListener('error', function () {
          setStatus('Reconnecting live updates…', false);
        });
      })();
    </script>
  </body>
</html>`;
}

function renderRunningRows(snapshot: RuntimeSnapshot): string {
  return snapshot.running.length === 0
    ? '<tr><td colspan="7">No active sessions.</td></tr>'
    : snapshot.running
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.issue_identifier)}</td>
              <td>${escapeHtml(row.state)}</td>
              <td>${escapeHtml(row.session_id ?? "-")}</td>
              <td>${row.turn_count}</td>
              <td>${escapeHtml(row.last_event ?? "-")}</td>
              <td>${escapeHtml(row.last_message ?? "-")}</td>
              <td>${escapeHtml(row.last_event_at ?? "-")}</td>
            </tr>`,
        )
        .join("");
}

function renderRetryRows(snapshot: RuntimeSnapshot): string {
  return snapshot.retrying.length === 0
    ? '<tr><td colspan="4">No queued retries.</td></tr>'
    : snapshot.retrying
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.issue_identifier ?? row.issue_id)}</td>
              <td>${row.attempt}</td>
              <td>${escapeHtml(row.due_at)}</td>
              <td>${escapeHtml(row.error ?? "-")}</td>
            </tr>`,
        )
        .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
