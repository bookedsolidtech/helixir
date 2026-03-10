# PRD: HelixKit — The Web Component Developer Platform

**Version:** 1.0
**Date:** 2026-03-04
**Author:** Ava + Josh
**Status:** Draft
**Brand:** helixkit (npm), HelixKit (VS Code), `brew install helixkit`
**GitHub:** bookedsolidtech/wc-tools (rename to helixkit later)
**Version strategy:** Pre-release. Current: 0.1.0. Phase 1 ships as 0.2.0.

---

## 1. Problem Statement

Web component libraries (Lit, Stencil, FAST, Shoelace, etc.) lack integrated developer tooling. The ecosystem has fragmented point solutions — a language server here, a wrapper generator there — but no unified platform that combines component analysis, health scoring, migration detection, and developer tooling into one cohesive system.

**Today's pain points:**
- Developers using web components in React/Vue/Angular projects have no automated wrapper generation that includes health awareness or migration safety
- No CI quality gates exist for web component APIs — breaking changes ship undetected
- IDE support for web components is framework-specific (lit-plugin only helps Lit users) and limited to autocomplete — no health scores, no accessibility grades, no migration warnings
- Component library maintainers have no standardized way to measure and communicate API health over time

**helixir already solves the hard problems** — CEM analysis, health scoring, breaking change detection, accessibility auditing, migration guides, bundle analysis, and CDN resolution. But it's locked behind the MCP protocol, limiting it to AI assistant users.

## 2. Vision

**Transform helixir from an MCP server into THE web component developer platform.**

One analysis engine. Many surfaces. Every web component developer installs helixir — whether they use AI assistants or not, whether they use VS Code or the terminal, whether they're building a design system or consuming one.

**Tagline evolution:**
- Today: *"Give Claude eyes into your design system"*
- Tomorrow: *"The developer platform for web components"*

## 3. Architecture

### Core + Extensions Model

```
helixir/                           ← monorepo (pnpm workspaces)
  packages/
    core/                          ← current src/, published as "helixir"
      src/
        handlers/                  ← pure analysis functions (already exist)
        api/                       ← NEW: public programmatic API
        mcp/                       ← MCP server entry point (refactored from index.ts)
        cli/                       ← NEW: CLI subcommand interface
      package.json                 ← "helixir" on npm

    github-action/                 ← published as GitHub Action
      action.yml
      src/index.ts                 ← imports from @helixir/core
      package.json

    vscode/                        ← published to VS Code Marketplace
      src/extension.ts             ← imports from helixir core
      package.json

    wrapper-gen/                   ← published as "@helixir/wrapper-gen"
      src/
        react.ts
        vue.ts
        angular.ts
        svelte.ts
      package.json

    docs-gen/                      ← published as "@helixir/docs-gen"  (Phase 5+)
    storybook/                     ← published as "@helixir/storybook" (Phase 5+)
```

### The Key Unlock: Programmatic API

The handlers in `src/handlers/*.ts` are already pure functions. The refactor is:

1. **Extract** the MCP dispatch logic from `src/index.ts` into `src/mcp/server.ts`
2. **Export** handler functions from a public `src/api/index.ts` barrel file
3. **Add** `"exports"` field to package.json so consumers can `import { scoreComponent } from 'helixir'`
4. **Keep** the `bin` entry for MCP server and CLI

```ts
// Consumer usage after Phase 1:
import { loadConfig, loadCem } from 'helixir';
import { scoreComponent, analyzeAccessibility } from 'helixir/health';
import { diffCem, checkBreakingChanges } from 'helixir/safety';
import { suggestUsage, generateImport } from 'helixir/suggest';

const config = loadConfig('/path/to/project');
const cem = loadCem(config);
const score = scoreComponent(config, 'my-button', cem);
```

### Why Monorepo

- Shared TypeScript types across all packages
- One CI pipeline, coordinated releases
- pnpm workspaces makes dependency linking trivial
- Each package publishes independently (different registries for VS Code, npm, GitHub Marketplace)

## 4. Phases

### Phase 1: Programmatic API Export (Unlocks Everything)

**Goal:** Make helixir importable as a library, not just runnable as a server.

**Deliverables:**
1. Restructure `src/` into `src/api/`, `src/mcp/`, `src/cli/` directories
2. Create barrel exports: `src/api/index.ts` with all public handler functions
3. Add `"exports"` map to package.json:
   ```json
   {
     "exports": {
       ".": "./build/api/index.js",
       "./health": "./build/api/health.js",
       "./safety": "./build/api/safety.js",
       "./suggest": "./build/api/suggest.js",
       "./cem": "./build/api/cem.js",
       "./tokens": "./build/api/tokens.js",
       "./cdn": "./build/api/cdn.js",
       "./bundle": "./build/api/bundle.js",
       "./mcp": "./build/mcp/server.js"
     },
     "bin": {
       "helixir": "./build/cli/index.js"
     }
   }
   ```
4. `loadConfig()` and `loadCem()` exported as first-class public functions
5. MCP server still works exactly as before (`npx helixir` starts MCP mode)
6. Convert to monorepo structure (move current code into `packages/core/`)

**Acceptance criteria:**
- `import { scoreComponent } from 'helixir/health'` works
- `npx helixir` still starts the MCP server (backwards compatible)
- All existing tests pass from new locations
- TypeScript declaration files generated for all exports

**Complexity:** Large (structural refactor, but no new logic)

---

### Phase 2: CLI Subcommands

**Goal:** Make every helixir capability usable from the terminal without MCP.

**Deliverables:**
1. CLI entry point at `packages/core/src/cli/index.ts`
2. Subcommands mapping to existing handlers:

| Command | Handler | Output |
|---------|---------|--------|
| `helixir init` | existing init wizard | interactive setup |
| `helixir analyze [tag]` | `parseCem` + `analyzeAccessibility` | component analysis JSON/table |
| `helixir health [tag]` | `scoreComponent` / `scoreAllComponents` | health scores table |
| `helixir health --trend [tag]` | `getHealthTrend` | score history |
| `helixir diff [--base branch]` | `diffCem` + `checkBreakingChanges` | breaking changes list |
| `helixir migrate [tag] [--base branch]` | `generateMigrationGuide` | migration guide |
| `helixir suggest [tag]` | `suggestUsage` | usage examples |
| `helixir bundle [tag]` | `estimateBundleSize` | bundle size report |
| `helixir tokens [query]` | `getDesignTokens` / `findToken` | token search results |
| `helixir compare [cemA] [cemB]` | `compareLibraries` | comparison table |
| `helixir benchmark [cem...]` | `benchmarkLibraries` | benchmark report |
| `helixir validate [tag] --html "..."` | `validateUsage` | validation report |
| `helixir cdn [pkg] [--registry]` | `resolveCdnCem` | CDN CEM resolution |
| `helixir serve` | MCP server (current behavior) | stdio MCP |

3. Output formats: `--format json|table|markdown` (default: table for TTY, JSON for pipes)
4. Config auto-discovery: looks for `mcpwc.config.json` in cwd, same as MCP mode
5. Exit codes: 0 success, 1 error, 2 breaking changes detected (for CI usage)
6. `--ci` flag: machine-readable output, non-zero exit on health score below threshold

**Parser:** Use `commander` or built-in `parseArgs` (Node 20+). Prefer `parseArgs` to keep zero-dep philosophy.

**Acceptance criteria:**
- Every MCP tool accessible as a CLI subcommand
- `helixir health` produces a readable table in terminal
- `helixir diff --ci` returns exit code 2 on breaking changes
- `helixir serve` starts MCP server (backwards compat with existing usage)
- `npx helixir` without subcommand shows help

**Complexity:** Medium

---

### Phase 3: GitHub Action

**Goal:** Web component quality gates in every PR.

**Deliverables:**
1. `packages/github-action/` with `action.yml`
2. Usage:
   ```yaml
   - uses: clarity-house-press/helixir-action@v1
     with:
       checks: health,breaking-changes,accessibility
       health-threshold: 70
       fail-on-breaking: true
       comment: true
   ```
3. Action runs:
   - `helixir health --ci --format json` → parse scores
   - `helixir diff --base ${{ github.base_ref }} --ci --format json` → detect breaking changes
   - Posts a PR comment with:
     - Health score summary (table with per-component scores)
     - Breaking changes (if any)
     - Accessibility grade changes
     - Health trend sparklines (if history available)
4. Fail the check if:
   - Any component health score drops below threshold
   - Breaking changes detected and `fail-on-breaking: true`
5. Uses the CLI (Phase 2) internally — no direct handler imports needed
6. Composite action (runs node, installs helixir, executes CLI)

**Acceptance criteria:**
- `uses: clarity-house-press/helixir-action@v1` works in any GitHub Actions workflow
- PR comment shows health scores and breaking changes
- Check fails on configurable thresholds
- Works with any web component library that has a CEM

**Complexity:** Medium

---

### Phase 4: Framework Wrapper Generator

**Goal:** "I want a React library that wraps all our web components."

**Deliverables:**
1. `packages/wrapper-gen/` published as `@helixir/wrapper-gen`
2. CLI: `helixir generate react --out ./src/react-wrappers/`
3. Generates typed wrapper components for:
   - **React** — `React.forwardRef` with proper event binding (`onSlChange` → `sl-change`), typed props from CEM, slot children as `children`
   - **Vue** — `defineComponent` with prop definitions, `v-model` support for form components, event bindings
   - **Angular** — `CUSTOM_ELEMENTS_SCHEMA` module, `@Input()`/`@Output()` decorators, two-way binding
   - **Svelte** — typed wrapper with event forwarding, slot projection
4. Each generated wrapper includes:
   - Full TypeScript types derived from CEM properties/attributes/events/slots
   - JSDoc comments with property descriptions from CEM
   - Health score annotation (comment warning if component health < 70)
   - Deprecation warnings from CEM `@deprecated` tags
5. Config: `helixir generate react --prefix sl- --package @shoelace-style/shoelace`
6. Watch mode: `helixir generate react --watch` (regenerate on CEM changes)

**Competitive advantage over existing tools (Plasma, cem-plugin-reactify):**
- Health-aware: warns about unhealthy components
- Migration-aware: includes deprecation notices from CEM
- Multi-framework from one tool (not React-only)
- Uses helixir's richer CEM analysis (accessibility, composition, dependencies)

**Acceptance criteria:**
- Generated React wrappers compile with `tsc --strict`
- Generated wrappers include typed props, events, slots, CSS custom properties
- `--watch` mode regenerates on CEM file changes
- Works with Shoelace, FAST, Lit, Stencil component libraries

**Complexity:** Large

---

### Phase 5: VS Code Extension

**Goal:** helixir analysis as real-time IDE features.

**Deliverables:**
1. `packages/vscode/` published to VS Code Marketplace as `helixir`
2. Features:
   - **Hover documentation** — hover over `<sl-button>` and see full component API, health score, accessibility grade
   - **Diagnostics** — red squiggles for unknown attributes, deprecated components, type mismatches
   - **Autocomplete** — component tag names, attributes, slot names, CSS custom properties, event names
   - **Health status bar** — current file's component health scores in the status bar
   - **Code actions** — "Generate import for sl-button", "Show migration guide", "View health trend"
   - **Component tree view** — sidebar showing all components in the library with health indicators
   - **Go to definition** — click a tag name to jump to its CEM declaration or source
3. Architecture: Language Server Protocol (LSP) server that wraps helixir core
4. Configuration: reads `mcpwc.config.json` from workspace root (same config as CLI/MCP)

**Competitive advantage over lit-plugin / custom-elements-language-server:**
- Works with ALL web component frameworks (not Lit-specific)
- Health scores, accessibility grades, migration warnings (unique)
- CDN resolution — fetch CEM from npm for third-party libraries
- Same analysis engine as CI (consistency between IDE and pipeline)

**Acceptance criteria:**
- Hover docs show component API from CEM
- Autocomplete works for tag names, attributes, slots, events, CSS properties
- Diagnostics flag unknown attributes and deprecated components
- Health scores visible in status bar and hover
- Works with any CEM-based web component library

**Complexity:** Large

---

### Phase 6+ (Future)

| Extension | What | Priority |
|-----------|------|----------|
| **Docs Generator** | `helixir docs --out ./docs/` → static site with API reference, health dashboards, token catalog | Medium |
| **Storybook Integration** | `helixir storybook --out ./stories/` → auto-generated `.stories.ts` from CEM | Medium |
| **Design Token Bridge** | Figma plugin ↔ W3C DTCG tokens ↔ CSS custom properties | Low |
| **Component Playground** | `helixir.dev/playground` — paste a CEM URL, explore components interactively | Low |
| **Comparison Dashboard** | `helixir.dev/compare` — compare N libraries head-to-head (health, bundle, API surface) | Low |

---

## 5. Competitive Landscape

| Niche | Existing Tools | HELiXiR Advantage |
|-------|---------------|-------------------|
| VS Code extension | lit-plugin, custom-elements-ls, wc-toolkit-ls | Framework-agnostic + health scores + migration warnings |
| CI quality gates | **NONE** | First mover — zero competition |
| Wrapper generators | Plasma, cem-plugin-reactify | Health-aware + multi-framework + one tool |
| CLI analysis | **NONE** (CEM analyzer generates, doesn't analyze) | First comprehensive CLI for WC analysis |
| All-in-one platform | **NONE** | Only integrated platform combining analysis + health + migration + tooling |

## 6. Success Metrics

| Metric | 6 months | 12 months |
|--------|----------|-----------|
| npm weekly downloads (helixir) | 2,000 | 10,000 |
| GitHub stars | 1,000 | 5,000 |
| GitHub Action installations | 100 repos | 500 repos |
| VS Code Marketplace installs | — | 2,000 |
| Framework wrapper users | — | 500 |

## 7. Technical Constraints

- **Zero new runtime dependencies** in core package (keep `@modelcontextprotocol/sdk` + `zod` only)
- **CLI uses Node.js built-in `parseArgs`** — no commander/yargs dependency
- **Backwards compatible** — `npx helixir` must continue to start MCP server for existing users
- **ESM only** — all packages are `"type": "module"`
- **Node.js >= 20** — can use built-in `parseArgs`, `fetch`, `test` runner
- **pnpm workspaces** — already the package manager

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Monorepo migration breaks existing users | Version bump to 1.0.0, `npx helixir` behavior preserved |
| Too many packages to maintain | Start with core + CLI + action only, add extensions based on demand |
| VS Code extension scope creep | Ship minimal viable (hover + autocomplete + diagnostics) first |
| Wrapper generator correctness across frameworks | Start React-only, add frameworks incrementally |

## 9. Open Questions

1. **Package name for v1.0:** Keep `helixir` or rename to something catchier?
2. **GitHub org:** Keep under `clarity-house-press` or create `helixir` org?
3. **Monorepo migration timing:** Do we version-bump to 1.0.0 at the same time or ship current fixes as 0.2.0 first?
4. **VS Code extension name:** `helixir` or something more descriptive like `Web Component Toolkit`?
