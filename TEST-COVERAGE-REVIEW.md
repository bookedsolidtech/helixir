# Test Coverage Review — Antagonistic Audit

**Date:** 2026-03-04
**Auditor:** Automated antagonistic audit
**Scope:** All 51 test files in `tests/`
**Methodology:** Find tests that give FALSE CONFIDENCE — not just gaps, but tests that VALIDATE WRONG BEHAVIOR

---

## Executive Summary

The codebase has solid coverage infrastructure (80% statements, 75% branches, 90% functions) and some excellent tests (health, git, cem-debounce). However, this audit found:

- **8 false-confidence test patterns** that actively hide bugs
- **4 mock quality failures** where mocks don't simulate real system behavior
- **15+ edge case gaps** prioritized by risk
- **2 handlers with critically thin test suites** (bundle: 11 tests, benchmark: 12 tests)

Grades and findings below are harsh by design. "B-" means real risk exists.

---

## 1. False Confidence Test Inventory — MUST FIX

These tests assert wrong or trivially-true things. A test that always passes is worse than no test — it masks real failures.

### FC-1: `bundle.test.ts:77` — `toBeTruthy()` on critical `note` field

```typescript
// CURRENT (line 77) — passes if note is " ", "0", "null", or any truthy junk
expect(result.note).toBeTruthy();

// REQUIRED — test actual content
expect(typeof result.note).toBe('string');
expect(result.note.length).toBeGreaterThan(0);
expect(result.note).toContain('shoelace'); // or whatever the expected fragment is
```

**Why it's dangerous:** The `note` field communicates upgrade guidance to users. If the handler returns a nonsense string, this test still passes.

---

### FC-2: `suggest.test.ts:268,282,292,301` — `toBeDefined()` on framework snippets

```typescript
// CURRENT (line 268) — passes if frameworkSnippet is undefined (!!), null, or ""
expect(result.frameworkSnippet).toBeDefined();

// REQUIRED — verify snippet is usable
expect(typeof result.frameworkSnippet).toBe('string');
expect(result.frameworkSnippet).toContain('<sl-button');
expect(result.frameworkSnippet.length).toBeGreaterThan(20);
```

**Why it's dangerous:** `toBeDefined()` returns true for `undefined`... wait, no. But it passes for `null`, `""`, `"   "`, `false`. These are all defined but broken values.

---

### FC-3: `suggest.test.ts:245` — `toBeDefined()` on notes array

```typescript
// CURRENT (line 245) — passes if notes is [], null, or 42
expect(result.notes).toBeDefined();

// REQUIRED
expect(Array.isArray(result.notes)).toBe(true);
expect(result.notes.length).toBeGreaterThan(0);
```

---

### FC-4: `tokens.test.ts:56-58` — `toBeGreaterThan(0)` instead of exact counts

```typescript
// CURRENT — passes if parser returns 1 color token when fixture has 6
expect(colorTokens.length).toBeGreaterThan(0);
expect(spacingTokens.length).toBeGreaterThan(0);
expect(shadowTokens.length).toBeGreaterThan(0);

// REQUIRED — count the fixture tokens and assert exactly
expect(colorTokens.length).toBe(6); // verify against actual fixture
expect(spacingTokens.length).toBe(4); // verify against actual fixture
```

**Why it's dangerous:** If the parser starts skipping categories, it would return 1 token, tests still pass, and users get incomplete token data.

**Same pattern at:** `tokens.test.ts:28,35,95,103,112,121,152,169,177,187`

---

### FC-5: `bundle.test.ts:160` — `toBeGreaterThan(0)` on gzipped size

```typescript
// CURRENT
expect(result.estimates.full_package!.gzipped).toBeGreaterThan(0);

// REQUIRED — at minimum bound-check sanity
expect(result.estimates.full_package!.gzipped).toBeGreaterThan(0);
expect(result.estimates.full_package!.gzipped).toBeLessThan(100_000_000); // 100MB
// Better: use fixture data to expect a specific range
expect(result.estimates.full_package!.gzipped).toBeCloseTo(12345, -3);
```

---

### FC-6: `suggest.test.ts:232` — `toBeGreaterThan(0)` on slots array

```typescript
// CURRENT — sl-button has 4 specific slots; this passes with any 1
expect(result.slots.length).toBeGreaterThan(0);

// REQUIRED
expect(result.slots.length).toBe(4);
expect(result.slots.map((s) => s.name)).toContain('prefix');
expect(result.slots.map((s) => s.name)).toContain('suffix');
```

---

### FC-7: `safety.test.ts:222` — Loose regex `/2/` matches anything containing "2"

```typescript
// CURRENT — matches "2", "20", "version 2.0", "component 200"
expect(text).toMatch(/2/);

// REQUIRED — test the actual numeric value
const count = parseInt(text.match(/\d+/)?.[0] ?? '0');
expect(count).toBe(2);
```

---

### FC-8: `benchmark.test.ts` — Handler mocked completely, tests the mock

The benchmark tests mock `benchmarkLibraries()` entirely. This means the test suite tests the mock behavior, not the handler. If `benchmarkLibraries()` has a bug, zero tests catch it.

**Files:** `tests/tools/benchmark.test.ts` — all tests using `vi.mocked(benchmarkLibraries)`

**Fix required:** At least one integration-style test should call the real handler with real fixture files.

---

## 2. Mock Quality Ratings Per Test File

### `tests/handlers/cdn.test.ts` — Mock Quality: FAIL (two issues)

**Issue A: Missing `.code` property on filesystem error mocks**

```typescript
// CURRENT (lines 261-263, 405-407) — wrong error type
vi.mocked(mkdirSync).mockImplementation(() => {
  throw new Error('ENOSPC: no space left'); // generic Error, no .code
});

// REQUIRED — real fs errors have .code property
vi.mocked(mkdirSync).mockImplementation(() => {
  const err = Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' });
  throw err;
});
```

Real `fs` module errors always have `.code`. If the source handler checks `.code` to distinguish error types, the current mock bypasses that logic entirely.

**Issue B: No test for race condition in concurrent cache writes**

Lines 421-430 test concurrent fetch succeeds but don't test what happens when two concurrent requests both try to write the same cache file simultaneously. This is a real-world failure mode.

---

### `tests/handlers/bundle.test.ts` — Mock Quality: WARN

**Issue: Malformed JSON response not tested**

`stubFetch()` always returns well-formed JSON. What happens when the bundlephobia API returns `200 OK` with body `{invalid`? The handler may throw an unhandled SyntaxError that escapes the error boundary.

---

### `tests/handlers/health.test.ts` — Mock Quality: PASS

Filesystem fixtures are realistic. Error objects are properly formed. Minor gap: no test for truncated JSON (file ends mid-object, e.g., `{"score": 85, "comp`).

---

### `tests/handlers/suggest.test.ts` — Mock Quality: PASS

CEM fixture data is realistic. Framework detection mocks are reasonable.

---

### `tests/handlers/tokens.test.ts` — Mock Quality: PASS

Token fixture files are realistic. No mock quality issues; gaps are in assertion strength.

---

### `tests/shared/git.test.ts` — Mock Quality: PASS (BEST IN CLASS)

Validation tests are excellent. Blocklist covers all known injection vectors. No mocking issues.

---

### `tests/cem-debounce.test.ts` — Mock Quality: PASS (BEST IN CLASS)

Real process spawning with actual MCP JSON-RPC protocol. Tests actual timing behavior. No mock issues.

---

### `tests/tools/error-handling.test.ts` — Mock Quality: WARN

**Issue: Error with missing `.code` property not tested**

Test at lines 54-64 tests `ENOENT` and `EACCES` codes. But what happens when `handleError()` receives a generic `Error` (no `.code` property) that came from a non-fs source? The mapping logic has an unverified branch.

---

### `tests/tools/safety.test.ts` — Mock Quality: WARN

All assertions use loose `.toMatch(/pattern/i)`. This tests that a pattern appears somewhere in the output, not that the output is correct. A test can pass with partial, wrong, or garbled output as long as one keyword appears.

---

### `tests/tools/benchmark.test.ts` — Mock Quality: FAIL

Handler is completely mocked. Tests do not exercise any real handler logic. See FC-8 above.

---

## 3. Edge Case Gap List (Prioritized by Risk)

### CRITICAL RISK

| Gap                                         | Handler | Reason                                                                                         |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| Malformed JSON from CDN (truncated/invalid) | cdn.ts  | Handler fetches custom-elements.json from CDN; malformed response could crash or corrupt state |
| fs error missing `.code` property           | cdn.ts  | Error classification breaks silently; ENOSPC treated as unknown error                          |
| Concurrent cache writes (race condition)    | cdn.ts  | Two requests fetching same package simultaneously may corrupt cache file                       |
| Network timeout (ETIMEDOUT vs AbortError)   | cdn.ts  | Code handles AbortError but ETIMEDOUT throws differently                                       |
| Empty CEM (zero components)                 | cem.ts  | `listAllComponents()` with `modules: []` — returns `[]` or throws?                             |

### HIGH RISK

| Gap                                            | Handler    | Reason                                                                   |
| ---------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| Component with NO properties, events, or slots | suggest.ts | Minimal component should still render valid (empty) HTML, not throw      |
| Bundlephobia returns 200 OK with invalid JSON  | bundle.ts  | SyntaxError may escape error handler, expose stack trace to user         |
| Malformed JSON in health history (truncated)   | health.ts  | File read succeeds but `JSON.parse()` throws; needs graceful degradation |
| Duplicate timestamps in health history         | health.ts  | Two `2024-03-10.json` entries — which wins? Test doesn't verify          |
| Future dates in health history (2099-12-31)    | health.ts  | Trend analysis could break with future timestamps                        |
| Cache eviction removes OLDEST entry            | bundle.ts  | Test at line 168 confirms eviction exists, not that it's FIFO            |
| `toBeGreaterThan(0)` wrong-count blind spot    | tokens.ts  | Parser skipping a category returns 1 instead of 0; tests still pass      |

### MEDIUM RISK

| Gap                                     | Handler    | Reason                                                       |
| --------------------------------------- | ---------- | ------------------------------------------------------------ | --------------------------------------------- |
| Unicode in component tag names          | cem.ts     | `tagName: "мой-кнопка"` — is it validated or passed through? |
| Unicode in token names/values           | tokens.ts  | `color.名前: "#ff0000"` — does parser handle non-ASCII?      |
| Unicode in variant option strings       | suggest.ts | `variant: "🔴"                                               | "🟢"` — does snippet generation handle emoji? |
| CEM with 1000+ components               | cem.ts     | Performance/parsing timeout risk at scale                    |
| Union type with 100+ variant options    | suggest.ts | Snippet generation performance with huge union types         |
| Very long property names (>1000 chars)  | cem.ts     | Buffer overrun or truncation risk                            |
| Very long token values (>10KB)          | tokens.ts  | Memory handling; UI rendering of giant CSS values            |
| Config with all optional fields missing | config.ts  | Handler behavior with minimal config object                  |
| Bundlephobia version mismatch           | bundle.ts  | Request 2.14.0, receive 2.13.0 — does handler validate?      |

### LOW RISK

| Gap                                     | Handler      | Reason                                                |
| --------------------------------------- | ------------ | ----------------------------------------------------- |
| Score > 100 in benchmark                | benchmark.ts | Overflow or clamping not tested                       |
| Duplicate library labels in benchmark   | benchmark.ts | Two libraries with same `label` — collision handling? |
| Negative scores in health history       | health.ts    | Stored score of -5 — should clamp to 0 or reject?     |
| npm registry returns unpacked size of 0 | bundle.ts    | Division or formatting edge case                      |
| Very large version string (100 chars)   | cdn.ts       | Semver parse with pathological input                  |

---

## 4. Integration Test Assessment

### `tests/integration/acceptance.test.ts` — Grade: B+

- Spawns real MCP server process
- Tests 5 acceptance criteria via real JSON-RPC
- Validates list, get, find, score, and diff operations

**Gaps:**

- Only happy path — no error paths via real server
- No test for malformed JSON-RPC messages
- No test for concurrent requests to real server

### `tests/integration/server.test.ts` — Grade: B

- Exists, tests server startup
- **Gap:** Partial test coverage of protocol negotiation

### `tests/cem-debounce.test.ts` — Grade: A (Best Integration Test)

- Real process spawn with actual MCP protocol
- Tests race condition between debounce window and cache validity
- Timeout handling at 3000ms
- Catches real timing bugs that unit tests cannot

### End-to-End Gap

No test starts the full server and makes tool calls with real CEM + real filesystem + real git. The debounce test is close but focused on one scenario. A comprehensive E2E test suite is missing.

---

## 5. Coverage Threshold Analysis

**Current thresholds (vitest.config.ts):**

```
statements: 80%
branches:   75%
functions:  90%
lines:      80%
```

**Excluded files:** `src/index.ts`

**Assessment:**

Thresholds are reasonable for general coverage but have a critical blind spot: they measure line execution, not semantic correctness. A test can hit 80% coverage and still:

- Never trigger `ENOSPC` vs `ENOENT` branch distinction (because mocks don't include `.code`)
- Never test cache eviction ordering (because mock doesn't reach that path)
- Never test zero-component behavior (because all fixtures have ≥1 component)

**Recommendation:** For security-critical files (`src/shared/git.ts`, `src/shared/validation.ts`), thresholds should be 95%+ branches. The current 75% branch threshold permits 1-in-4 branches untested.

**File `src/index.ts` is excluded** from coverage. If this file contains startup logic, error handling, or config validation, it should be tested. The exclusion should be reviewed.

---

## 6. Handler Test Quality Grades

| Handler                   | Grade  | Test Count | Key Strength                                   | Key Weakness                                                             |
| ------------------------- | ------ | ---------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `health.test.ts`          | **A-** | 42         | Fixture-based scoring, corrupted file handling | No truncated JSON, no future-date history                                |
| `suggest.test.ts`         | **A-** | 60         | Framework detection, Shoelace-specific tests   | `toBeDefined()` without content checks; no zero-property component test  |
| `shared/git.test.ts`      | **A**  | 30+        | Comprehensive injection blocklist              | None identified                                                          |
| `cem-debounce.test.ts`    | **A**  | 8          | Real process spawn, actual timing test         | Only one timing scenario                                                 |
| `tokens.test.ts`          | **B+** | 22         | All 3 handler functions covered                | `toBeGreaterThan(0)` throughout; no circular refs; no Unicode            |
| `cem.test.ts`             | **B+** | 36         | Good coverage of CEM operations                | No zero-component test; no Unicode tag names                             |
| `cdn.test.ts`             | **B-** | 48         | Security tests, semver validation              | Missing `.code` on fs errors; no streaming race test                     |
| `tools/benchmark.test.ts` | **B**  | 12         | Validates library count bounds                 | Handler completely mocked — tests mock, not handler                      |
| `bundle.test.ts`          | **C+** | 11         | Tests both bundlephobia and npm fallback       | `toBeTruthy()` assertion; cache eviction unverified; only 11 tests total |

**Grades below B require action.** `bundle.test.ts` at C+ with 11 tests for a complex handler is the highest priority test expansion target.

---

## 7. Recommended Test Additions (Prioritized)

### Priority 1 — Fix Existing False Confidence Tests

1. **`bundle.test.ts:77`** — Replace `toBeTruthy()` with content assertion on `note` field
2. **`tokens.test.ts:28,35,56-58,95,103,112,121,152,169,177,187`** — Replace `toBeGreaterThan(0)` with exact fixture counts
3. **`suggest.test.ts:268,282,292,301`** — Replace `toBeDefined()` with string content checks
4. **`cdn.test.ts:261-263,405-407`** — Add `.code` property to fs error mocks
5. **`safety.test.ts:222`** — Replace loose regex with exact value assertion

### Priority 2 — High-Risk Edge Cases

6. **`cdn.test.ts`** — Add test: CDN returns malformed JSON (`{invalid`)
7. **`cdn.test.ts`** — Add test: ETIMEDOUT error (distinct from AbortError)
8. **`cdn.test.ts`** — Add test: concurrent cache writes (two simultaneous requests for same package)
9. **`bundle.test.ts`** — Add test: bundlephobia returns 200 OK with SyntaxError body
10. **`bundle.test.ts`** — Add test: cache eviction removes oldest entry specifically
11. **`suggest.test.ts`** — Add test: component with zero properties, zero events, zero slots
12. **`health.test.ts`** — Add test: truncated JSON in history file (file ends mid-object)
13. **`cem.test.ts`** — Add test: CEM with zero components (`modules: []`)

### Priority 3 — Medium-Risk Edge Cases

14. Add Unicode tests: component tag names, token names, variant options (one test each)
15. Add performance test: CEM with 1000+ components (verify no timeout or memory spike)
16. Add concurrent request test: health scoring with simultaneous requests
17. Add test: config with all optional fields missing (minimal config object)
18. Add test: very long property names (>1000 chars) in CEM member

### Priority 4 — Test Suite Expansion

19. **`bundle.test.ts`** — Expand from 11 to 25+ tests (most undertested critical handler)
20. **`benchmark.test.ts`** — Add at least one test calling real `benchmarkLibraries()` with fixtures
21. Add E2E test: start server + real tool call + real CEM file + real git repo

---

## 8. Summary

### What This Codebase Gets Right

- `shared/git.test.ts` has excellent injection prevention tests
- `cem-debounce.test.ts` is a model integration test
- `health.test.ts` and `suggest.test.ts` use fixture data effectively
- Security tests in `cdn.test.ts` cover null bytes and path traversal
- Integration acceptance tests verify real MCP protocol behavior

### What Needs Immediate Attention

1. **`bundle.test.ts` is critically undertested** (11 tests, weak assertions, cache logic unverified)
2. **`cdn.test.ts` fs error mocks are wrong** — missing `.code` property could mask real bugs
3. **`benchmark.test.ts` tests its mocks, not the handler** — zero real handler coverage
4. **Assertion weakness is systemic** — `toBeDefined/toBeTruthy/toBeGreaterThan(0)` throughout when exact values are available from fixtures

### Risk Verdict

Current test suite provides **adequate regression coverage** but **poor semantic correctness validation**. Tests will catch if a handler stops returning a response, but they will NOT catch:

- Handler returning wrong token count
- Handler returning empty snippet instead of real snippet
- Handler silently swallowing `ENOSPC` errors due to mock mismatch
- Cache evicting newest entry instead of oldest
- CDN handler crashing on malformed JSON

These failures would ship to production undetected.
