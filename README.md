# HELiXiR

> Give AI agents full situational awareness of any web component library.

[![npm version](https://img.shields.io/npm/v/helixir)](https://www.npmjs.com/package/helixir)
[![npm downloads](https://img.shields.io/npm/dw/helixir)](https://www.npmjs.com/package/helixir)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Build](https://img.shields.io/github/actions/workflow/status/bookedsolidtech/helixir/build.yml?branch=main&label=build)](https://github.com/bookedsolidtech/helixir/actions/workflows/build.yml)
[![Tests](https://img.shields.io/github/actions/workflow/status/bookedsolidtech/helixir/test.yml?branch=main&label=tests)](https://github.com/bookedsolidtech/helixir/actions/workflows/test.yml)

---

## Quick Start

**Under 60 seconds from zero to a component-aware AI agent.**

```bash
# 1. Install globally (or use npx — no install required)
npm install -g helixir

# 2. Generate a starter config in your component library
npx helixir init
# → writes mcpwc.config.json to the current directory
```

Edit `mcpwc.config.json` to point at your library:

```json
{
  "cemPath": "custom-elements.json",
  "projectRoot": "/absolute/path/to/your/component-library",
  "componentPrefix": "sl-",
  "tokensPath": "dist/tokens/tokens.json"
}
```

Add HELiXiR to your Claude Desktop config (see [AI Tool Configs](#ai-tool-configs) for other editors):

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

Restart Claude Desktop. Done — your AI agent now knows every property, event, slot, CSS part, and design token in your library.

---

## What You Get

### Without HELiXiR

> **You:** How do I use sl-button?
>
> **Claude:** You can use `<sl-button>` like this:
>
> ```html
> <sl-button type="primary" color="blue" rounded>Click me</sl-button>
> ```
>
> It supports `type`, `color`, `rounded`, `icon`, and `label` attributes.

**All of that is hallucinated.** `type`, `color`, `rounded`, `icon`, and `label` are not real attributes on `sl-button`. The correct attribute for the visual style is `variant`, and `rounded` doesn't exist at all.

---

### With HELiXiR

> **You:** How do I use sl-button?
>
> **Claude:** _(calls `get_component` → `sl-button`)_ Here's the accurate API for `<sl-button>`:
>
> **Attributes:**
>
> - `variant` — `'default' | 'primary' | 'success' | 'neutral' | 'warning' | 'danger' | 'text'` (default: `'default'`)
> - `size` — `'small' | 'medium' | 'large'` (default: `'medium'`)
> - `disabled` — `boolean` (default: `false`)
> - `loading` — `boolean` — Draws the button in a loading state
> - `outline` — `boolean` — Draws an outlined button
> - `pill` — `boolean` — Draws a pill-style button with rounded edges
> - `href` — `string | undefined` — Renders as `<a>` when set
>
> **Slots:** default (button label), `prefix` (before label), `suffix` (after label)
>
> **Events:** `sl-blur`, `sl-focus`, `sl-invalid`
>
> **Example:**
>
> ```html
> <sl-button variant="primary" size="medium">Save changes</sl-button>
> ```

**Every property, event, slot, CSS part, and design token — sourced directly from your Custom Elements Manifest. No hallucinations.**

---

## Framework Setup

HELiXiR works with any toolchain that produces a [`custom-elements.json`](https://github.com/webcomponents/custom-elements-manifest) (CEM). Below are quick-start setups for the most common frameworks.

### Shoelace

Shoelace ships `custom-elements.json` inside its npm package. No build step needed.

```bash
npm install @shoelace-style/shoelace
```

```json
{
  "cemPath": "node_modules/@shoelace-style/shoelace/dist/custom-elements.json",
  "componentPrefix": "sl-"
}
```

### Lit

Use the official CEM analyzer with the Lit plugin:

```bash
npm install -D @custom-elements-manifest/analyzer
```

```json
// package.json scripts
"analyze": "cem analyze --litelement --globs 'src/**/*.ts'"
```

```json
{
  "cemPath": "custom-elements.json",
  "componentPrefix": "my-"
}
```

Run `npm run analyze` after each build to keep the CEM current.

### Stencil

Enable CEM output in `stencil.config.ts`:

```ts
// stencil.config.ts
import { Config } from '@stencil/core';

export const config: Config = {
  outputTargets: [{ type: 'docs-custom' }, { type: 'dist-custom-elements' }],
};
```

Stencil emits `custom-elements.json` to your `dist/` folder:

```json
{
  "cemPath": "dist/custom-elements/custom-elements.json",
  "componentPrefix": "my-"
}
```

### FAST

FAST components ship with CEM support via the `@custom-elements-manifest/analyzer`:

```bash
npm install -D @custom-elements-manifest/analyzer
```

```json
// package.json scripts
"analyze": "cem analyze --globs 'src/**/*.ts'"
```

```json
{
  "cemPath": "custom-elements.json",
  "componentPrefix": "fluent-"
}
```

### Adobe Spectrum Web Components

Spectrum Web Components use Stencil under the hood and ship their CEM in the package:

```bash
npm install @spectrum-web-components/bundle
```

```json
{
  "cemPath": "node_modules/@spectrum-web-components/bundle/custom-elements.json",
  "componentPrefix": "sp-"
}
```

### Polymer / Generic Web Components

Any project can add CEM generation with the analyzer:

```bash
npm install -D @custom-elements-manifest/analyzer
```

```json
// package.json scripts
"analyze": "cem analyze --globs 'src/**/*.js'"
```

```json
{
  "cemPath": "custom-elements.json"
}
```

---

## Tools Reference

All tools are exposed over the [Model Context Protocol](https://modelcontextprotocol.io). Your AI agent can call any of these tools by name.

### Discovery

| Tool                          | Description                                                                          | Required Args          |
| ----------------------------- | ------------------------------------------------------------------------------------ | ---------------------- |
| `list_components`             | List all custom elements registered in the CEM                                       | —                      |
| `find_component`              | Semantic search for components by name, description, or member names (top 3 matches) | `query`                |
| `get_library_summary`         | Overview of the library: component count, average health score, grade distribution   | —                      |
| `list_events`                 | List all events across the library, optionally filtered by component                 | `tagName` _(optional)_ |
| `list_slots`                  | List all slots across the library, optionally filtered by component                  | `tagName` _(optional)_ |
| `list_css_parts`              | List all CSS `::part()` targets across the library, optionally filtered by component | `tagName` _(optional)_ |
| `list_components_by_category` | Group components by functional category (form, navigation, feedback, layout, etc.)   | —                      |

### Component

| Tool                          | Description                                                                                           | Required Args              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------- |
| `get_component`               | Full metadata for a component: members, events, slots, CSS parts, CSS properties                      | `tagName`                  |
| `validate_cem`                | Validate CEM documentation completeness; returns score (0–100) and issues list                        | `tagName`                  |
| `suggest_usage`               | Generate an HTML snippet showing key attributes with their defaults and variant options               | `tagName`                  |
| `generate_import`             | Generate side-effect and named import statements from CEM exports                                     | `tagName`                  |
| `get_component_narrative`     | 3–5 paragraph markdown prose description of a component optimized for LLM comprehension               | `tagName`                  |
| `get_prop_constraints`        | Structured constraint table for an attribute: union values with descriptions, or simple type info     | `tagName`, `attributeName` |
| `find_components_by_token`    | Find all components that expose a given CSS custom property token                                     | `tokenName`                |
| `find_components_using_token` | Find all components referencing a token in their `cssProperties` (works without `tokensPath`)         | `tokenName`                |
| `get_component_dependencies`  | Dependency graph for a component: direct and transitive dependencies from CEM reference data          | `tagName`                  |
| `validate_usage`              | Validate a proposed HTML snippet against the CEM spec: unknown attrs, bad slot names, enum mismatches | `tagName`, `html`          |

### Composition

| Tool                      | Description                                                                                      | Required Args |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------- |
| `get_composition_example` | Realistic HTML snippet showing how to compose 1–4 components together using their slot structure | `tagNames`    |

### Health

| Tool                    | Description                                                                         | Required Args          |
| ----------------------- | ----------------------------------------------------------------------------------- | ---------------------- |
| `score_component`       | Latest health score for a component: grade (A–F), dimension scores, and issues      | `tagName`              |
| `score_all_components`  | Health scores for every component in the library                                    | —                      |
| `get_health_trend`      | Health trend for a component over the last N days with trend direction              | `tagName`              |
| `get_health_diff`       | Before/after health comparison between current branch and a base branch             | `tagName`              |
| `get_health_summary`    | Aggregate health stats for all components: average score, grade distribution        | —                      |
| `analyze_accessibility` | Accessibility profile: ARIA roles, keyboard events, focus management, label support | `tagName` _(optional)_ |

### Library

| Tool             | Description                                                              | Required Args |
| ---------------- | ------------------------------------------------------------------------ | ------------- |
| `load_library`   | Load an additional web component library by npm package name or CEM path | `libraryId`   |
| `list_libraries` | List all currently loaded web component libraries                        | —             |
| `unload_library` | Remove a loaded library from memory                                      | `libraryId`   |

### Safety

| Tool                     | Description                                                                        | Required Args           |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------------------- |
| `diff_cem`               | Per-component CEM diff between branches; highlights breaking changes and additions | `tagName`, `baseBranch` |
| `check_breaking_changes` | Breaking-change scan across all components vs. a base branch with summary report   | `baseBranch`            |

### Framework

| Tool               | Description                                                                               | Required Args |
| ------------------ | ----------------------------------------------------------------------------------------- | ------------- |
| `detect_framework` | Identifies the web component framework in use from package.json, CEM metadata, and config | —             |

### TypeScript

| Tool                      | Description                                               | Required Args |
| ------------------------- | --------------------------------------------------------- | ------------- |
| `get_file_diagnostics`    | TypeScript diagnostics for a single file                  | `filePath`    |
| `get_project_diagnostics` | Full TypeScript diagnostic pass across the entire project | —             |

### Story

| Tool             | Description                                                                        | Required Args |
| ---------------- | ---------------------------------------------------------------------------------- | ------------- |
| `generate_story` | Generates a Storybook CSF3 story file for a component based on its CEM declaration | `tagName`     |

### Bundle

| Tool                   | Description                                                                                 | Required Args |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| `estimate_bundle_size` | Estimates minified + gzipped bundle size for a component's npm package via bundlephobia/npm | `tagName`     |

### Benchmark

| Tool                  | Description                                                                                                                  | Required Args |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `benchmark_libraries` | Compare 2–10 web component libraries by health score, documentation quality, and API surface; returns a weighted score table | `libraries`   |

### CDN

| Tool              | Description                                                                                           | Required Args |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| `resolve_cdn_cem` | Fetch and cache a library's CEM from jsDelivr or UNPKG by npm package name (for CDN-loaded libraries) | `package`     |

### Tokens

_(Requires `tokensPath` to be configured)_

| Tool                | Description                                                                           | Required Args |
| ------------------- | ------------------------------------------------------------------------------------- | ------------- |
| `get_design_tokens` | List all design tokens, optionally filtered by category (e.g. `"color"`, `"spacing"`) | —             |
| `find_token`        | Search for a design token by name or value (case-insensitive substring match)         | `query`       |

---

## Configuration

Configuration is resolved in priority order: **environment variables > `mcpwc.config.json` > defaults**.

### `mcpwc.config.json`

Place this file at the root of your component library project (or wherever `MCP_WC_PROJECT_ROOT` points).

| Key                | Type             | Default                  | Description                                                                                                                                                                                                                                                           |
| ------------------ | ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cemPath`          | `string`         | `"custom-elements.json"` | Path to the Custom Elements Manifest, relative to `projectRoot`. Auto-discovered if omitted.                                                                                                                                                                          |
| `projectRoot`      | `string`         | `process.cwd()`          | Absolute path to the component library project root.                                                                                                                                                                                                                  |
| `componentPrefix`  | `string`         | `""`                     | Optional tag-name prefix (e.g. `"sl-"`) to scope component discovery.                                                                                                                                                                                                 |
| `healthHistoryDir` | `string`         | `".mcp-wc/health"`       | Directory where health snapshots are stored, relative to `projectRoot`.                                                                                                                                                                                               |
| `tsconfigPath`     | `string`         | `"tsconfig.json"`        | Path to the project's `tsconfig.json`, relative to `projectRoot`.                                                                                                                                                                                                     |
| `tokensPath`       | `string \| null` | `null`                   | Path to a design tokens JSON file. Set to `null` to disable token tools.                                                                                                                                                                                              |
| `cdnBase`          | `string \| null` | `null`                   | Base URL prepended to component paths when generating CDN `<script>` and `<link>` tags in `suggest_usage` output (e.g. `"https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn"`). Does not affect `resolve_cdn_cem`. Set to `null` to disable CDN suggestions. |
| `watch`            | `boolean`        | `false`                  | When `true`, HELiXiR automatically reloads the CEM on file changes.                                                                                                                                                                                                   |

**Full example:**

```json
{
  "cemPath": "dist/custom-elements.json",
  "projectRoot": "/home/user/my-design-system",
  "componentPrefix": "ds-",
  "healthHistoryDir": ".mcp-wc/health",
  "tsconfigPath": "tsconfig.build.json",
  "tokensPath": "dist/tokens/tokens.json",
  "cdnBase": "https://cdn.jsdelivr.net/npm"
}
```

### Environment Variables

Environment variables override all config file values. Useful for CI or when pointing the same server at different libraries.

| Variable                    | Overrides          |
| --------------------------- | ------------------ |
| `MCP_WC_PROJECT_ROOT`       | `projectRoot`      |
| `MCP_WC_CEM_PATH`           | `cemPath`          |
| `MCP_WC_COMPONENT_PREFIX`   | `componentPrefix`  |
| `MCP_WC_HEALTH_HISTORY_DIR` | `healthHistoryDir` |
| `MCP_WC_TSCONFIG_PATH`      | `tsconfigPath`     |
| `MCP_WC_TOKENS_PATH`        | `tokensPath`       |
| `MCP_WC_CDN_BASE`           | `cdnBase`          |

Set `MCP_WC_TOKENS_PATH=null` (the string `"null"`) to explicitly disable token tools via env var.

See [`mcpwc.config.json.example`](./mcpwc.config.json.example) for a ready-to-copy template.

---

## AI Tool Configs

### Claude Code (CLI)

Add to `.mcp.json` in your project root (project-scoped) or `~/.claude.json` (global):

**Option 1 — Install from npm (recommended)**

```bash
npx helixir init  # generates mcpwc.config.json in your project root
```

Then add to `.mcp.json`:

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

**Option 2 — Install from local clone (development)**

```bash
git clone https://github.com/bookedsolidtech/helixir.git
cd helixir
pnpm install
pnpm build
```

Then add to `.mcp.json`:

```json
{
  "mcpServers": {
    "helixir": {
      "command": "node",
      "args": ["/absolute/path/to/helixir/build/index.js"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  }
}
```

Reload Claude Code after saving (`:mcp` to verify the server appears).

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop after saving.

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

### VS Code (Cline / Continue)

**Cline** — add to `.vscode/cline_mcp_settings.json`:

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

**Continue** — add to `~/.continue/config.json` under `mcpServers`:

```json
{
  "mcpServers": [
    {
      "name": "helixir",
      "command": "npx helixir",
      "env": {
        "MCP_WC_PROJECT_ROOT": "/absolute/path/to/your/component-library"
      }
    }
  ]
}
```

### Zed

Add to your Zed settings (`~/.config/zed/settings.json`):

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

## Security

HELiXiR applies defense-in-depth on all inputs that touch the file system or network:

- **Path containment** — all file paths are resolved and verified to stay within `projectRoot`; `..` traversals and absolute paths outside the root are rejected.
- **Input validation** — every tool argument is validated with [Zod](https://zod.dev) schemas before reaching handler code; unknown properties are rejected via `additionalProperties: false`.
- **CDN safety** — `resolve_cdn_cem` only fetches from allowlisted CDN origins (jsDelivr, UNPKG); arbitrary URLs are not accepted.
- **No shell execution** — the server never spawns subprocesses based on user input; TypeScript diagnostics use the TS compiler API in-process.

See [`SECURITY.md`](./SECURITY.md) for the vulnerability disclosure policy.

---

## Quality Gates

Every pull request must pass all five CI checks before merge:

| Workflow     | What it checks                                      |
| ------------ | --------------------------------------------------- |
| **build**    | TypeScript type-check + `tsc` compile on Node 20/22 |
| **test**     | Full vitest suite with coverage on Node 20/22       |
| **lint**     | ESLint (TypeScript + Prettier compatibility rules)  |
| **format**   | Prettier formatting check                           |
| **security** | `pnpm audit --audit-level=high`                     |

**Pre-commit hooks** (via [husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged)):

- TypeScript/JavaScript files: ESLint auto-fix → Prettier format
- JSON/CSS/Markdown/YAML files: Prettier format
- Commit messages: validated by [commitlint](https://commitlint.js.org) against conventional-commits format

**Allowed commit types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `audit`

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`LOCAL.md`](./LOCAL.md) for full setup details.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

Quick steps:

1. Fork the repo and create a feature branch.
2. Run `pnpm install` to install dependencies.
3. Make your changes in `src/`.
4. Run `pnpm test` to ensure all tests pass.
5. Run `pnpm run lint && pnpm run format:check` before submitting.
6. Open a pull request with a clear description of the change.

Issues and feature requests are welcome on GitHub.

---

## License

MIT © Jake Strawn
