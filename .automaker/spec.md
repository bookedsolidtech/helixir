# wc-tools — Project Specification

## What It Is

`wc-tools` is a single, self-contained MCP (Model Context Protocol) server that gives AI coding assistants full situational awareness of any web component library.

**Framework-agnostic.** Works with Lit, Stencil, FAST, hand-coded JS, or any library that generates a Custom Elements Manifest (CEM). This is THE goto tool for anyone working with web components.

**Tagline:** *Give Claude eyes into your design system.*

**npm package:** `wc-tools`
**GitHub:** `git@github.com:bookedsolidtech/wc-tools.git`

## OSS Context
- Priority #2 in Clarity House / ProtoLabs OSS strategy
- Projected 2,000–6,000 GitHub stars in 12 months
- Category: MCP Servers (hottest OSS category in 2025/2026)
- Niche: Web component tooling for AI assistants — currently unoccupied
- Target communities: Lit Discord, Web Components Community Group, awesome-mcp-servers

## Architecture
- **Single server** with 16 tools in 6 groups
- **Config system:** env vars (`MCP_WC_*`) → `mcpwc.config.json` → defaults
- **No LLM calls** — all analysis is deterministic
- **stdio transport** only (standard MCP pattern)
- **ESM-only** Node.js package
- **NOT a monorepo** — single package, single tsconfig, tsc only build

## Tech Stack
| Concern | Choice |
|---------|--------|
| Language | TypeScript 5.7 strict |
| Runtime | Node.js ≥20 |
| MCP SDK | `@modelcontextprotocol/sdk` ^1.26.0 |
| Validation | `zod` ^3.22.0 |
| Build | `tsc` only (no bundler) |
| Testing | `vitest` ^3 + `@vitest/coverage-v8` |
| Module format | ESM (`"type": "module"`) |
| Package manager | pnpm |
| Publish | npm (`wc-tools`) |

## Tool Groups (16 tools total)
1. **Discovery** — `list_components`, `find_component`, `get_library_summary`
2. **Component API** — `get_component`, `validate_cem`, `suggest_usage`, `generate_import`
3. **Health Scoring** — `score_component`, `score_all_components`, `get_health_trend`, `get_health_diff`
4. **Safety** — `diff_cem`, `check_breaking_changes`
5. **Design Tokens** — `get_design_tokens`, `find_token` (optional — only when `tokensPath` configured)
6. **TypeScript Diagnostics** — `get_file_diagnostics`, `get_project_diagnostics`

## Implementation Order (planning.md Section 14)
1. Scaffold — package.json, tsconfig.json, vitest.config.ts, entry point stub
2. Test fixtures — synthetic CEM, tokens, health history JSON
3. Shared utilities — git, file-ops, error-handling, mcp-helpers, validation
4. Config system — src/config.ts
5. CEM handler + tests — critical path, 100% coverage target
6. Discovery + Component tools
7. Safety tools
8. Health handler + tests
9. Health tools
10. Token handler + tools
11. TypeScript diagnostics handler + tools
12. Wire up single server dispatcher
13. README + CHANGELOG + example configs
14. npm pack dry run + tarball audit
15. Smoke test with a real WC project
16. npm publish v0.1.0

## Key Design Principles
- **Framework-agnostic** — the only contract is the CEM schema. Works with any WC library.
- **No tag prefix assumptions** — `componentPrefix` defaults to empty string (accept any tag name)
- **Configurable paths** — no hardcoded project structure assumptions
- **Deterministic** — no LLM calls, no randomness, same input always produces same output
- **Minimal deps** — runtime deps are `@modelcontextprotocol/sdk` and `zod` only
