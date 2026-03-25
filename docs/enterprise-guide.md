# HELiXiR Enterprise Guide

Everything your team needs to go from zero to a fully grounded, AI-powered component workflow.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1 — Install HELiXiR](#step-1--install-helixir)
4. [Step 2 — Configure for Your Library](#step-2--configure-for-your-library)
5. [Step 3 — Connect Your IDE](#step-3--connect-your-ide)
6. [Step 4 — Run Your First Component Audit](#step-4--run-your-first-component-audit)
7. [Step 5 — Scaffold Your First Component](#step-5--scaffold-your-first-component)
8. [Step 6 — Create Your First Theme](#step-6--create-your-first-theme)
9. [CI Integration](#ci-integration)
10. [Troubleshooting](#troubleshooting)

---

## Overview

HELiXiR is an MCP (Model Context Protocol) server that gives AI coding assistants complete, accurate knowledge of your web component library. Instead of hallucinating component APIs from training data, your AI agent reads the actual Custom Elements Manifest (CEM) — the ground truth for every attribute, event, slot, CSS part, and design token.

**What enterprise teams get:**

- AI that knows your exact component API — no hallucinated attributes or missing properties
- 30+ MCP tools for discovery, health scoring, design token lookup, TypeScript diagnostics, scaffolding, and theming
- Framework-agnostic — works with Lit, Stencil, FAST, Spectrum, Shoelace, or any CEM-producing library
- Connects to Claude Code, Claude Desktop, Cursor, VS Code (Cline/Continue), and Zed

---

## Prerequisites

| Requirement | Minimum Version |
|-------------|-----------------|
| Node.js | 20+ |
| npm / pnpm / yarn | Any current version |
| Custom Elements Manifest | `custom-elements.json` at a known path |
| IDE | Claude Code, Claude Desktop, Cursor, VS Code, or Zed |

**Generate a CEM if you don't have one:**

```bash
# For Lit components
npm install -D @custom-elements-manifest/analyzer
npx cem analyze --litelement --globs 'src/**/*.ts'

# For Stencil — enabled via stencil.config.ts
# For Shoelace — ships with the package at dist/custom-elements.json
# For FAST — use the CEM analyzer with --globs 'src/**/*.ts'
```

---

## Step 1 — Install HELiXiR

Install HELiXiR in your component library project:

```bash
# npm
npm install helixir

# pnpm
pnpm add helixir

# yarn
yarn add helixir
```

Verify the installation:

```bash
npx helixir --version
# → helixir/x.x.x
```

---

## Step 2 — Configure for Your Library

Generate a starter config file at your component library root:

```bash
cd /path/to/your/component-library
npx helixir init
# → wrote mcpwc.config.json
```

Open `mcpwc.config.json` and fill in the details for your library:

```json
{
  "cemPath": "custom-elements.json",
  "projectRoot": "/absolute/path/to/your/component-library",
  "componentPrefix": "hx-",
  "healthHistoryDir": ".mcp-wc/health",
  "tsconfigPath": "tsconfig.json",
  "tokensPath": "dist/tokens/tokens.json"
}
```

### Configuration fields explained

| Field | What to set |
|-------|------------|
| `cemPath` | Path to `custom-elements.json`, relative to `projectRoot`. Auto-discovered if omitted. |
| `projectRoot` | Absolute path to your component library. This is the base for all relative paths. |
| `componentPrefix` | Your tag-name prefix (e.g. `"hx-"`, `"sl-"`, `"ds-"`). Scopes discovery to your library. |
| `healthHistoryDir` | Where health score snapshots are stored. Leave as default unless you have a specific reason to move it. |
| `tsconfigPath` | Path to your `tsconfig.json`. Required for TypeScript diagnostics tools. |
| `tokensPath` | Path to your design tokens JSON (W3C DTCG format). Set to `null` to disable token tools. |
| `watch` | Set to `true` for local development — HELiXiR reloads when the CEM file changes. |

### Monorepo setup

If your component library lives inside a monorepo (e.g. `packages/web-components`), set `projectRoot` to the package directory, not the repo root:

```json
{
  "cemPath": "custom-elements.json",
  "projectRoot": "/absolute/path/to/repo/packages/web-components",
  "componentPrefix": "hx-"
}
```

You can also use environment variables to override config without modifying the file — useful for CI or pointing the same server at different libraries:

```bash
export MCP_WC_PROJECT_ROOT="/path/to/packages/web-components"
export MCP_WC_COMPONENT_PREFIX="hx-"
```

### Verify config is loading correctly

```bash
npx helixir list_components
# Should print your component list
```

If you see an empty list, check [Troubleshooting — No components found](#no-components-found).

---

## Step 3 — Connect Your IDE

Choose the instructions for your IDE. You only need to do this once per project.

### Claude Code

Add a `.mcp.json` file to your project root:

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

Reload Claude Code and verify the server is running:

```
:mcp
```

`helixir` should appear in the list with status `connected`. If it shows `error`, see [Troubleshooting — Server not appearing](#server-not-appearing-in-ide).

**Quick test** — ask Claude Code:

> "What components are available? List them."

Claude Code will call `list_components` and return your library's component list with zero hallucinations.

### Claude Desktop

Edit the Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

Restart Claude Desktop after saving. Look for the plug icon in the chat input — it should show `helixir` as a connected tool.

### Cursor

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

`${workspaceFolder}` automatically resolves to your open project directory.

### VS Code — Cline

Add to `.vscode/cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

### VS Code — Continue

Add to `.continue/config.json`:

```json
{
  "mcpServers": [
    {
      "name": "helixir",
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  ]
}
```

### Zed

Add to your Zed settings or project `.zed/settings.json`:

```json
{
  "context_servers": {
    "helixir": {
      "command": {
        "path": "npx",
        "args": ["helixir"],
        "env": {
          "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
        }
      }
    }
  }
}
```

---

## Step 4 — Run Your First Component Audit

Once HELiXiR is connected to your IDE, you can audit component health instantly.

### Audit a single component

Ask your AI assistant:

> "Score the health of hx-button"

Or call the tool directly:

```
score_component({ tagName: "hx-button" })
```

**Example response:**

```
hx-button — Grade: B (74/100)

Dimension Scores:
  ✓ CEM Completeness:     88/100  (Critical)
  ✓ Type Coverage:        95/100  (Critical)
  ✗ Accessibility:        62/100  (Critical) ← needs attention
  ✓ Test Coverage:        80/100  (Critical)
  ✓ CEM-Source Fidelity:  92/100  (Critical)
  ✓ API Surface Quality:  85/100  (Important)
  ...

Issues:
  - Missing aria-label support on interactive variant
  - No keyboard event documentation for Enter/Space
```

The 14 quality dimensions are weighted by tier (Critical, Important, Advanced). Fix Critical issues first — they have the most impact on the score.

### Audit all components

```
score_all_components()
get_health_summary()
```

**Example summary response:**

```
Library Health Summary — 42 components

Average score:  71/100  (Grade: C)
Grade distribution:
  A (90-100): 3 components
  B (75-89):  12 components
  C (60-74):  18 components
  D (40-59):  7 components
  F (<40):    2 components

Top issues across library:
  - Accessibility: 28 components missing keyboard event docs
  - Story Coverage: 15 components have no Storybook stories
```

### Check accessibility specifically

```
analyze_accessibility({ tagName: "hx-button" })
```

Returns ARIA roles, keyboard events, focus management signals, and label support — matched against the component's source code.

### Track health over time

After running audits on multiple days, view the trend:

```
get_health_trend({ tagName: "hx-button" })
```

Health snapshots are stored in `healthHistoryDir` (`.mcp-wc/health/` by default) as JSON files. Each `score_component` call writes a snapshot with a timestamp.

### Detect breaking changes before a release

```
check_breaking_changes({ baseBranch: "main" })
```

Scans all components in the current branch against the base branch CEM and flags:
- Removed attributes
- Changed types
- Renamed events
- Removed slots or CSS parts

Run this as a PR check to catch API regressions before they reach consumers.

---

## Step 5 — Scaffold Your First Component

The `scaffold_component` tool generates a complete, Helix-pattern component skeleton — source, stories, and tests — wired correctly from the start.

Ask your AI assistant:

> "Scaffold a new component called hx-status-badge that shows a status label with a color indicator"

Or call directly:

```
scaffold_component({
  tagName: "hx-status-badge",
  description: "Displays a status label with a colored indicator dot"
})
```

**Generated files:**

```
src/components/hx-status-badge/
├── hx-status-badge.ts          ← Lit component with CEM-compatible JSDoc
├── hx-status-badge.stories.ts  ← Storybook CSF3 stories
└── hx-status-badge.test.ts     ← Vitest unit tests
```

**After scaffolding, regenerate the CEM:**

```bash
npm run analyze:cem
# or
npx cem analyze --litelement --globs 'src/**/*.ts'
```

**Verify the component was picked up:**

```
get_component({ tagName: "hx-status-badge" })
```

If it returns the component metadata, the CEM is current and HELiXiR is tracking the new component. If it returns "not found", the CEM hasn't been regenerated — run `analyze:cem` again.

**Why regenerate the CEM?**

The CEM is generated from source file JSDoc annotations. HELiXiR reads the CEM, not the source files directly. If you skip regeneration, HELiXiR won't know about the new component.

**Enable watch mode to skip manual regeneration during development:**

```json
{
  "watch": true
}
```

With `watch: true`, HELiXiR monitors `cemPath` and reloads automatically when the file changes. Pair this with a file watcher that regenerates the CEM on save:

```json
// package.json
"scripts": {
  "dev": "concurrently \"npm run analyze:cem --watch\" \"npm run storybook\""
}
```

---

## Step 6 — Create Your First Theme

HELiXiR's theming tools work with design token JSON files. Tokens must follow W3C DTCG format or be compatible with Style Dictionary / Theo.

### Create a theme

```
create_theme({
  themeName: "brand-light",
  baseTokens: {
    "--hx-color-primary": "#1a56db",
    "--hx-color-primary-hover": "#1e429f",
    "--hx-color-surface": "#ffffff",
    "--hx-color-surface-secondary": "#f8fafc",
    "--hx-color-text": "#0f172a",
    "--hx-color-text-secondary": "#475569",
    "--hx-color-border": "#e2e8f0",
    "--hx-radius-md": "0.5rem",
    "--hx-spacing-md": "1rem"
  }
})
```

This generates a CSS file and a token JSON file that can be loaded as a theme.

### Update token values in an existing theme

```
apply_theme_tokens({
  themeName: "brand-light",
  tokens: {
    "--hx-color-primary": "#2563eb",
    "--hx-color-primary-hover": "#1d4ed8"
  }
})
```

This patches only the specified tokens without affecting the rest of the theme.

### Create a dark theme variant

```
create_theme({
  themeName: "brand-dark",
  baseTokens: {
    "--hx-color-primary": "#60a5fa",
    "--hx-color-primary-hover": "#93c5fd",
    "--hx-color-surface": "#0f172a",
    "--hx-color-surface-secondary": "#1e293b",
    "--hx-color-text": "#f1f5f9",
    "--hx-color-text-secondary": "#94a3b8",
    "--hx-color-border": "#334155"
  }
})
```

### Discover token usage before changing a token

Before changing a token value, find out which components will be affected:

```
find_components_using_token({ tokenName: "--hx-color-primary" })
```

**Example response:**

```
Components using --hx-color-primary (14 components):
  hx-button       — used in: background, border-color
  hx-badge        — used in: background
  hx-link         — used in: color, text-decoration-color
  hx-input        — used in: focus ring, border-color (focus state)
  ... and 10 more
```

This gives you a pre-change impact analysis with zero manual code searching.

### Browse all design tokens

```
get_design_tokens()
# filter by category:
get_design_tokens({ category: "color" })
get_design_tokens({ category: "spacing" })
get_design_tokens({ category: "typography" })
```

```
find_token({ query: "primary" })
# Returns all tokens whose name or value matches "primary"
```

---

## CI Integration

Add HELiXiR health checks to your CI pipeline to catch quality regressions before they merge.

### GitHub Actions — health gate

```yaml
# .github/workflows/component-health.yml
name: Component Health Check

on:
  pull_request:
    branches: [main, dev]

jobs:
  health-check:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Regenerate CEM
        run: npm run analyze:cem

      - name: Run HELiXiR health summary
        run: npx helixir get_health_summary
        env:
          MCP_WC_PROJECT_ROOT: ${{ github.workspace }}/packages/web-components
```

### GitHub Actions — breaking change detection

```yaml
      - name: Check for breaking changes
        run: npx helixir check_breaking_changes --baseBranch main
        env:
          MCP_WC_PROJECT_ROOT: ${{ github.workspace }}/packages/web-components
```

This runs the breaking-change scanner against `main` on every PR. If an attribute is removed, a type changes, or an event is renamed, the step fails with a detailed report.

### Keeping the CEM current in CI

The CEM must be regenerated before running HELiXiR health checks. Add `analyze:cem` as a pre-build step:

```json
// package.json
"scripts": {
  "analyze:cem": "cem analyze --litelement --globs 'src/**/*.ts'",
  "build": "npm run analyze:cem && tsc && ..."
}
```

Or run it explicitly in CI before the health check step:

```yaml
- name: Regenerate CEM
  run: npm run analyze:cem
```

---

## Troubleshooting

### No components found

**Symptom:** `list_components` returns an empty list or zero components.

**Causes and fixes:**

1. **Wrong `cemPath`** — verify the path is correct relative to `projectRoot`:
   ```bash
   cat mcpwc.config.json
   ls -la /path/to/your/library/custom-elements.json
   ```

2. **CEM is empty or malformed** — check the file has content:
   ```bash
   cat custom-elements.json | head -30
   # Should show: {"schemaVersion":"2.0.0","modules":[...]}
   ```

3. **CEM not regenerated after adding components** — run:
   ```bash
   npm run analyze:cem
   ```

4. **Wrong `componentPrefix`** — if you set `componentPrefix: "hx-"` but components use `"ds-"`, no matches will be found. Either correct the prefix or clear it (`""`) to match all components.

5. **Monorepo root vs package root** — if `projectRoot` points to the monorepo root but `custom-elements.json` is in `packages/web-components/`, set `projectRoot` to `packages/web-components/`.

---

### Server not appearing in IDE

**Symptom:** The IDE doesn't show `helixir` in the MCP server list, or shows it as disconnected/errored.

**Causes and fixes:**

1. **Relative vs absolute path** — `MCP_WC_PROJECT_ROOT` must be an absolute path:
   ```json
   // WRONG
   "MCP_WC_PROJECT_ROOT": "./packages/web-components"

   // CORRECT
   "MCP_WC_PROJECT_ROOT": "/Users/you/your-repo/packages/web-components"
   ```

2. **`helixir` not installed** — verify:
   ```bash
   npx helixir --version
   ```
   If it fails, run `npm install helixir` in the component library.

3. **`mcpwc.config.json` missing** — the server looks for this file at `projectRoot`:
   ```bash
   ls /path/to/your/library/mcpwc.config.json
   ```
   If missing, run `npx helixir init` in the library root.

4. **IDE needs a restart** — most IDEs cache MCP server configs. After any change to MCP config files, fully restart the IDE.

5. **Port conflict (Claude Desktop)** — if another process is using the MCP port, Claude Desktop may fail to start the server. Restart Claude Desktop.

---

### Health scores seem inaccurate

**Symptom:** Scores are unexpectedly high or low, or don't reflect recent changes.

**Causes and fixes:**

1. **Stale CEM** — the most common cause. Regenerate from source:
   ```bash
   npm run analyze:cem
   stat custom-elements.json  # check the modification timestamp
   ```

2. **Watch mode not enabled** — during active development, enable CEM auto-reload:
   ```json
   { "watch": true }
   ```

3. **Source files not matching CEM glob** — if your CEM analyzer is configured to scan a subset of files, newly added components may be missed. Check `custom-elements-manifest.config.cjs` and ensure the globs cover all source files.

---

### Token tools return "tokensPath not configured"

**Symptom:** `get_design_tokens` or `find_token` returns an error about `tokensPath`.

**Fix:** Set `tokensPath` in `mcpwc.config.json` to the path of your tokens JSON file:

```json
{
  "tokensPath": "dist/tokens/tokens.json"
}
```

The tokens file must be in W3C DTCG format:

```json
{
  "color": {
    "primary": {
      "$value": "#1a56db",
      "$type": "color"
    }
  }
}
```

Style Dictionary and Theo output formats are also supported. If your tokens are in a different format, run a transform step to produce DTCG JSON before pointing HELiXiR at it.

---

### scaffold_component generates files in the wrong location

**Symptom:** Scaffolded files appear at the repo root instead of inside your component source directory.

**Fix:** The scaffold uses `projectRoot` + a standard `src/components/` path. If your components live elsewhere (e.g. `packages/web-components/src/components/`), ensure `projectRoot` points to the package, not the repo root:

```json
{
  "projectRoot": "/absolute/path/to/repo/packages/web-components"
}
```

---

### Breaking change scanner reports false positives

**Symptom:** `check_breaking_changes` reports removals or type changes that don't exist in your code.

**Cause:** The scanner compares the current CEM against the base branch CEM. If the base branch CEM was committed in a stale state (not regenerated after the last code change), the diff will show phantom changes.

**Fix:** Ensure CEM generation is part of the CI build on your base branch:

```yaml
# In your base branch CI:
- name: Regenerate CEM
  run: npm run analyze:cem

- name: Commit updated CEM
  run: |
    git add custom-elements.json
    git diff --cached --quiet || git commit -m "chore: update CEM"
```

---

### TypeScript diagnostics tools return no results

**Symptom:** `get_file_diagnostics` or `get_project_diagnostics` returns empty or fails.

**Fix:** Verify `tsconfigPath` points to the correct TypeScript config:

```json
{
  "tsconfigPath": "tsconfig.json"
}
```

If you have separate build and editor tsconfigs, point to the build one:

```json
{
  "tsconfigPath": "tsconfig.build.json"
}
```

Ensure the tsconfig `include` or `files` array covers your source files.

---

## Getting Help

- **Issues and bug reports:** [github.com/bookedsolidtech/helixir/issues](https://github.com/bookedsolidtech/helixir/issues)
- **Contributing:** See [CONTRIBUTING.md](../CONTRIBUTING.md) in the repository root
- **Security vulnerabilities:** See [SECURITY.md](../SECURITY.md)
- **Changelog:** See [CHANGELOG.md](../CHANGELOG.md) for version history and migration notes
