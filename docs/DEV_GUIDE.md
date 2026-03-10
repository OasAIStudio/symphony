# Symphony-TS Developer Quick-Start Guide

> For: developers with a Linear test project who want to run Symphony locally and start contributing.

---

## What Is This Project

Symphony-TS is a TypeScript implementation of the [Symphony](https://github.com/openai/symphony) specification.

**In one sentence**: A long-running daemon that polls a Linear board, creates isolated workspaces for each active issue, launches a Codex (OpenAI coding agent) subprocess per issue, and manages concurrency, retries, state reconciliation, and observability.

**Core data flow**:

```
WORKFLOW.md (config + prompt template)
      |
      v
[Orchestrator] -- polls Linear --> active Issues
      |
      v
[WorkspaceManager] -- creates /tmp/symphony_workspaces/<issue-key>/
      |
      v
[AgentRunner] -- spawns codex app-server subprocess in workspace
      |
      v
Codex agent works on the issue, writes back to Linear via linear_graphql tool
```

---

## Project Structure

```
src/
  cli/              # Entry point: main.ts - parses CLI args, loads config, starts runtime
  config/           # WORKFLOW.md parsing, typed config resolution, hot-reload file watcher
  domain/           # Core type definitions (Issue, RunAttempt, LiveSession, etc.)
  orchestrator/     # Dispatch core (core.ts) + runtime host (runtime-host.ts)
  agent/            # AgentRunner (spawns Codex subprocess) + prompt builder
  tracker/          # Linear GraphQL client, queries, response normalization
  codex/            # Codex app-server protocol client + linear_graphql dynamic tool
  workspace/        # Workspace directory management, path safety, lifecycle hooks
  logging/          # Structured logging, session metrics, runtime snapshots
  observability/    # Optional HTTP dashboard server
  errors/           # Error code constants
  index.ts          # Public API exports

tests/              # Vitest tests, mirroring src/ structure
```

**Key files at a glance**:

| Concern | File |
|---------|------|
| Dispatch logic | [src/orchestrator/core.ts](src/orchestrator/core.ts) |
| Runtime startup | [src/orchestrator/runtime-host.ts](src/orchestrator/runtime-host.ts) |
| Config resolution | [src/config/config-resolver.ts](src/config/config-resolver.ts) |
| Defaults | [src/config/defaults.ts](src/config/defaults.ts) |
| Linear client | [src/tracker/linear-client.ts](src/tracker/linear-client.ts) |
| Agent launch | [src/agent/runner.ts](src/agent/runner.ts) |
| Prompt construction | [src/agent/prompt-builder.ts](src/agent/prompt-builder.ts) |
| Codex protocol | [src/codex/app-server-client.ts](src/codex/app-server-client.ts) |
| CLI entry | [src/cli/main.ts](src/cli/main.ts) |
| Domain model | [src/domain/model.ts](src/domain/model.ts) |

---

## Step-by-Step Quick Start

### Step 1: Prerequisites

Make sure you have:
- Node.js >= 22
- pnpm >= 10
- Codex CLI installed (`codex app-server` command must be available)

```bash
node --version    # must be v22+
pnpm --version    # must be 10+
codex --version   # must support codex app-server
```

### Step 2: Install Dependencies and Build

```bash
pnpm install
pnpm build
```

Build output goes to `dist/`. The CLI entry point is `dist/src/cli/main.js`.

Verify the build:

```bash
node dist/src/cli/main.js --help
```

### Step 3: Get Your Linear API Key and Project Slug

1. Go to Linear -> Settings -> API -> Personal API Keys
2. Create a new key and copy it
3. Find your test project's **slug** (visible in the URL or project settings)

Export the key as an environment variable (never commit it):

```bash
export LINEAR_API_KEY="lin_api_xxxxxxxxxxxx"
```

Or put it in an untracked `.env.local` and source it yourself — Symphony does not auto-load `.env` files.

### Step 4: Create WORKFLOW.md

Create a `WORKFLOW.md` in the **target repository** (the codebase Codex will work in), or in any directory you will run Symphony from.

Minimal working example:

```markdown
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: "your-project-slug"
  active_states:
    - "Todo"
    - "In Progress"
  terminal_states:
    - "Closed"
    - "Cancelled"
    - "Canceled"
    - "Duplicate"
    - "Done"

polling:
  interval_ms: 30000

workspace:
  root: ~/symphony_workspaces

agent:
  max_concurrent_agents: 2
  max_turns: 20

codex:
  command: "codex app-server"
  approval_policy: "never"
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
---

You are a software engineer working on a Linear issue.

Issue: {{ issue.identifier }} - {{ issue.title }}
State: {{ issue.state }}
Description: {{ issue.description | default: "No description provided." }}
{% if attempt %}Retry attempt: {{ attempt }}{% endif %}

Work on this issue. When done, use the linear_graphql tool to transition the
issue to "In Review" and leave a comment summarizing what you did.
```

**WORKFLOW.md field reference**:

> For an annotated file covering every field with defaults and comments, see
> [WORKFLOW.template.md](WORKFLOW.template.md).

| Field | Description | Default |
|-------|-------------|---------|
| `tracker.kind` | Tracker backend. Only `linear` is supported | `linear` |
| `tracker.endpoint` | GraphQL endpoint for the Linear API | `https://api.linear.app/graphql` |
| `tracker.api_key` | Linear API key; use `$ENV_VAR` to reference env | Reads `LINEAR_API_KEY` env var |
| `tracker.project_slug` | Linear project slug — required | None |
| `tracker.active_states` | Issue states that trigger dispatch | `[Todo, In Progress]` |
| `tracker.terminal_states` | States that trigger workspace cleanup | `[Closed, Cancelled, Canceled, Duplicate, Done]` |
| `polling.interval_ms` | Poll interval in milliseconds | `30000` |
| `workspace.root` | Root directory for all workspaces | `<os.tmpdir()>/symphony_workspaces` |
| `hooks.after_create` | Shell command run after workspace is created | `null` |
| `hooks.before_run` | Shell command run before each agent turn (fatal on non-zero exit) | `null` |
| `hooks.after_run` | Shell command run after each agent turn (errors suppressed) | `null` |
| `hooks.before_remove` | Shell command run before workspace removal (errors suppressed) | `null` |
| `hooks.timeout_ms` | Max time in ms for any single hook | `60000` |
| `agent.max_concurrent_agents` | Global agent concurrency cap | `10` |
| `agent.max_turns` | Max Codex turns per run | `20` |
| `agent.max_retry_backoff_ms` | Max retry back-off delay in ms (exponential cap) | `300000` |
| `agent.max_concurrent_agents_by_state` | Per-state concurrency overrides (map of state → limit) | `{}` |
| `codex.command` | Shell command to launch Codex | `codex app-server` |
| `codex.approval_policy` | Codex approval policy, passed through to the installed Codex schema | Inherits Codex default |
| `codex.thread_sandbox` | Thread-level sandbox mode (e.g. `workspace-write`) | `null` |
| `codex.turn_sandbox_policy` | Per-turn sandbox policy object | `null` |
| `codex.turn_timeout_ms` | Max wall-clock time in ms for a full agent turn | `3600000` |
| `codex.read_timeout_ms` | Max time in ms to wait for the next Codex event before declaring stream stalled | `5000` |
| `codex.stall_timeout_ms` | Max silent time in ms before a running agent is declared stalled and stopped | `300000` |
| `server.port` | HTTP dashboard port; omit or `null` to disable | `null` |
| `observability.dashboard_enabled` | Enable live dashboard updates when the HTTP server is running | `true` |
| `observability.refresh_ms` | Dashboard heartbeat interval in ms for time-based refreshes | `1000` |
| `observability.render_interval_ms` | Minimum spacing in ms between pushed dashboard renders | `16` |

The prompt body uses **Liquid template syntax**. Available variables:
- `{{ issue.identifier }}`, `{{ issue.title }}`, `{{ issue.description }}`
- `{{ issue.state }}`, `{{ issue.url }}`, `{{ issue.labels }}`
- `{{ attempt }}` — `null` on first run, integer on retries

### Step 5: Run Symphony

```bash
# Run from the directory containing WORKFLOW.md
node dist/src/cli/main.js --acknowledge-high-trust-preview

# Or specify the WORKFLOW.md path explicitly
node dist/src/cli/main.js /path/to/your/WORKFLOW.md \
  --acknowledge-high-trust-preview

# Enable the optional HTTP dashboard
node dist/src/cli/main.js --acknowledge-high-trust-preview --port 3000
```

> `--acknowledge-high-trust-preview` is a required safety flag. Symphony runs agent code without sandboxing by default; this flag confirms you understand that.

### Environment and networked CLI note

If your workflow depends on environment variables from the launching shell, launch Codex with
shell environment inheritance enabled:

```yaml
codex:
  command: codex --config shell_environment_policy.inherit=all app-server
```

If the agent must use networked tools during a turn, configure an explicit
`codex.turn_sandbox_policy` that allows network access, for example:

```yaml
codex:
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
    writableRoots:
      - /tmp/symphony_workspaces
    readOnlyAccess:
      type: fullAccess
    networkAccess: true
    excludeTmpdirEnvVar: false
    excludeSlashTmp: false
```

With that in place, env-based credentials exported before launching Symphony are available to turn
commands. If a specific external CLI still does not find usable credentials in your environment,
provide that tool's credential explicitly via an env var such as `GH_TOKEN`, `GITHUB_TOKEN`, or a
provider-specific API key.

The exact accepted sandbox and approval values depend on the installed Codex app-server version. To
inspect the local schema, run `codex app-server generate-json-schema --out <dir>` and inspect the
generated `ThreadStartParams` and `TurnStartParams` schema files.

### Step 6: Trigger a Test Issue in Linear

1. Open your Linear test project
2. Create an issue and set its state to `Todo` or `In Progress`
3. Wait for the next poll cycle (default: 30 seconds)
4. Watch Symphony's terminal output — the issue should be dispatched
5. Codex will run inside `~/symphony_workspaces/<issue-key>/`

### Step 7: Run Tests

```bash
pnpm test           # run all tests once
pnpm test:watch     # watch mode
pnpm typecheck      # TypeScript type check only
pnpm lint           # Biome lint check
pnpm format         # Biome auto-format
```

---

## Key Concepts for Development

### Orchestrator State Machine

Each issue moves through these internal states:

```
unclaimed -> claimed -> running -> (retry_queued -> running)* -> released
```

- **unclaimed**: fetched from Linear but not yet reserved
- **claimed**: slot reserved; prevents duplicate dispatch
- **running**: Codex agent is active
- **retry_queued**: agent exited, waiting to re-dispatch (normal exit: 1s delay; abnormal exit: exponential backoff capped at 5 minutes)
- **released**: issue reached a terminal state; claim freed

### Workspace Lifecycle Hooks

Configure shell scripts in `WORKFLOW.md` that run at workspace lifecycle points:

```yaml
hooks:
  after_create: |
    git clone https://github.com/your-org/your-repo.git .
    npm install
  before_run: |
    git pull --rebase
  after_run: |
    echo "Agent finished"
  before_remove: |
    echo "Workspace being cleaned up"
  timeout_ms: 60000
```

`after_create` is the most important hook — use it to clone your repo into the fresh workspace before the agent starts.

### linear_graphql Dynamic Tool

Every Codex agent run automatically gets a `linear_graphql` tool injected, allowing the agent to read and write Linear directly:

```graphql
# Example mutation an agent might run to update issue state
mutation UpdateState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
  }
}
```

### Concurrency Control

```yaml
agent:
  max_concurrent_agents: 5           # global cap
  max_concurrent_agents_by_state:    # per-state fine-grained control
    "in progress": 3
    "todo": 2
```

State keys are matched case-insensitively.

### Config Hot-Reload

These fields take effect on the next poll tick without restarting Symphony:
- `polling.interval_ms`
- `agent.max_concurrent_agents`
- `agent.max_retry_backoff_ms`
- `hooks.timeout_ms`

---

## Troubleshooting

**Issues are not being dispatched after startup**
- Verify `tracker.project_slug` matches exactly (check Linear project URL)
- Verify `LINEAR_API_KEY` is set and valid
- Check that the issue's current state matches an entry in `active_states` (comparison is case-insensitive after trim)

**`codex app-server` command not found**
- Confirm Codex CLI is installed and on `PATH`
- Use an absolute path in WORKFLOW.md: `codex.command: "/usr/local/bin/codex app-server"`

**Agent stalls and never finishes**
- `codex.stall_timeout_ms` (default 5 minutes) will kill and retry a stalled agent
- Set `codex.stall_timeout_ms: 0` to disable stall detection

**How to watch runtime state**
- Structured JSON logs are the primary observability surface
- Launch with `--port 3000` to access the HTTP dashboard at `http://localhost:3000`
- The dashboard serves an initial HTML snapshot, then stays current over `/api/v1/events`

---
