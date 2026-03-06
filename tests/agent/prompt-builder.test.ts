import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKFLOW_PROMPT,
  getEffectivePromptTemplate,
  renderPrompt,
} from "../../src/agent/prompt-builder.js";
import type { PromptTemplateError } from "../../src/agent/prompt-builder.js";
import type { Issue } from "../../src/domain/model.js";
import { ERROR_CODES } from "../../src/errors/codes.js";

const ISSUE_FIXTURE: Issue = {
  id: "issue-1",
  identifier: "ABC-123",
  title: "Ship prompt rendering",
  description: "Implement strict Liquid prompt rendering",
  priority: 1,
  state: "In Progress",
  branchName: "feature/abc-123",
  url: "https://linear.app/example/issue/ABC-123",
  labels: ["backend", "automation"],
  blockedBy: [
    {
      id: "issue-0",
      identifier: "ABC-122",
      state: "Todo",
    },
  ],
  createdAt: "2026-03-06T00:00:00.000Z",
  updatedAt: "2026-03-06T01:00:00.000Z",
};

describe("prompt builder", () => {
  it("uses the spec fallback prompt when the workflow body is blank", () => {
    expect(getEffectivePromptTemplate(" \n\t ")).toBe(DEFAULT_WORKFLOW_PROMPT);
  });

  it("renders issue fields, nested arrays, and attempt metadata", async () => {
    const prompt = await renderPrompt({
      workflow: {
        promptTemplate: [
          "# {{ issue.identifier }}",
          "{{ issue.title }}",
          "{% for label in issue.labels %}[{{ label }}]{% endfor %}",
          "{% for blocker in issue.blockedBy %}{{ blocker.identifier }}:{{ blocker.state }}{% endfor %}",
          "attempt={{ attempt }}",
        ].join("\n"),
      },
      issue: ISSUE_FIXTURE,
      attempt: 2,
    });

    expect(prompt).toContain("# ABC-123");
    expect(prompt).toContain("Ship prompt rendering");
    expect(prompt).toContain("[backend][automation]");
    expect(prompt).toContain("ABC-122:Todo");
    expect(prompt).toContain("attempt=2");
  });

  it("preserves a null attempt for first-run prompts", async () => {
    const prompt = await renderPrompt({
      workflow: {
        promptTemplate:
          "{% if attempt == nil %}first-run{% else %}retry{% endif %}",
      },
      issue: ISSUE_FIXTURE,
      attempt: null,
    });

    expect(prompt).toBe("first-run");
  });

  it("fails on unknown variables in strict mode", async () => {
    await expect(
      renderPrompt({
        workflow: {
          promptTemplate: "{{ issue.missingField }}",
        },
        issue: ISSUE_FIXTURE,
        attempt: null,
      }),
    ).rejects.toMatchObject({
      name: "PromptTemplateError",
      code: ERROR_CODES.promptRenderFailed,
      kind: "template_render_error",
    } satisfies Partial<PromptTemplateError>);
  });

  it("fails on unknown filters in strict mode", async () => {
    await expect(
      renderPrompt({
        workflow: {
          promptTemplate: "{{ issue.title | no_such_filter }}",
        },
        issue: ISSUE_FIXTURE,
        attempt: null,
      }),
    ).rejects.toMatchObject({
      name: "PromptTemplateError",
      code: ERROR_CODES.promptRenderFailed,
      kind: "template_render_error",
    } satisfies Partial<PromptTemplateError>);
  });

  it("reports invalid template syntax as a parse error", async () => {
    await expect(
      renderPrompt({
        workflow: {
          promptTemplate: "{% if issue.identifier %}",
        },
        issue: ISSUE_FIXTURE,
        attempt: null,
      }),
    ).rejects.toMatchObject({
      name: "PromptTemplateError",
      code: ERROR_CODES.promptRenderFailed,
      kind: "template_parse_error",
    } satisfies Partial<PromptTemplateError>);
  });
});
