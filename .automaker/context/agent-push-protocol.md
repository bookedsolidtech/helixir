# Agent Push Protocol — ZERO TOLERANCE

Every agent push MUST follow this exact sequence. No shortcuts. No exceptions.
Pushing code that fails CI is a wasted cycle and an unacceptable failure.

**CODE DOES NOT LEAVE THIS MACHINE UNTIL IT PASSES ALL QUALITY GATES.**

---

## The Push Sequence

### Step 1: Format

```bash
pnpm run format
git add -u
```

### Step 2: Commit

```bash
git commit -m "type(scope): lowercase message"
```

Do NOT use `HUSKY=0`. The pre-commit hook runs gitleaks (secret scanning)
and lint-staged. These are safety checks, not obstacles.

### Step 3: Push

```bash
git push origin <branch>
```

The pre-push hook runs `pnpm run preflight` automatically. This executes:
1. Lint (ESLint)
2. Format check (Prettier)
3. Type check (TypeScript strict)
4. Build (tsc compilation)
5. Test (Vitest)
6. Changeset check (if source changed)
7. Docker CI (act-ci, if Docker is available)
8. Full test suite (all tests, not just changed files)

If ANY gate fails, the push is blocked. Fix the errors and push again.

**Do NOT use `--no-verify` to bypass the pre-push hook.**
**Do NOT use `HUSKY=0` to skip hooks.**

### Step 4: Create PR + Auto-Merge

```bash
PR_URL=$(gh pr create \
  --repo bookedsolidtech/helixir \
  --base dev \
  --title "type(scope): lowercase description" \
  --body "Description of changes")

PR_NUMBER=$(echo $PR_URL | grep -oE '[0-9]+$')

gh pr merge $PR_NUMBER --auto --merge --repo bookedsolidtech/helixir
```

---

## Enforcement Layers

| Layer | What | Bypassable? |
|-------|------|-------------|
| pre-commit | gitleaks + lint-staged | Only with `--no-verify` |
| commit-msg | commitlint | Only with `--no-verify` |
| **pre-push** | **`pnpm run preflight` (8 gates including changeset, Docker CI, and full test suite)** | **Only with `--no-verify`** |

The pre-push hook calls `pnpm run preflight` which runs all 8 gates.
Gate 7 (Docker CI) is the act-ci gate — runs if Docker is available, hard fail if it fails.
Gate 8 (Full test suite) runs all tests when source files changed.
Skip Docker only: `SKIP_ACT=1 git push`
Skip full tests only: `SKIP_FULL_TESTS=1 git push`

---

## What Happens If You Skip Steps

- **Skip format** → pre-push format check fails → push blocked
- **Skip lint** → pre-push lint fails → push blocked
- **Type errors** → pre-push type-check fails → push blocked
- **Build broken** → pre-push build fails → push blocked
- **Tests fail** → pre-push test fails → push blocked
- **Use --no-verify** → EMERGENCY ONLY — document why in the commit message

---

## Changeset Requirement

If your changes modify published source code, create a changeset:

```bash
pnpm exec changeset
```

Select the package, bump type, and write a description.
Commit the `.changeset/*.md` file WITH your code changes (same commit).

---

## CI Matrix Parity — Node 20/22/24

helixir must pass tests on Node 20, 22, and 24. This mirrors the CI matrix
defined in `.github/workflows/ci-matrix.yml`.

### When to run `--matrix`

Run `./scripts/act-ci.sh --matrix` when:
- Modifying `package.json` engines or dependencies
- Adding/changing Node.js-version-specific code paths
- Preparing a release to main
- CI matrix failures are reported on a PR

### How it works

The `--matrix` flag sets `ACT_MATRIX_TESTS=true` and `ACT_FULL_TESTS=true`,
which activates the `test-full` job in `act-ci.yml`. That job uses nvm to
install and test against Node 20, 22, and 24 in parallel (fail-fast: false).

```bash
# Run full matrix locally
./scripts/act-ci.sh --matrix

# Matrix on ARM64 (no Rosetta emulation, faster on Apple Silicon)
./scripts/act-ci.sh --native --matrix

# Run full suite on current Node only (no matrix)
./scripts/act-ci.sh --full
```

### Enforcement

Gate 7 of preflight runs `act-ci.sh --native` (standard quality gates).
For matrix parity verification before a release, run manually:

```bash
./scripts/act-ci.sh --native --matrix
```

This is required before merging any PR that touches `src/`, `package.json`,
or Node version configuration.

---

## The One Rule

If `git push` fails due to the pre-push hook, you do NOT bypass it. Period.
Fix the errors first. Then push. This is non-negotiable.
