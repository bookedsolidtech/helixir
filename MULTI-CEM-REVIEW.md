# Multi-CEM Architecture Review

> **Scope:** Audit of current wc-tools architecture for multi-library readiness
> **Date:** 2026-03-04
> **Status:** Audit only — no code changes

---

## Executive Summary

wc-tools is **architecturally single-CEM by design**. A module-level `cemCache` singleton in `src/index.ts` is the foundation of all handler dispatch. While several subsystems show forward-looking design (health history namespacing, `mergeCems()`, `benchmarkLibraries()` multi-path support), the core server architecture would require a **significant refactor** to support true multi-CEM functionality — approximately 30–40% of the codebase is affected.

---

## 1. Single-CEM Assumptions — Full Table

| File                      | Lines    | Symbol / Pattern                              | Assumption                                           | Severity |
| ------------------------- | -------- | --------------------------------------------- | ---------------------------------------------------- | -------- |
| `src/index.ts`            | 46–56    | `cemCache: Cem \| null`                       | Module-level singleton; only one CEM at a time       | CRITICAL |
| `src/index.ts`            | 46–56    | `cemLoadedAt`, `cemReloading`                 | Single load timestamp and lock                       | CRITICAL |
| `src/index.ts`            | 58–67    | `loadCem(cemAbsPath)`                         | Loads one file into global cemCache                  | CRITICAL |
| `src/index.ts`            | 69–93    | `startCemWatcher(cemAbsPath)`                 | Watches a single CEM path                            | CRITICAL |
| `src/index.ts`            | 98–130   | `config.cemPath` at startup                   | Config supplies one path                             | CRITICAL |
| `src/index.ts`            | 174–211  | All `handle*Call(…, cemCache)` dispatch       | `cemCache` passed directly; no libraryId routing     | CRITICAL |
| `src/config.ts`           | 5–14     | `cemPath: string` in `McpWcConfig`            | Interface allows only one CEM path                   | CRITICAL |
| `src/config.ts`           | 42–97    | `loadConfig()`, `MCP_WC_CEM_PATH` env var     | No `cemPaths[]` or multi-library env support         | CRITICAL |
| `src/handlers/health.ts`  | 157, 320 | `componentHistoryDir(config, tag, 'default')` | `'default'` hardcoded; ignores libraryId             | HIGH     |
| `src/handlers/health.ts`  | 282, 395 | `scoreComponent(config, tagName, cemDecl)`    | No libraryId propagated                              | HIGH     |
| `src/handlers/suggest.ts` | 97–103   | `loadCemFromConfig(config)`                   | Loads `config.cemPath` (single path)                 | HIGH     |
| `src/handlers/suggest.ts` | 167–285  | `suggestUsage(tagName, config, cem?)`         | Optional cem falls back to single config path        | HIGH     |
| `src/handlers/suggest.ts` | 293–358  | `generateImport(tagName, config, cem?)`       | CDN detection hardcoded for Shoelace package name    | HIGH     |
| `src/handlers/suggest.ts` | 321–323  | `config.projectRoot + 'package.json'`         | Reads single package.json; fails for monorepos       | HIGH     |
| `src/handlers/bundle.ts`  | 34       | `bundleCache: Map<string, CacheEntry>`        | Global in-memory cache with no library namespace     | HIGH     |
| `src/handlers/bundle.ts`  | 198      | `\`${pkg}@${version}\`` as cache key          | No libraryId prefix; collisions possible             | HIGH     |
| `src/handlers/bundle.ts`  | 80–98    | `derivePackageFromPrefix(prefix)`             | Derives package from single `config.componentPrefix` | HIGH     |
| `src/handlers/cdn.ts`     | 186–188  | `// TODO: register to multi-CEM store`        | `register` param accepted but store never written    | HIGH     |
| `src/handlers/cdn.ts`     | 193–195  | `registered: register` in return              | Returns flag as if registered; misleading            | HIGH     |
| `src/handlers/tokens.ts`  | 102–117  | `config.tokensPath` (single string)           | One token file; no per-library path                  | MEDIUM   |
| `src/handlers/tokens.ts`  | 123–135  | `findToken(config, query)`                    | No libraryId in search results                       | MEDIUM   |
| `src/handlers/cem.ts`     | 317–327  | `listAllComponents(cem)`                      | Returns flat tag-name array with no library label    | MEDIUM   |
| `src/handlers/cem.ts`     | 402–451  | `mergeCems(packages)`                         | Implemented but never called                         | MEDIUM   |
| `src/tools/cdn.ts`        | 8–13     | `register: boolean` in Zod schema             | Schema prepared; handler ignores it                  | MEDIUM   |

---

## 2. Infrastructure Already Prepared (But Unused)

The following exist and are correct for multi-CEM but are not integrated into the dispatch path:

| Symbol                                                    | File                                    | Lines   | Notes                                              |
| --------------------------------------------------------- | --------------------------------------- | ------- | -------------------------------------------------- |
| `componentHistoryDir(config, tag, libraryId = 'default')` | `src/handlers/health.ts`                | 112–131 | Accepts libraryId; callers hardcode `'default'`    |
| `mergeCems(packages: PackagedCem[])`                      | `src/handlers/cem.ts`                   | 402–451 | Correct design; never invoked                      |
| `PackagedCem` interface                                   | `src/handlers/cem.ts`                   | 404–407 | `{ cem: Cem; packageName: string }`                |
| `resolveCdnCem(…, register)`                              | `src/handlers/cdn.ts`                   | 63–69   | Parameter exists; store missing                    |
| Health history path structure                             | `.mcp-wc/health/{libraryId}/{tagName}/` | —       | Directory convention is ready                      |
| `compareLibraries(args)`                                  | `src/handlers/compare.ts`               | 128–142 | Loads CEMs from two explicit file paths; no global |
| `benchmarkLibraries(libraries)`                           | `src/handlers/benchmark.ts`             | 204–232 | Loops over N libraries from file paths; no global  |

---

## 3. Config System Readiness

### Current schema (`src/config.ts:5–14`)

```typescript
interface McpWcConfig {
  readonly cemPath: string; // single path only
  readonly componentPrefix: string; // single prefix
  readonly tokensPath: string; // single token file
  readonly projectRoot: string;
  readonly healthHistoryDir: string;
  // …
}
```

### Proposed multi-CEM config extension (backward-compatible)

```jsonc
// mcpwc.config.json — proposed multi-library schema
{
  // Legacy single-library (still supported):
  "cemPath": "custom-elements.json",
  "componentPrefix": "my-",

  // New multi-library array (opt-in):
  "libraries": [
    {
      "id": "shoelace",
      "cemPath": "vendor/shoelace/custom-elements.json",
      "componentPrefix": "sl-",
      "tokensPath": "vendor/shoelace/tokens.json",
      "packageName": "@shoelace-style/shoelace",
    },
    {
      "id": "fast",
      "cemPath": "vendor/fast/custom-elements.json",
      "componentPrefix": "fast-",
      "packageName": "@microsoft/fast-components",
    },
  ],
}
```

**`loadConfig()` changes needed:**

- If `libraries[]` is present, validate each entry
- Expose `activeLibrary(tagName): LibraryConfig` helper to auto-detect by prefix match
- Keep `cemPath` as a shorthand that populates `libraries[0]`

---

## 4. Cross-Library Operations

### `compareLibraries` (`src/handlers/compare.ts`)

- **Already multi-CEM:** accepts `cemPathA` / `cemPathB` as explicit tool arguments
- Loads both CEMs from the filesystem — no dependency on global `cemCache`
- No changes required for multi-library support

### `benchmarkLibraries` (`src/handlers/benchmark.ts`)

- **Already multi-CEM:** accepts `libraries[]` array of `{cemPath, packageName}` objects
- Iterates and reads each CEM independently
- No changes required for multi-library support

### Health scoring across libraries

- Score values are raw integers; normalization is per-component independent
- `scoreAllComponents()` does not aggregate across libraries, so scoring is already isolated
- Only change needed: pass `libraryId` through so history is stored in the right directory

---

## 5. Concurrency and Cache Design

### Current `cemReloading` boolean (`src/index.ts:48`)

- Single boolean lock; debounced watcher prevents double-reloads for one file
- **Not scalable:** N libraries need N locks (or a `Map<libraryId, boolean>`)

### Bundle cache (`src/handlers/bundle.ts:34`)

- `MAX_CACHE_SIZE = 500` entries shared across all libraries
- Cache key `${pkg}@${version}` has no library prefix
- **Risk:** If two libraries happen to share a package name at different versions the cache eviction behavior is correct, but if the same package is requested in two different library contexts the first response will be reused without checking library context
- **Fix:** Change cache key to `${libraryId}:${pkg}@${version}`

### CDN cache (file-based, `src/handlers/cdn.ts`)

- Cache files stored at `.mcp-wc/cdn-cache/{pkg}@{version}.json`
- Path includes package + version but not libraryId
- Two libraries fetching the same package+version share the same file — acceptable (same CEM content)
- No change required

---

## 6. Test Fixture Analysis

### Multi-library fixtures: none

`tests/__fixtures__/` contains separate single-library manifests:

```
custom-elements.json            ← Shoelace (main)
shoelace-custom-elements.json
fast-custom-elements.json
fluent-custom-elements.json
ionic-custom-elements.json
lion-custom-elements.json
material-web-custom-elements.json
patternfly-custom-elements.json
spectrum-custom-elements.json
stencil-custom-elements.json
vaadin-custom-elements.json
carbon-custom-elements.json
```

These are **used individually** in tests; no test loads two at once from the global cache.

### Health-history fixtures — missing library namespacing

```
tests/__fixtures__/health-history/
├── my-button/          ← No library prefix (legacy layout)
├── my-card/
├── my-confirmed/
├── corrupted-tag/
├── empty-file-tag/
├── missing-fields-tag/
├── no-json-files-tag/
└── non-numeric-score-tag/
```

The directory convention for multi-CEM health history would be:

```
tests/__fixtures__/health-history/
├── default/
│   └── my-button/
├── shoelace/
│   └── sl-button/
└── fast/
    └── fast-button/
```

No handler test exercises two CEMs loaded simultaneously.

---

## 7. Breaking Change Assessment

| Change                                        | Files Impacted                            | Backward Compatible?                   |
| --------------------------------------------- | ----------------------------------------- | -------------------------------------- |
| Add `libraries[]` to config                   | `src/config.ts`                           | Yes — `cemPath` kept as fallback       |
| Replace `cemCache` global with `Map<id, Cem>` | `src/index.ts`, all `handle*Call` sites   | **No** — all handler signatures change |
| Add `libraryId` to tool arg schemas           | All `src/tools/*.ts`                      | Yes — optional field                   |
| Fix health `'default'` hardcoding             | `src/handlers/health.ts` (×2)             | Yes — `'default'` still works          |
| Prefix bundle cache key                       | `src/handlers/bundle.ts:198`              | Yes — no API surface change            |
| Implement CDN `register` store                | `src/handlers/cdn.ts`, `src/index.ts`     | Yes — additive                         |
| Add per-library `tokensPath`                  | `src/handlers/tokens.ts`, `src/config.ts` | Yes — fall back to global              |

---

## 8. Priority Ranking

| Priority | Change                                               | Effort | Risk                          |
| -------- | ---------------------------------------------------- | ------ | ----------------------------- |
| P0       | Fix health `'default'` hardcoding (2 lines)          | XS     | None                          |
| P0       | Prefix bundle cache key with `libraryId`             | XS     | None                          |
| P1       | Add `libraries[]` to config schema                   | S      | Low                           |
| P1       | Load all library CEMs into `Map<id, Cem>` at startup | M      | Medium — touches startup path |
| P1       | Implement CDN `register` to in-memory store          | M      | Low — additive                |
| P2       | Update tool arg schemas with optional `libraryId`    | S      | Low                           |
| P2       | Thread `libraryId` through handler dispatch          | L      | High — all handler signatures |
| P2       | Per-library `tokensPath`                             | S      | Low                           |
| P3       | Multi-library test fixtures                          | M      | None                          |
| P3       | Auto-detect `libraryId` from tagName prefix          | M      | Medium                        |

---

## 9. Recommended Migration Path

### Phase 1 — Non-breaking fixes (P0)

1. `src/handlers/health.ts:157` — pass `libraryId` arg instead of `'default'`
2. `src/handlers/health.ts:320` — same
3. `src/handlers/bundle.ts:198` — prefix cache key: `\`${libraryId}:${pkg}@${version}\``

### Phase 2 — Config extension (P1)

1. Add `LibraryConfig` interface and `libraries?: LibraryConfig[]` to `McpWcConfig`
2. Update `loadConfig()` to parse `libraries[]`; fall back to `cemPath` shim
3. Add `activeLibraryForTag(tagName, config): LibraryConfig` helper

### Phase 3 — Multi-CEM store (P1)

1. Replace `let cemCache: Cem | null` with `const cemMap = new Map<string, Cem>()`
2. Replace `cemReloading: boolean` with `cemReloading: Map<string, boolean>`
3. Replace `startCemWatcher(path)` with `startCemWatcher(libraryId, path)`
4. Implement `resolveCdnCem()` register path — write to `cemMap`

### Phase 4 — Handler propagation (P2)

1. Add optional `libraryId` to all tool arg schemas
2. Update all `handle*Call(…, cemCache)` to accept `cemMap` instead
3. Thread `libraryId` through to health, tokens, suggest, bundle handlers

### Phase 5 — Tests (P3)

1. Add health-history fixtures with library prefixes
2. Add integration tests loading two CEMs into `cemMap`
3. Test CDN register flow end-to-end

---

## 10. Notes

- **Compare and Benchmark** are already multi-library capable via file-path arguments; no changes needed there
- `mergeCems()` in `src/handlers/cem.ts` is ready to use; wiring it into the CDN register path would be P1 work
- The health history directory structure already supports namespacing — only the callers need fixing
- The Shoelace-specific CDN detection in `src/handlers/suggest.ts:329` will need to become a data-driven lookup per library config when multi-CEM is active
