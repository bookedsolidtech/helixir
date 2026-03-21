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

#### Critical Tier

| Task | Delegate To |
|------|------------|
| CEM completeness (`cem_completeness`) scanner implementation or bug | `technical-writer` |
| Accessibility Compliance (`accessibility`) scanner implementation or bug | `accessibility-engineer` |
| Type Coverage (`type_coverage`) scanner implementation or bug | `typescript-specialist` |
| Test coverage (`test_coverage`) scanner implementation or bug | `test-architect` |
| CEM-Source Fidelity (`cem_source_fidelity`) scanner implementation or bug | `technical-writer` |

#### Important Tier

| Task | Delegate To |
|------|------------|
| API Surface Quality (`api_surface_quality`) scanner implementation or bug | `solutions-architect` |
| CSS Architecture (`css_architecture`) scanner implementation or bug | `performance-engineer` |
| Event Architecture (`event_architecture`) scanner implementation or bug | `solutions-architect` |
| Slot Architecture (`slot_architecture`) scanner implementation or bug | `component-architect` |
| Bundle Size (`bundle_size`) scanner implementation or bug | `performance-engineer` |
| Story Coverage (`story_coverage`) scanner implementation or bug | `storybook-specialist` |
| Naming Consistency (`naming_consistency`) scanner implementation or bug | `technical-writer` |

#### Advanced Tier

| Task | Delegate To |
|------|------------|
| Performance (`performance`) scanner implementation or bug | `performance-engineer` |
| Drupal Readiness (`drupal_readiness`) scanner implementation or bug | `cto` |

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

### Dimension Scan Tools

| MCP Tool | Dimension | Tier | Reviewer |
|----------|-----------|------|---------|
| `scan_cem_completeness` | CEM Completeness (`cem_completeness`) | Critical | `technical-writer` |
| `scan_accessibility` | Accessibility Compliance (`accessibility`) | Critical | `accessibility-engineer` |
| `scan_type_coverage` | Type Coverage (`type_coverage`) | Critical | `typescript-specialist` |
| `scan_test_coverage` | Test Coverage (`test_coverage`) | Critical | `test-architect` |
| `scan_cem_source_fidelity` | CEM-Source Fidelity (`cem_source_fidelity`) | Critical | `technical-writer` |
| `scan_api_surface` | API Surface Quality (`api_surface_quality`) | Important | `solutions-architect` |
| `scan_css_architecture` | CSS Architecture (`css_architecture`) | Important | `performance-engineer` |
| `scan_event_architecture` | Event Architecture (`event_architecture`) | Important | `solutions-architect` |
| `scan_slot_architecture` | Slot Architecture (`slot_architecture`) | Important | `component-architect` |
| `scan_bundle_size` | Bundle Size (`bundle_size`) | Important | `performance-engineer` |
| `scan_story_coverage` | Story Coverage (`story_coverage`) | Important | `storybook-specialist` |
| `scan_naming_consistency` | Naming Consistency (`naming_consistency`) | Important | `technical-writer` |
| `scan_performance` | Performance (`performance`) | Advanced | `performance-engineer` |
| `scan_drupal_readiness` | Drupal Readiness (`drupal_readiness`) | Advanced | `cto` |

### Aggregate and Server Tools

| MCP Tool | Reviewer |
|----------|---------|
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
       Critical dimension bugs → always Tier 2
  → Tier 3: chief-code-reviewer (architecture, security)
  → CTO (release sign-off, major technical decisions; Drupal Readiness dimension owner)
  → VP Engineering (threshold changes, dimension weight changes)
```

**Tier-based escalation by dimension:**
- **Critical dimension** bugs or regressions → Tier 2 (`senior-code-reviewer`) minimum
- **Important dimension** changes → Tier 1 (`code-reviewer`); escalate to Tier 2 if scoring logic is touched
- **Advanced dimension** changes → follow up within 2 weeks if no Tier 1 review occurs

When in doubt: delegate earlier rather than later. A specialist takes 10 minutes to verify; a production bug in scoring logic takes days to remediate.
