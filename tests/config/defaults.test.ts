import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CODEX_COMMAND,
  DEFAULT_HOOK_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENT_AGENTS,
  DEFAULT_MAX_RETRY_BACKOFF_MS,
  DEFAULT_MAX_TURNS,
  DEFAULT_OBSERVABILITY_ENABLED,
  DEFAULT_OBSERVABILITY_REFRESH_MS,
  DEFAULT_OBSERVABILITY_RENDER_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_STALL_TIMEOUT_MS,
  DEFAULT_TURN_TIMEOUT_MS,
  DEFAULT_WORKSPACE_ROOT,
  SPEC_DEFAULTS,
  WORKFLOW_FILENAME,
} from "../../src/config/defaults.js";

describe("SPEC_DEFAULTS", () => {
  it("matches the required spec baseline values", () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(30_000);
    expect(DEFAULT_HOOK_TIMEOUT_MS).toBe(60_000);
    expect(DEFAULT_MAX_CONCURRENT_AGENTS).toBe(10);
    expect(DEFAULT_MAX_TURNS).toBe(20);
    expect(DEFAULT_MAX_RETRY_BACKOFF_MS).toBe(300_000);
    expect(DEFAULT_TURN_TIMEOUT_MS).toBe(3_600_000);
    expect(DEFAULT_READ_TIMEOUT_MS).toBe(5_000);
    expect(DEFAULT_STALL_TIMEOUT_MS).toBe(300_000);
    expect(DEFAULT_OBSERVABILITY_ENABLED).toBe(true);
    expect(DEFAULT_OBSERVABILITY_REFRESH_MS).toBe(1_000);
    expect(DEFAULT_OBSERVABILITY_RENDER_INTERVAL_MS).toBe(16);
    expect(DEFAULT_CODEX_COMMAND).toBe("codex app-server");
  });

  it("uses the expected workflow and workspace defaults", () => {
    expect(WORKFLOW_FILENAME).toBe("WORKFLOW.md");
    expect(DEFAULT_WORKSPACE_ROOT).toBe(join(tmpdir(), "symphony_workspaces"));
    expect(SPEC_DEFAULTS.workspace.root).toBe(DEFAULT_WORKSPACE_ROOT);
  });

  it("keeps the frozen default tree internally consistent", () => {
    expect(SPEC_DEFAULTS.polling.intervalMs).toBe(DEFAULT_POLL_INTERVAL_MS);
    expect(SPEC_DEFAULTS.agent.maxConcurrentAgents).toBe(
      DEFAULT_MAX_CONCURRENT_AGENTS,
    );
    expect(SPEC_DEFAULTS.codex.command).toBe(DEFAULT_CODEX_COMMAND);
    expect(SPEC_DEFAULTS.observability.dashboardEnabled).toBe(
      DEFAULT_OBSERVABILITY_ENABLED,
    );
    expect(Object.isFrozen(SPEC_DEFAULTS)).toBe(true);
  });
});
