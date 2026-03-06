import { homedir } from "node:os";
import { isAbsolute, normalize, resolve, sep } from "node:path";

import type { WorkflowDefinition } from "../domain/model.js";
import { normalizeIssueState } from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";
import {
  DEFAULT_ACTIVE_STATES,
  DEFAULT_CODEX_COMMAND,
  DEFAULT_HOOK_TIMEOUT_MS,
  DEFAULT_LINEAR_ENDPOINT,
  DEFAULT_LINEAR_NETWORK_TIMEOUT_MS,
  DEFAULT_LINEAR_PAGE_SIZE,
  DEFAULT_MAX_CONCURRENT_AGENTS,
  DEFAULT_MAX_CONCURRENT_AGENTS_BY_STATE,
  DEFAULT_MAX_RETRY_BACKOFF_MS,
  DEFAULT_MAX_TURNS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_STALL_TIMEOUT_MS,
  DEFAULT_TERMINAL_STATES,
  DEFAULT_TRACKER_KIND,
  DEFAULT_TURN_TIMEOUT_MS,
  DEFAULT_WORKSPACE_ROOT,
} from "./defaults.js";
import type {
  DispatchValidationResult,
  ResolvedWorkflowConfig,
} from "./types.js";

const LINEAR_CANONICAL_API_KEY_ENV = "LINEAR_API_KEY";

export function resolveWorkflowConfig(
  workflow: WorkflowDefinition & { workflowPath: string },
  environment: NodeJS.ProcessEnv = process.env,
): ResolvedWorkflowConfig {
  const config = workflow.config;
  const tracker = asRecord(config.tracker);
  const polling = asRecord(config.polling);
  const workspace = asRecord(config.workspace);
  const hooks = asRecord(config.hooks);
  const agent = asRecord(config.agent);
  const codex = asRecord(config.codex);
  const server = asRecord(config.server);

  return {
    workflowPath: workflow.workflowPath,
    promptTemplate: workflow.promptTemplate,
    tracker: {
      kind: readString(tracker.kind) ?? DEFAULT_TRACKER_KIND,
      endpoint: readString(tracker.endpoint) ?? DEFAULT_LINEAR_ENDPOINT,
      apiKey:
        resolveEnvReference(readString(tracker.api_key), environment) ??
        environment[LINEAR_CANONICAL_API_KEY_ENV] ??
        null,
      projectSlug: readString(tracker.project_slug),
      activeStates: readStringList(
        tracker.active_states,
        DEFAULT_ACTIVE_STATES,
      ),
      terminalStates: readStringList(
        tracker.terminal_states,
        DEFAULT_TERMINAL_STATES,
      ),
    },
    polling: {
      intervalMs: readInteger(polling.interval_ms) ?? DEFAULT_POLL_INTERVAL_MS,
    },
    workspace: {
      root:
        resolvePathValue(
          readString(workspace.root),
          workflow.workflowPath,
          environment,
        ) ?? DEFAULT_WORKSPACE_ROOT,
    },
    hooks: {
      afterCreate: readScript(hooks.after_create),
      beforeRun: readScript(hooks.before_run),
      afterRun: readScript(hooks.after_run),
      beforeRemove: readScript(hooks.before_remove),
      timeoutMs:
        readPositiveInteger(hooks.timeout_ms) ?? DEFAULT_HOOK_TIMEOUT_MS,
    },
    agent: {
      maxConcurrentAgents:
        readPositiveInteger(agent.max_concurrent_agents) ??
        DEFAULT_MAX_CONCURRENT_AGENTS,
      maxTurns: readPositiveInteger(agent.max_turns) ?? DEFAULT_MAX_TURNS,
      maxRetryBackoffMs:
        readPositiveInteger(agent.max_retry_backoff_ms) ??
        DEFAULT_MAX_RETRY_BACKOFF_MS,
      maxConcurrentAgentsByState: readStateConcurrencyMap(
        agent.max_concurrent_agents_by_state,
      ),
    },
    codex: {
      command: readString(codex.command) ?? DEFAULT_CODEX_COMMAND,
      approvalPolicy: codex.approval_policy,
      threadSandbox: codex.thread_sandbox,
      turnSandboxPolicy: codex.turn_sandbox_policy,
      turnTimeoutMs:
        readPositiveInteger(codex.turn_timeout_ms) ?? DEFAULT_TURN_TIMEOUT_MS,
      readTimeoutMs:
        readPositiveInteger(codex.read_timeout_ms) ?? DEFAULT_READ_TIMEOUT_MS,
      stallTimeoutMs:
        readInteger(codex.stall_timeout_ms) ?? DEFAULT_STALL_TIMEOUT_MS,
    },
    server: {
      port: readNonNegativeInteger(server.port),
    },
  };
}

export function validateDispatchConfig(
  config: ResolvedWorkflowConfig,
): DispatchValidationResult {
  const trackerKind = config.tracker.kind?.trim();
  if (!trackerKind) {
    return invalid(
      ERROR_CODES.configInvalid,
      "tracker.kind must be present before dispatch.",
    );
  }

  if (trackerKind !== DEFAULT_TRACKER_KIND) {
    return invalid(
      ERROR_CODES.unsupportedTrackerKind,
      `tracker.kind '${trackerKind}' is not supported.`,
    );
  }

  if (!config.tracker.apiKey || config.tracker.apiKey.trim() === "") {
    return invalid(
      ERROR_CODES.trackerCredentialsMissing,
      "tracker.api_key must be configured before dispatch.",
    );
  }

  if (!config.tracker.projectSlug || config.tracker.projectSlug.trim() === "") {
    return invalid(
      ERROR_CODES.configInvalid,
      "tracker.project_slug must be configured before dispatch.",
    );
  }

  if (config.codex.command.trim() === "") {
    return invalid(
      ERROR_CODES.configInvalid,
      "codex.command must be present and non-empty before dispatch.",
    );
  }

  return { ok: true };
}

function invalid(code: string, message: string): DispatchValidationResult {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value;
}

function readScript(value: unknown): string | null {
  const script = readString(value);
  if (script === null) {
    return null;
  }

  return script === "" ? null : script;
}

function readInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  return null;
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = readInteger(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }

  return parsed;
}

function readNonNegativeInteger(value: unknown): number | null {
  const parsed = readInteger(value);
  if (parsed === null || parsed < 0) {
    return null;
  }

  return parsed;
}

function readStringList(value: unknown, fallback: readonly string[]): string[] {
  if (Array.isArray(value)) {
    const items = value.filter(
      (entry): entry is string => typeof entry === "string",
    );
    if (items.length > 0) {
      return items.map((entry) => entry.trim()).filter((entry) => entry !== "");
    }
  }

  if (typeof value === "string") {
    const items = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");
    if (items.length > 0) {
      return items;
    }
  }

  return [...fallback];
}

function readStateConcurrencyMap(
  value: unknown,
): Readonly<Record<string, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_MAX_CONCURRENT_AGENTS_BY_STATE;
  }

  const normalizedEntries = Object.entries(value).flatMap(([state, limit]) => {
    const parsedLimit = readPositiveInteger(limit);
    if (parsedLimit === null) {
      return [];
    }

    return [[normalizeIssueState(state), parsedLimit] as const];
  });

  return Object.freeze(Object.fromEntries(normalizedEntries));
}

function resolveEnvReference(
  value: string | null,
  environment: NodeJS.ProcessEnv,
): string | null {
  if (!value) {
    return null;
  }

  if (!value.startsWith("$")) {
    return value;
  }

  const envName = value.slice(1);
  const resolvedValue = environment[envName];
  if (!resolvedValue || resolvedValue.trim() === "") {
    return null;
  }

  return resolvedValue;
}

function resolvePathValue(
  value: string | null,
  workflowPath: string,
  environment: NodeJS.ProcessEnv,
): string | null {
  const rawPath = resolveEnvReference(value, environment);
  if (!rawPath) {
    return null;
  }

  let expanded = rawPath.startsWith("~")
    ? `${homedir()}${rawPath.slice(1)}`
    : rawPath;

  if (
    !expanded.includes(sep) &&
    !expanded.includes("/") &&
    !expanded.includes("\\")
  ) {
    return expanded;
  }

  if (isAbsolute(expanded)) {
    return normalize(expanded);
  }

  expanded = resolve(resolve(workflowPath, ".."), expanded);
  return normalize(expanded);
}

export const LINEAR_DEFAULTS = Object.freeze({
  endpoint: DEFAULT_LINEAR_ENDPOINT,
  pageSize: DEFAULT_LINEAR_PAGE_SIZE,
  networkTimeoutMs: DEFAULT_LINEAR_NETWORK_TIMEOUT_MS,
});
