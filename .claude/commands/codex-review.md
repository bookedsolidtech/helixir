---
description: Run an adversarial review of the current branch via Codex (GPT-5.4). Default = direct Bash + thin + cheap; `--verbose` = wrapper-agent + 3x Opus burn.
argument-hint: "[--verbose] [diff-target]"
allowed-tools:
  - Bash(git diff:*)
  - Bash(git log:*)
  - Bash(git branch:*)
  - Bash(git rev-parse:*)
  - Bash(rea hook codex-review:*)
  - Bash(rea review:*)
  - Bash(jq:*)
  - Read
  - Agent
---

# /codex-review — Adversarial Review via Codex

Default: direct Bash invocation via `rea hook codex-review` — the cheap, thin, marathon-mode path. The codex JSON is the review; this command's output is a ledger entry. Use `--verbose` only when you specifically need a Claude-paraphrased summary.

## Two modes

| Mode | Cost | Output | When |
|------|------|--------|------|
| **default (thin)** | 1 Opus turn | Terse verdict+count+raw-path on stderr, canonical JSON on stdout | Every routine review round, especially in marathon-mode iteration |
| `--verbose` (wrapper) | 3 Opus turns | Claude-paraphrased findings with categories + severities | Teaching context, or when the caller is unfamiliar with the codex JSON shape |

Direct = cheap. Wrapper = expensive. Pick the right one for the situation.

## Default path (thin)

```bash
# With auto-detected upstream/main base
rea hook codex-review --json | tee /tmp/rea-codex-last.json

# Or with an explicit base ref
rea hook codex-review --base origin/main --json | tee /tmp/rea-codex-last.json

# Or narrow to last N commits
rea hook codex-review --last-n-commits 5 --json
```

The CLI runs `codex exec review --json --ephemeral` directly with the iron-gate model defaults (`gpt-5.4` + `high` reasoning), tees raw JSONL to `$TMPDIR/rea-codex-<sha>-<nonce>.json`, and writes a `codex.review` audit entry. Exit codes: 0 (pass), 1 (concerns), 2 (blocking / codex error / HALT).

The stdout JSON shape:

```json
{
  "verdict": "pass" | "concerns" | "blocking",
  "finding_count": 0,
  "head_sha": "<SHA>",
  "target": "<base ref>",
  "audit_hash": "<hash>",
  "raw_path": "/tmp/rea-codex-...json",
  "exit_code": 0
}
```

To act on findings, read `raw_path` directly with the `Read` tool. Each line is a JSONL event; the `item.completed` events with `item.type === "agent_message"` carry the review prose. Don't paraphrase to chat — show the user the exit code and let them decide what to do next.

## Verbose path (wrapper)

When the user explicitly asks for a paraphrased summary — typically because they're not yet fluent in codex JSON — invoke the `codex-adversarial` agent. The agent itself runs `rea hook codex-review --json` and then produces a Claude-paraphrased summary by reading the raw JSON. This is the 3-Opus-turn path and should NOT be the default.

Trigger via:

- `/codex-review --verbose [target]`
- Or call the `codex-adversarial` agent directly via the `Agent` tool

## Why default flipped (0.27.0+)

The user directive (2026-05-05) is "codex should be invoked this way always to minimize claude consumption of all the output. we just need the log at the end." Each wrapper-Claude codex round costs 3 Opus turns. Marathon-mode shipping (multiple releases per day) makes this cost compound fast. The thin path is the new default — wrapper is opt-in for the cases that genuinely benefit from it.

## When to run

**Default: working tree before commit.** The local-first guardrail (CTO directive 2026-05-05) is forceful as of 0.26.0 — the Bash-tier `local-review-gate.sh` hook + husky pre-push refuse `git push` when no recent `rea.local_review` audit entry covers HEAD. **`rea hook codex-review` writes a `codex.review` entry, NOT `rea.local_review`** — for the gate-friendly form, use `rea review` (which writes the entry the local-review gate consults).

The two CLIs are complementary:

- `rea review` — local-first review for the gate. Writes `rea.local_review`. Human-readable output. Primary surface for the working-tree → commit flow.
- `rea hook codex-review` — thin Bash-direct codex invocation for marathon-mode iteration. Writes `codex.review`. Terse stderr + raw JSON file. Designed for agents and slash commands that don't need a paraphrased summary.

Both write audit entries. The local-review gate consults `rea.local_review`; the legacy gateway path consulted `codex.review`. New work flows through `rea review`; this slash command's thin path is for ad-hoc rounds where the JSON is the deliverable.

## Preflight

1. Read `.rea/policy.yaml` — confirm autonomy is at least L1
2. Check `.rea/HALT` — if present, stop and report FROZEN (the CLI also short-circuits on HALT, but reporting early is friendlier)
3. Verify `codex` is on `$PATH` — if not, `rea hook codex-review` will exit 2 with an install hint

## Verdict + audit semantics

- `verdict: pass` — no material findings. Exit 0.
- `verdict: concerns` — significant risk worth fixing. Exit 1.
- `verdict: blocking` — must be addressed before merge. Exit 2.
- `verdict: error` — codex failed to produce a parseable result. Exit 2. The audit metadata carries the error kind (`not-installed`, `timeout`, `protocol`, `subprocess`, `unknown`) and message.

The audit entry is always written, even on error. That's the forensic trail.

## Pre-merge usage

This command is the **interactive** Codex adversarial review surface. The **pre-push** gate at `rea hook push-gate` runs Codex independently on every push — you don't need to run `/codex-review` to "prime" the push-gate. Use the thin path freely during iteration; the verbose path only when the cost is justified by the audience.

## Constraints

- Read-only with respect to source files. Writes only to `.rea/audit.jsonl` and the raw-stdout tempfile.
- Never silently fails. If Codex is unavailable, unresponsive, or returns an error, exit 2 and surface the error.
- Never retries automatically on non-deterministic Codex errors — surface and let the user decide.
- The thin path is the default. Don't default to verbose unless explicitly asked.
