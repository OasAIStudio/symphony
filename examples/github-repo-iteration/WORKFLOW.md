---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: YOUR_LINEAR_PROJECT_SLUG
  active_states: [Todo, In Progress]
  terminal_states: [Done, Canceled, Duplicate]

polling:
  interval_ms: 5000

workspace:
  root: /tmp/symphony_github_repo_iteration

hooks:
  after_create: |
    if [ -z "${GITHUB_REPO_URL:-}" ]; then
      echo "GITHUB_REPO_URL must be set before launching Symphony" >&2
      exit 1
    fi

    git clone --depth 1 "${GITHUB_REPO_URL}" .
    git config user.name "${GIT_AUTHOR_NAME:-Symphony Demo}"
    git config user.email "${GIT_AUTHOR_EMAIL:-symphony-demo@example.com}"
    git config push.autoSetupRemote true

    cat > AGENTS.md <<'MD'
    # GitHub Repo Iteration Demo

    Work only inside this repository.

    Required execution order:

    1. Make the smallest change that satisfies the Linear issue.
    2. Run only the relevant validation commands.
    3. Create a commit on a branch named `codex/<issue-identifier-lowercase>`.
    4. Push the branch to origin.
    5. Create a GitHub PR against the configured base branch.
    6. Use the `linear_graphql` tool to:
       - add a comment containing the PR URL and validation summary
       - move the issue to `Done`

    Rules:

    - Do not leave the work as an uncommitted local-only change.
    - Do not mark the issue `Done` unless a real PR URL exists.
    - Keep the diff narrowly scoped to the issue.
    MD

agent:
  max_concurrent_agents: 1
  max_turns: 20

codex:
  command: codex --config shell_environment_policy.inherit=all --model gpt-5.3-codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
    writableRoots:
      - /tmp/symphony_github_repo_iteration
    readOnlyAccess:
      type: fullAccess
    networkAccess: true
    excludeTmpdirEnvVar: false
    excludeSlashTmp: false

server:
  port: 4321
---

You are implementing Linear issue `{{ issue.identifier }}` in a GitHub-hosted repository.

Issue context:
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Current state: {{ issue.state }}
- URL: {{ issue.url }}

Repository and branch context:
- Remote repository URL comes from the `GITHUB_REPO_URL` environment variable.
- Base branch is `${GITHUB_BASE_BRANCH:-main}`.
- Branch naming convention: `codex/{{ issue.identifier | downcase }}`

Execution requirements:

1. Make the smallest code or documentation change that satisfies the issue.
2. Run only the validation commands needed for this change.
3. Create a branch named `codex/{{ issue.identifier | downcase }}`.
4. Commit with a concise message.
5. Push the branch to origin.
6. Create a PR with `gh pr create` against `${GITHUB_BASE_BRANCH:-main}`.
7. Use the `linear_graphql` tool to:
   - comment on the issue with:
     - the PR URL
     - a short validation summary
   - move the issue to `Done`

Suggested PR body:

- one-sentence summary of the change
- validation command(s) and result
- `Closes {{ issue.identifier }}`

Hard constraints:

- Do not stop after only editing files locally.
- Do not finish without a real PR URL.
- Do not move the issue to `Done` before the PR is created.
