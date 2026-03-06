import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parse } from "yaml";

import type { WorkflowDefinition } from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";
import { WORKFLOW_FILENAME } from "./defaults.js";

export class WorkflowLoaderError extends Error {
  readonly code: string;
  readonly workflowPath: string;

  constructor(input: { code: string; message: string; workflowPath: string }) {
    super(input.message);
    this.name = "WorkflowLoaderError";
    this.code = input.code;
    this.workflowPath = input.workflowPath;
  }
}

export function resolveWorkflowPath(workflowPath?: string): string {
  if (workflowPath && workflowPath.trim() !== "") {
    return resolve(workflowPath);
  }

  return resolve(process.cwd(), WORKFLOW_FILENAME);
}

export async function loadWorkflowDefinition(
  workflowPath?: string,
): Promise<WorkflowDefinition & { workflowPath: string }> {
  const resolvedWorkflowPath = resolveWorkflowPath(workflowPath);

  let content: string;
  try {
    content = await readFile(resolvedWorkflowPath, "utf8");
  } catch (error) {
    const errorCode =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code === "ENOENT"
        ? ERROR_CODES.missingWorkflowFile
        : ERROR_CODES.workflowReadFailed;

    throw new WorkflowLoaderError({
      code: errorCode,
      message: `Unable to read workflow file at ${resolvedWorkflowPath}.`,
      workflowPath: resolvedWorkflowPath,
    });
  }

  const workflow = parseWorkflowContent(content, resolvedWorkflowPath);
  return {
    ...workflow,
    workflowPath: resolvedWorkflowPath,
  };
}

export function parseWorkflowContent(
  content: string,
  workflowPath = WORKFLOW_FILENAME,
): WorkflowDefinition {
  if (!content.startsWith("---")) {
    return {
      config: {},
      promptTemplate: content.trim(),
    };
  }

  const frontMatterResult = splitFrontMatter(content, workflowPath);
  const parsedConfig = parseYamlFrontMatter(
    frontMatterResult.frontMatter,
    workflowPath,
  );

  return {
    config: parsedConfig,
    promptTemplate: frontMatterResult.body.trim(),
  };
}

function splitFrontMatter(
  content: string,
  workflowPath: string,
): {
  frontMatter: string;
  body: string;
} {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");

  if (lines[0] !== "---") {
    return {
      frontMatter: "",
      body: normalizedContent,
    };
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line === "---",
  );
  if (closingIndex === -1) {
    throw new WorkflowLoaderError({
      code: ERROR_CODES.workflowParseError,
      message: "Workflow front matter is missing a closing delimiter.",
      workflowPath,
    });
  }

  return {
    frontMatter: lines.slice(1, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n"),
  };
}

function parseYamlFrontMatter(
  yamlSource: string,
  workflowPath: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parse(yamlSource);
  } catch (error) {
    const details = error instanceof Error ? ` ${error.message}` : "";
    throw new WorkflowLoaderError({
      code: ERROR_CODES.workflowParseError,
      message: `Workflow front matter could not be parsed as YAML.${details}`,
      workflowPath,
    });
  }

  if (parsed === null) {
    throw new WorkflowLoaderError({
      code: ERROR_CODES.workflowFrontMatterNotAMap,
      message: "Workflow front matter must decode to a map/object.",
      workflowPath,
    });
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkflowLoaderError({
      code: ERROR_CODES.workflowFrontMatterNotAMap,
      message: "Workflow front matter must decode to a map/object.",
      workflowPath,
    });
  }

  return parsed as Record<string, unknown>;
}
