# Local Development Guide

This document covers how to set up and run `wc-mcp` locally for development and contribution.

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

# Run with coverage report
pnpm run test:coverage

# Watch mode
pnpm run test:watch
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
    "wc-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/wc-mcp/build/index.js"],
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

Run `wc-mcp init` to generate this file interactively.

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
