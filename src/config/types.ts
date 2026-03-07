export interface WorkflowHooksConfig {
  afterCreate: string | null;
  beforeRun: string | null;
  afterRun: string | null;
  beforeRemove: string | null;
  timeoutMs: number;
}

export interface WorkflowTrackerConfig {
  kind: string | null;
  endpoint: string;
  apiKey: string | null;
  projectSlug: string | null;
  activeStates: string[];
  terminalStates: string[];
}

export interface WorkflowPollingConfig {
  intervalMs: number;
}

export interface WorkflowWorkspaceConfig {
  root: string;
}

export interface WorkflowAgentConfig {
  maxConcurrentAgents: number;
  maxTurns: number;
  maxRetryBackoffMs: number;
  maxConcurrentAgentsByState: Readonly<Record<string, number>>;
}

export interface WorkflowCodexConfig {
  command: string;
  approvalPolicy: unknown;
  threadSandbox: unknown;
  turnSandboxPolicy: unknown;
  turnTimeoutMs: number;
  readTimeoutMs: number;
  stallTimeoutMs: number;
}

export interface WorkflowServerConfig {
  port: number | null;
}

export interface WorkflowObservabilityConfig {
  dashboardEnabled: boolean;
  refreshMs: number;
  renderIntervalMs: number;
}

export interface ResolvedWorkflowConfig {
  workflowPath: string;
  promptTemplate: string;
  tracker: WorkflowTrackerConfig;
  polling: WorkflowPollingConfig;
  workspace: WorkflowWorkspaceConfig;
  hooks: WorkflowHooksConfig;
  agent: WorkflowAgentConfig;
  codex: WorkflowCodexConfig;
  server: WorkflowServerConfig;
  observability: WorkflowObservabilityConfig;
}

export interface DispatchValidationFailure {
  code: string;
  message: string;
}

export type DispatchValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: DispatchValidationFailure;
    };

export interface WorkflowSnapshot {
  definition: {
    workflowPath: string;
    config: Record<string, unknown>;
    promptTemplate: string;
  };
  config: ResolvedWorkflowConfig;
  dispatchValidation: DispatchValidationResult;
  loadedAt: string;
}

export type WorkflowReloadReason = "manual" | "filesystem_event";

export type WorkflowReloadResult =
  | {
      ok: true;
      reason: WorkflowReloadReason;
      previousSnapshot: WorkflowSnapshot;
      snapshot: WorkflowSnapshot;
    }
  | {
      ok: false;
      reason: WorkflowReloadReason;
      currentSnapshot: WorkflowSnapshot;
      error: unknown;
    };
