---
description: Run the code-reviewer agent against the current branch's diff and produce structured findings
argument-hint: "[diff-target]"
allowed-tools:
  - Bash(git diff:*)
  - Bash(git log:*)
  - Bash(git branch:*)
  - Bash(git status:*)
  - Read
---

# /review — Code Review on Current Changes

Invokes the `code-reviewer` agent on the uncommitted and/or branched changes in the current working tree. Use this as a first-pass quality gate before you open a PR.

## Arguments

- `$ARGUMENTS` (optional) — diff target. Defaults to `main`. Examples:
  - `/review` → diff against `main`
  - `/review staging` → diff against `staging`
  - `/review HEAD~3` → diff against three commits back
  - `/review --staged` → only staged changes

## Preflight

1. Read `.rea/policy.yaml` — confirm autonomy is at least L1 (review is read-only, so L0 also permitted)
2. Check `.rea/HALT` — if present, stop and report FROZEN
3. Verify you are inside a git repo: `git rev-parse --show-toplevel`

## Step 1 — Gather the diff

Resolve the diff target:

- If `$ARGUMENTS` is empty → use `main`
- If `$ARGUMENTS` starts with `--staged` → use `git diff --staged`
- Otherwise → use `git diff $ARGUMENTS...HEAD`

Run in parallel:

```bash
git diff <target>...HEAD
git log <target>..HEAD --oneline
git status --short
```

If the diff is empty, stop and report: "No changes to review against `<target>`."

## Step 2 — Delegate to code-reviewer

Invoke the `code-reviewer` agent with:

- **Tier**: `standard` (default). For diffs over 500 lines or cross-module changes, escalate to `senior`.
- **Context**: the full diff, the commit log, and the current branch name
- **Project config**: pass paths to `package.json`, `tsconfig.json`, and `.rea/policy.yaml` so the reviewer can adapt to the project's standards

Prompt shape for the delegation:

> Review the following git diff at tier `<standard|senior>`. Produce structured findings:
> each finding has file, line, severity (high/medium/low), issue, and suggestion_code when applicable.
> Output JSON array. Empty array if no findings. Diff follows.

## Step 3 — Summarize

Print a clean summary:

```
/review — <branch> vs <target>
Files changed: <N>
Findings: <total> (<high> high, <medium> medium, <low> low)

<grouped findings by severity, most severe first>
```

If the user asks "post this to a PR", invoke `/review-pr <PR#>` instead — that is the PR-posting variant and requires a PR number.

## Constraints

- Read-only. Never writes to files, never creates commits, never pushes.
- If `code-reviewer` returns invalid JSON, report the raw output and stop — do not retry automatically.
