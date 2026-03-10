# Senior Engineer Review: wc-mcp v0.2.0

**Date**: 2026-03-01
**Reviewer**: Senior Engineer Review (automated)
**Scope**: Full codebase audit — src/, tests/, config, CI
**Commit**: `0eff6b5` (HEAD of `main`)

---

## 1. Executive Summary

**Verdict: CONDITIONAL PASS**

The wc-mcp codebase is well-architected with strong security fundamentals, consistent error handling patterns, and 100% schema validation coverage across all 28 MCP tools. Two items block an unconditional PASS: 8 ESLint errors (non-null assertions and an unused variable) that fail `pnpm run lint`, and 1 failing integration test due to a server name mismatch (`helixir` vs `wc-mcp`). With these resolved, the codebase is ready for npm publish.

---

## 2. Code Quality

### TypeScript Strictness and Type Safety — PASS

- `tsc --noEmit` exits cleanly with zero errors
- No `any` types in public interfaces or tool dispatch paths
- Zod schemas enforce runtime type safety at all entry points
- Proper generics usage in `SafeFileOperations` and handler signatures
- `unknown` type correctly used at catch boundaries in `handleToolError()`

### Error Handling Completeness — PASS

- All 28 tools follow a consistent try/catch pattern:
  ```
  try { validate → execute → createSuccessResponse() }
  catch { handleToolError() → createErrorResponse() }
  ```
- `handleToolError()` covers `MCPError`, `Error`, and `unknown` types
- CDN handler includes 10-second `AbortController` timeout for network calls
- CEM parse errors caught at startup with descriptive stderr messages

### Edge Case Coverage — WARN

- `tokens.ts` handler throws generic `Error` instead of `MCPError` (loses error category)
- `handleToolError()` does not special-case `ZodError` — validation failures report as `[UNKNOWN]` instead of `[VALIDATION]`
- History directory access in discovery tools fails silently (acceptable, but not logged)
- Config file parse errors logged but do not include the parse error detail

### Code Consistency and Patterns — PASS

- 9 tool files, 14 handler files, 6 shared modules — all follow identical structural patterns
- Tool definitions: consistent `name`, `description`, `inputSchema` with `additionalProperties: false`
- Handler dispatch: consistent `isXTool()` → `handleXCall()` chain in `index.ts`
- JSON serialization: uniform `JSON.stringify(result, null, 2)` for success responses

---

## 3. Security

### Input Validation on All Tool Parameters — PASS

Every tool validates input via Zod `.parse()` before any business logic executes. 28/28 tools validated.

### Path Traversal Risks — PASS

Three-layer defense:
1. `FilePathSchema` in `src/shared/validation.ts` rejects `..` and absolute paths
2. Handler-level Zod schemas duplicate path traversal checks (defense in depth)
3. `SafeFileOperations` class wraps all file reads with schema validation

### Shell Injection Risks — PASS

- Git operations use `execFile()` with argument arrays (not `exec()` with string interpolation)
- No `eval()`, `Function()`, or dynamic code execution anywhere in codebase
- TypeScript loaded via safe `import()` call

### No Secrets or Credentials in Code — PASS

- All paths from config or validated input
- CDN URLs constructed from config (no API keys)
- No hardcoded tokens, passwords, or credentials

---

## 4. Test Coverage

### Diagnostic Output

**`pnpm run type-check`**: PASS (exit 0)

**`pnpm run lint`**: FAIL (8 errors)
```
src/handlers/cem.ts:118:27      — @typescript-eslint/no-non-null-assertion
src/handlers/compare.ts:171:31  — @typescript-eslint/no-non-null-assertion
src/handlers/compare.ts:171:62  — @typescript-eslint/no-non-null-assertion
src/handlers/compare.ts:173:20  — @typescript-eslint/no-non-null-assertion
src/handlers/compare.ts:175:20  — @typescript-eslint/no-non-null-assertion
src/handlers/story.ts:57:53     — @typescript-eslint/no-unused-vars ('format')
src/handlers/story.ts:69:23     — @typescript-eslint/no-non-null-assertion
src/handlers/story.ts:136:19    — @typescript-eslint/no-non-null-assertion
```

**`pnpm test`**: 564 passed, 1 failed (36 test files)
```
FAIL  tests/integration/server.test.ts
  — "responds to initialize with server info and capabilities"
  — Expected serverInfo.name: "wc-mcp"
  — Received serverInfo.name: "helixir"
```

**`pnpm run build`**: PASS (exit 0)

### Coverage Configuration

Vitest coverage configured with v8 provider:
- Statements threshold: 80%
- Branches threshold: 75%
- Functions threshold: 90%
- Lines threshold: 80%
- Excludes: `src/index.ts`, `src/cli.ts` (entry points)

Note: Coverage report table did not render in this run. The `@vitest/coverage-v8` package is installed as a devDependency.

### Test Suite Breakdown

| Test File | Tests | Status |
|-----------|-------|--------|
| tests/config.test.ts | 18 | PASS |
| tests/handlers/accessibility.test.ts | 38 | PASS |
| tests/handlers/benchmark.test.ts | 5 | PASS |
| tests/handlers/carbon.test.ts | 9 | PASS |
| tests/handlers/cdn.test.ts | 7 | PASS |
| tests/handlers/cem-monorepo.test.ts | 10 | PASS |
| tests/handlers/compare.test.ts | (present) | PASS |
| tests/handlers/fluent.test.ts | 10 | PASS |
| tests/handlers/framework.test.ts | 8 | PASS |
| tests/handlers/ionic.test.ts | 8 | PASS |
| tests/handlers/lion.test.ts | 7 | PASS |
| tests/handlers/material-web.test.ts | 7 | PASS |
| tests/handlers/migration.test.ts | 9 | PASS |
| tests/handlers/narrative.test.ts | 4 | PASS |
| tests/handlers/patternfly.test.ts | 9 | PASS |
| tests/handlers/story.test.ts | 15 | PASS |
| tests/handlers/suggest.test.ts | 37 | PASS |
| tests/handlers/validate.test.ts | 16 | PASS |
| tests/handlers/vaadin.test.ts | 6 | PASS |
| tests/handlers/typescript.test.ts | 11 | PASS |
| tests/integration/acceptance.test.ts | 10 | PASS |
| tests/integration/server.test.ts | 12 | 1 FAIL |
| tests/shared/validation.test.ts | 12 | PASS |
| tests/tools/component.test.ts | 21 | PASS |
| tests/tools/discovery.test.ts | 53 | PASS |
| tests/tools/dispatchers.test.ts | 19 | PASS |
| tests/tools/error-handling.test.ts | 3 | PASS |
| tests/tools/health.test.ts | 38 | PASS |
| tests/tools/safety.test.ts | 18 | PASS |
| tests/startup.test.ts | 3 | PASS |
| tests/cli.test.ts | 4 | PASS |

### Untested Critical Paths

1. **CEM file watcher** (`startCemWatcher` in `index.ts`) — not unit-tested (excluded from coverage)
2. **CDN network failures** — timeout and retry paths partially tested
3. **Concurrent tool calls** — no concurrency/race-condition tests

---

## 5. API Surface (MCP Tool Integration Checklist)

### Tool Groups (9 groups, 28 tools total)

#### Discovery Tools (6 tools)
| Tool | Schema Valid | Null Args | Structured Errors | Description |
|------|:-----------:|:---------:|:-----------------:|:-----------:|
| `list_components` | ✅ | ✅ | ✅ | ✅ Clear |
| `find_component` | ✅ | ✅ | ✅ | ✅ Clear |
| `get_library_summary` | ✅ | ✅ | ✅ | ✅ Clear |
| `list_events` | ✅ | ✅ | ✅ | ✅ Clear |
| `list_slots` | ✅ | ✅ | ✅ | ✅ Clear |
| `list_css_parts` | ✅ | ✅ | ✅ | ✅ Clear |

#### Component Tools (8 tools)
| Tool | Schema Valid | Null Args | Structured Errors | Description |
|------|:-----------:|:---------:|:-----------------:|:-----------:|
| `get_component` | ✅ | ✅ | ✅ | ✅ Clear |
| `validate_cem` | ✅ | ✅ | ✅ | ✅ Clear |
| `suggest_usage` | ✅ | ✅ | ✅ | ✅ Clear |
| `generate_import` | ✅ | ✅ | ✅ | ✅ Clear |
| `get_component_narrative` | ✅ | ✅ | ✅ | ✅ Clear |
| `generate_story` | ✅ | ✅ | ✅ | ✅ Clear |
| `compare_libraries` | ✅ | ✅ | ✅ | ✅ Clear |
| `benchmark_libraries` | ✅ | ✅ | ✅ | ✅ Clear |

#### Safety Tools (2 tools)
| Tool | Schema Valid | Null Args | Structured Errors | Description |
|------|:-----------:|:---------:|:-----------------:|:-----------:|
| `diff_cem` | ✅ | ✅ | ✅ | ✅ Clear |
| `check_breaking_changes` | ✅ | ✅ | ✅ | ✅ Clear |

#### Health Tools (5 tools)
| Tool | Schema Valid | Null Args | Structured Errors | Description |
|------|:-----------:|:---------:|:-----------------:|:-----------:|
| `score_component` | ✅ | ✅ | ✅ | ✅ Clear |
| `score_all_components` | ✅ | ✅ | ✅ | ✅ Clear |
| `get_health_trend` | ✅ | ✅ | ✅ | ✅ Clear |
| `get_health_diff` | ✅ | ✅ | ✅ | ✅ Clear |
| `analyze_accessibility` | ✅ | ✅ | ✅ | ✅ Clear |

#### Token Tools (2 tools)
| Tool | Schema Valid | Null Args | Structured Errors | Description |
|------|:-----------:|:---------:|:-----------------:|:-----------:|
| `get_design_tokens` | ✅ | ✅ | ✅ | ✅ Clear |
| `find_token` | ✅ | ✅ | ✅ | ✅ Clear |

#### TypeScript Tools (2 tools)
| Tool | Schema Valid | Null Args | Structured Errors | Description |
|------|:-----------:|:---------:|:-----------------:|:-----------:|
| `get_file_diagnostics` | ✅ | ✅ | ✅ | ✅ Clear |
| `get_project_diagnostics` | ✅ | ✅ | ✅ | ✅ Clear |

#### Framework Tools (1 tool)
| Tool | Schema Valid | Null Args | Structured Errors | Description |
|------|:-----------:|:---------:|:-----------------:|:-----------:|
| `detect_framework` | ✅ | ✅ | ✅ | ✅ Clear |

#### Validate Tools (1 tool)
| Tool | Schema Valid | Null Args | Structured Errors | Description |
|------|:-----------:|:---------:|:-----------------:|:-----------:|
| `validate_usage` | ✅ | ✅ | ✅ | ✅ Clear |

#### CDN Tools (1 tool)
| Tool | Schema Valid | Null Args | Structured Errors | Description |
|------|:-----------:|:---------:|:-----------------:|:-----------:|
| `resolve_cdn_cem` | ✅ | ✅ | ✅ | ✅ Clear |

**Summary**: 28/28 tools pass all four integration checks.

---

## 6. Critical Issues

### CRITICAL-1: Integration Test Failure — Server Name Mismatch

**File**: `src/index.ts:79` vs `tests/integration/server.test.ts:106`

The server is initialized with `name: 'helixir'` but the test expects `name: 'wc-mcp'`. One or the other needs to be updated. Given `package.json` names the package `wc-mcp`, the server name should likely match.

**Fix**: Either update `src/index.ts` line 79 to `name: 'wc-mcp'` or update the test expectation. Decide which is the canonical name.

### CRITICAL-2: ESLint Failures Block CI

8 ESLint errors prevent `pnpm run lint` from passing:
- 7 `no-non-null-assertion` violations in `cem.ts`, `compare.ts`, `story.ts`
- 1 `no-unused-vars` violation in `story.ts` (unused `format` variable)

These must be resolved before publish — `prepublishOnly` does not run lint, but any CI pipeline should.

---

## 7. Recommended Improvements

Ranked by impact:

### High Impact

1. **Fix server name mismatch** — Align `src/index.ts` server name with package name or update test (blocks green CI)
2. **Fix 8 ESLint errors** — Replace `!` assertions with proper null checks; remove unused `format` variable (blocks lint gate)
3. **Improve Zod error categorization** — `handleToolError()` should detect `ZodError` instances and return `ErrorCategory.VALIDATION` instead of `UNKNOWN`
4. **Standardize token handler errors** — `src/handlers/tokens.ts` should throw `MCPError` with `ErrorCategory.FILESYSTEM` / `ErrorCategory.VALIDATION` instead of generic `Error`

### Medium Impact

5. **Add package name validation in CDN handler** — Reject names with non-ASCII characters to prevent potential cache-path issues
6. **Include parse error details in config warning** — `config.ts` catch block should include `String(err)` in the warning message
7. **Add CI gates** — `prepublishOnly` runs build+test but no lint/format/type-check; CI should run all quality gates
8. **Coverage report rendering** — Investigate why `@vitest/coverage-v8` does not produce a table; may need `--reporter=text` flag

### Low Impact

9. **Add debug logging for skipped health history dir** — Currently silently falls back when dir missing
10. **Document TypeScript peer dependency** — README should note that TS diagnostic tools require `typescript` as a project dependency
11. **Test CEM watcher** — `startCemWatcher()` is untested; consider extracting for testability

---

## 8. Final Verdict

### **CONDITIONAL PASS**

The wc-mcp codebase demonstrates strong engineering fundamentals:
- Excellent schema validation (100% Zod coverage)
- Robust security posture (no injection risks, path traversal blocked)
- Consistent patterns across 28 tools and 14 handlers
- 564/565 tests passing with comprehensive fixture coverage

**Conditions for PASS (must fix before npm publish):**

1. Resolve server name mismatch (`helixir` vs `wc-mcp`) — 1 line change
2. Fix 8 ESLint errors — ~15 minutes of work
3. Verify test suite is fully green (565/565)

**Recommended but not blocking:**
- Improve Zod error categorization in `handleToolError()`
- Standardize error types in `tokens.ts`
- Add CI quality gates (lint + format + type-check)

Once the 3 blocking conditions are addressed, this codebase is ready for `v0.1.0` npm publish.
