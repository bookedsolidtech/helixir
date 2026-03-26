# PRD: Enterprise Readiness

## Situation
helixir has 40+ MCP tools, 2,400+ tests, and world-class component analysis/scoring. An enterprise engagement is scheduled for mid-April 2026 where a team will use Helix + helixir + custom MCP tools to build and extend web components.

## Problem
helixir is optimized for analyzing component libraries but lacks tools for building with them. Enterprise teams need scaffolding, theming, extension workflows, and onboarding documentation. Without these, they'll copy-paste boilerplate, make styling mistakes, and struggle with Shadow DOM patterns that helixir already knows how to diagnose.

## Approach
Tier 1 (Week 1-2): Build @helixui/mcp core package, component scaffolding tools, component extension workflow, and theme creation tools. Tier 2 (Week 2-3): Enterprise onboarding guide, agent delegation recipes, and CI validation action. Balance scaffolding tools with comprehensive documentation throughout.

## Results
Enterprise team can: (1) scaffold new Helix-pattern components with correct structure, (2) extend existing components with proper inheritance, (3) create and apply enterprise themes, (4) follow a guided onboarding flow from install to first audit to first scaffold, (5) use pre-built agent recipes for common workflows, (6) gate PRs with helixir quality checks in CI.

## Constraints
3-week deadline (mid-April 2026)
Must not break existing 40+ MCP tools or 2,400+ tests
Balance scaffolding tools with documentation — team has mixed Lit/WC experience
Core package must be independently installable (@helixui/mcp)
All new tools must follow existing handler patterns and include tests
Context files must be created for enterprise-specific agent guidance
