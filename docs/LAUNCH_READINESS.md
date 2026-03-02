# wc-tools v0.1.0 Launch Readiness Report

Generated: 2026-03-02T04:00:00Z
Status: READY

## Verdict

All CRITICAL and HIGH findings have been fixed inline. The codebase passes build, test (1006 tests), coverage (91% statements, 93.78% functions), lint, and format checks. No security vulnerabilities were found. Two HIGH-severity quality issues were fixed: an unsafe type cast that bypassed Zod schema validation, and a CI coverage gate failure caused by three tool dispatcher modules with 0% coverage. The project is ready for v0.1.0 release.

## Test Results

Tests: 1006 passing, 0 failing
Coverage: 91.02% statements, 93.78% functions, 82.27% branches
Build: clean
Lint: clean
Format: clean

## Findings Summary

| Severity | Count | Fixed inline | Board features created |
| -------- | ----- | ------------ | ---------------------- |
| CRITICAL | 0     | 0            | 0                      |
| HIGH     | 2     | 2            | 0                      |
| MEDIUM   | 5     | 0            | 5\*                    |
| LOW      | 4     | 0            | 4\*                    |

\*Note: The protoLabs MCP server (mcp**plugin_protolabs_studio**create_feature) was unavailable
during this audit run (AUTOMAKER_ROOT not set). MEDIUM and LOW board features are documented
below for manual creation.

## CRITICAL Findings

None found.

## HIGH Findings

**[FIXED] src/handlers/health.ts:352-353 — Unsafe `as Cem` cast bypasses schema validation**

The `getHealthDiff` function read the base-branch CEM via `git show`, parsed the JSON, and
immediately cast it to `Cem` with `JSON.parse(cemContent) as Cem`. This bypassed Zod's
`CemSchema.parse()` validation that protects against malformed CEM structures. If the base
branch CEM contained unexpected fields or missing required fields, the code would silently
produce wrong health diff results or throw unguarded runtime errors.

Fix applied: Changed `const cem = JSON.parse(cemContent) as Cem` to
`const cem = CemSchema.parse(JSON.parse(cemContent))`. Updated `health.test.ts` fixture
`MY_BUTTON_DECL` to include required `kind` and `name` fields so the parsed CEM passes
schema validation. Removed now-unused `Cem` type-only import.

**[FIXED] CI coverage gate failure — 3 tool dispatchers at 0% coverage, functions at 85.44% < 90%**

The CI workflow (`ci.yml`) runs `pnpm run test:coverage` which enforces a 90% function coverage
threshold. Three tool dispatcher files (`src/tools/bundle.ts`, `src/tools/composition.ts`,
`src/tools/story.ts`) had 0% coverage because no tests existed for them. Additionally,
`src/handlers/component.ts` and `src/handlers/dependencies.ts` had ~1% statement coverage
and 0% function coverage. `src/shared/file-ops.ts` was at 57.5% statements/50% functions and
`src/shared/git.ts` was at 41% statements/0% functions.

Fix applied: Added dispatcher tests for bundle, composition, and story tool modules to
`tests/tools/dispatchers.test.ts` (following the existing pattern). Added new test files:
`tests/handlers/component-handler.test.ts` (9 tests for `formatPropConstraints`),
`tests/handlers/dependencies.test.ts` (7 tests for `getComponentDependencies`),
`tests/shared/file-ops.test.ts` (6 tests for `SafeFileOperations`),
`tests/shared/git.test.ts` (2 tests for `GitOperations.gitShow`).
Functions coverage rose from 85.44% to 93.78%.

## MEDIUM Findings

**[BOARD FEATURE NEEDED] src/config.ts:33 — Silent config failure**

`readConfigFile` catches JSON parse errors and returns `{}` with a `process.stderr.write`
warning. Users who have a malformed `mcpwc.config.json` may not notice the warning and
continue with wrong defaults silently. Should throw or exit with a clear error message.

Already ticketed as `feature-1772348950302`. No new board feature needed.

**[BOARD FEATURE NEEDED] src/handlers/tokens.ts:52 — Blocking `readFileSync` in async handler context**

`parseTokens()` uses synchronous `readFileSync` and `existsSync`. Called from `getDesignTokens`
and `findToken` at tool invocation time. For large token files this blocks the Node.js event
loop. Should use async `readFile` from `node:fs/promises`.

Recommended fix: Convert `parseTokens` to `async parseTokens(filePath: string): Promise<DesignToken[]>`
and use `await readFile(filePath, 'utf-8')`.

**[BOARD FEATURE NEEDED] src/handlers/framework.ts:65,109 — Blocking `readFileSync` in async context**

Same issue as tokens.ts: `readPackageJsonDeps` and `detectFramework` use `readFileSync`.
Since `detectFramework` is called at tool invocation time through an async dispatcher,
the blocking reads can degrade throughput for large package.json files.

**[BOARD FEATURE NEEDED] src/handlers/suggest.ts:101 — Blocking `readFileSync` in async context**

`readFileSync` used in `buildSuggestedUsage` to read the CEM file. Should use async reads
consistent with other handlers.

**[BOARD FEATURE NEEDED] src/tools/component.ts:78% / src/handlers/component.ts coverage gaps**

`src/tools/component.ts` is at 78.54% statement coverage (below the 80% threshold).
The `get_prop_constraints` and `find_components_by_token` dispatch paths have uncovered
branches (lines 346-349, 352-355). Add test cases for these edge paths.

## LOW Findings

**[BOARD FEATURE NEEDED] No SECURITY.md**

The project has no `SECURITY.md` file documenting how users should report security
vulnerabilities. Standard practice for open-source npm packages.

Recommended fix: Add `docs/SECURITY.md` or `SECURITY.md` at the repo root with a
vulnerability reporting contact/process.

**[BOARD FEATURE NEEDED] No `pnpm audit` in CI pipeline**

The CI workflow (`ci.yml`) does not run `pnpm audit` to check for known vulnerable
dependencies. While the current dependency set is clean, this should be automated.

Recommended fix: Add `pnpm audit --audit-level=high` as a CI step after `pnpm install`.

**[BOARD FEATURE NEEDED] Design token files not validated against a schema**

`src/handlers/tokens.ts:parseTokens` reads and flattens token files but does not validate
the JSON against a Zod schema. Malformed or unexpected token file structures cause
silent data loss (missing tokens) rather than a clear error. Low risk since token files
are user-provided config, not external data.

**[BOARD FEATURE NEEDED] src/handlers/suggest.ts, src/handlers/benchmark.ts, src/handlers/compare.ts — branch coverage gaps**

Several handler files have branch coverage below 75% (compare.ts: 58.82%, benchmark.ts: 73.17%).
Add edge-case tests for error paths and boundary conditions.

## Launch Checklist

- [x] All tests pass (1006/1006)
- [x] Build clean (`pnpm run build` exits 0)
- [x] Lint clean (`pnpm run lint` exits 0)
- [x] Format check clean (`pnpm run format:check` exits 0)
- [x] No open CRITICAL findings
- [x] No open HIGH findings
- [x] `package.json` version is `0.1.0`
- [x] `files` array includes `build/`, `README.md`, `CHANGELOG.md` (LICENSE auto-included by npm)
- [x] `main` points to `build/index.js`
- [x] `bin` points to `build/index.js`
- [x] `engines.node` is set to `>=20.0.0`
- [x] README.md tool count (33 tools) matches actual registered tools (29 core + 2 TS + 2 tokens = 33)
- [x] All env var names in README match `src/config.ts` keys
- [x] TypeScript as optional peer dependency with correct meta
- [x] `prepublishOnly` runs build + test before publishing
- [x] Coverage: 91.02% statements, 93.78% functions (thresholds: 80% statements, 90% functions)

## Go/No-Go

**GO** — All CRITICAL and HIGH findings are fixed, all gates pass, and the package is correctly structured for npm publication. MEDIUM and LOW findings are quality improvements that can ship as follow-on patches.
