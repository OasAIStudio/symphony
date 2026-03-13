import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ERROR_CODES } from "../../src/errors/codes.js";
import {
  WorkspaceHookRunner,
  WorkspaceManager,
  type WorkspacePathError,
} from "../../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.allSettled(
    roots.splice(0).map(async (root) => {
      const manager = new WorkspaceManager({ root });
      await manager.removeForIssue("issue-123");
      await manager.removeForIssue("issue/123:needs review");
    }),
  );
});

describe("WorkspaceManager", () => {
  it("creates a missing workspace directory with a deterministic path", async () => {
    const root = await createRoot();
    const manager = new WorkspaceManager({ root });

    const workspace = await manager.createForIssue("issue/123:needs review");

    expect(workspace.workspaceKey).toBe("issue_123_needs_review");
    expect(workspace.path).toBe(join(root, "issue_123_needs_review"));
    expect(workspace.createdNow).toBe(true);
  });

  it("reuses an existing workspace directory on later attempts", async () => {
    const root = await createRoot();
    const manager = new WorkspaceManager({ root });

    await manager.createForIssue("issue-123");
    const workspace = await manager.createForIssue("issue-123");

    expect(workspace.path).toBe(join(root, "issue-123"));
    expect(workspace.createdNow).toBe(false);
  });

  it("runs afterCreate only for newly created workspaces", async () => {
    const root = await createRoot();
    const hookCalls: string[] = [];
    const hooks = new WorkspaceHookRunner({
      config: {
        afterCreate: "prepare",
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 100,
      },
      execute: async (_script, options) => {
        hookCalls.push(options.cwd);
        return {
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        };
      },
    });
    const manager = new WorkspaceManager({ root, hooks });

    const first = await manager.createForIssue("issue-123");
    await manager.createForIssue("issue-123");

    expect(hookCalls).toEqual([first.path]);
  });

  it("runs beforeRemove as a best-effort hook when deleting an existing workspace", async () => {
    const root = await createRoot();
    const hookCalls: string[] = [];
    const hooks = new WorkspaceHookRunner({
      config: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: "cleanup",
        timeoutMs: 100,
      },
      execute: async (_script, options) => {
        hookCalls.push(options.cwd);
        return {
          exitCode: 1,
          signal: null,
          stdout: "",
          stderr: "ignored",
        };
      },
    });
    const manager = new WorkspaceManager({ root, hooks });

    const workspace = await manager.createForIssue("issue-123");
    const removed = await manager.removeForIssue("issue-123");

    expect(removed).toBe(true);
    expect(hookCalls).toEqual([workspace.path]);
  });

  it("fails safely when the workspace path already exists as a file", async () => {
    const root = await createRoot();
    await writeFile(join(root, "issue-123"), "not a directory");
    const manager = new WorkspaceManager({ root });

    await expect(manager.createForIssue("issue-123")).rejects.toThrowError(
      expect.objectContaining<Partial<WorkspacePathError>>({
        code: ERROR_CODES.workspacePathInvalid,
      }),
    );
  });

  it("removes a workspace path during cleanup", async () => {
    const root = await createRoot();
    const manager = new WorkspaceManager({ root });

    const workspace = await manager.createForIssue("issue-123");
    const removed = await manager.removeForIssue("issue-123");

    expect(removed).toBe(true);
    await expect(manager.createForIssue("issue-123")).resolves.toEqual({
      path: workspace.path,
      workspaceKey: "issue-123",
      createdNow: true,
    });
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "symphony-task6-"));
  roots.push(root);
  return root;
}
