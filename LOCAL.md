# Local Development Guide

This document covers how to set up and run `wc-tools` locally for development and contribution.

## Prerequisites

- **Node.js** >= 20.0.0 (check your version with `node --version`)
- **pnpm** >= 9 (install with `npm install -g pnpm@latest`)

## Installation

```bash
pnpm install
```

## Build

Compiles TypeScript to `build/` and marks the entry point executable:

```bash
pnpm run build
```

To watch for changes during development:

```bash
pnpm run dev
```

## Running Tests

```bash
# Run all tests once
pnpm test

# Run with v8 coverage report (output in coverage/)
pnpm run test:coverage

# Watch mode — reruns on file changes
pnpm run test:watch
```

### Running Individual Test Suites

```bash
# Single test file
pnpm exec vitest run tests/handlers/health.test.ts

# All tests in a directory
pnpm exec vitest run tests/handlers/
pnpm exec vitest run tests/tools/

# Watch a specific file
pnpm exec vitest tests/handlers/health.test.ts

# Filter by test name pattern
pnpm exec vitest run --reporter=verbose -t "score_component"
```

## Linting and Formatting

```bash
# Check for lint errors
pnpm run lint

# Auto-fix lint errors
pnpm run lint:fix

# Check formatting (Prettier)
pnpm run format:check

# Auto-fix formatting
pnpm run format
```

## Running the MCP Server Locally

After building, wire the server into your MCP client by pointing it at the built entry point.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "wc-tools": {
      "command": "node",
      "args": ["/absolute/path/to/wc-tools/build/index.js"],
      "env": {
        "MCP_WC_CEM_PATH": "/path/to/your/custom-elements.json"
      }
    }
  }
}
```

### CLI (stdio mode)

```bash
MCP_WC_CEM_PATH=./custom-elements.json node build/index.js
```

## Config Options

The server resolves configuration in priority order: **env vars → `mcpwc.config.json` → defaults**.

### Environment Variables

| Variable                    | Default                | Description                                       |
| --------------------------- | ---------------------- | ------------------------------------------------- |
| `MCP_WC_CEM_PATH`           | `custom-elements.json` | Path to the Custom Elements Manifest file         |
| `MCP_WC_PROJECT_ROOT`       | `process.cwd()`        | Root directory for resolving relative paths       |
| `MCP_WC_COMPONENT_PREFIX`   | `""`                   | Prefix filter (e.g., `"sl-"` for Shoelace)        |
| `MCP_WC_HEALTH_HISTORY_DIR` | `.mcp-wc/health`       | Directory for health score history files          |
| `MCP_WC_TSCONFIG_PATH`      | `tsconfig.json`        | Path to tsconfig for TypeScript diagnostics tools |
| `MCP_WC_TOKENS_PATH`        | `null` (disabled)      | Path to design tokens JSON file (W3C DTCG format) |
| `MCP_WC_CDN_BASE`           | `null`                 | CDN base URL for `resolve_cdn_cem` tool           |

### `mcpwc.config.json`

Place `mcpwc.config.json` at your project root to configure the server without env vars:

```json
{
  "cemPath": "dist/custom-elements.json",
  "tokensPath": "tokens/tokens.json",
  "componentPrefix": "my-"
}
```

Run `wc-tools init` to generate this file interactively.

## Pre-Commit Hooks

`pnpm install` installs husky hooks automatically (via the `prepare` lifecycle script). Two hooks run on every commit:

**`pre-commit`** — runs lint-staged on staged files:

- `.ts`/`.js` files: ESLint auto-fix → Prettier format
- `.json`/`.css`/`.md`/`.yml` files: Prettier format

**`commit-msg`** — validates your commit message against conventional-commits format via commitlint.

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `audit`

Format: `<type>(<scope>): <description>` — max 120 chars. Example:

```
feat(health): add get_health_trend tool
fix(validation): reject path traversal in cemPath
```

### Bypassing Hooks in Emergencies

If you genuinely need to skip hooks (e.g., a WIP commit on a local branch), use:

```bash
git commit --no-verify -m "wip: emergency save"
```

**Do not use `--no-verify` on commits destined for `main`, `dev`, or `staging`** — the CI will catch what the hooks would have flagged, and the PR will fail.

## Project Structure

**`src/handlers/`** contains pure business logic functions — CEM parsing, health scoring, token lookup,
TypeScript diagnostics, and other domain operations. These are independently testable and have no MCP
dependencies.

**`src/tools/`** contains the MCP tool layer — each file exports `TOOL_DEFINITIONS` (the JSON schema
exposed to the AI), a `handleXxxCall(name, args, ...)` dispatcher, and an `isXxxTool(name)` predicate.
The dispatcher validates args with Zod and calls the appropriate handler function.

**`src/shared/`** contains utilities shared across the codebase: error handling, file operations, git
operations, MCP response helpers, and input validation.

**`tests/`** mirrors the `src/` structure. Fixtures live in `tests/__fixtures__/` and include a
synthetic CEM, design tokens, health history files, and fixture CEMs for real libraries (Carbon,
Ionic, Shoelace, Vaadin).
