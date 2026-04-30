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
#   7. Docker CI (act — full CI pipeline in Docker containers, with Node matrix)
#
# Usage:
#   pnpm run preflight
#   SKIP_CHANGESET=1 pnpm run preflight   # bypass changeset gate (infra-only changes)
#   SKIP_ACT=1 pnpm run preflight         # bypass Docker CI gate
#   SKIP_MATRIX=1 pnpm run preflight      # downgrade Docker CI to basic (no Node matrix)
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "════════════════════════════════════════════════"
echo "  HELiXiR Preflight — local CI equivalent"
echo "════════════════════════════════════════════════"
echo ""

# ── Resolve base branch and common ancestor ──────────────────────────────────

# BASE_BRANCH = the branch this work targets, NOT origin/HEAD. The promotion
# pipeline is feature/* → dev → staging → main, so a feature branch's diff
# baseline is `dev`. Using origin/HEAD (which resolves to `main`) would pull
# in everything already merged to dev, causing false-positive changeset
# requirements on docs-only branches. Operators on dev/staging/main can
# override via $BASE_BRANCH or the diff lands against the same branch (no-op).
case "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" in
  main) BASE_BRANCH="${BASE_BRANCH:-staging}" ;;
  staging) BASE_BRANCH="${BASE_BRANCH:-dev}" ;;
  dev) BASE_BRANCH="${BASE_BRANCH:-dev}" ;;
  *) BASE_BRANCH="${BASE_BRANCH:-dev}" ;;
esac

COMMON_ANCESTOR=$(git merge-base HEAD "origin/${BASE_BRANCH}" 2>/dev/null || echo "")

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Detect changed source files across every release-bearing workspace package.
# A package is excluded only if it is BOTH marked `"private": true` AND its
# src is not re-exported by the root helixir package's `exports` map.
# packages/core is private but root helixir exports `./core` and `./core/*`
# from it, so its changes ship via the root npm release and MUST trigger the
# changeset gate. packages/vscode and packages/github-action are private AND
# not re-exported, so they're safe to skip.
EXCLUDED_PACKAGES=$(node -e "
  const fs = require('fs');
  const path = require('path');
  const rootPkgPath = path.resolve('package.json');
  const pkgsDir = path.resolve('packages');
  if (!fs.existsSync(pkgsDir)) process.exit(0);
  let rootExports = {};
  try {
    rootExports = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8')).exports || {};
  } catch {}
  const exportTargets = JSON.stringify(rootExports);
  for (const name of fs.readdirSync(pkgsDir)) {
    const pkgJson = path.join(pkgsDir, name, 'package.json');
    if (!fs.existsSync(pkgJson)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'));
      if (data.private !== true) continue;
      // Re-exported via root? Look for 'packages/<name>/' anywhere in the
      // root exports map. If found, treat as publishable.
      if (exportTargets.includes('packages/' + name + '/')) continue;
      console.log(name);
    } catch {}
  }
" 2>/dev/null || true)

CHANGED_SOURCES=""
if [ -n "$COMMON_ANCESTOR" ]; then
  # Release-bearing changes:
  #   - Source code under src/ or packages/*/src/
  #   - github-action's action.yml (the published action contract)
  #   - package.json edits that touch publish-relevant fields (deps,
  #     peerDependencies, engines, exports, version, files, bin, main,
  #     module, types). Tooling-only edits (devDependencies, scripts,
  #     workspace config) explicitly do NOT trigger the gate — those are
  #     the documented "infra-only" exception.
  RAW_CHANGED=$(git diff --name-only "$COMMON_ANCESTOR"...HEAD \
    | grep -E '^(src/|packages/[^/]+/src/|packages/[^/]+/action\.yml$)' \
    | grep -v '\.test\.ts$' \
    || true)
  # Detect publish-relevant package.json edits via line-level diff inspection.
  PUBLISH_RELEVANT_FIELDS='"(version|name|files|bin|main|module|types|exports|engines|dependencies|peerDependencies)"'
  PKG_CHANGED=$(git diff --unified=0 "$COMMON_ANCESTOR"...HEAD -- '*package.json' \
    | grep -E "^[+-].*${PUBLISH_RELEVANT_FIELDS}" \
    || true)
  if [ -n "$PKG_CHANGED" ]; then
    PKG_FILES=$(git diff --name-only "$COMMON_ANCESTOR"...HEAD -- '*package.json' || true)
    RAW_CHANGED=$(printf '%s\n%s\n' "$RAW_CHANGED" "$PKG_FILES" | grep -v '^$' || true)
  fi
  CHANGED_SOURCES="$RAW_CHANGED"
  if [ -n "$EXCLUDED_PACKAGES" ]; then
    while IFS= read -r excluded_pkg; do
      [ -z "$excluded_pkg" ] && continue
      CHANGED_SOURCES=$(printf '%s\n' "$CHANGED_SOURCES" \
        | grep -v "^packages/${excluded_pkg}/src/" \
        | grep -v "^packages/${excluded_pkg}/package\.json$" \
        | grep -v "^packages/${excluded_pkg}/action\.yml$" \
        || true)
    done <<< "$EXCLUDED_PACKAGES"
  fi
fi

# ── Gate 1: Lint ─────────────────────────────────────────────────────────────

echo "▶ [1/7] Lint"
pnpm run lint
echo "  ✓ Lint passed"
echo ""

# ── Gate 2: Format check ─────────────────────────────────────────────────────

echo "▶ [2/7] Format check"
pnpm run format:check
echo "  ✓ Format passed"
echo ""

# ── Gate 3: Type check ───────────────────────────────────────────────────────

echo "▶ [3/7] Type check"
pnpm run type-check
echo "  ✓ Type check passed"
echo ""

# ── Gate 4: Build ────────────────────────────────────────────────────────────

echo "▶ [4/7] Build"
pnpm run build
echo "  ✓ Build passed"
echo ""

# ── Gate 5: Test ─────────────────────────────────────────────────────────────

echo "▶ [5/7] Test"
pnpm run test
echo "  ✓ Tests passed"
echo ""

# ── Gate 6: Changeset ────────────────────────────────────────────────────────

echo "▶ [6/7] Changeset"

if [ "${SKIP_CHANGESET:-0}" = "1" ]; then
  echo "  ✓ SKIP_CHANGESET=1 — bypassed"
elif [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "staging" || "$CURRENT_BRANCH" == "dev" ]] \
  || [[ "$CURRENT_BRANCH" == *"audit/"* ]]; then
  echo "  ✓ Changeset check skipped (branch: $CURRENT_BRANCH)"
elif [ -z "$COMMON_ANCESTOR" ]; then
  # No merge-base means we cannot determine what changed since the target
  # branch — fresh clone, shallow checkout, or pre-fetch state. Fail loudly
  # rather than silently waving through changes that should have required
  # a changeset.
  echo ""
  echo "  ✗ CANNOT DETERMINE CHANGESET REQUIREMENT — origin/${BASE_BRANCH} not available locally."
  echo ""
  echo "    Run: git fetch origin ${BASE_BRANCH}"
  echo "    Or, if this is intentionally an infra/CI-only run: SKIP_CHANGESET=1 pnpm run preflight"
  echo ""
  exit 1
elif [ -n "$CHANGED_SOURCES" ]; then
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

# ── Gate 7: Docker CI (act) with Node matrix ────────────────────────────────

echo "▶ [7/7] Docker CI (act)"

if [ "${SKIP_ACT:-0}" = "1" ]; then
  echo "  ⚠ SKIP_ACT=1 — Docker CI gate bypassed"
elif ! command -v act &>/dev/null || ! docker info &>/dev/null 2>&1; then
  echo ""
  echo "  ✗ DOCKER CI GATE CANNOT RUN"
  echo "    Either act is not installed or Docker is not running."
  echo "    Install: brew install act && open -a Docker"
  echo "    To bypass intentionally (e.g. infra-only changes): SKIP_ACT=1 pnpm run preflight"
  echo ""
  exit 1
else
  # Pass --native only when running on ARM64 (the flag forces linux/arm64
  # containers; on x86_64 hosts that would force emulation and is the
  # opposite of the intent). Operators on either arch can opt-in via
  # ACT_NATIVE=1.
  ACT_NATIVE_FLAG=""
  if [ -n "${ACT_NATIVE:-}" ] || [ "$(uname -m 2>/dev/null)" = "arm64" ]; then
    ACT_NATIVE_FLAG="--native"
  fi
  if [ "${SKIP_MATRIX:-0}" = "1" ]; then
    echo "  Running CI in Docker (basic — matrix skipped via SKIP_MATRIX=1)..."
    ACT_CMD="./scripts/act-ci.sh $ACT_NATIVE_FLAG"
  else
    echo "  Running CI in Docker with Node 22/24 matrix..."
    ACT_CMD="./scripts/act-ci.sh --matrix $ACT_NATIVE_FLAG"
  fi
  if $ACT_CMD; then
    echo "  ✓ Docker CI passed"
  else
    echo ""
    echo "  ✗ DOCKER CI FAILED — do NOT push."
    echo "    Fix the errors above and re-run: pnpm run preflight"
    exit 1
  fi
fi
echo ""

# ── All gates passed ──────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════"
echo "  ✓ All preflight gates passed — safe to push!"
echo "════════════════════════════════════════════════"
