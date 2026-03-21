# Custom Agent Delegation Matrix — HELiXiR

This document defines the routing table for delegating work to custom agents in HELiXiR. It tells the Lead Engineer when to invoke each specialist and what scope to hand off.

---

## Overview

HELiXiR is an MCP server and health scanning infrastructure for web component libraries. Most work falls into one of three categories:

1. **Auditing** — verifying that health scores are accurate (see `health-scanning-audit-workflow.md`)
2. **Implementation** — building new scanners, MCP tools, or scoring logic
3. **Infrastructure** — server performance, caching, CI/CD, deployment

The Lead Engineer handles standard implementation but delegates to specialists for domain-specific work.

---

## Delegation Routing Table

### Code Review

| Trigger | Delegate To | Notes |
|---------|------------|-------|
| Any implementation PR | `code-reviewer` | Always. Tier 1 gate for every change. |
| Scoring engine changes | `senior-code-reviewer` | Escalate to Tier 2 — scoring logic is critical path. |
| MCP server architecture changes | `chief-code-reviewer` | Tier 3. Any change to server contracts requires this. |
| Security-sensitive changes (auth, data exposure) | `security-engineer` + `chief-code-reviewer` | Both required. |

### Health Dimension Work

| Task | Delegate To |
|------|------------|
| Accessibility scanner implementation or bug | `accessibility-engineer` |
| CEM completeness scanner implementation or bug | `technical-writer` |
| Test coverage scanner implementation or bug | `test-architect` |
| Storybook coverage scanner implementation or bug | `storybook-specialist` |
| TypeScript strictness scanner implementation or bug | `typescript-specialist` |
| Bundle size scanner implementation or bug | `performance-engineer` |
| Documentation scanner implementation or bug | `technical-writer` |

### Auditing and Validation

| Task | Delegate To |
|------|------------|
| Health scan accuracy audit | `principal-engineer` (coordinates all dimension specialists) |
| CEM parsing correctness | `technical-writer` + `typescript-specialist` |
| Scoring calibration review | `principal-engineer` + `vp-engineering` (approval) |
| Full pre-release audit | `cto` (signs off) |

### MCP Server Infrastructure

| Task | Delegate To |
|------|------------|
| MCP server performance profiling | `performance-engineer` |
| Caching strategy design | `infrastructure-engineer` |
| CI/CD pipeline changes | `devops-engineer` |
| MCP tool API design | `solutions-architect` |
| Security review of MCP endpoints | `security-engineer` |

### Architecture and Direction

| Task | Delegate To |
|------|------------|
| New health dimension proposal | `principal-engineer` (assessment) → `vp-engineering` (approval) |
| Scoring weight changes | `principal-engineer` (proposal) → `vp-engineering` (approval) |
| Integration with new consumer tools | `solutions-architect` |
| Technology decisions (new dependencies, frameworks) | `cto` |

---

## MCP Tool Routing

HELiXiR exposes these MCP tools to consumers (Claude Code, CI pipelines). Each tool has a designated reviewer:

| MCP Tool | Reviewer |
|----------|---------|
| `scan_accessibility` | `accessibility-engineer` |
| `scan_cem_completeness` | `technical-writer` |
| `scan_test_coverage` | `test-architect` |
| `scan_storybook_coverage` | `storybook-specialist` |
| `scan_typescript_strictness` | `typescript-specialist` |
| `scan_bundle_size` | `performance-engineer` |
| `scan_documentation` | `technical-writer` |
| `scan_health_score` (aggregate) | `principal-engineer` |
| Server configuration tools | `devops-engineer` |
| Cache management tools | `infrastructure-engineer` |

---

## Model Routing by Task Complexity

Following the HELiX pattern, route by complexity:

| Complexity | Model | Example Tasks |
|-----------|-------|--------------|
| Simple | `haiku` | Changeset creation, changelog updates, minor text fixes |
| Standard | `sonnet` | Scanner implementation, test writing, MCP tool additions |
| Complex | `sonnet` | Scoring algorithm changes, CEM parsing updates |
| Architectural | `opus` | Dimension weight changes, new health dimension design, MCP API contracts |

---

## Do Not Delegate

These tasks should NOT be delegated — the Lead Engineer handles them directly:

- Standard file edits and refactors within well-understood code
- Dependency version bumps (unless security-related → `security-engineer`)
- Formatting and linting fixes
- Updating the `.automaker/context/` files themselves

---

## Escalation Path

```
Lead Engineer
  → Tier 1: code-reviewer (all PRs)
  → Tier 2: senior-code-reviewer (scoring, MCP contracts)
  → Tier 3: chief-code-reviewer (architecture, security)
  → CTO (release sign-off, major technical decisions)
  → VP Engineering (threshold changes, dimension changes)
```

When in doubt: delegate earlier rather than later. A specialist takes 10 minutes to verify; a production bug in scoring logic takes days to remediate.
