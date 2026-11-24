#!/usr/bin/env bash
set -euo pipefail

# Safety guard for GPX-Ski-Analyzer (shared by Codex CLI, Antigravity CLI, and local dev).
# Inspects git-tracked and staged files for:
#   1. Unapproved .gpx files (only public/samples/hakuba-synthetic.gpx is public)
#   2. Secret, credential, generated-worker, or local-only CLI files
#   3. Accidental OpenNext migration files/dependencies
#   4. High-confidence hardcoded secret patterns

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

ALLOWED_GPX="public/samples/hakuba-synthetic.gpx"
errors=0

report_error() {
  echo "[check-safety] ERROR: $1" >&2
  errors=$((errors + 1))
}

# Collect unique list of tracked and staged files
mapfile -t files < <(
  {
    git ls-files
    git diff --cached --name-only --diff-filter=ACMR
  } | sort -u
)

for file in "${files[@]}"; do
  [ -z "$file" ] && continue

  lower="${file,,}"

  # 1. GPX allowlist
  if [[ "$lower" == *.gpx ]] && [[ "$file" != "$ALLOWED_GPX" ]]; then
    report_error "Unapproved GPX file tracked/staged: $file (only $ALLOWED_GPX is allowed)"
  fi

  # 2. Sensitive, local-only, and generated files
  base="$(basename "$file")"
  case "$base" in
    .env | .env.*)
      if [[ "$base" != ".env.example" ]]; then
        report_error "Environment file tracked/staged: $file"
      fi
      ;;
    .dev.vars | .dev.vars.*)
      if [[ "$base" != ".dev.vars.example" ]]; then
        report_error "Cloudflare local vars file tracked/staged: $file"
      fi
      ;;
    *.pem | *.key | *.p12 | *.pfx | .netrc)
      report_error "Credential/key file tracked/staged: $file"
      ;;
    AGENTS.override.md | GEMINI.local.md | handoff.local.md)
      report_error "Local-only agent file tracked/staged: $file"
      ;;
    open-next.config.*)
      report_error "Disallowed OpenNext config tracked/staged: $file"
      ;;
  esac

  if [[ "$file" == .codex/*.local.toml ]]; then
    report_error "Local-only Codex config tracked/staged: $file"
  fi

  if [[ "$file" == "public/analysis-worker.js" || "$file" == "public/analysis-worker.js.LEGAL.txt" ]]; then
    report_error "Generated worker artifact tracked/staged: $file"
  fi

  # 3. High-confidence secret pattern check on existing text files
  if [[ -f "$file" && "$file" != "scripts/check-safety.sh" && "$file" != "package-lock.json" ]]; then
    if grep -E -I -q -e '-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{36,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}' -- "$file"; then
      report_error "Potential hardcoded secret detected in: $file"
    fi
  fi
done

# 4. Prevent accidental @opennextjs/cloudflare dependency
if [[ -f "package.json" ]] && grep -q '@opennextjs/cloudflare' package.json; then
  report_error "@opennextjs/cloudflare found in package.json; keep output: 'export' static deployment"
fi

if [[ "$errors" -gt 0 ]]; then
  echo "[check-safety] Failed with $errors issue(s)." >&2
  exit 1
fi

echo "[check-safety] OK (${#files[@]} tracked/staged files checked)."
