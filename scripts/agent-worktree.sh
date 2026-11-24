#!/usr/bin/env bash
set -euo pipefail

# Manage isolated Git worktrees for concurrent Codex CLI and Antigravity CLI (agy) sessions.
# Worktrees are created under .worktrees/<agent>-<task-slug> on branch <agent>/<task-slug>.

usage() {
  cat <<'EOF'
Usage:
  scripts/agent-worktree.sh create <codex|agy> <task-slug> [base-ref]
  scripts/agent-worktree.sh list
  scripts/agent-worktree.sh remove <codex|agy> <task-slug> [--force]
  scripts/agent-worktree.sh prune

Examples:
  scripts/agent-worktree.sh create codex refine-run-detection
  scripts/agent-worktree.sh create agy review-run-detection main
  scripts/agent-worktree.sh list
  scripts/agent-worktree.sh remove codex refine-run-detection
EOF
}

validate_agent() {
  local agent="$1"
  if [[ "$agent" != "codex" && "$agent" != "agy" ]]; then
    echo "[agent-worktree] ERROR: agent must be 'codex' or 'agy' (got: $agent)" >&2
    exit 1
  fi
}

validate_slug() {
  local slug="$1"
  if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
    echo "[agent-worktree] ERROR: task-slug must match ^[a-z0-9][a-z0-9._-]*$ (got: $slug)" >&2
    exit 1
  fi
}

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "[agent-worktree] ERROR: must be run inside a Git repository" >&2
  exit 1
}
cd "$ROOT_DIR"

WORKTREE_BASE="$ROOT_DIR/.worktrees"
cmd="${1:-}"

case "$cmd" in
  create)
    if [[ $# -lt 3 || $# -gt 4 ]]; then
      usage >&2
      exit 1
    fi
    agent="$2"
    slug="$3"
    base_ref="${4:-HEAD}"
    validate_agent "$agent"
    validate_slug "$slug"

    branch="${agent}/${slug}"
    target="${WORKTREE_BASE}/${agent}-${slug}"

    if [[ -e "$target" ]]; then
      echo "[agent-worktree] ERROR: worktree path already exists: $target" >&2
      exit 1
    fi

    mkdir -p "$WORKTREE_BASE"

    if git show-ref --verify --quiet "refs/heads/${branch}"; then
      git worktree add "$target" "$branch"
    else
      git worktree add -b "$branch" "$target" "$base_ref"
    fi

    cat <<EOF
[agent-worktree] Created worktree:
  Path:   $target
  Branch: $branch

Next steps:
  cd "$target"
  npm ci
  ${agent}
EOF
    ;;

  list)
    git worktree list
    ;;

  remove)
    if [[ $# -lt 3 || $# -gt 4 ]]; then
      usage >&2
      exit 1
    fi
    agent="$2"
    slug="$3"
    force_flag="${4:-}"
    validate_agent "$agent"
    validate_slug "$slug"

    branch="${agent}/${slug}"
    target="${WORKTREE_BASE}/${agent}-${slug}"

    if [[ ! -d "$target" ]]; then
      echo "[agent-worktree] ERROR: worktree not found: $target" >&2
      exit 1
    fi

    if [[ "$force_flag" == "--force" ]]; then
      git worktree remove --force "$target"
    elif [[ -z "$force_flag" ]]; then
      git worktree remove "$target"
    else
      echo "[agent-worktree] ERROR: unknown option: $force_flag" >&2
      exit 1
    fi

    echo "[agent-worktree] Removed worktree: $target"
    echo "If branch '${branch}' is merged and no longer needed, delete it with:"
    echo "  git branch -d ${branch}"
    ;;

  prune)
    git worktree prune -v
    ;;

  -h | --help | help | "")
    usage
    ;;

  *)
    echo "[agent-worktree] ERROR: unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
