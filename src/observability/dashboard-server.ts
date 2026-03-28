import { execFile as execFileCb } from "node:child_process";
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
import { toErrorMessage } from "./dashboard-format.js";
import {
  isSnapshotTimeoutError,
  readRequestBody,
  readSnapshot,
  writeHtml,
  writeJson,
  writeNotFound,
} from "./dashboard-http.js";
import { DashboardLiveUpdatesController } from "./dashboard-live-updates.js";
import {
  type DashboardRenderOptions,
  renderDashboardHtml,
} from "./dashboard-render.js";

const DEFAULT_SNAPSHOT_TIMEOUT_MS = 1_000;
const GITHUB_QUEUE_CACHE_TTL_MS = 15_000;

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
  parent: {
    identifier: string;
    title: string;
    url: string;
  } | null;
}

export interface RefreshResponse {
  queued: boolean;
  coalesced: boolean;
  requested_at: string;
  operations: string[];
}

export interface StopIssueResponse {
  issue_identifier: string;
  stopped: boolean;
  reason: string;
}

export interface DashboardServerHost {
  getRuntimeSnapshot(): RuntimeSnapshot | Promise<RuntimeSnapshot>;
  getIssueDetails(
    issueIdentifier: string,
  ): IssueDetailResponse | null | Promise<IssueDetailResponse | null>;
  requestRefresh(): RefreshResponse | Promise<RefreshResponse>;
  requestIssueStop?(
    issueIdentifier: string,
  ): StopIssueResponse | Promise<StopIssueResponse>;
  subscribeToSnapshots?(listener: () => void): () => void;
}

/** Async function that runs `gh` with the given args and returns stdout. */
export type ExecGh = (args: string[]) => Promise<string>;

export interface DashboardServerOptions {
  host: DashboardServerHost;
  hostname?: string;
  snapshotTimeoutMs?: number;
  refreshMs?: number;
  renderIntervalMs?: number;
  liveUpdatesEnabled?: boolean;
  /** GitHub repo slug (e.g. "org/repo"). Falls back to REPO_URL env var. */
  githubRepoSlug?: string;
  /** Injectable gh CLI executor for testing. Defaults to child_process.execFile("gh", ...). */
  execGh?: ExecGh;
}

export interface DashboardServerInstance {
  readonly server: Server;
  readonly hostname: string;
  readonly port: number;
  close(): Promise<void>;
}

export function createDashboardServer(options: DashboardServerOptions): Server {
  const hostname = options.hostname ?? "0.0.0.0";
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
  const hostname = options.hostname ?? "0.0.0.0";

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
  const hostname = options.hostname ?? "0.0.0.0";
  const snapshotTimeoutMs =
    options.snapshotTimeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS;
  const renderOptions: DashboardRenderOptions = {
    liveUpdatesEnabled: options.liveUpdatesEnabled ?? true,
  };
  const githubRepoSlug = resolveRepoSlug(options.githubRepoSlug);
  const execGh = options.execGh ?? defaultExecGh;
  let githubQueueCache: GitHubQueueCache | null = null;

  return async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${hostname}`);
      const method = request.method ?? "GET";

      // CORS headers on all responses
      response.setHeader("access-control-allow-origin", "*");
      response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      response.setHeader(
        "access-control-allow-headers",
        "Content-Type, Authorization",
      );

      // Handle CORS preflight
      if (method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }

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

      if (url.pathname === "/api/v1/github/queue") {
        if (method !== "GET") {
          writeMethodNotAllowed(response, ["GET"]);
          return;
        }

        if (githubRepoSlug === null) {
          writeJsonError(response, 500, ERROR_CODES.githubCliFailed, {
            message:
              "GitHub repo slug is not configured. Set githubRepoSlug in options or REPO_URL environment variable.",
          });
          return;
        }

        // Return cached response if still valid
        if (
          githubQueueCache !== null &&
          Date.now() < githubQueueCache.expiresAt
        ) {
          writeJson(response, 200, { ...githubQueueCache.data, cached: true });
          return;
        }

        try {
          const data = await fetchGitHubQueue(githubRepoSlug, execGh);
          githubQueueCache = {
            data,
            expiresAt: Date.now() + GITHUB_QUEUE_CACHE_TTL_MS,
          };
          writeJson(response, 200, data);
        } catch (error) {
          writeJsonError(response, 502, ERROR_CODES.githubCliFailed, {
            message:
              error instanceof Error
                ? error.message
                : "GitHub CLI command failed.",
          });
        }
        return;
      }

      if (url.pathname.startsWith("/api/v1/")) {
        const rest = url.pathname.slice("/api/v1/".length);
        const stopMatch = rest.match(/^(.+)\/stop$/);

        if (stopMatch !== null) {
          if (method !== "POST") {
            writeMethodNotAllowed(response, ["POST"]);
            return;
          }

          const issueIdentifier = decodeURIComponent(stopMatch[1] ?? "");

          if (options.host.requestIssueStop === undefined) {
            writeJsonError(response, 501, "not_implemented", {
              message: "Stop issue is not supported by this host.",
            });
            return;
          }

          await readRequestBody(request);
          const result = await options.host.requestIssueStop(issueIdentifier);
          writeJson(response, result.stopped ? 200 : 404, result);
          return;
        }

        if (method !== "GET") {
          writeMethodNotAllowed(response, ["GET"]);
          return;
        }

        const issueIdentifier = decodeURIComponent(rest);
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

// ── GitHub merge queue types & helpers ────────────────────────────

export interface GitHubQueuePR {
  number: number;
  title: string;
  url: string;
  author: string;
  state: string;
  mergedAt: string | null;
  labels: string[];
}

export interface GitHubQueueAlert {
  number: number;
  title: string;
  url: string;
  createdAt: string;
}

export interface GitHubQueueResponse {
  repo: string;
  cached: boolean;
  fetched_at: string;
  in_queue: GitHubQueuePR[];
  recently_merged: GitHubQueuePR[];
  rejected: GitHubQueuePR[];
  alerts: GitHubQueueAlert[];
}

interface GitHubQueueCache {
  data: GitHubQueueResponse;
  expiresAt: number;
}

function resolveRepoSlug(explicit?: string): string | null {
  if (explicit !== undefined && explicit !== "") {
    return explicit;
  }
  const repoUrl = process.env.REPO_URL;
  if (repoUrl === undefined || repoUrl === "") {
    return null;
  }
  // Extract owner/repo from https://github.com/owner/repo(.git)
  return repoUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
}

interface GhPrJsonItem {
  number: number;
  title: string;
  url: string;
  author: { login: string };
  state: string;
  mergedAt: string | null;
  labels: Array<{ name: string }>;
}

interface GhIssueJsonItem {
  number: number;
  title: string;
  url: string;
  createdAt: string;
}

function categorizePRs(prs: GhPrJsonItem[]): {
  in_queue: GitHubQueuePR[];
  recently_merged: GitHubQueuePR[];
  rejected: GitHubQueuePR[];
} {
  const in_queue: GitHubQueuePR[] = [];
  const recently_merged: GitHubQueuePR[] = [];
  const rejected: GitHubQueuePR[] = [];

  for (const pr of prs) {
    const mapped: GitHubQueuePR = {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author: pr.author.login,
      state: pr.state,
      mergedAt: pr.mergedAt,
      labels: pr.labels.map((l) => l.name),
    };

    if (pr.state === "MERGED") {
      recently_merged.push(mapped);
    } else if (pr.state === "CLOSED") {
      rejected.push(mapped);
    } else {
      // OPEN PRs are considered in the queue
      in_queue.push(mapped);
    }
  }

  return { in_queue, recently_merged, rejected };
}

function defaultExecGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileCb(
      "gh",
      args,
      { encoding: "utf-8", maxBuffer: 2 * 1024 * 1024, timeout: 15_000 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function fetchGitHubQueue(
  repoSlug: string,
  execGh: ExecGh,
): Promise<GitHubQueueResponse> {
  const prFields = "number,title,url,author,state,mergedAt,labels";

  const [prStdout, issueStdout] = await Promise.all([
    execGh([
      "pr",
      "list",
      "--repo",
      repoSlug,
      "--json",
      prFields,
      "--limit",
      "50",
      "--state",
      "all",
    ]),
    execGh([
      "issue",
      "list",
      "--repo",
      repoSlug,
      "--json",
      "number,title,url,createdAt",
      "--label",
      "pipeline-halt",
      "--limit",
      "20",
    ]),
  ]);

  const prs = JSON.parse(prStdout) as GhPrJsonItem[];
  const issues = JSON.parse(issueStdout) as GhIssueJsonItem[];

  const { in_queue, recently_merged, rejected } = categorizePRs(prs);

  const alerts: GitHubQueueAlert[] = issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    url: issue.url,
    createdAt: issue.createdAt,
  }));

  return {
    repo: repoSlug,
    cached: false,
    fetched_at: new Date().toISOString(),
    in_queue,
    recently_merged,
    rejected,
    alerts,
  };
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
