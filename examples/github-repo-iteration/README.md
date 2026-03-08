## GitHub Repo Iteration Example

This example shows how to use Symphony to iterate on a GitHub-hosted repository while still using
Linear as the issue tracker.

What this example covers:

- clone a GitHub repository into each per-issue workspace
- run Codex with shell environment inheritance enabled
- allow networked turn commands for `git push`, `gh pr create`, and similar tools
- update the Linear issue with a PR URL and move it to `Done`

Required environment variables before launch:

- `LINEAR_API_KEY`
- `GITHUB_REPO_URL`
- `GITHUB_BASE_BRANCH` (optional, defaults to `main`)

If your GitHub CLI auth is not already usable inside the agent turn, also export:

- `GH_TOKEN`

Launch example:

```bash
export LINEAR_API_KEY=lin_api_xxx
export GITHUB_REPO_URL=https://github.com/your-org/your-repo.git
export GITHUB_BASE_BRANCH=main
export GH_TOKEN="$(gh auth token)"

node dist/src/cli/main.js examples/github-repo-iteration/WORKFLOW.md \
  --acknowledge-high-trust-preview
```

Tracker note:

- Symphony currently supports `tracker.kind: linear`
- this example is for iterating on a GitHub repository, not for using GitHub Projects as the tracker
