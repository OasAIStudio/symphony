# Repository Guidelines

## Project Structure & Module Organization

This repository is currently documentation-first. The tracked files are:

- `README.upstream.md`: upstream project overview and setup entry points
- `SPEC.upstream.md`: upstream product and implementation spec

Add new implementation code in a top-level language or app directory such as `elixir/`, `src/`, or `apps/<name>/`, and keep tests adjacent in `test/` or `tests/`. Store design assets and media under a dedicated path like `.github/media/` or `docs/assets/`.

## Build, Test, and Development Commands

No build or test tooling is committed yet. Until an implementation is added, contributors mainly inspect and update the reference docs:

- `rg --files`: list tracked files quickly
- `sed -n '1,120p' README.upstream.md`: read key project context
- `git log --oneline -5`: review recent contributor conventions

When adding a runnable implementation, document the canonical local commands in the implementation README and mirror the most important ones here, for example `mix test`, `npm test`, or `make lint`.

## Coding Style & Naming Conventions

Keep Markdown concise, imperative, and specific to this repository. Use sentence-style prose in docs and short sections with meaningful headings. Name new files clearly by purpose, for example `ARCHITECTURE.md`, `docs/setup.md`, or `apps/orchestrator/`.

Match the formatter and linter of the language you introduce. If you add source code, also add the corresponding config files in the same change.

## Testing Guidelines

There is no repository-wide test harness yet. Any new implementation should include automated tests from the start and state how to run them in its local README. Prefer naming tests after observable behavior, such as `orchestrates_pending_tasks_test.exs` or `scheduler.spec.ts`.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects, for example `Add execution order to implementation plan`. Follow that pattern: start with a verb, keep the subject focused, and avoid punctuation at the end.

Pull requests should include:

- a short problem statement and scope summary
- links to relevant issues, specs, or upstream references
- test evidence or an explicit note that no runnable tests exist yet
- screenshots or logs when changing UX, automation flows, or generated artifacts

## Security & Configuration Tips

Do not commit secrets, tokens, or private board data. Keep local environment settings in untracked files such as `.env.local`, and document required variables without checking in real values.

## Source of Truth

Treat `SPEC.upstream.md` as the single source of truth for product behavior, feature scope, and acceptance criteria. If local notes or code comments conflict with the spec, follow the spec and update the other artifacts to match it.

## Branching & Worktree Workflow

Tasks 1 and 2 may be developed directly in the main working copy. For every task after Task 2, create a dedicated worktree under `.worktrees/` and do the implementation on a separate branch. Complete the work there, push the branch, and open a pull request before merging. Example flow: `git worktree add .worktrees/task-3 -b task-3`, implement the change in that worktree, then submit a PR for review.

After finishing any task, verify that the implementation matches `SPEC.upstream.md` without behavioral or scope drift. Once that check passes, open the pull request immediately rather than batching multiple tasks into one PR.
