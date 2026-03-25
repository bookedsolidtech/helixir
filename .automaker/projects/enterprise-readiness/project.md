# Enterprise Readiness

Transform helixir from an analysis-focused MCP server into a complete enterprise web component development platform. Add scaffolding tools, theming tools, extension workflows, and onboarding documentation so enterprise teams can build, extend, and theme Helix components — not just analyze them.

**Status:** active
**Created:** 2026-03-25T03:54:27.864Z
**Updated:** 2026-03-25T12:30:04.507Z

## PRD

### Situation

helixir has 40+ MCP tools, 2,400+ tests, and world-class component analysis/scoring. An enterprise engagement is scheduled for mid-April 2026 where a team will use Helix + helixir + custom MCP tools to build and extend web components.

### Problem

helixir is optimized for analyzing component libraries but lacks tools for building with them. Enterprise teams need scaffolding, theming, extension workflows, and onboarding documentation. Without these, they'll copy-paste boilerplate, make styling mistakes, and struggle with Shadow DOM patterns that helixir already knows how to diagnose.

### Approach

Tier 1 (Week 1-2): Build @helixui/mcp core package, component scaffolding tools, component extension workflow, and theme creation tools. Tier 2 (Week 2-3): Enterprise onboarding guide, agent delegation recipes, and CI validation action. Balance scaffolding tools with comprehensive documentation throughout.

### Results

Enterprise team can: (1) scaffold new Helix-pattern components with correct structure, (2) extend existing components with proper inheritance, (3) create and apply enterprise themes, (4) follow a guided onboarding flow from install to first audit to first scaffold, (5) use pre-built agent recipes for common workflows, (6) gate PRs with helixir quality checks in CI.

### Constraints

3-week deadline (mid-April 2026)
Must not break existing 40+ MCP tools or 2,400+ tests
Balance scaffolding tools with documentation — team has mixed Lit/WC experience
Core package must be independently installable (@helixui/mcp)
All new tools must follow existing handler patterns and include tests
Context files must be created for enterprise-specific agent guidance

## Milestones

### 1. Tier 1: Core Enterprise Tools

Foundation package and essential scaffolding/theming tools that enterprise teams need from day one

**Status:** pending

#### Phases

1. **feat: @helixui/mcp core package — CEM reader, token parser, template engine exports** (large)
2. **feat: scaffold_component MCP tool — generate new Helix-pattern components** (large)
3. **feat: extend_component MCP tool — subclass existing components with proper inheritance** (medium)
4. **feat: create_theme and apply_theme_tokens MCP tools — enterprise theming workflow** (large)

### 2. Tier 2: Documentation & Workflows

Enterprise onboarding documentation, agent recipes, and CI integration that make the tools discoverable and usable

**Status:** pending

#### Phases

1. **docs: enterprise onboarding guide — install to first audit to first scaffold** (medium)
2. **docs: agent delegation recipes — pre-built patterns for common enterprise workflows** (medium)
3. **feat: fix detect_theme_support PR #104 — resolve failing CI checks** (small)
4. **feat: validation CI action — @helixir/github-action ready for enterprise CI pipelines** (large)
