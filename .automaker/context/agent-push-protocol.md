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
6. Docker CI (act-ci, if Docker is available)

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
| **pre-push** | **`pnpm run preflight` (6 gates including Docker CI)** | **Only with `--no-verify`** |

The pre-push hook calls `pnpm run preflight` which runs all 6 gates.
Gate 6 (Docker CI) is the act-ci gate — runs if Docker is available, hard fail if it fails.
Skip Docker only: `SKIP_ACT=1 git push`

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

## The One Rule

If `git push` fails due to the pre-push hook, you do NOT bypass it. Period.
Fix the errors first. Then push. This is non-negotiable.
