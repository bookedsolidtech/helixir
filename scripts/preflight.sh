#!/usr/bin/env bash
# scripts/preflight.sh — All quality gates in one command
# Usage: pnpm run preflight
#        SKIP_ACT=1 pnpm run preflight  (skip Docker gate)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Preflight quality gates ==="
echo ""

# ── Gate 1: Lint ─────────────────────────────────────────────────────────
echo "Gate 1/6: Lint"
pnpm run lint
echo ""

# ── Gate 2: Format ───────────────────────────────────────────────────────
echo "Gate 2/6: Format"
pnpm run format:check
echo ""

# ── Gate 3: Type check ──────────────────────────────────────────────────
echo "Gate 3/6: Type check"
pnpm run type-check
echo ""

# ── Gate 4: Build ────────────────────────────────────────────────────────
echo "Gate 4/6: Build"
pnpm run build
echo ""

# ── Gate 5: Test ─────────────────────────────────────────────────────────
echo "Gate 5/6: Test"
pnpm run test
echo ""

# ── Gate 6: Docker CI (act) ─────────────────────────────────────────────
if [ "${SKIP_ACT:-}" = "1" ]; then
  echo "Gate 6/6: Docker CI — SKIPPED (SKIP_ACT=1)"
elif ! command -v act &>/dev/null; then
  echo "Gate 6/6: Docker CI — SKIPPED (act not installed)"
  echo "  Install: brew install act"
elif ! docker info &>/dev/null 2>&1; then
  echo "Gate 6/6: Docker CI — SKIPPED (Docker not running)"
  echo "  Start Docker Desktop to enable this gate"
else
  echo "Gate 6/6: Docker CI (act)"
  ./scripts/act-ci.sh --native
fi

echo ""
echo "=== All preflight gates passed ==="
