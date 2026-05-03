<!-- rea-managed:start -->
<!-- Managed by @bookedsolid/rea 0.11.0. Run: npx @bookedsolid/rea init to update. -->

# Agent Behavioral Rules

## Non-Negotiable Rules

These rules are enforced by hooks and cannot be overridden by any agent instruction:

- **NEVER** use `--no-verify` to skip git hooks — hooks are safety gates, not obstacles
- **NEVER** commit secrets, credentials, API keys, or tokens to any file
- **NEVER** force-push to `main`, `master`, `staging`, or `production` branches
- **NEVER** push without all applicable quality gates passing (run `pnpm preflight` or equivalent)
- **NEVER** install packages without verifying they exist in the npm registry first

## Verification Requirements

- Read files before editing them — understand existing code before modifying
- Verify package existence before installing: `npm view <package>` or check npmjs.com
- Confirm current state before claiming status — check git, files, build output
- Check tool availability before assuming it is installed

## Attribution

Do NOT include AI attribution in commits, PR bodies, code comments, or any content. When block_ai_attribution is enabled in .rea/policy.yaml, the commit-msg hook REJECTS commits containing structural AI attribution (Co-Authored-By with AI names, 'Generated with [Tool]' footers, etc.). The attribution-advisory hook also blocks gh pr create/edit and git commit commands with attribution. You must remove all attribution markers before committing — the hooks will NOT silently fix them.

## Human-in-the-Loop Escalation

When you encounter an unexpected blocker, ambiguous requirement, or situation not covered by the current context:

1. **STOP** — do not invent a workaround or make assumptions
2. **Describe** the situation clearly: what you tried, what failed, what you need
3. **Wait** for explicit human instruction before proceeding

The cost of pausing is always lower than the cost of acting incorrectly.

## Policy File

Read `.rea/policy.yaml` at the start of every session to confirm:

- The current `autonomy_level` (L0–L3) — your permitted operation scope
- `blocked_paths` — directories you must never modify
- `max_autonomy_level` — ceiling set by a human; never request escalation beyond it

## Audit Acknowledgment

This session may be subject to audit logging per `.rea/policy.yaml`. All tool invocations may be recorded. Behave as if every action is observed.

## Delegation

This project uses a "bring your own engineering team" model. All non-trivial work flows through the orchestrator to specialist agents.

**CRITICAL: For any non-trivial task, delegate to the `rea-orchestrator` agent FIRST.**

The orchestrator (`subagent_type: "rea-orchestrator"`) is the primary routing layer:

- It reads `.rea/policy.yaml` and checks HALT before any work
- It selects the right specialist agents from `.claude/agents/` based on the task
- It enforces engineering processes, coordinates multi-step work, and ensures quality gates
- It can launch multiple specialists in parallel for maximum throughput

**Fallback**: If the orchestrator is unavailable or the task is narrowly scoped to a single domain, you may route directly to a specialist agent by scanning `.claude/agents/` and using the matching `subagent_type` (e.g., `security-engineer`, `frontend-specialist`, `database-architect`).

**Do NOT** use generic Agent calls without specifying a `subagent_type`. Every agent invocation should target a discoverable specialist from `.claude/agents/`.

Exception: simple read-only questions and direct clarifications may be answered without delegation.

## When extending a helix component, you MUST call

The field-report finding ("32 helixir tools available, 0 invoked") was a discoverability failure, not a tool failure. Specific calls for component-shaped work:

- **First call to discover available tools:** `list_helixir_tools` (filter by tag — `audit`, `verify`, `tokens`, `extension`, `scaffold`)
- **Before scaffolding a subclass:** `verify_token_inheritance` and `verify_extension` against the parent — they catch slot drift, ARIA regressions, deprecated token aliases, and the rest of the defect-corpus classes 01–14
- **After scaffolding:** `audit_component_with_codex <tagName>` — runs the per-component codex audit, cached by contract-surface hash so re-runs cost nothing
- **For library-wide health:** `score_component` / `audit_library` — but in M2-strict mode (`unknown` verdict surfaces missing CEM data instead of silently scoring A)

Defect-corpus and falsifiability ledger live in `bst-cto-kb/Projects/HELiXiR/Audits/`. Every M3/M4/M5 finding cites a class id and a helix commit so consumers can trace the rule back to its origin.

<!-- rea-managed:end -->

<!-- rea:managed:start v=1 -->

## REA Governance (managed — do not edit this block)

- **Policy**: `.rea/policy.yaml` — profile `bst-internal`
- **Autonomy**: `L3` (ceiling `L3`)
- **Blocked paths**: 3 entries — see the policy file
- **block_ai_attribution**: `true` (enforced by commit-msg hook)

Protected-path changes (`src/gateway/middleware/`, `hooks/`, `src/policy/`,
`.github/workflows/`) require a `/codex-review` audit entry before push.

Run `rea doctor` to verify the install. Run `rea check` to inspect state.

<!-- rea:managed:end -->
