import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  WorkflowLoaderError,
  loadWorkflowDefinition,
  parseWorkflowContent,
  resolveWorkflowPath,
} from "../../src/config/workflow-loader.js";
import { ERROR_CODES } from "../../src/errors/codes.js";

describe("workflow-loader", () => {
  it("parses YAML front matter and trims the prompt body", () => {
    const workflow = parseWorkflowContent(`---
tracker:
  kind: linear
  project_slug: ENG
---

# Prompt

Do the work.
`);

    expect(workflow.config).toEqual({
      tracker: {
        kind: "linear",
        project_slug: "ENG",
      },
    });
    expect(workflow.promptTemplate).toBe("# Prompt\n\nDo the work.");
  });

  it("treats files without front matter as prompt-only workflows", () => {
    const workflow = parseWorkflowContent("\n\nShip it.\n");

    expect(workflow.config).toEqual({});
    expect(workflow.promptTemplate).toBe("Ship it.");
  });

  it("rejects non-map front matter", () => {
    expect(() =>
      parseWorkflowContent(`---
- nope
---
Prompt`),
    ).toThrowError(WorkflowLoaderError);

    try {
      parseWorkflowContent(`---
- nope
---
Prompt`);
    } catch (error) {
      expect(error).toMatchObject({
        code: ERROR_CODES.workflowFrontMatterNotAMap,
      });
    }
  });

  it("rejects invalid YAML front matter", () => {
    expect(() =>
      parseWorkflowContent(`---
tracker: [broken
---
Prompt`),
    ).toThrowError(WorkflowLoaderError);

    try {
      parseWorkflowContent(`---
tracker: [broken
---
Prompt`);
    } catch (error) {
      expect(error).toMatchObject({
        code: ERROR_CODES.workflowParseError,
      });
    }
  });

  it("loads the workflow from disk and defaults to WORKFLOW.md in cwd", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "symphony-task3-loader-"));
    const workflowPath = join(workspace, "WORKFLOW.md");
    await writeFile(workflowPath, "Prompt body\n", "utf8");

    const workflow = await loadWorkflowDefinition(workflowPath);

    expect(workflow.workflowPath).toBe(workflowPath);
    expect(workflow.promptTemplate).toBe("Prompt body");
    expect(resolveWorkflowPath(workflowPath)).toBe(workflowPath);
  });

  it("returns a typed missing-workflow error when the file does not exist", async () => {
    const missingPath = join(tmpdir(), "missing-workflow.md");

    await expect(loadWorkflowDefinition(missingPath)).rejects.toMatchObject({
      code: ERROR_CODES.missingWorkflowFile,
    });
  });
});
