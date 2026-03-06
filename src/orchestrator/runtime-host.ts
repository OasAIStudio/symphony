import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Writable } from "node:stream";

import type { AgentRunResult, AgentRunnerEvent } from "../agent/runner.js";
import { AgentRunner } from "../agent/runner.js";
import { validateDispatchConfig } from "../config/config-resolver.js";
import type { ResolvedWorkflowConfig } from "../config/types.js";
import type { Issue, RetryEntry, RunningEntry } from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";
import {
  type RuntimeSnapshot,
  buildRuntimeSnapshot,
} from "../logging/runtime-snapshot.js";
import {
  StructuredLogger,
  createJsonLineSink,
} from "../logging/structured-logger.js";
import {
  type DashboardServerHost,
  type DashboardServerInstance,
  type IssueDetailResponse,
  type RefreshResponse,
  startDashboardServer,
} from "../observability/dashboard-server.js";
import { LinearTrackerClient } from "../tracker/linear-client.js";
import type { IssueTracker } from "../tracker/tracker.js";
import { WorkspaceManager } from "../workspace/workspace-manager.js";
import type {
  OrchestratorCoreOptions,
  StopRequest,
  TimerScheduler,
} from "./core.js";
import { OrchestratorCore } from "./core.js";

export interface AgentRunnerLike {
  run(input: {
    issue: Issue;
    attempt: number | null;
    signal?: AbortSignal;
  }): Promise<AgentRunResult>;
}

export interface RuntimeHostOptions {
  config: ResolvedWorkflowConfig;
  tracker: IssueTracker;
  agentRunner?: AgentRunnerLike;
  createAgentRunner?: (input: {
    onEvent: (event: AgentRunnerEvent) => void;
  }) => AgentRunnerLike;
  workspaceManager?: WorkspaceManager;
  now?: () => Date;
}

export interface RuntimeServiceOptions {
  config: ResolvedWorkflowConfig;
  logsRoot?: string | null;
  tracker?: IssueTracker;
  runtimeHost?: OrchestratorRuntimeHost;
  workspaceManager?: WorkspaceManager;
  now?: () => Date;
  logger?: StructuredLogger;
  stdout?: Writable;
}

export interface RuntimeServiceHandle {
  readonly runtimeHost: OrchestratorRuntimeHost;
  readonly logger: StructuredLogger;
  readonly dashboard: DashboardServerInstance | null;
  waitForExit(): Promise<number>;
  shutdown(): Promise<void>;
}

interface WorkerExecution {
  issueId: string;
  issueIdentifier: string;
  controller: AbortController;
  completion: Promise<void>;
  stopRequest: StopRequest | null;
  lastResult: AgentRunResult | null;
}

export class RuntimeHostStartupError extends Error {
  readonly code: string;

  constructor(message: string, code: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RuntimeHostStartupError";
    this.code = code;
  }
}

export class OrchestratorRuntimeHost implements DashboardServerHost {
  private readonly config: ResolvedWorkflowConfig;

  private readonly tracker: IssueTracker;

  private readonly workspaceManager: WorkspaceManager;

  private readonly agentRunner: AgentRunnerLike;

  private readonly now: () => Date;

  private readonly workers = new Map<string, WorkerExecution>();

  private readonly orchestrator: OrchestratorCore;

  private eventQueue: Promise<unknown> = Promise.resolve();

  private refreshQueued = false;

  constructor(options: RuntimeHostOptions) {
    this.config = options.config;
    this.tracker = options.tracker;
    this.now = options.now ?? (() => new Date());
    this.workspaceManager =
      options.workspaceManager ??
      new WorkspaceManager({
        root: options.config.workspace.root,
      });
    this.agentRunner =
      options.agentRunner ??
      options.createAgentRunner?.({
        onEvent: (event) => {
          void this.enqueue(async () => {
            this.orchestrator.onCodexEvent({
              issueId: event.issueId,
              event,
            });
          });
        },
      }) ??
      new AgentRunner({
        config: options.config,
        tracker: options.tracker,
        workspaceManager: this.workspaceManager,
        onEvent: (event) => {
          void this.enqueue(async () => {
            this.orchestrator.onCodexEvent({
              issueId: event.issueId,
              event,
            });
          });
        },
      });

    const timerScheduler = createQueuedTimerScheduler({
      run: (callback) => {
        void this.enqueue(async () => {
          callback();
        });
      },
    });

    const orchestratorOptions: OrchestratorCoreOptions = {
      config: options.config,
      tracker: options.tracker,
      now: this.now,
      timerScheduler,
      spawnWorker: async ({ issue, attempt }) =>
        this.spawnWorkerExecution(issue, attempt),
      stopRunningIssue: async (input) => {
        await this.stopWorkerExecution(input.issueId, {
          issueId: input.issueId,
          issueIdentifier: input.runningEntry.identifier,
          cleanupWorkspace: input.cleanupWorkspace,
          reason: input.reason,
        });
      },
    };

    this.orchestrator = new OrchestratorCore(orchestratorOptions);
  }

  getState() {
    return this.orchestrator.getState();
  }

  async pollOnce() {
    return this.enqueue(async () => this.orchestrator.pollTick());
  }

  async runRetryTimer(issueId: string) {
    return this.enqueue(async () => this.orchestrator.onRetryTimer(issueId));
  }

  async flushEvents(): Promise<void> {
    await this.eventQueue;
  }

  async waitForIdle(): Promise<void> {
    await this.eventQueue;
    await Promise.allSettled(
      [...this.workers.values()].map((worker) => worker.completion),
    );
    await this.eventQueue;
  }

  async getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    return buildRuntimeSnapshot(this.orchestrator.getState(), {
      now: this.now(),
    });
  }

  async getIssueDetails(
    issueIdentifier: string,
  ): Promise<IssueDetailResponse | null> {
    const running = Object.values(this.orchestrator.getState().running).find(
      (entry) => entry.identifier === issueIdentifier,
    );
    if (running !== undefined) {
      return toRunningIssueDetail(running, this.workspaceManager);
    }

    const retry = Object.values(
      this.orchestrator.getState().retryAttempts,
    ).find((entry) => entry.identifier === issueIdentifier);
    if (retry !== undefined) {
      return toRetryIssueDetail(issueIdentifier, retry);
    }

    return null;
  }

  async requestRefresh(): Promise<RefreshResponse> {
    const requestedAt = this.now().toISOString();
    const coalesced = this.refreshQueued;
    this.refreshQueued = true;

    if (!coalesced) {
      void this.enqueue(async () => {
        this.refreshQueued = false;
        await this.orchestrator.pollTick();
      });
    }

    return {
      queued: true,
      coalesced,
      requested_at: requestedAt,
      operations: ["poll", "reconcile"],
    };
  }

  private async spawnWorkerExecution(
    issue: Issue,
    attempt: number | null,
  ): Promise<{
    workerHandle: WorkerExecution;
    monitorHandle: Promise<void>;
  }> {
    const controller = new AbortController();
    const execution: WorkerExecution = {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      controller,
      stopRequest: null,
      lastResult: null,
      completion: Promise.resolve(),
    };

    const completion = this.agentRunner
      .run({
        issue,
        attempt,
        signal: controller.signal,
      })
      .then(async (result) => {
        execution.lastResult = result;
        await this.enqueue(async () => {
          await this.finalizeWorkerExecution(execution, {
            outcome: "normal",
            endedAt: this.now(),
          });
        });
      })
      .catch(async (error) => {
        await this.enqueue(async () => {
          await this.finalizeWorkerExecution(execution, {
            outcome: "abnormal",
            reason:
              execution.stopRequest === null
                ? toErrorMessage(error)
                : `stopped after ${execution.stopRequest.reason}`,
          });
        });
      });

    execution.completion = completion;
    this.workers.set(issue.id, execution);

    return {
      workerHandle: execution,
      monitorHandle: completion,
    };
  }

  private async stopWorkerExecution(
    issueId: string,
    input: StopRequest,
  ): Promise<void> {
    const execution = this.workers.get(issueId);
    if (execution === undefined) {
      return;
    }

    execution.stopRequest = input;
    execution.controller.abort(`Stopped due to ${input.reason}.`);
  }

  private async finalizeWorkerExecution(
    execution: WorkerExecution,
    input: {
      outcome: "normal" | "abnormal";
      reason?: string;
      endedAt?: Date;
    },
  ): Promise<void> {
    this.workers.delete(execution.issueId);

    if (execution.stopRequest?.cleanupWorkspace === true) {
      await this.workspaceManager.removeForIssue(execution.issueIdentifier);
    }

    this.orchestrator.onWorkerExit({
      issueId: execution.issueId,
      outcome: input.outcome,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      endedAt: input.endedAt ?? this.now(),
    });
  }

  private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const next = this.eventQueue.then(task, task);
    this.eventQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

export async function startRuntimeService(
  options: RuntimeServiceOptions,
): Promise<RuntimeServiceHandle> {
  const validation = validateDispatchConfig(options.config);
  if (!validation.ok) {
    throw new RuntimeHostStartupError(
      validation.error.message,
      validation.error.code,
    );
  }

  const tracker =
    options.tracker ??
    new LinearTrackerClient({
      endpoint: options.config.tracker.endpoint,
      apiKey: options.config.tracker.apiKey,
      projectSlug: options.config.tracker.projectSlug,
      activeStates: options.config.tracker.activeStates,
    });
  const workspaceManager =
    options.workspaceManager ??
    new WorkspaceManager({
      root: options.config.workspace.root,
    });
  const logger =
    options.logger ??
    (await createRuntimeLogger({
      logsRoot: options.logsRoot ?? null,
      ...(options.stdout === undefined ? {} : { stdout: options.stdout }),
    }));
  const runtimeHost =
    options.runtimeHost ??
    new OrchestratorRuntimeHost({
      config: options.config,
      tracker,
      workspaceManager,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  await cleanupTerminalIssueWorkspaces({
    tracker,
    terminalStates: options.config.tracker.terminalStates,
    workspaceManager,
    logger,
  });

  const dashboard =
    options.config.server.port === null
      ? null
      : await startDashboardServer({
          host: runtimeHost,
          port: options.config.server.port,
        });

  const stopController = new AbortController();
  const exitPromise = createExitPromise();
  let pollTimer: NodeJS.Timeout | null = null;
  let shuttingDown = false;

  const scheduleNextPoll = () => {
    if (stopController.signal.aborted) {
      return;
    }

    pollTimer = setTimeout(() => {
      void runPollCycle();
    }, options.config.polling.intervalMs);
  };

  const runPollCycle = async () => {
    try {
      await runtimeHost.pollOnce();
      scheduleNextPoll();
    } catch (error) {
      await logger.error("runtime_poll_failed", toErrorMessage(error), {
        error_code: ERROR_CODES.cliStartupFailed,
      });
      resolveExit(exitPromise, 1);
      void shutdown();
    }
  };

  const onSignal = (signal: NodeJS.Signals) => {
    void logger.info("runtime_shutdown_signal", `received ${signal}`, {
      reason: signal,
    });
    resolveExit(exitPromise, 0);
    void shutdown();
  };

  const removeSignalHandlers = installSignalHandlers(onSignal);

  const shutdown = async () => {
    if (shuttingDown) {
      await exitPromise.closed;
      return;
    }
    shuttingDown = true;
    resolveExit(exitPromise, 0);
    stopController.abort();

    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }

    removeSignalHandlers();

    await Promise.allSettled([
      runtimeHost.waitForIdle(),
      dashboard?.close() ?? Promise.resolve(),
    ]);

    resolveClosed(exitPromise);
  };

  await logger.info("runtime_starting", "Symphony runtime started.", {
    poll_interval_ms: options.config.polling.intervalMs,
    max_concurrent_agents: options.config.agent.maxConcurrentAgents,
    ...(dashboard === null ? {} : { port: dashboard.port }),
  });

  void runPollCycle();

  return {
    runtimeHost,
    logger,
    dashboard,
    async waitForExit() {
      return exitPromise.exitCode;
    },
    shutdown,
  };
}

async function cleanupTerminalIssueWorkspaces(input: {
  tracker: IssueTracker;
  terminalStates: string[];
  workspaceManager: WorkspaceManager;
  logger: StructuredLogger;
}): Promise<void> {
  try {
    const issues = await input.tracker.fetchIssuesByStates(
      input.terminalStates,
    );
    await Promise.all(
      issues.map(async (issue) => {
        await input.workspaceManager.removeForIssue(issue.identifier);
      }),
    );
  } catch (error) {
    await input.logger.warn(
      "startup_terminal_cleanup_failed",
      toErrorMessage(error),
      {
        outcome: "degraded",
        reason: "startup_terminal_cleanup_failed",
      },
    );
  }
}

async function createRuntimeLogger(input: {
  logsRoot: string | null;
  stdout?: Writable;
}): Promise<StructuredLogger> {
  const sinks = [createJsonLineSink(input.stdout ?? process.stdout)];

  if (input.logsRoot !== null) {
    await mkdir(input.logsRoot, { recursive: true });
    sinks.push(
      createJsonLineSink(
        createWriteStream(join(input.logsRoot, "symphony.jsonl"), {
          flags: "a",
        }),
      ),
    );
  }

  return new StructuredLogger(sinks);
}

function createQueuedTimerScheduler(input: {
  run: (callback: () => void) => void;
}): TimerScheduler {
  return {
    set(callback, delayMs) {
      return setTimeout(() => {
        input.run(callback);
      }, delayMs);
    },
    clear(handle) {
      if (handle !== null) {
        clearTimeout(handle);
      }
    },
  };
}

function toRunningIssueDetail(
  running: RunningEntry,
  workspaceManager: WorkspaceManager,
): IssueDetailResponse {
  return {
    issue_identifier: running.identifier,
    issue_id: running.issue.id,
    status: "running",
    workspace: {
      path: workspaceManager.resolveForIssue(running.identifier).workspacePath,
    },
    attempts: {
      restart_count: running.retryAttempt ?? 0,
      current_retry_attempt: running.retryAttempt,
    },
    running: {
      session_id: running.sessionId,
      turn_count: running.turnCount,
      state: running.issue.state,
      started_at: running.startedAt,
      last_event: running.lastCodexEvent,
      last_message: running.lastCodexMessage,
      last_event_at: running.lastCodexTimestamp,
      tokens: {
        input_tokens: running.codexInputTokens,
        output_tokens: running.codexOutputTokens,
        total_tokens: running.codexTotalTokens,
      },
    },
    retry: null,
    logs: {
      codex_session_logs: [],
    },
    recent_events: [],
    last_error: null,
    tracked: {},
  };
}

function toRetryIssueDetail(
  issueIdentifier: string,
  retry: RetryEntry,
): IssueDetailResponse {
  return {
    issue_identifier: issueIdentifier,
    issue_id: retry.issueId,
    status: "retry_queued",
    workspace: null,
    attempts: {
      restart_count: retry.attempt,
      current_retry_attempt: retry.attempt,
    },
    running: null,
    retry: {
      attempt: retry.attempt,
      due_at: new Date(retry.dueAtMs).toISOString(),
      error: retry.error,
    },
    logs: {
      codex_session_logs: [],
    },
    recent_events: [],
    last_error: retry.error,
    tracked: {},
  };
}

function installSignalHandlers(
  onSignal: (signal: NodeJS.Signals) => void,
): () => void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, onSignal);
  }

  return () => {
    for (const signal of signals) {
      process.off(signal, onSignal);
    }
  };
}

function createExitPromise(): {
  exitCode: Promise<number>;
  closed: Promise<void>;
  resolveExit: (code: number) => void;
  resolveClosed: () => void;
} {
  let resolveExitCode: ((code: number) => void) | null = null;
  let resolveClosedPromise: (() => void) | null = null;

  return {
    exitCode: new Promise<number>((resolve) => {
      resolveExitCode = resolve;
    }),
    closed: new Promise<void>((resolve) => {
      resolveClosedPromise = resolve;
    }),
    resolveExit(code) {
      resolveExitCode?.(code);
      resolveExitCode = null;
    },
    resolveClosed() {
      resolveClosedPromise?.();
      resolveClosedPromise = null;
    },
  };
}

function resolveExit(
  exitPromise: ReturnType<typeof createExitPromise>,
  code: number,
): void {
  exitPromise.resolveExit(code);
}

function resolveClosed(
  exitPromise: ReturnType<typeof createExitPromise>,
): void {
  exitPromise.resolveClosed();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "worker failed";
}
