#!/usr/bin/env bash
set -euo pipefail

# token-report.sh — Wrapper for token history extraction, analysis, reporting, and rotation
#
# Responsibilities:
#   - Validate/set default env vars (SYMPHONY_HOME, SYMPHONY_LOG_DIR)
#   - Create directory tree
#   - Acquire lockfile via shlock (concurrent execution guard)
#   - Route to node ops/token-report.mjs <subcommand>
#   - Orchestrate daily pipeline (extract → analyze → render → slack → rotate)
#   - Release lockfile via trap
#
# Usage: token-report.sh [extract|analyze|render|slack|rotate|daily]
#
# SYMPH-129, SYMPH-131

SCRIPT_DIR="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)"
SYMPHONY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Environment defaults
# ---------------------------------------------------------------------------

export SYMPHONY_HOME="${SYMPHONY_HOME:-$HOME/.symphony}"
export SYMPHONY_LOG_DIR="${SYMPHONY_LOG_DIR:-$HOME/Library/Logs/symphony}"

# ---------------------------------------------------------------------------
# Directory tree creation
# ---------------------------------------------------------------------------

mkdir -p "$SYMPHONY_HOME"/{data/.hwm,data/linear-cache,logs,reports}

# ---------------------------------------------------------------------------
# Lockfile management
# ---------------------------------------------------------------------------

LOCKFILE="$SYMPHONY_HOME/data/.lock"

cleanup_lock() {
  rm -f "$LOCKFILE"
}

acquire_lock() {
  if command -v shlock >/dev/null 2>&1; then
    if ! shlock -p $$ -f "$LOCKFILE"; then
      echo "Another instance is running, skipping" >&2
      exit 0
    fi
  else
    # Fallback: simple mkdir-based lock for systems without shlock
    if ! mkdir "$LOCKFILE.d" 2>/dev/null; then
      echo "Another instance is running, skipping" >&2
      exit 0
    fi
    # Override cleanup to remove directory lock
    cleanup_lock() {
      rm -f "$LOCKFILE"
      rmdir "$LOCKFILE.d" 2>/dev/null || true
    }
  fi
  trap cleanup_lock EXIT INT TERM
}

# ---------------------------------------------------------------------------
# Subcommand routing
# ---------------------------------------------------------------------------

SUBCOMMAND="${1:-extract}"
NODE_BIN="${SYMPHONY_NODE:-$(which node 2>/dev/null || echo /opt/homebrew/bin/node)}"
UI_DIR="$SCRIPT_DIR/token-report-ui"

# ---------------------------------------------------------------------------
# Build helper: copy analysis.json → React app src/data, pnpm build,
# copy dist/index.html → reports/{date}.html
# ---------------------------------------------------------------------------

build_report() {
  local analysis_json="$SYMPHONY_HOME/data/analysis.json"
  if [ ! -f "$analysis_json" ]; then
    echo "ERROR: $analysis_json not found — run analyze first" >&2
    return 1
  fi

  # Copy live analysis data into React app source for static bundling
  mkdir -p "$UI_DIR/src/data"
  cp "$analysis_json" "$UI_DIR/src/data/analysis.json"

  # Build the React app (produces dist/index.html as single-file bundle)
  (cd "$UI_DIR" && pnpm build)
  echo "INFO: React app build complete" >&2

  # Copy built HTML to reports directory
  local today
  today="$(date +%Y-%m-%d)"
  mkdir -p "$SYMPHONY_HOME/reports"
  cp "$UI_DIR/dist/index.html" "$SYMPHONY_HOME/reports/${today}.html"
  echo "INFO: Report written to $SYMPHONY_HOME/reports/${today}.html" >&2
}

case "$SUBCOMMAND" in
  extract)
    acquire_lock
    "$NODE_BIN" "$SCRIPT_DIR/token-report.mjs" extract
    ;;
  analyze)
    acquire_lock
    "$NODE_BIN" "$SCRIPT_DIR/token-report.mjs" analyze
    ;;
  render)
    acquire_lock
    # Build React app report from analysis.json (SYMPH-145)
    build_report
    ;;
  slack)
    "$NODE_BIN" "$SCRIPT_DIR/token-report.mjs" slack
    ;;
  rotate)
    "$NODE_BIN" "$SCRIPT_DIR/token-report.mjs" rotate
    ;;
  daily)
    acquire_lock

    # Daily pipeline: extract → analyze → build → slack → rotate
    # If extract/analyze/build fail → skip subsequent, exit non-zero
    # Slack failure → log warning, continue to rotate (graceful degradation)
    # Rotate failure → log warning, exit non-zero

    echo "INFO: Starting daily pipeline" >&2

    "$NODE_BIN" "$SCRIPT_DIR/token-report.mjs" extract
    echo "INFO: extract complete" >&2

    "$NODE_BIN" "$SCRIPT_DIR/token-report.mjs" analyze > /dev/null
    echo "INFO: analyze complete" >&2

    build_report
    echo "INFO: build complete" >&2

    # Slack: graceful degradation — failure logs warning but continues
    if ! "$NODE_BIN" "$SCRIPT_DIR/token-report.mjs" slack; then
      echo "WARN: Slack step failed, continuing to rotate" >&2
    fi

    # Rotate: failure is non-zero exit
    if ! "$NODE_BIN" "$SCRIPT_DIR/token-report.mjs" rotate; then
      echo "WARN: Rotate step failed" >&2
      exit 1
    fi

    echo "INFO: Daily pipeline complete" >&2
    ;;
  *)
    echo "Usage: token-report.sh [extract|analyze|render|slack|rotate|daily]" >&2
    exit 1
    ;;
esac
