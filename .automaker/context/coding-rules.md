# HELiXiR Coding Rules

## Language & Runtime
- TypeScript 5.7+ strict mode — no `any`, no implicit `any`
- Node.js ≥20, ESM-only (`"type": "module"` in package.json)
- All imports must use `.js` extensions (ESM requirement): `import { x } from './foo.js'`

## MCP Server Patterns
- Use `@modelcontextprotocol/sdk` ^1.26.0 — same version as Helix source
- Single consolidated `ListToolsRequestSchema` handler returns ALL tools from ALL groups
- Single `CallToolRequestSchema` handler dispatches to group handlers
- Never register multiple handlers for the same request type
- All tool inputs validated with Zod before processing

## Module Structure
- `src/index.ts` — entry point only, no business logic
- `src/config.ts` — config loading (env vars → mcpwc.config.json → defaults)
- `src/shared/` — ported utilities (git, file-ops, error-handling, mcp-helpers, validation)
- `src/handlers/` — business logic (cem, health, typescript, tokens, suggest)
- `src/tools/` — MCP tool registrations (discovery, component, health, safety, tokens, typescript)

## Configuration
- All config via `McpWcConfig` interface — never hardcode paths
- Config priority: env vars → mcpwc.config.json → defaults
- Env var prefix: `MCP_WC_*`
- Never hardcode `hx-` prefix — use configurable `componentPrefix`

## Validation & Security
- All file path inputs MUST go through `FilePathSchema` (blocks `..` and absolute paths)
- Use `SafeFileOperations.readJSON` with Zod schema for all JSON reads
- Never accept raw file paths without `FilePathSchema` validation

## Testing
- Vitest ^3, `@vitest/coverage-v8`
- Coverage thresholds: statements 80%, branches 75%, functions 90%, lines 80%
- `handlers/cem.ts`: target 100% coverage (critical path)
- Use `tests/__fixtures__/` for CEM and health JSON — no real component library needed
- Test file naming: `*.test.ts`

## Error Handling
- Use `MCPError` with `ErrorCategory` enum from `src/shared/error-handling.ts`
- Use `handleToolError` wrapper in all tool handlers
- Use `createSuccessResponse` / `createErrorResponse` from `src/shared/mcp-helpers.ts`

## Dependencies
- Runtime deps: `@modelcontextprotocol/sdk`, `zod` only
- No bundler — `tsc` only, output to `build/`
- No LLM calls — all analysis is deterministic
- No persistent database — filesystem only
- No HTTP transport — stdio only

## Git & PRs
- Branch from `dev`, standard merge commits only (squash and rebase merges are disabled on GitHub)
- Always use `gh pr merge --merge` — NEVER `--squash` or `--rebase`
- PR title: imperative, under 70 chars
- Never commit `build/` directory
- Never commit `node_modules/`
