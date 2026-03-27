# Agent Push Protocol — ZERO TOLERANCE

Every agent push MUST follow this exact sequence. No shortcuts. No exceptions.
Pushing code that fails CI is a wasted cycle and an unacceptable failure.

**CODE DOES NOT LEAVE THIS MACHINE UNTIL IT PASSES THE LOCAL DOCKER CI GATE.**

---

## The Push Sequence

### Step 1: Format

```bash
pnpm run format
git add -u
```

### Step 2: Local Checks (fast)

```bash
pnpm run lint
pnpm run format:check
pnpm run type-check
pnpm run build
pnpm run test
```

If any step fails: **FIX THE ERRORS.** Do not proceed.

### Step 3: Docker CI Gate (MANDATORY)

```bash
./scripts/act-ci.sh
```

This runs the FULL quality gates inside Docker containers — the exact same
environment as GitHub Actions CI. If it passes here, it WILL pass on GitHub.

**If act fails: FIX THE ERRORS. Do not push. Do not skip. This is non-negotiable.**

If Docker is not running, start it. If `act` is not installed, stop — you cannot push.

### Step 4: Commit

```bash
HUSKY=0 git commit -m "type(scope): lowercase message"
```

Subject must be ALL LOWERCASE. Max 120 chars.

### Step 5: Push ONCE

```bash
HUSKY=0 git push origin <branch>
```

ONE push. ONE CodeRabbit review cycle. Never push twice.

### Step 6: Create PR + Auto-Merge

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

## What Happens If You Skip Steps

- **Skip format** — CI format check fails — wasted cycle
- **Skip local checks** — CI lint/type-check/build/tests fail — wasted cycle
- **Push twice** — CodeRabbit reviews twice — stale CHANGES_REQUESTED blocks merge

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

If `./scripts/act-ci.sh` fails, you do NOT push. Period.
Fix the errors first. Then push. This is non-negotiable.
