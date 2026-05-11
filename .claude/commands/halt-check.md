---
description: Smoke test — verify every hook and middleware respects the HALT kill switch. Advisory, read-only.
allowed-tools:
  - Bash(npx rea check:*)
  - Bash(ls:*)
  - Read
---

# /halt-check — Kill Switch Smoke Test

Verifies that the REA HALT kill switch is actually enforced end-to-end: hooks check for `.rea/HALT` at their top, middleware short-circuits on kill-switch, and governed tool calls are denied when the file is present. Run this after any change to hooks, middleware, or `.claude/settings.json`. Run it at least once per release.

This command is **advisory and read-only**. It writes a temporary HALT file, observes behavior, and removes it — but the observation is all through safe, declarative checks. It never issues destructive tool calls to probe the system.

## Preflight

1. Read `.rea/policy.yaml` — confirm REA is installed
2. Check if `.rea/HALT` already exists. If it does, report "Session already frozen — cannot run smoke test without disturbing existing HALT. Unfreeze first." and stop.
3. Verify the user has permission — this is an L1+ operation because it writes `.rea/HALT` (briefly).

## Step 1 — Baseline check

Before writing HALT, capture the baseline:

```bash
npx rea check --json
```

Record:

- `halt_present: false` (must be)
- `autonomy_level`
- `profile`
- `hook_count` from `.claude/settings.json`
- `middleware_enabled` list

If the baseline reports `halt_present: true`, stop — the smoke test requires a clean starting state.

## Step 2 — Write the test HALT

```bash
printf '{"reason":"halt-check smoke test","timestamp":"%s","invoker":"halt-check"}\n' "$(date -u +%FT%TZ)" > .rea/HALT
```

Confirm the file exists and is readable:

```bash
ls -la .rea/HALT
```

## Step 3 — Verify denial paths

Run the diagnostic CLI which simulates representative tool calls through the middleware without actually executing them:

```bash
npx rea check --simulate
```

Expected output: each simulated call returns `denied: kill-switch`. Record the results.

Then inspect the hook library — every hook should source `hooks/_lib/halt-check.sh`:

```bash
for hook in .claude/hooks/*.sh; do
  if ! grep -q 'halt-check.sh' "$hook"; then
    echo "MISSING HALT CHECK: $hook"
  fi
done
```

Any hook that does not source `halt-check.sh` is a finding.

## Step 4 — Remove the test HALT

```bash
rm .rea/HALT
```

Then verify removal:

```bash
npx rea check --json | grep halt_present
```

Must report `halt_present: false`.

## Step 5 — Report

Print a structured result:

```
/halt-check — HALT smoke test
  Baseline:           clean (halt_present=false)
  HALT written:       ok
  Middleware denial:  <N of M> layers returned denied
  Hook coverage:      <N of M> hooks source halt-check.sh
  HALT removed:       ok
  Final state:        clean

Missing coverage:
  - <list of hooks without halt-check.sh, if any>

Middleware gaps:
  - <list of layers that did not short-circuit, if any>

Verdict: PASS | CONCERNS | FAIL
```

## Failure modes

- **Any hook missing halt-check.sh** → FAIL. Hooks that do not check HALT can run during a frozen session.
- **Any middleware layer that executes past kill-switch** → FAIL. The ordering guarantee is the whole point.
- **`.rea/HALT` removal fails** → FAIL loudly. Do not exit until the file is cleaned up. Instruct the user to remove it manually if needed.
- **CLI unavailable** → CONCERNS, not FAIL. The shell-based hook audit still runs.

## Constraints

- Never destructive. The only file written and removed is `.rea/HALT`.
- Never issues real tool calls during the test — only `--simulate` through the CLI. Real tool calls would pollute the audit log with denied entries and could have side effects if a hook does not correctly short-circuit.
- Always cleans up, even on partial failure. If cleanup fails, exit non-zero and print the cleanup instruction prominently.
