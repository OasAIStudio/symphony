import { describe, expect, it } from "vitest";

import {
  ORCHESTRATOR_EVENTS,
  ORCHESTRATOR_ISSUE_STATUSES,
  RUN_ATTEMPT_PHASES,
  createEmptyLiveSession,
  createInitialOrchestratorState,
  normalizeIssueState,
  toSessionId,
  toWorkspaceKey,
} from "../../src/domain/model.js";

describe("domain model", () => {
  it("tracks the orchestrator issue lifecycle states from the spec", () => {
    expect(ORCHESTRATOR_ISSUE_STATUSES).toEqual([
      "unclaimed",
      "claimed",
      "running",
      "retry_queued",
      "released",
    ]);
  });

  it("tracks the run attempt phases and orchestrator events required by the spec", () => {
    expect(RUN_ATTEMPT_PHASES).toEqual([
      "preparing_workspace",
      "building_prompt",
      "launching_agent_process",
      "initializing_session",
      "streaming_turn",
      "finishing",
      "succeeded",
      "failed",
      "timed_out",
      "stalled",
      "canceled_by_reconciliation",
    ]);
    expect(ORCHESTRATOR_EVENTS).toEqual([
      "poll_tick",
      "worker_exit_normal",
      "worker_exit_abnormal",
      "codex_update_event",
      "retry_timer_fired",
      "reconciliation_state_refresh",
      "stall_timeout",
    ]);
  });

  it("normalizes state, workspace, and session identifiers deterministically", () => {
    expect(normalizeIssueState(" In Progress ")).toBe("in progress");
    expect(toWorkspaceKey("ABC-123/needs review")).toBe("ABC-123_needs_review");
    expect(toSessionId("thread-1", "turn-2")).toBe("thread-1-turn-2");
  });

  it("creates empty live session and orchestrator state baselines", () => {
    expect(createEmptyLiveSession()).toEqual({
      sessionId: null,
      threadId: null,
      turnId: null,
      codexAppServerPid: null,
      lastCodexEvent: null,
      lastCodexTimestamp: null,
      lastCodexMessage: null,
      codexInputTokens: 0,
      codexOutputTokens: 0,
      codexTotalTokens: 0,
      lastReportedInputTokens: 0,
      lastReportedOutputTokens: 0,
      lastReportedTotalTokens: 0,
      turnCount: 0,
    });

    const state = createInitialOrchestratorState({
      pollIntervalMs: 30_000,
      maxConcurrentAgents: 10,
    });

    expect(state.pollIntervalMs).toBe(30_000);
    expect(state.maxConcurrentAgents).toBe(10);
    expect(state.running).toEqual({});
    expect([...state.claimed]).toEqual([]);
    expect(state.retryAttempts).toEqual({});
    expect([...state.completed]).toEqual([]);
    expect(state.codexTotals).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0,
    });
    expect(state.codexRateLimits).toBeNull();
  });
});
