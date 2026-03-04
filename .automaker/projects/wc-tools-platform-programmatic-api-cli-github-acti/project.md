# wc-tools Platform — Programmatic API, CLI, GitHub Action, Wrapper Generator, VS Code Extension

Transform wc-tools from an MCP-only server into the web component developer platform. One analysis engine, many surfaces. See full PRD at .automaker/projects/wc-tools-platform/prd.md

## Situation
wc-tools has 18+ handlers covering CEM analysis, health scoring, breaking change detection, accessibility auditing, migration guides, bundle analysis, CDN resolution, and framework detection. All of this is locked behind MCP protocol — only usable by AI assistants.

## Problem
- Non-MCP developers cannot use wc-tools (majority of the market)
- No CI quality gates exist for web component APIs anywhere in the ecosystem
- IDE web component support is framework-specific (lit-plugin = Lit only)
- Framework wrapper generation tools lack health/migration awareness
- The "all-in-one web component platform" niche is completely unoccupied

## Approach
Monorepo with packages/. Core analysis engine (current handlers) exported as public programmatic API. Extensions consume it:

Phase 1: Programmatic API export — restructure src/ into api/, mcp/, cli/ directories. Add "exports" map to package.json. All handlers importable.
Phase 2: CLI subcommands — wc-tools analyze, health, diff, migrate, suggest, bundle, tokens, compare, benchmark, validate, cdn, serve. Table/JSON/markdown output. CI-friendly exit codes.
Phase 3: GitHub Action — clarity-house-press/wc-tools-action@v1. Health scores + breaking changes in PR comments. Configurable thresholds. Fail checks on quality drops.
Phase 4: Framework wrapper generator — wc-tools generate react/vue/angular/svelte. Typed wrappers from CEM with health annotations and deprecation warnings.
Phase 5: VS Code extension — hover docs, diagnostics, autocomplete, health status bar, component tree view. LSP-based.

## Results
- 10x addressable market (CLI usable by all developers)
- Enterprise adoption via GitHub Action (viral in PRs)
- Daily-driver status via VS Code extension
- "Must install" positioning as the only all-in-one WC platform

## Constraints
- Zero new runtime deps in core (keep @modelcontextprotocol/sdk + zod only)
- CLI uses Node.js built-in parseArgs
- Backwards compatible: npx wc-tools still starts MCP server
- ESM only, Node >= 20, pnpm workspaces

**Status:** active
**Created:** 2026-03-04T05:56:37.266Z
**Updated:** 2026-03-04T05:57:36.429Z

## Milestones

### 1. Phase 1: Programmatic API Export

Restructure src/ into api/, mcp/, cli/ directories. Create barrel exports for all handlers. Add exports map to package.json. Convert to monorepo with packages/core/. Ensure npx wc-tools still starts MCP server. All existing tests pass from new locations.

**Status:** pending

### 2. Phase 2: CLI Subcommands

CLI entry point with subcommands: analyze, health, diff, migrate, suggest, bundle, tokens, compare, benchmark, validate, cdn, serve, init. Output formats: table (TTY), JSON (pipe), markdown. CI-friendly exit codes (0=ok, 1=error, 2=breaking changes). Uses Node.js built-in parseArgs (zero deps).

**Status:** pending

### 3. Phase 3: GitHub Action

packages/github-action/ with action.yml. Composite action that installs wc-tools and runs CLI. PR comment with health scores, breaking changes, accessibility grades. Configurable thresholds. Fail check on quality drops. Works with any CEM-based web component library.

**Status:** pending

### 4. Phase 4: Framework Wrapper Generator

packages/wrapper-gen/ published as @wc-tools/wrapper-gen. CLI: wc-tools generate react --out ./wrappers/. React first (forwardRef, event binding, typed props from CEM, slot children). Then Vue, Angular, Svelte. Health annotations, deprecation warnings. Watch mode.

**Status:** pending

### 5. Phase 5: VS Code Extension

packages/vscode/ published to VS Code Marketplace. LSP server wrapping wc-tools core. Hover docs, diagnostics (unknown attrs, deprecated), autocomplete (tags, attrs, slots, events, CSS props), health status bar, component tree sidebar, go-to-definition.

**Status:** pending
