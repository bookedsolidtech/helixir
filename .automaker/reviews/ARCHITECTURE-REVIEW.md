# Architecture Cleanup — Antagonistic Verification Report

**Reviewed:** 2026-03-03
**Reviewer:** Automated adversarial agent
**Subject:** Architecture Cleanup feature agent's claimed 10 improvements across 13+ files

---

## Summary Table

| #   | Finding                                  | Claimed                                                                      | Verified      | Evidence (file:line)                                                               | Gaps                                                                                       |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | MCPError standardization                 | health.ts=3, tokens.ts=5, typescript.ts=2                                    | **PARTIAL**   | health.ts:116,123,138,289,331,339; tokens.ts:63,72,81,107,125; typescript.ts:38,82 | health.ts has **6** throws, not 3 — count undercounted 2×; standardization itself is real  |
| 2   | handleToolError category inference       | SyntaxError/TypeError→VALIDATION, ENOENT/EACCES→FILESYSTEM                   | **CONFIRMED** | error-handling.ts:32-40; error-handling.test.ts:42-70                              | None — all 4 paths tested                                                                  |
| 3   | Bundle cache size limit                  | MAX_CACHE_SIZE=500, setBundleCacheEntry() oldest-key eviction                | **CONFIRMED** | bundle.ts:31, 51-62; bundle.test.ts:167-205                                        | Test verifies size only, not _which_ key was evicted                                       |
| 4   | McpWcConfig readonly                     | All props readonly, McpWcConfigMutable, --watch in loadConfig                | **CONFIRMED** | config.ts:5-14, 17, 47, 92-93                                                      | `Readonly<McpWcConfig>` return type is redundant (fields already readonly) — harmless      |
| 5   | resolve_cdn_cem side effect fix          | register=false param, Zod schema update                                      | **CONFIRMED** | cdn.ts:63-68, 143-144, 150-152; tools/cdn.ts:12, 38-42, 60                         | No test for register=true path                                                             |
| 6   | Silent CDN registration                  | SKIPPED (library.ts doesn't exist)                                           | **CONFIRMED** | N/A — no library.ts in src/                                                        | Skip is correct                                                                            |
| 7   | Health history multi-library namespacing | componentHistoryDir(libraryId), {dir}/{libraryId}/{tagName}, legacy fallback | **CONFIRMED** | health.ts:112-130, 156-178, 317-333                                                | Legacy fallback silently swallows all errors (not just ENOENT) — masks permission errors   |
| 8   | CEM cache concurrency sentinel           | cemReloading boolean                                                         | **CONFIRMED** | index.ts:56, 78, 89, 169, 190, 199, 207                                            | cemReloading=true set during debounce window (100ms) — causes false rejects on valid cache |
| 9   | Type safety TODO                         | Comment on unsafe cast in index.ts                                           | **CONFIRMED** | index.ts:156-160                                                                   | Cast still present — this is a deferral, not a fix (acknowledged in the comment)           |
| 10  | Sync-to-async file ops                   | suggest.ts readFileSync → async readFile                                     | **CONFIRMED** | suggest.ts:1, 17, 102                                                              | `existsSync` remains at lines 15 and 99 — inconsistent, not a bug                          |

---

## Overall Verdict: PARTIAL PASS

**9 of 10 claims correctly implemented.** The one inaccuracy (Claim #1) is in the _stated count_ for health.ts throws — the agent under-reported (3 claimed vs 6 actual). The standardization itself is real and complete.

---

## Regressions and Bugs Introduced

### BUG-1 (CRITICAL) — unpkg CDN URL is malformed

**File:** `src/handlers/cdn.ts:77`
**Severity:** High — silently returns 404 for any tool call using `registry: "unpkg"`

The code constructs unpkg URLs as:

```
https://unpkg.com/npm/@pkg/name@version/custom-elements.json
```

The correct unpkg URL format is:

```
https://unpkg.com/@pkg/name@version/custom-elements.json
```

jsDelivr uses `/npm/` in its path (`cdn.jsdelivr.net/npm/`), but unpkg does **not**. The implementation applies the same `/npm/` prefix to both CDNs.

**Test masking:** `tests/handlers/cdn.test.ts:219` asserts:

```ts
expect(calledUrl).toMatch(/^https:\/\/unpkg\.com\/npm\//);
```

This test _passes_ because it validates the buggy URL the code produces, effectively enshrining the bug rather than catching it. Any real HTTP call to unpkg will 404.

---

### BUG-2 (MINOR) — `cemReloading` set during debounce window, not during actual reload

**File:** `src/index.ts:78`
**Severity:** Low — causes unnecessary request failures during 100ms debounce windows

`cemReloading = true` is set when a file-change event fires, _before_ the `setTimeout` callback actually runs. Requests arriving during the 100ms debounce period are rejected with "server still initializing" even when `cemCache` is perfectly valid. The source comment at lines 49-52 acknowledges this behavior, so it is a _documented_ limitation, but it causes avoidable user-visible errors during active development.

---

### BUG-3 (OBSERVATION) — Legacy fallback in `readLatestHistoryFile` swallows all errors

**File:** `src/handlers/health.ts:166-177`
**Severity:** Low — masks real filesystem errors

The outer catch block around `readdir(namespacedDir)` catches _any_ error and silently falls back to the legacy path. A `EACCES` permission error on the namespaced directory will silently cause a fallback to the legacy location rather than surfacing the real problem. Should restrict the catch to `ENOENT` only.

---

### BUG-4 (OBSERVATION) — CDN import generation hardcodes Shoelace-specific paths

**File:** `src/handlers/suggest.ts:328-337`
**Severity:** Medium — incorrect output for non-Shoelace libraries

When `config.cdnBase` is set, `generateImport` returns:

```ts
sideEffectImport: `<script type="module" src="${cdnBase}/shoelace-autoloader.js"></script>`,
cdnStylesheetLink: `<link rel="stylesheet" href="${cdnBase}/themes/light.css">`,
```

The paths `shoelace-autoloader.js` and `themes/light.css` are Shoelace-specific. Any non-Shoelace library using `cdnBase` will receive incorrect autoloader URLs. This predates the architecture cleanup but is worth flagging as an existing correctness issue.

---

## Value Ranking — Which Changes Matter Most

| Rank | Change                            | Why It Matters                                                                                |
| ---- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| 1    | **#7 Health history namespacing** | Prevents cross-library data collisions in production; has backward-compatible fallback        |
| 2    | **#2 handleToolError inference**  | Surfaces correct error categories to callers; affects observability and client error handling |
| 3    | **#3 Bundle cache size limit**    | Prevents unbounded memory growth in long-running server sessions                              |
| 4    | **#4 McpWcConfig readonly**       | Prevents accidental mutation of config after load; enforced at compile time                   |
| 5    | **#8 CEM cache sentinel**         | Guards against stale cache reads during concurrent reloads                                    |
| 6    | **#1 MCPError standardization**   | Consistent error protocol; enables proper MCP error code propagation                          |
| 7    | **#10 Async file ops**            | Non-blocking I/O improvement; correctness improvement in async context                        |
| 8    | **#5 register=false default**     | Prevents silent side effects when tool is used for resolution only                            |
| 9    | **#9 Type safety TODO**           | Documents known debt; no runtime change                                                       |
| 10   | **#6 CDN registration (SKIPPED)** | No work done; file doesn't exist                                                              |

---

## Test Quality Assessment

- **error-handling.test.ts**: Good coverage — all 4 category inference paths tested independently.
- **bundle.test.ts**: Cache eviction test present but weak — verifies size only, not which specific key was evicted (Map insertion-order eviction correctness is not directly asserted).
- **cdn.test.ts**: `register=true` path has no test coverage. The unpkg URL test actively validates a broken URL format.
- **health.ts**: No new tests found for the multi-library namespacing or legacy fallback paths.
- **suggest.ts**: No tests for the async conversion; existing tests likely cover the behavior indirectly.

---

## Conclusion

The architecture cleanup delivers real value on 9 of 10 claims. The `health.ts` throw count is the only factual inaccuracy in the agent's summary. The most significant concern is the **unpkg URL bug** (BUG-1), which is not from the cleanup agent but is present in the existing code and was not caught or noted in the review. The test for this path actively validates the broken URL, making it invisible to CI. This should be fixed separately with the correct URL pattern.
