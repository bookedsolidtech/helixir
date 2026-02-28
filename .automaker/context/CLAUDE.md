# wc-mcp — Agent Context

## What This Is
An OSS MCP server that gives AI coding assistants full situational awareness of any web component library. Framework-agnostic — works with Lit, Stencil, FAST, hand-coded JS, or any library that generates a Custom Elements Manifest (CEM). Single package, 16 tools, 6 handler groups. Published to npm as `wc-mcp`.

## Common Commands

```bash
pnpm install             # Install dependencies
pnpm build               # tsc && chmod 755 build/index.js
pnpm test                # vitest run
pnpm test:watch          # vitest
pnpm type-check          # tsc --noEmit
pnpm format:check        # prettier --check .
pnpm lint                # eslint src tests
```

## Architecture: Critical Rules

**Single dispatcher** — ONE `ListToolsRequestSchema` handler, ONE `CallToolRequestSchema` handler in `src/index.ts`. Each `src/tools/*.ts` exports `getTools()` and `handleCall()`. Never register multiple handlers for the same schema type.

**Config over hardcoding** — Every path and prefix goes through `McpWcConfig`. No tag name prefixes hardcoded. No hardcoded paths. The tool must work equally well for `hx-button`, `sl-button`, `my-button`, or `button`.

**ESM everywhere** — All imports use `.js` extensions. `"type": "module"` in package.json.

**Path security** — Every external file path input goes through `FilePathSchema` before use. No exceptions.

**No framework assumptions** — Handlers must not assume Lit, Stencil, or any specific framework. The only contract is the CEM schema (custom-elements.json). Any library that produces a valid CEM works.

## TDD Mandate — Non-Negotiable

**Write the test file before the handler file. Every time. No exceptions.**

Order for every handler:
1. Write `tests/handlers/{name}.test.ts` with failing tests against fixture data
2. Run `pnpm test` — confirm red
3. Write `src/handlers/{name}.ts` with minimal implementation
4. Run `pnpm test` — confirm green
5. Refactor if needed, keep green

Coverage targets: `handlers/cem.ts` = 100%. All other handlers = 90%+. Tools layer = 80%+.

## Module Structure

```
src/
├── index.ts          # Entry point + dispatcher ONLY
├── config.ts         # Config loading
├── shared/           # Utility classes (git, file-ops, errors, validation)
├── handlers/         # Business logic — tested in isolation
└── tools/            # MCP tool registrations — call handlers
tests/
├── __fixtures__/     # Synthetic CEM, token, health JSON — the ground truth
├── handlers/         # Unit tests (read fixtures, call handler functions)
└── tools/            # Integration tests (verify tool output shape)
```

## Configuration System

All configuration goes through `McpWcConfig`. Priority: env vars → `mcpwc.config.json` → defaults.

| Config key | Env var | Default |
|---|---|---|
| `cemPath` | `MCP_WC_CEM_PATH` | `custom-elements.json` |
| `projectRoot` | `MCP_WC_PROJECT_ROOT` | `process.cwd()` |
| `componentPrefix` | `MCP_WC_COMPONENT_PREFIX` | `""` (any prefix) |
| `healthHistoryDir` | `MCP_WC_HEALTH_HISTORY_DIR` | `.mcp-wc/health` |
| `tokensPath` | `MCP_WC_TOKENS_PATH` | `null` (token tools disabled) |
| `tsconfigPath` | `MCP_WC_TSCONFIG_PATH` | `tsconfig.json` |

## Test Fixtures

Fixtures live in `tests/__fixtures__/`. They are synthetic — hand-crafted to exercise all code paths. They do NOT copy from any specific project. Required files:
- `custom-elements.json` — valid CEM with 3 components covering: events, slots, CSS parts, CSS properties, complete docs, and intentionally incomplete docs (for validateCompleteness tests)
- `tokens.json` — W3C DTCG-format design tokens with color, spacing, typography categories
- `health-history/` — JSON score files for 2+ components covering trend and diff scenarios

## Shared Utilities (src/shared/)

Five utility modules:
- `git.ts` — `GitOperations` class: `withBranch(branch, fn)` checks out branch, runs fn, restores; `stash/unstash` helpers
- `file-ops.ts` — `SafeFileOperations`: `readJSON<T>(path, schema)` validates with Zod; `fileExists(path)`
- `error-handling.ts` — `MCPError` class, `ErrorCategory` enum, `handleToolError` wrapper
- `mcp-helpers.ts` — `createSuccessResponse(content)`, `createErrorResponse(message)`
- `validation.ts` — `TagNameSchema` factory (configurable prefix), `FilePathSchema` (blocks `..` and absolute paths)

## planning.md

The file `planning.md` in the repo root is the authoritative specification. When in doubt about tool behavior, input/output shapes, or implementation decisions — read it. It covers: all 16 tools with exact input/output types, the full config interface, repo structure, tech stack decisions, and implementation order.
