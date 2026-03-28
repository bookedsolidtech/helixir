#!/usr/bin/env bash
# ==============================================================================
# Preflight — Local CI equivalent. Run before every push.
# ==============================================================================
# Mirrors the CI pipeline exactly so all failures are caught locally.
# Fails fast on first error.
#
# Gates (in order):
#   1. Lint (ESLint)
#   2. Format check (Prettier)
#   3. Type check (TypeScript strict)
#   4. Build (tsc)
#   5. Test (Vitest, Node mode)
#   6. Changeset check (if source changed)
#   7. Docker CI (act — full CI pipeline in Docker containers)
#   8. Full test suite (all tests, not just changed files)
#
# Usage:
#   pnpm run preflight
#   SKIP_CHANGESET=1 pnpm run preflight   # bypass changeset gate (infra-only changes)
#   SKIP_ACT=1 pnpm run preflight         # bypass Docker CI gate
#   SKIP_FULL_TESTS=1 pnpm run preflight  # bypass full test suite gate
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "════════════════════════════════════════════════"
echo "  HELiXiR Preflight — local CI equivalent"
echo "════════════════════════════════════════════════"
echo ""

# ── Resolve base branch and common ancestor ──────────────────────────────────

BASE_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null \
  | sed 's|refs/remotes/origin/||' \
  || git rev-parse --abbrev-ref origin/HEAD 2>/dev/null \
  | sed 's|origin/||' \
  || echo "dev")

COMMON_ANCESTOR=$(git merge-base HEAD "origin/${BASE_BRANCH}" 2>/dev/null || echo "")

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Detect changed source files (src/)
CHANGED_SOURCES=""
if [ -n "$COMMON_ANCESTOR" ]; then
  CHANGED_SOURCES=$(git diff --name-only "$COMMON_ANCESTOR"...HEAD \
    | grep -E '^src/' \
    | grep -v '\.test\.ts$' \
    || true)
fi

# ── Gate 1: Lint ─────────────────────────────────────────────────────────────

echo "▶ [1/8] Lint"
pnpm run lint
echo "  ✓ Lint passed"
echo ""

# ── Gate 2: Format check ─────────────────────────────────────────────────────

echo "▶ [2/8] Format check"
pnpm run format:check
echo "  ✓ Format passed"
echo ""

# ── Gate 3: Type check ───────────────────────────────────────────────────────

echo "▶ [3/8] Type check"
pnpm run type-check
echo "  ✓ Type check passed"
echo ""

# ── Gate 4: Build ────────────────────────────────────────────────────────────

echo "▶ [4/8] Build"
pnpm run build
echo "  ✓ Build passed"
echo ""

# ── Gate 5: Test ─────────────────────────────────────────────────────────────

echo "▶ [5/8] Test"
pnpm run test
echo "  ✓ Tests passed"
echo ""

# ── Gate 6: Changeset ────────────────────────────────────────────────────────

echo "▶ [6/8] Changeset"

if [ "${SKIP_CHANGESET:-0}" = "1" ]; then
  echo "  ✓ SKIP_CHANGESET=1 — bypassed"
elif [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "staging" || "$CURRENT_BRANCH" == "dev" ]] \
  || [[ "$CURRENT_BRANCH" == *"audit/"* ]]; then
  echo "  ✓ Changeset check skipped (branch: $CURRENT_BRANCH)"
elif [ -n "$COMMON_ANCESTOR" ] && [ -n "$CHANGED_SOURCES" ]; then
  CHANGESET_ADDED=$(git diff --name-only "$COMMON_ANCESTOR"...HEAD \
    | grep '^\.changeset/.*\.md$' | grep -v 'README\.md' || true)

  if [ -z "$CHANGESET_ADDED" ]; then
    echo ""
    echo "  ✗ CHANGESET REQUIRED — source was modified but no changeset found."
    echo ""
    echo "    Run: pnpm exec changeset"
    echo "    Select the package, bump type, and write a description."
    echo "    Commit the .changeset/*.md file with your changes."
    echo ""
    echo "    To bypass for infra-only work: SKIP_CHANGESET=1 pnpm run preflight"
    echo ""
    exit 1
  fi
  echo "  ✓ Changeset found: $CHANGESET_ADDED"
else
  echo "  ✓ No source changes — changeset not required"
fi
echo ""

# ── Gate 7: Docker CI (act) ──────────────────────────────────────────────────

echo "▶ [7/8] Docker CI (act)"

if [ "${SKIP_ACT:-0}" = "1" ]; then
  echo "  ⚠ SKIP_ACT=1 — Docker CI gate bypassed"
elif ! command -v act &>/dev/null || ! docker info &>/dev/null 2>&1; then
  echo "  ⚠ WARNING: Docker CI gate skipped — Docker not running or act not installed"
  echo "    CI may fail on push. Install: brew install act && open -a Docker"
else
  echo "  Running full CI in Docker..."
  if ./scripts/act-ci.sh --native; then
    echo "  ✓ Docker CI passed"
  else
    echo ""
    echo "  ✗ DOCKER CI FAILED — do NOT push."
    echo "    Fix the errors above and re-run: pnpm run preflight"
    exit 1
  fi
fi
echo ""

# ── Gate 8: Full test suite ───────────────────────────────────────────────────

echo "▶ [8/8] Full test suite"

if [ "${SKIP_FULL_TESTS:-0}" = "1" ]; then
  echo "  ✓ SKIP_FULL_TESTS=1 — full test suite bypassed"
elif [ -z "$CHANGED_SOURCES" ]; then
  echo "  ✓ No source changes — full test suite not required"
else
  echo "  Running full test suite with hang watchdog..."

  # Vitest hang watchdog — kills stale processes after 15s of no output
  LOGFILE=$(mktemp /tmp/helixir-preflight-full.XXXXXX)
  STALE_TIMEOUT=15
  POLL_INTERVAL=3
  START_WT=$(date +%s)

  pnpm exec vitest run --reporter=verbose > "$LOGFILE" 2>&1 &
  VITEST_PID=$!

  LAST_SIZE=0
  STALE_SECONDS=0
  FORCE_KILLED=false

  while kill -0 "$VITEST_PID" 2>/dev/null; do
    sleep "$POLL_INTERVAL"
    CURRENT_SIZE=$(stat -c "%s" "$LOGFILE" 2>/dev/null || stat -f "%z" "$LOGFILE" 2>/dev/null || echo 0)
    ELAPSED=$(( $(date +%s) - START_WT ))

    if [ "$CURRENT_SIZE" -eq "$LAST_SIZE" ] && [ "$CURRENT_SIZE" -gt 0 ]; then
      STALE_SECONDS=$((STALE_SECONDS + POLL_INTERVAL))
      if [ "$STALE_SECONDS" -ge "$STALE_TIMEOUT" ] && [ "$ELAPSED" -ge 30 ]; then
        echo "  [watchdog] Output stale for ${STALE_SECONDS}s at ${ELAPSED}s — force killing vitest"
        kill "$VITEST_PID" 2>/dev/null || true
        sleep 1
        kill -9 "$VITEST_PID" 2>/dev/null || true
        FORCE_KILLED=true
        break
      fi
    else
      STALE_SECONDS=0
    fi
    LAST_SIZE=$CURRENT_SIZE
  done

  wait "$VITEST_PID" 2>/dev/null || true

  FAILED_TESTS=$(grep -c "^[[:space:]]*[×x]" "$LOGFILE" 2>/dev/null || echo 0)
  PASSED_TESTS=$(grep -c "^[[:space:]]*[✓✔]" "$LOGFILE" 2>/dev/null || echo 0)

  echo ""
  tail -20 "$LOGFILE"
  echo ""
  echo "  [full suite] ${PASSED_TESTS} passed, ${FAILED_TESTS} failed"

  if [ "$FORCE_KILLED" = true ]; then
    echo "  [watchdog] vitest was force-killed after teardown hang"
  fi

  rm -f "$LOGFILE"

  if [ "$FAILED_TESTS" -gt 0 ]; then
    echo ""
    echo "  ✗ FULL TEST SUITE FAILED — do NOT push."
    echo "    Fix the errors above and re-run: pnpm run preflight"
    echo "    To bypass: SKIP_FULL_TESTS=1 pnpm run preflight"
    exit 1
  fi

  echo "  ✓ Full test suite passed"
fi
echo ""

# ── All gates passed ──────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════"
echo "  ✓ All preflight gates passed — safe to push!"
echo "════════════════════════════════════════════════"
