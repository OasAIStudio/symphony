---
# ============================================================
# tracker — Issue tracker connection (currently only "linear")
# ============================================================
tracker:
  # Tracker backend. Only "linear" is supported.
  kind: linear

  # GraphQL endpoint for the Linear API.
  # Default: https://api.linear.app/graphql
  endpoint: https://api.linear.app/graphql

  # Linear API key. Use $ENV_VAR syntax to read from environment,
  # or set the LINEAR_API_KEY environment variable directly.
  # Required for dispatch.
  api_key: $LINEAR_API_KEY

  # Linear project slug (the short identifier visible in issue URLs).
  # Required for dispatch. Example: ENG, MYPROJECT-abc123
  project_slug: YOUR_PROJECT_SLUG

  # Issue states that are eligible for the agent to pick up.
  # Default: [Todo, In Progress]
  active_states: [Todo, In Progress]

  # Issue states that are considered permanently finished.
  # Reaching one of these triggers workspace cleanup.
  # Default: [Closed, Cancelled, Canceled, Duplicate, Done]
  terminal_states: [Closed, Cancelled, Canceled, Duplicate, Done]

# ============================================================
# polling — How often Symphony checks for new/changed issues
# ============================================================
polling:
  # Interval between poll ticks in milliseconds.
  # Default: 30000 (30 s)
  interval_ms: 30000

# ============================================================
# workspace — Per-issue working directory management
# ============================================================
workspace:
  # Root directory under which per-issue workspaces are created.
  # Supports ~ expansion, relative paths (resolved from WORKFLOW.md),
  # and $ENV_VAR references.
  # Default: <os.tmpdir()>/symphony_workspaces
  root: /tmp/symphony_workspaces

# ============================================================
# hooks — Shell commands run at workspace lifecycle events
# All hooks are optional (omit or set to null/empty to skip).
# ============================================================
hooks:
  # Run after a new workspace directory is created.
  after_create: null

  # Run before each agent turn starts (fatal on non-zero exit).
  before_run: null

  # Run after each agent turn finishes (best-effort, errors suppressed).
  after_run: null

  # Run before a workspace is removed (best-effort, errors suppressed).
  before_remove: null

  # Maximum time in ms any single hook may run before being killed.
  # Default: 60000 (60 s)
  timeout_ms: 60000

# ============================================================
# agent — Concurrency and retry behaviour
# ============================================================
agent:
  # Maximum number of issues being processed simultaneously.
  # Default: 10
  max_concurrent_agents: 10

  # Maximum number of Codex turns allowed per run attempt.
  # Default: 20
  max_turns: 20

  # Maximum retry back-off delay in milliseconds (exponential back-off cap).
  # Default: 300000 (5 min)
  max_retry_backoff_ms: 300000

  # Per-state concurrency limits (optional, overrides max_concurrent_agents
  # for issues in a specific state). Example:
  #   max_concurrent_agents_by_state:
  #     In Review: 2
  # Default: {} (no per-state limits)
  max_concurrent_agents_by_state: {}

# ============================================================
# codex — Codex app-server process configuration
# ============================================================
codex:
  # Shell command used to launch the Codex app-server.
  # Add `--config shell_environment_policy.inherit=all` if agent turns
  # should inherit environment variables from the launching shell.
  # Default: codex app-server
  command: codex app-server

  # Codex approval policy, passed through to the app-server.
  # Common values depend on the installed Codex schema.
  # Example values: never, on-request, on-failure
  # Default: (not set — inherits Codex default)
  approval_policy: never

  # Thread-level sandbox mode passed through to Codex.
  # Example values: workspace-write
  # Default: (not set)
  thread_sandbox: null

  # Per-turn sandbox policy passed through to Codex.
  # Example:
  #   turn_sandbox_policy:
  #     type: workspaceWrite
  #     writableRoots:
  #       - /tmp/symphony_workspaces
  #     readOnlyAccess:
  #       type: fullAccess
  #     networkAccess: true
  #     excludeTmpdirEnvVar: false
  #     excludeSlashTmp: false
  # Default: (not set)
  turn_sandbox_policy: null

  # Maximum wall-clock time in ms for a full agent turn.
  # Default: 3600000 (1 h)
  turn_timeout_ms: 3600000

  # Maximum time in ms to wait for the next event from Codex before
  # considering the stream stalled.
  # Default: 5000 (5 s)
  read_timeout_ms: 5000

  # Maximum time in ms a running agent may be silent before being
  # declared stalled and stopped.
  # Default: 300000 (5 min)
  stall_timeout_ms: 300000

# ============================================================
# server — Built-in HTTP status server (optional)
# ============================================================
server:
  # Port to listen on. Set to a number to enable, or omit/null to disable.
  # Default: null (disabled)
  port: null

# ============================================================
# observability — Live dashboard refresh behavior (optional)
# ============================================================
observability:
  # Enable live updates for the HTTP dashboard.
  # Default: true
  dashboard_enabled: true

  # Heartbeat interval in milliseconds for live dashboard refreshes.
  # Used to keep runtime counters current even when no orchestration state changes.
  # Default: 1000 (1 s)
  refresh_ms: 1000

  # Minimum spacing between pushed dashboard renders in milliseconds.
  # Default: 16 (~60 FPS upper bound)
  render_interval_ms: 16
---

You are implementing work for Linear issue {{ issue.identifier }}.

<!-- Replace the lines below with your actual agent instructions. -->

Rules:

1. Implement only what the ticket asks for.
2. Keep changes scoped and safe.
3. Run the test suite before finishing.
4. Do not add secrets or credentials to the repository.

If this workflow needs environment variables from the launching shell:

1. Launch Codex with `--config shell_environment_policy.inherit=all`.
2. Export the required environment variables before launching Symphony.

If the agent must call networked tools during a turn:

1. Configure `codex.turn_sandbox_policy` with explicit `networkAccess: true`.
2. If a specific CLI still does not find usable credentials in your environment, provide that
   tool's credential via an env var such as `GH_TOKEN`, `GITHUB_TOKEN`, or a provider-specific API
   key.

When finished:

1. Update the Linear issue state to "Done" using the `linear_graphql` tool.
   First, query the available workflow states to find the "Done" state ID:
   ```graphql
   query GetWorkflowStates {
     workflowStates {
       nodes { id name }
     }
   }
   ```
   Then update the issue:
   ```graphql
   mutation CompleteIssue($id: String!, $stateId: String!) {
     issueUpdate(id: $id, input: { stateId: $stateId }) {
       success
     }
   }
   ```

2. Provide a summary:
   - What changed
   - Test command and result
   - Any follow-up risks
