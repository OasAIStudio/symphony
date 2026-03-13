import { promises as fs } from "node:fs";

import type { Workspace } from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";
import type { WorkspaceHookRunner } from "./hooks.js";
import {
  WorkspacePathError,
  type WorkspacePathInfo,
  resolveWorkspacePath,
} from "./path-safety.js";

interface FileSystemLike {
  lstat(path: string): Promise<{ isDirectory(): boolean }>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
  rm(
    path: string,
    options?: { force?: boolean; recursive?: boolean },
  ): Promise<void>;
}

export interface WorkspaceManagerOptions {
  root: string;
  fs?: FileSystemLike;
  hooks?: WorkspaceHookRunner | null;
}

export class WorkspaceManager {
  readonly root: string;
  readonly #fs: FileSystemLike;
  readonly #hooks: WorkspaceHookRunner | null;

  constructor(options: WorkspaceManagerOptions) {
    this.root = options.root;
    this.#fs = options.fs ?? fs;
    this.#hooks = isHookRunner(options.hooks) ? options.hooks : null;
  }

  resolveForIssue(issueId: string): WorkspacePathInfo {
    return resolveWorkspacePath(this.root, issueId);
  }

  async createForIssue(issueId: string): Promise<Workspace> {
    const { workspaceKey, workspacePath, workspaceRoot } =
      this.resolveForIssue(issueId);

    try {
      await this.#fs.mkdir(workspaceRoot, { recursive: true });
      const createdNow = await this.#ensureWorkspaceDirectory(workspacePath);
      const workspace = {
        path: workspacePath,
        workspaceKey,
        createdNow,
      };

      if (createdNow) {
        await this.#hooks?.run({
          name: "afterCreate",
          workspacePath,
        });
      }

      return workspace;
    } catch (error) {
      if (error instanceof WorkspacePathError) {
        throw error;
      }

      throw new WorkspacePathError(
        ERROR_CODES.workspaceCreateFailed,
        `Failed to prepare workspace for ${issueId}`,
        { cause: error },
      );
    }
  }

  async removeForIssue(issueId: string): Promise<boolean> {
    const { workspacePath } = this.resolveForIssue(issueId);

    try {
      const existsAsDirectory = await this.#workspaceExists(workspacePath);
      if (existsAsDirectory) {
        await this.#hooks?.runBestEffort({
          name: "beforeRemove",
          workspacePath,
        });
      }

      await this.#fs.rm(workspacePath, { force: true, recursive: true });
      return true;
    } catch (error) {
      throw new WorkspacePathError(
        ERROR_CODES.workspaceCleanupFailed,
        `Failed to remove workspace for ${issueId}`,
        { cause: error },
      );
    }
  }

  async #ensureWorkspaceDirectory(workspacePath: string): Promise<boolean> {
    try {
      const current = await this.#fs.lstat(workspacePath);

      if (current.isDirectory()) {
        return false;
      }

      throw new WorkspacePathError(
        ERROR_CODES.workspacePathInvalid,
        `Workspace path exists and is not a directory: ${workspacePath}`,
      );
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }

    try {
      await this.#fs.mkdir(workspacePath);
      return true;
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        const current = await this.#fs.lstat(workspacePath);

        if (current.isDirectory()) {
          return false;
        }

        throw new WorkspacePathError(
          ERROR_CODES.workspacePathInvalid,
          `Workspace path exists and is not a directory: ${workspacePath}`,
        );
      }

      throw error;
    }
  }

  async #workspaceExists(workspacePath: string): Promise<boolean> {
    try {
      const current = await this.#fs.lstat(workspacePath);
      return current.isDirectory();
    } catch (error) {
      if (isMissingPathError(error)) {
        return false;
      }

      throw error;
    }
  }
}

function isHookRunner(
  value: WorkspaceManagerOptions["hooks"],
): value is WorkspaceHookRunner {
  return (
    typeof value === "object" &&
    value !== null &&
    "run" in value &&
    typeof value.run === "function" &&
    "runBestEffort" in value &&
    typeof value.runBestEffort === "function"
  );
}

function isMissingPathError(
  error: unknown,
): error is NodeJS.ErrnoException & { code: "ENOENT" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isAlreadyExistsError(
  error: unknown,
): error is NodeJS.ErrnoException & { code: "EEXIST" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}
