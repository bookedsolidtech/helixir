---
description: Run an adversarial review of the current branch via the Codex plugin (GPT-5.4). First-class step in the REA engineering process.
argument-hint: "[diff-target]"
allowed-tools:
  - Bash(git diff:*)
  - Bash(git log:*)
  - Bash(git branch:*)
  - Bash(git rev-parse:*)
  - Read
  - Agent
---

# /codex-review — Adversarial Review via Codex

Invokes the Codex plugin (`/codex:adversarial-review`) on the current branch's diff, captures the result, and records it to the REA audit log. Adversarial review by an independent model (GPT-5.4) is a **first-class, non-optional step** in the REA engineering process — it is the counterweight to Opus-authored code.

## Why this exists

The default workflow in REA is Plan → Build → Review, with the Review leg handed to a different model than the one that wrote the code. Codex adversarial review is free, fast, and independent — it catches the mistakes the authoring model is most likely to miss: security assumptions, correctness under edge cases, and logical gaps in tests. Treat it with the same weight as a human second set of eyes.

## Arguments

- `$ARGUMENTS` (optional) — diff target, same semantics as `/review`. Defaults to `main`.

## Preflight

1. Read `.rea/policy.yaml` — confirm autonomy is at least L1
2. Check `.rea/HALT` — if present, stop and report FROZEN
3. Verify the Codex plugin is installed. If `/codex` is not available in this Claude Code install, report: "Codex plugin not installed. See https://github.com/openai/codex for install steps." and stop.

## Step 1 — Resolve the diff target

Same logic as `/review`:

- Empty `$ARGUMENTS` → `main`
- Otherwise → use the provided ref

Capture:

- Current branch name (`git rev-parse --abbrev-ref HEAD`)
- Head SHA (`git rev-parse HEAD`)
- Diff target SHA (`git rev-parse <target>`)
- Commit log from target to HEAD

If the diff is empty, stop and report: "No changes to review against `<target>`."

## Step 2 — Delegate to codex-adversarial agent

Invoke the `codex-adversarial` agent with:

- The diff target and head SHA
- The branch name
- The commit log summary
- The full diff text

The agent wraps `/codex:adversarial-review` and returns structured findings.

## Step 3 — (Optional) verify audit entry

Audit emission is **optional** in 0.11.0+. The pre-push gate is stateless and does not consult audit records to decide pass/fail; the agent's structured findings ARE the review. The agent will append an audit entry when it helps forensic traceability (intermittent verdicts, review-history audits) but its absence is not a failure.

If you want to confirm an entry was written for this run:

```bash
tail -n 1 .rea/audit.jsonl
```

A `codex-adversarial-review` entry with `head_sha`, `target`, `finding_count`, and `verdict` fields is informative — but DO NOT treat its absence as a failure. The review happened if the agent returned text. (Pre-0.15.0 this step was a hard verification gate that contradicted the agent's "audit optional" contract — see Helix Finding 3, 2026-05-03.)

## Step 4 — Report

Print a summary:

```
/codex-review — <branch> vs <target>
Head SHA:    <SHA>
Verdict:     pass | concerns | blocking
Findings:    <total>
Audit:       .rea/audit.jsonl:<entry-index>

<grouped findings>
```

If the verdict is `blocking`, state plainly: "Do not merge until the blocking findings are addressed."

## Pre-merge usage

This command is the **interactive** Codex adversarial review. The **pre-push** gate at `rea hook push-gate` runs Codex independently on every push — you do not need to run `/codex-review` to "prime" the push-gate. The two are complementary:

- `/codex-review` — rich, interactive review output in the chat. Use during implementation to catch issues early, at review checkpoints, or whenever you want Codex's read on a specific diff.
- `rea hook push-gate` (wired to `.husky/pre-push`) — fresh Codex review on every push. If Codex surfaces blocking/concerns findings, the push exits 2; Claude reads `.rea/last-review.json`, fixes, and pushes again.

## Constraints

- Read-only with respect to source files. Writes only to `.rea/audit.jsonl` (via middleware).
- Never silently fails. If Codex is unavailable, unresponsive, or returns an error, surface it to the user and record the failure in audit.
- Never retries automatically on non-deterministic Codex errors — surface and let the user decide.
