---
description: Print REA session status — autonomy level, HALT state, policy profile, and recent audit entries
allowed-tools:
  - Bash(npx rea check:*)
  - Read
---

# /rea — Session Status

Prints a concise status overview of the REA governance layer for the current project. Use this at the start of a session, after policy changes, or whenever you need to confirm the runtime posture before acting.

## What it reports

- **Autonomy level** — current `autonomy_level` from `.rea/policy.yaml` (L0–L3) and the `max_autonomy_level` ceiling
- **HALT status** — whether `.rea/HALT` exists (FROZEN vs. ACTIVE) and, if frozen, the reason
- **Policy profile** — the active profile (e.g. `bst-internal`, `client-engagement`, `minimal`)
- **Blocked paths** — paths the middleware chain refuses to touch
- **Attribution gating** — `block_ai_attribution` on/off
- **Recent audit entries** — last 5 entries from `.rea/audit.jsonl` with tool name, decision, and timestamp

## Behavior

1. Invoke the CLI: `npx rea check`
2. Render the output verbatim — do not interpret, summarize, or add commentary unless the user asks
3. If `.rea/policy.yaml` is missing, report: "REA not initialized in this project. Run `npx rea init` to scaffold."
4. If `.rea/HALT` exists, highlight the FROZEN state prominently — the user needs to see this first

## Constraints

- Read-only. This command never writes to `.rea/` or any project file.
- If the CLI is not available (`npx rea check` fails), report the error and suggest `pnpm install` or `npm install -g @bookedsolid/rea`.
- Never print the contents of `audit.jsonl` beyond what `npx rea check` surfaces — the audit log may contain redacted payloads and should be accessed through the CLI, not directly.

## Typical output shape

```
REA Status
  Profile:           bst-internal
  Autonomy:          L1 (ceiling L2)
  HALT:              ACTIVE (unfrozen)
  Attribution gate:  enforced
  Blocked paths:     .env, .env.*, .rea/, node_modules/

Recent audit (last 5):
  2026-04-18T10:42:11Z  Bash              allowed
  2026-04-18T10:41:58Z  Write             allowed
  2026-04-18T10:41:22Z  Edit              denied (blocked-paths)
  2026-04-18T10:40:03Z  mcp__helixir__*   allowed
  2026-04-18T10:39:47Z  Bash              allowed
```

If the user wants more detail, point them at `npx rea check --verbose` or `npx rea doctor`.
