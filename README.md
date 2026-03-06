# Symphony

Symphony turns project work into isolated, autonomous implementation runs, allowing teams to manage
work instead of supervising coding agents.

> `symphony-ts` is a TypeScript implementation of the original [openai/symphony](https://github.com/openai/symphony) project.
>
> Harness Engineering is exactly what I want! Not vibe coding. Not just giving OpenClaw a sentence and asking it to orchestrate the rest.
>
> We will support more platforms beyond Linear in the near term, including platforms widely used in China. 短期内我们会支持更多平台，包括国内的平台。

<!-- Demo preview goes here -->

> [!WARNING]
> Symphony is intended for testing in trusted environments.

## Running Symphony

### Requirements

Symphony works best in codebases that have adopted
[harness engineering](https://openai.com/index/harness-engineering/). Symphony is the next step:
moving from managing coding agents to managing work that needs to get done.

- Node.js `>= 22`
- pnpm `>= 10`
- a repository with a valid `WORKFLOW.md`
- tracker credentials such as `LINEAR_API_KEY`
- a coding agent runtime that supports app-server mode

### Install

```bash
pnpm install
```

### Develop

```bash
pnpm build
pnpm test
pnpm lint
pnpm format
```

### Configure your repository

Create a `WORKFLOW.md` that defines how Symphony should operate in your codebase. The YAML front
matter configures tracker, workspace, hooks, and runtime behavior. The Markdown body becomes the
agent prompt template.

Example:

```md
---
tracker:
  kind: linear
workspace:
  root: ~/code/symphony-workspaces
agent:
  max_concurrent_agents: 10
codex:
  command: codex app-server
---

You are working on Linear issue {{ issue.identifier }}.
Implement the task, validate the result, and stop at the required handoff state.
```

### About This Repository

This repository follows the published Symphony README and spec to provide a TypeScript
implementation of the Symphony service model.
