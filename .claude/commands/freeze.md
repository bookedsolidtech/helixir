---
description: Activate the REA kill switch — writes .rea/HALT with a reason, blocking all governed tool calls until unfrozen
argument-hint: "<reason>"
allowed-tools:
  - Bash(npx rea freeze:*)
---

# /freeze — Activate the Kill Switch

Writes `.rea/HALT` with a timestamped reason. Once frozen, every REA-governed tool call (native MCP, proxied downstream, and hook-gated) refuses to execute until `npx rea unfreeze` is run.

Use this when:

- You see the agent doing something unexpected and you want to stop it immediately
- You are handing the session off and want to be sure nothing runs unattended
- A hook or middleware is misbehaving and you need to isolate the problem
- You are about to do something outside the normal governance envelope and want an obvious tripwire

## Arguments

- `$ARGUMENTS` (required) — a short reason (one sentence). If empty, prompt the user for one before proceeding. Never freeze without a reason.

## Preflight

1. Read `.rea/policy.yaml` — confirm REA is installed. If missing, report "REA not initialized" and stop.
2. Check whether `.rea/HALT` already exists. If it does, show the existing reason and ask whether to overwrite.

## Step 1 — Validate the reason

- If `$ARGUMENTS` is empty or whitespace, prompt: "Reason is required. Describe why you are freezing this session."
- If the reason is a placeholder like "test", "asdf", or "freeze", confirm with the user — the reason ends up in the audit log and should be meaningful.

## Step 2 — Invoke the freeze CLI

```bash
npx rea freeze --reason "$ARGUMENTS"
```

This command:

1. Writes `.rea/HALT` with a JSON payload: `{ reason, timestamp, invoker: "slash-command" }`
2. Appends an entry to `.rea/audit.jsonl`
3. Returns exit code 0 on success, non-zero on failure

## Step 3 — Confirm

Print the confirmation plainly:

```
REA session FROZEN
  Reason:    <reason>
  Timestamp: <ISO-8601>
  HALT file: .rea/HALT

All governed tool calls are now blocked. To resume: npx rea unfreeze
```

## Behavior under HALT

Once `.rea/HALT` is present:

- Every hook checks `hooks/_lib/halt-check.sh` at its top and exits non-zero (blocked)
- Every middleware invocation checks `kill-switch` first and refuses
- Slash commands that take actions (not read-only status commands) report FROZEN and refuse to proceed
- `/rea` continues to work — it is read-only and needs to be able to report the frozen state

## Unfreezing

Unfreezing is explicit and requires its own command:

```bash
npx rea unfreeze --reason "<why it is safe to resume>"
```

The slash-command variant is not provided on purpose — unfreezing should be a deliberate CLI action, not a one-keystroke reflex.

## Constraints

- Writes only to `.rea/HALT` and `.rea/audit.jsonl`. Never modifies policy, source files, or git state.
- Does not auto-unfreeze on any condition. HALT is sticky.
- If the CLI is unavailable, fall back to writing the HALT file directly with `printf`, but record this in the audit log as a CLI-unavailable fallback.
