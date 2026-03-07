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
  const initialRuntimeLabel = formatRuntimeSeconds(
    snapshot.codex_totals.seconds_running,
  );
  const totalTokensLabel = formatInteger(snapshot.codex_totals.total_tokens);
  const inputTokensLabel = formatInteger(snapshot.codex_totals.input_tokens);
  const outputTokensLabel = formatInteger(snapshot.codex_totals.output_tokens);
  const initialRateLimits = prettyValue(snapshot.rate_limits);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Symphony Observability</title>
    <style>
      :root {
        color-scheme: light;
        --page: #f7f7f8;
        --page-soft: #fbfbfc;
        --page-deep: #ececf1;
        --card: rgba(255, 255, 255, 0.94);
        --card-muted: #f3f4f6;
        --ink: #202123;
        --muted: #6e6e80;
        --line: #ececf1;
        --line-strong: #d9d9e3;
        --accent: #10a37f;
        --accent-ink: #0f513f;
        --accent-soft: #e8faf4;
        --danger: #b42318;
        --danger-soft: #fef3f2;
        --warning: #8a5a00;
        --warning-soft: #fff7e8;
        --warning-line: #f1d8a6;
        --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.05);
        --shadow-lg: 0 20px 50px rgba(15, 23, 42, 0.08);
      }
      * {
        box-sizing: border-box;
      }
      html {
        background: var(--page);
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top, rgba(16, 163, 127, 0.12) 0%, rgba(16, 163, 127, 0) 30%),
          linear-gradient(180deg, var(--page-soft) 0%, var(--page) 24%, #f3f4f6 100%);
        color: var(--ink);
        font-family: "Sohne", "SF Pro Text", "Helvetica Neue", "Segoe UI", sans-serif;
        line-height: 1.5;
      }
      a {
        color: var(--ink);
        text-decoration: none;
        transition: color 140ms ease;
      }
      a:hover {
        color: var(--accent);
      }
      button {
        appearance: none;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: white;
        border-radius: 999px;
        padding: 0.72rem 1.08rem;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
        letter-spacing: -0.01em;
        box-shadow: 0 8px 20px rgba(16, 163, 127, 0.18);
        transition:
          transform 140ms ease,
          box-shadow 140ms ease,
          background 140ms ease,
          border-color 140ms ease;
      }
      button:hover {
        transform: translateY(-1px);
        box-shadow: 0 12px 24px rgba(16, 163, 127, 0.22);
      }
      .subtle-button {
        border: 1px solid var(--line-strong);
        background: rgba(255, 255, 255, 0.72);
        color: var(--muted);
        padding: 0.34rem 0.72rem;
        font-size: 0.82rem;
        letter-spacing: 0.01em;
        box-shadow: none;
      }
      .subtle-button:hover {
        transform: none;
        box-shadow: none;
        background: white;
        border-color: var(--muted);
        color: var(--ink);
      }
      code,
      pre,
      .mono {
        font-family: "Sohne Mono", "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace;
      }
      .mono,
      .numeric {
        font-variant-numeric: tabular-nums slashed-zero;
        font-feature-settings: "tnum" 1, "zero" 1;
      }
      .app-shell {
        max-width: 1280px;
        margin: 0 auto;
        padding: 2rem 1rem 3.5rem;
      }
      .dashboard-shell {
        display: grid;
        gap: 1rem;
      }
      .hero-card,
      .section-card,
      .metric-card {
        background: var(--card);
        border: 1px solid rgba(217, 217, 227, 0.82);
        box-shadow: var(--shadow-sm);
        backdrop-filter: blur(18px);
      }
      .hero-card {
        border-radius: 28px;
        padding: clamp(1.25rem, 3vw, 2rem);
        box-shadow: var(--shadow-lg);
      }
      .hero-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 1.25rem;
        align-items: start;
      }
      .eyebrow {
        margin: 0;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.76rem;
        font-weight: 600;
      }
      .hero-title {
        margin: 0.35rem 0 0;
        font-size: clamp(2rem, 4vw, 3.3rem);
        line-height: 0.98;
        letter-spacing: -0.04em;
      }
      .hero-copy {
        margin: 0.75rem 0 0;
        max-width: 46rem;
        color: var(--muted);
        font-size: 1rem;
      }
      .status-stack {
        display: grid;
        justify-items: end;
        align-content: start;
        min-width: min(100%, 9rem);
      }
      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        min-height: 2rem;
        padding: 0.35rem 0.78rem;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: var(--card-muted);
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .status-badge-dot {
        width: 0.52rem;
        height: 0.52rem;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.9;
      }
      .status-badge-live {
        background: var(--accent-soft);
        border-color: rgba(16, 163, 127, 0.18);
        color: var(--accent-ink);
      }
      .metric-grid {
        display: grid;
        gap: 0.85rem;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .metric-card {
        border-radius: 22px;
        padding: 1rem 1.05rem 1.1rem;
      }
      .metric-label {
        margin: 0;
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .metric-value {
        margin: 0.35rem 0 0;
        font-size: clamp(1.6rem, 2vw, 2.1rem);
        line-height: 1.05;
        letter-spacing: -0.03em;
      }
      .metric-detail {
        margin: 0.45rem 0 0;
        color: var(--muted);
        font-size: 0.88rem;
      }
      .section-card {
        border-radius: 24px;
        padding: 1.15rem;
      }
      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .section-title {
        margin: 0;
        font-size: 1.08rem;
        line-height: 1.2;
        letter-spacing: -0.02em;
      }
      .section-copy {
        margin: 0.35rem 0 0;
        color: var(--muted);
        font-size: 0.94rem;
      }
      .table-wrap {
        overflow-x: auto;
        margin-top: 1rem;
      }
      .data-table {
        width: 100%;
        min-width: 720px;
        border-collapse: collapse;
      }
      .data-table-running {
        table-layout: fixed;
        min-width: 980px;
      }
      .data-table th {
        padding: 0 0.5rem 0.75rem 0;
        text-align: left;
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .data-table td {
        padding: 0.9rem 0.5rem 0.9rem 0;
        border-top: 1px solid var(--line);
        vertical-align: top;
        font-size: 0.94rem;
      }
      .issue-stack,
      .session-stack,
      .detail-stack,
      .token-stack {
        display: grid;
        gap: 0.24rem;
        min-width: 0;
      }
      .event-text {
        font-weight: 500;
        line-height: 1.45;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .event-meta {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .state-badge {
        display: inline-flex;
        align-items: center;
        min-height: 1.85rem;
        padding: 0.3rem 0.68rem;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: var(--card-muted);
        color: var(--ink);
        font-size: 0.8rem;
        font-weight: 600;
        line-height: 1;
      }
      .state-badge-active {
        background: var(--accent-soft);
        border-color: rgba(16, 163, 127, 0.18);
        color: var(--accent-ink);
      }
      .state-badge-warning {
        background: var(--warning-soft);
        border-color: var(--warning-line);
        color: var(--warning);
      }
      .state-badge-danger {
        background: var(--danger-soft);
        border-color: #f6d3cf;
        color: var(--danger);
      }
      .issue-id {
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .issue-link {
        color: var(--muted);
        font-size: 0.86rem;
      }
      .muted {
        color: var(--muted);
      }
      .code-panel {
        margin-top: 1rem;
        padding: 1rem;
        border-radius: 18px;
        background: #f5f5f7;
        border: 1px solid var(--line);
        color: #353740;
        font-size: 0.9rem;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .empty-state {
        margin: 1rem 0 0;
        color: var(--muted);
      }
      @media (max-width: 860px) {
        .app-shell {
          padding: 1rem 0.85rem 2rem;
        }
        .hero-grid {
          grid-template-columns: 1fr;
        }
        .status-stack {
          justify-items: start;
        }
        .metric-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 560px) {
        .metric-grid {
          grid-template-columns: 1fr;
        }
        .section-card,
        .hero-card {
          border-radius: 20px;
          padding: 1rem;
        }
      }
    </style>
  </head>
  <body>
    <main class="app-shell">
      <section class="dashboard-shell">
        <header class="hero-card">
          <div class="hero-grid">
            <div>
              <p class="eyebrow">Symphony Observability</p>
              <h1 class="hero-title">Operations Dashboard</h1>
              <p class="hero-copy">
                Current state, retry pressure, token usage, and orchestration health for the active Symphony runtime.
              </p>
            </div>

            <div class="status-stack">
              <span id="live-status" class="status-badge${
                options.liveUpdatesEnabled ? " status-badge-live" : ""
              }">
                <span class="status-badge-dot"></span>
                <span>${options.liveUpdatesEnabled ? "Live" : "Offline"}</span>
              </span>
            </div>
          </div>
        </header>

        <section class="metric-grid">
          <article class="metric-card">
            <p class="metric-label">Running</p>
            <p id="metric-running" class="metric-value numeric">${snapshot.counts.running}</p>
            <p class="metric-detail">Active issue sessions in the current runtime.</p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Retrying</p>
            <p id="metric-retrying" class="metric-value numeric">${snapshot.counts.retrying}</p>
            <p class="metric-detail">Issues waiting for the next retry window.</p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Total tokens</p>
            <p id="metric-total" class="metric-value numeric">${totalTokensLabel}</p>
            <p id="metric-total-detail" class="metric-detail numeric">In ${inputTokensLabel} / Out ${outputTokensLabel}</p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Runtime</p>
            <p id="metric-runtime" class="metric-value numeric">${initialRuntimeLabel}</p>
            <p id="generated-at" class="metric-detail">Generated at ${escapeHtml(snapshot.generated_at)}</p>
          </article>
        </section>

        <section class="section-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Rate limits</h2>
              <p class="section-copy">Latest upstream rate-limit snapshot, when available.</p>
            </div>
          </div>

          <pre id="rate-limits" class="code-panel">${escapeHtml(initialRateLimits)}</pre>
        </section>

        <section class="section-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Running sessions</h2>
              <p class="section-copy">Active issues, last known agent activity, and token usage.</p>
            </div>
          </div>

          <div class="table-wrap">
            <table class="data-table data-table-running">
              <colgroup>
                <col style="width: 12rem;" />
                <col style="width: 8rem;" />
                <col style="width: 7.5rem;" />
                <col style="width: 8.5rem;" />
                <col />
                <col style="width: 10rem;" />
              </colgroup>
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>State</th>
                  <th>Session</th>
                  <th>Runtime / turns</th>
                  <th>Codex update</th>
                  <th>Tokens</th>
                </tr>
              </thead>
              <tbody id="running-rows">${renderRunningRows(snapshot)}</tbody>
            </table>
          </div>
        </section>

        <section class="section-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Retry queue</h2>
              <p class="section-copy">Issues waiting for the next retry window.</p>
            </div>
          </div>

          <div class="table-wrap">
            <table class="data-table" style="min-width: 680px;">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Attempt</th>
                  <th>Due at</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody id="retry-rows">${renderRetryRows(snapshot)}</tbody>
            </table>
          </div>
        </section>
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
          return String(value ?? '')
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
        }

        function formatInteger(value) {
          const number = Number(value);
          if (!Number.isFinite(number)) {
            return 'n/a';
          }
          return Math.trunc(number).toLocaleString('en-US');
        }

        function formatRuntimeSeconds(value) {
          const number = Number(value);
          if (!Number.isFinite(number) || number < 0) {
            return '0m 0s';
          }
          const wholeSeconds = Math.max(0, Math.trunc(number));
          const mins = Math.floor(wholeSeconds / 60);
          const secs = wholeSeconds % 60;
          return mins + 'm ' + secs + 's';
        }

        function runtimeSecondsFromStartedAt(startedAt, generatedAt) {
          const start = Date.parse(startedAt);
          const generated = Date.parse(generatedAt);
          if (!Number.isFinite(start) || !Number.isFinite(generated) || generated < start) {
            return 0;
          }
          return (generated - start) / 1000;
        }

        function formatRuntimeAndTurns(row, generatedAt) {
          const runtime = formatRuntimeSeconds(runtimeSecondsFromStartedAt(row.started_at, generatedAt));
          if (Number.isInteger(row.turn_count) && row.turn_count > 0) {
            return runtime + ' / ' + row.turn_count;
          }
          return runtime;
        }

        function stateBadgeClass(state) {
          const normalized = String(state || '').toLowerCase();
          if (normalized.includes('progress') || normalized.includes('running') || normalized.includes('active')) {
            return 'state-badge state-badge-active';
          }
          if (normalized.includes('blocked') || normalized.includes('error') || normalized.includes('failed')) {
            return 'state-badge state-badge-danger';
          }
          if (normalized.includes('todo') || normalized.includes('queued') || normalized.includes('pending') || normalized.includes('retry')) {
            return 'state-badge state-badge-warning';
          }
          return 'state-badge';
        }

        function prettyValue(value) {
          if (value == null) {
            return 'n/a';
          }
          try {
            return JSON.stringify(value, null, 2);
          } catch (_error) {
            return String(value);
          }
        }

        function renderRunningRows(next) {
          if (!next.running || next.running.length === 0) {
            return '<tr><td colspan="6"><p class="empty-state">No active sessions.</p></td></tr>';
          }

          return next.running.map(function (row) {
            const sessionCell = row.session_id
              ? '<button type="button" class="subtle-button" data-label="Copy ID" data-copy="' + escapeHtml(row.session_id) + '" onclick="navigator.clipboard.writeText(this.dataset.copy); this.textContent = \\'Copied\\'; clearTimeout(this._copyTimer); this._copyTimer = setTimeout(() => { this.textContent = this.dataset.label }, 1200);">Copy ID</button>'
              : '<span class="muted">n/a</span>';

            const message = row.last_message || row.last_event || 'n/a';
            const eventMeta = row.last_event
              ? escapeHtml(row.last_event) + (row.last_event_at ? ' · <span class="mono numeric">' + escapeHtml(row.last_event_at) + '</span>' : '')
              : 'n/a';

            return '<tr>' +
              '<td><div class="issue-stack"><span class="issue-id">' + escapeHtml(row.issue_identifier) + '</span><a class="issue-link" href="/api/v1/' + encodeURIComponent(row.issue_identifier) + '">JSON details</a></div></td>' +
              '<td><span class="' + stateBadgeClass(row.state) + '">' + escapeHtml(row.state) + '</span></td>' +
              '<td><div class="session-stack">' + sessionCell + '</div></td>' +
              '<td class="numeric">' + formatRuntimeAndTurns(row, next.generated_at) + '</td>' +
              '<td><div class="detail-stack"><span class="event-text" title="' + escapeHtml(message) + '">' + escapeHtml(message) + '</span><span class="muted event-meta">' + eventMeta + '</span></div></td>' +
              '<td><div class="token-stack numeric"><span>Total: ' + formatInteger(row.tokens?.total_tokens) + '</span><span class="muted">In ' + formatInteger(row.tokens?.input_tokens) + ' / Out ' + formatInteger(row.tokens?.output_tokens) + '</span></div></td>' +
              '</tr>';
          }).join('');
        }

        function renderRetryRows(next) {
          if (!next.retrying || next.retrying.length === 0) {
            return '<tr><td colspan="4"><p class="empty-state">No issues are currently backing off.</p></td></tr>';
          }

          return next.retrying.map(function (row) {
            return '<tr>' +
              '<td><div class="issue-stack"><span class="issue-id">' + escapeHtml(row.issue_identifier || row.issue_id) + '</span><a class="issue-link" href="/api/v1/' + encodeURIComponent(row.issue_identifier || row.issue_id) + '">JSON details</a></div></td>' +
              '<td>' + escapeHtml(row.attempt) + '</td>' +
              '<td class="mono">' + escapeHtml(row.due_at || 'n/a') + '</td>' +
              '<td>' + escapeHtml(row.error || 'n/a') + '</td>' +
              '</tr>';
          }).join('');
        }

        function setStatus(text, live) {
          const element = document.getElementById('live-status');
          if (!element) return;
          element.className = live ? 'status-badge status-badge-live' : 'status-badge';
          const label = element.querySelector('span:last-child');
          if (label) {
            label.textContent = text;
          }
        }

        function render(next) {
          document.getElementById('generated-at').textContent = 'Generated at ' + next.generated_at;
          document.getElementById('metric-running').textContent = String(next.counts.running);
          document.getElementById('metric-retrying').textContent = String(next.counts.retrying);
          document.getElementById('metric-total').textContent = formatInteger(next.codex_totals.total_tokens);
          document.getElementById('metric-total-detail').textContent = 'In ' + formatInteger(next.codex_totals.input_tokens) + ' / Out ' + formatInteger(next.codex_totals.output_tokens);
          document.getElementById('metric-runtime').textContent = formatRuntimeSeconds(next.codex_totals.seconds_running);
          document.getElementById('running-rows').innerHTML = renderRunningRows(next);
          document.getElementById('retry-rows').innerHTML = renderRetryRows(next);
          document.getElementById('rate-limits').textContent = prettyValue(next.rate_limits);
        }

        render(snapshot);
        if (!liveUpdatesEnabled || typeof window.EventSource !== 'function') {
          return;
        }

        const source = new window.EventSource('/api/v1/events');
        source.addEventListener('open', function () {
          setStatus('Live', true);
        });
        source.addEventListener('snapshot', function (event) {
          try {
            const next = JSON.parse(event.data);
            render(next);
            setStatus('Live', true);
          } catch (_error) {
            setStatus('Degraded', false);
          }
        });
        source.addEventListener('error', function () {
          setStatus('Reconnecting', false);
        });
      })();
    </script>
  </body>
</html>`;
}

function renderRunningRows(snapshot: RuntimeSnapshot): string {
  return snapshot.running.length === 0
    ? '<tr><td colspan="6"><p class="empty-state">No active sessions.</p></td></tr>'
    : snapshot.running
        .map(
          (row) => `
            <tr>
              <td>
                <div class="issue-stack">
                  <span class="issue-id">${escapeHtml(row.issue_identifier)}</span>
                  <a class="issue-link" href="/api/v1/${encodeURIComponent(
                    row.issue_identifier,
                  )}">JSON details</a>
                </div>
              </td>
              <td>
                <span class="${stateBadgeClass(row.state)}">${escapeHtml(row.state)}</span>
              </td>
              <td>
                <div class="session-stack">
                  ${
                    row.session_id === null
                      ? '<span class="muted">n/a</span>'
                      : `<button type="button" class="subtle-button" data-label="Copy ID" data-copy="${escapeHtml(
                          row.session_id,
                        )}" onclick="navigator.clipboard.writeText(this.dataset.copy); this.textContent = 'Copied'; clearTimeout(this._copyTimer); this._copyTimer = setTimeout(() => { this.textContent = this.dataset.label }, 1200);">Copy ID</button>`
                  }
                </div>
              </td>
              <td class="numeric">${formatRuntimeAndTurns(
                row.started_at,
                row.turn_count,
                snapshot.generated_at,
              )}</td>
              <td>
                <div class="detail-stack">
                  <span class="event-text" title="${escapeHtml(
                    row.last_message ?? row.last_event ?? "n/a",
                  )}">${escapeHtml(
                    row.last_message ?? row.last_event ?? "n/a",
                  )}</span>
                  <span class="muted event-meta">${escapeHtml(
                    row.last_event ?? "n/a",
                  )}${
                    row.last_event_at === null
                      ? ""
                      : ` · <span class="mono numeric">${escapeHtml(
                          row.last_event_at,
                        )}</span>`
                  }</span>
                </div>
              </td>
              <td>
                <div class="token-stack numeric">
                  <span>Total: ${formatInteger(row.tokens.total_tokens)}</span>
                  <span class="muted">In ${formatInteger(
                    row.tokens.input_tokens,
                  )} / Out ${formatInteger(row.tokens.output_tokens)}</span>
                </div>
              </td>
            </tr>`,
        )
        .join("");
}

function renderRetryRows(snapshot: RuntimeSnapshot): string {
  return snapshot.retrying.length === 0
    ? '<tr><td colspan="4"><p class="empty-state">No issues are currently backing off.</p></td></tr>'
    : snapshot.retrying
        .map(
          (row) => `
            <tr>
              <td>
                <div class="issue-stack">
                  <span class="issue-id">${escapeHtml(row.issue_identifier ?? row.issue_id)}</span>
                  <a class="issue-link" href="/api/v1/${encodeURIComponent(
                    row.issue_identifier ?? row.issue_id,
                  )}">JSON details</a>
                </div>
              </td>
              <td>${row.attempt}</td>
              <td class="mono">${escapeHtml(row.due_at)}</td>
              <td>${escapeHtml(row.error ?? "n/a")}</td>
            </tr>`,
        )
        .join("");
}

function formatRuntimeAndTurns(
  startedAt: string,
  turnCount: number,
  generatedAt: string,
): string {
  const runtime = formatRuntimeSeconds(
    runtimeSecondsFromStartedAt(startedAt, generatedAt),
  );
  return Number.isInteger(turnCount) && turnCount > 0
    ? `${runtime} / ${turnCount}`
    : runtime;
}

function formatRuntimeSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0m 0s";
  }
  const wholeSeconds = Math.max(0, Math.trunc(seconds));
  const mins = Math.floor(wholeSeconds / 60);
  const secs = wholeSeconds % 60;
  return `${mins}m ${secs}s`;
}

function runtimeSecondsFromStartedAt(
  startedAt: string,
  generatedAt: string,
): number {
  const start = Date.parse(startedAt);
  const generated = Date.parse(generatedAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(generated) ||
    generated < start
  ) {
    return 0;
  }
  return (generated - start) / 1000;
}

function formatInteger(value: number): string {
  return Number.isFinite(value)
    ? Math.trunc(value).toLocaleString("en-US")
    : "n/a";
}

function prettyValue(value: unknown): string {
  return value === null || value === undefined
    ? "n/a"
    : JSON.stringify(value, null, 2);
}

function stateBadgeClass(state: string): string {
  const normalized = state.toLowerCase();
  if (
    normalized.includes("progress") ||
    normalized.includes("running") ||
    normalized.includes("active")
  ) {
    return "state-badge state-badge-active";
  }
  if (
    normalized.includes("blocked") ||
    normalized.includes("error") ||
    normalized.includes("failed")
  ) {
    return "state-badge state-badge-danger";
  }
  if (
    normalized.includes("todo") ||
    normalized.includes("queued") ||
    normalized.includes("pending") ||
    normalized.includes("retry")
  ) {
    return "state-badge state-badge-warning";
  }
  return "state-badge";
}

function escapeHtml(value: string | number): string {
  return String(value)
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
