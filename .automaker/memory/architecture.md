---
tags: [architecture]
summary: architecture implementation decisions and patterns
relevantTo: [architecture]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 15
  referenced: 15
  successfulFeatures: 15
---
# architecture

### Centralized libraryId resolution in index.ts that extracts libraryId from tool args, resolves to CEM via resolveCem(), then passes only the resolved Cem object to handlers. Handlers remain unchanged and don't know which library they're working with. (2026-03-03)
- **Context:** Adding optional libraryId parameter across 26 tools without breaking 1071 existing tests or modifying handler signatures.
- **Why:** Single point of resolution prevents duplication across handlers, keeps handlers testable in isolation, and allows changing resolution strategy without touching handlers. Handlers remain library-agnostic—they work with the CEM object itself.
- **Rejected:** Passing libraryId + cemCache to each handler, letting handlers call resolveCem(). This would scatter resolution logic across 26 tools and create coupling between handlers and the store.
- **Trade-offs:** Handlers lose awareness of which library they're querying (can't add library context to errors). Gains: simpler handlers, centralized control flow, easier testing.
- **Breaking if changed:** If handlers need to know or log which libraryId they resolved (e.g., 'searching in library=shoelace'), this architecture makes that harder.

#### [Pattern] Backward compatibility strategy combines three techniques: (1) aliases like loadCdnCem() wrapping new loadLibrary() calls, (2) optional libraryId parameter defaulting to undefined, (3) resolveCem(undefined, store) returns default library. Old code calling with no libraryId silently uses 'default'. (2026-03-03)
- **Problem solved:** Migrating from single cdnCemCache to namespaced store without breaking existing code or requiring changes to calling code.
- **Why this works:** Default behavior stays identical for 90% of use cases (only default library). New multi-library feature is opt-in. No forced refactoring. Zero breaking changes to 1071 tests.
- **Trade-offs:** Adds implicit behavior (undefined→default). Easier: gradual adoption. Harder: understanding when/why code uses default vs explicit library.

#### [Pattern] The 'default' library is special and protected—cannot be unloaded or overwritten. Attempting to unload or replace it is rejected with an error. The default library is always loaded at startup from the project config. (2026-03-03)
- **Problem solved:** Ensuring the tool server always has a fallback CEM for backward compatibility and reliability.
- **Why this works:** Guarantees there's always a valid CEM to query, preventing complete library erasure. Protects against accidental removal of the application's primary component set. Simplifies error handling—handlers can assume a CEM exists.
- **Trade-offs:** Easier: handlers don't need null-checks or fallback logic. Harder: cannot fully reset by unloading all libraries; must keep default.

### CemStore uses single Map<string, CemStoreEntry> where each entry contains {cem, loadTime, source}. Lifecycle metadata (when/how it was loaded) is co-located with the CEM data. (2026-03-03)
- **Context:** Tracking multiple libraries with different sources (config, cdn, file) and needing to know when they were loaded.
- **Why:** Single map prevents inconsistency between CEM and metadata. Source type influences cache invalidation strategy. loadTime enables future TTL/refresh logic. Composite value makes the entry self-describing.
- **Rejected:** Separate Maps: cemStore, loadTimes, sources. This splits related data and risks getting out of sync (e.g., unload libraryId from one map but forget another).
- **Trade-offs:** Easier: atomic updates (load/unload one entry). Harder: iterating only CEMs requires .map(e => e.cem).
- **Breaking if changed:** If code reads loadTime or source separately, it must now access entry.loadTime and entry.source, not a separate map.

### Created new src/tools/library.ts to hold only the 3 library management tools (load_library, list_libraries, unload_library), separate from component/discovery/health/etc. tools. (2026-03-03)
- **Context:** Adding library lifecycle management as orthogonal to component introspection.
- **Why:** Single responsibility: library.ts handles store lifecycle only. Easier to review, test, and maintain. Clear separation between 'what libraries are available' and 'what's in a library'. Makes it obvious where to add future library-related tools.
- **Rejected:** Scattering load/unload across existing tool files (one in discovery.ts, one in health.ts). This obscures the library management API surface.
- **Trade-offs:** Easier: finding all library tools. Harder: library.ts depends on cem.ts exports.
- **Breaking if changed:** If code assumed all tools were in a single file, this changes the file structure.

### Global mutable CEM cache trades isolation/testability for read-once performance on large files (2026-03-03)
- **Context:** CEM cached at module scope; no eviction or size bounds; handlers read from cache across requests
- **Why:** Large CEMs (100MB+) expensive to parse; caching avoids re-reads. Per-request caching would lose this benefit
- **Rejected:** LRU/time-based eviction (adds complexity), immutable state generators (requires API redesign), per-request caching (re-reads on every tool call)
- **Trade-offs:** Memory efficiency for read-heavy workloads vs risk of stale/corrupted state in long-running processes or concurrent requests
- **Breaking if changed:** If changed to immutable/per-request, handlers relying on ambient CEM reference fail; API surface changes

#### [Gotcha] Unbounded in-memory bundle cache (no max size, no eviction) can cause memory leak in long-running processes (2026-03-03)
- **Situation:** Bundle cache stores generated outputs with no size limit or TTL; stores as many bundles as tooling generates
- **Root cause:** Simplicity—just append to map. Adding eviction policy requires defining 'useful lifetime' and overhead tracking logic
- **How to avoid:** Unmanaged cache avoids code complexity vs risk of OOM in 24/7 processes or with many large libraries

#### [Pattern] Inconsistent error types (plain Error vs MCPError) across handlers indicates error classification strategy was not enforced early (2026-03-03)
- **Problem solved:** Some handlers throw vanilla Error; others throw MCPError with ErrorCategory; inconsistency prevents client-side error routing
- **Why this works:** System grew incrementally; early handlers predated MCPError taxonomy. Retrofitting requires touching every error path
- **Trade-offs:** Early architectural decision (error type hierarchy) saves refactoring cost later vs flexibility during exploration phase

#### [Gotcha] Function name resolve_cdn_cem hides side effect: mutates global cache in addition to returning value (2026-03-03)
- **Situation:** Callers expect resolve_cdn_cem to be pure query function; instead it caches result globally without documentation
- **Root cause:** Caching optimization added for performance; naming not updated to signal side effect (e.g., resolve_and_cache_cdn_cem)
- **How to avoid:** Implicit caching avoids passing state through call chain vs loss of observability and testability (hard to isolate)

### CDN registration failure is silent/best-effort: system reports success but doesn't cache if fetch fails (2026-03-03)
- **Context:** resolve_cdn_cem falls back to in-memory CEM if fetch fails; tool returns success message even if no CDN cache written
- **Why:** CDN is optimization, not requirement. In-memory CEM works without it; graceful degradation prioritizes availability over transparency
- **Rejected:** Fail-fast (break analysis), propagate error (blocks all analysis), mandatory retry loop (adds latency)
- **Trade-offs:** Users get working analysis without CDN vs risk of silent feature degradation (no caching but user unaware)
- **Breaking if changed:** If CDN becomes mandatory, callers relying on silent fallback fail; workflow expectations change

#### [Gotcha] Health and diff tools designed for single CEM before multi-library support added; now lack aggregation/namespacing (2026-03-03)
- **Situation:** Original handlers assume one library; system evolved to load multiple CEMs but health/diff don't iterate/merge results
- **Root cause:** Scope expansion (single→multi) was incremental; early tools not retrofitted; cost deferred to now
- **How to avoid:** Incremental development is fast initially but architectural debt accrues; multi-library support incomplete without tool redesign

### Cache write error not caught; mkdirSync/writeFileSync failures silently ignored, tool reports success anyway (2026-03-03)
- **Context:** CDN cache write (cache dir creation + file write) has no try/catch; if write fails (perms, disk full), success lie is returned
- **Why:** Caching is best-effort optimization; in-memory CEM still works. Failing hard on disk error breaks availability
- **Rejected:** Fail-fast on write error (breaks workflow), async write with error log (adds complexity), ignore silently (current; no transparency)
- **Trade-offs:** Silent fallback maintains availability but risks user confusion (thinks data cached when not); error log would improve transparency at cost of log noise
- **Breaking if changed:** If cache writes become non-optional, error must be caught and decision made: fail or fallback

### Cache write changed from required to best-effort: operation succeeds even if file write fails. Return type: `cachePath?: string` (2026-03-03)
- **Context:** During cache write, mkdirSync/writeFileSync could fail (permission, disk full, etc.) but this should not fail the entire fetch operation
- **Why:** Graceful degradation: fetch result is still valid even without cache. User gets data; just might not be cached. Improves resilience vs fail-fast
- **Rejected:** Failing entire operation on cache write failure; requiring cache write to always succeed
- **Trade-offs:** Weaker API contract (callers can't rely on cachePath existing) but much more resilient. Logs warning instead of error for observability
- **Breaking if changed:** Any code checking `if (result.cachePath)` without fallback will now need to handle undefined. Code assuming cachePath always exists will break

#### [Pattern] Used Readonly<T> return type with internal mutable mapped type ({ -readonly [K] in T }) for immutable config objects (2026-03-03)
- **Problem solved:** McpWcConfig needed to be immutable externally but built incrementally in loadConfig()
- **Why this works:** Allows external API to enforce immutability (prevents accidental mutations) while internal code can construct the object step-by-step without casting
- **Trade-offs:** Slightly more complex internal implementation (needs McpWcConfigMutable type) but extremely safe external API. Forces all config reads to go through loadConfig.

#### [Pattern] Use JavaScript Map.keys().next().value to get oldest entry in FIFO eviction without additional data structures (2026-03-03)
- **Problem solved:** bundleCache needed bounded size (500 entries max) with automatic eviction of oldest entries
- **Why this works:** JavaScript Maps preserve insertion order by spec. This leverages that guarantee for free FIFO eviction—no need for a separate LRU queue or timestamp tracking
- **Trade-offs:** Clean and simple, but only works because we rely on JavaScript Map ordering guarantee. Performance is O(1) to find oldest entry

#### [Pattern] Infer error categories in central error-handling layer based on error type (SyntaxError/TypeError → VALIDATION) and code (.code → FILESYSTEM) (2026-03-03)
- **Problem solved:** Hundreds of throw sites across handlers, but wanted consistent MCPError categories without updating every throw
- **Why this works:** Centralizes error classification logic so new error types don't require changes everywhere. Allows gradual refactoring of throw sites
- **Trade-offs:** Inference rules can be fragile if error types overlap (e.g. both TypeError and a custom class thrown). Requires maintaining the inference matrix

#### [Pattern] Health history migration with fallback: try namespaced path first (new), then non-namespaced (legacy) for backward compatibility (2026-03-03)
- **Problem solved:** Changing health history directory structure from `{dir}/{tag}` to `{dir}/{libraryId}/{tag}` without breaking existing installations
- **Why this works:** Allows gradual migration. Old data lives at legacy path and is found on first read. New data goes to namespaced path. No data loss.
- **Trade-offs:** Code has to check both paths, adding slight complexity. But reading still works transparently across versions

#### [Gotcha] Moving --watch CLI flag check from post-load config mutation to inside loadConfig was required because config is now immutable (2026-03-03)
- **Situation:** With Readonly<McpWcConfig>, can't set config.watch = true after loadConfig returns
- **Root cause:** Immutable config means all final values must be set before returning from loadConfig()
- **How to avoid:** Config object construction is now fully encapsulated in loadConfig. Trades off some flexibility for safety.

#### [Pattern] Selective Node.js version matrix: build/test use [20,22] matrix; lint/format/security run only on Node 20 (2026-03-04)
- **Problem solved:** Optimizing CI execution time and resource usage after splitting monolithic CI into 5 workflows
- **Why this works:** Linting output is deterministic across Node versions - no need to verify multiple times. Build and test must verify on all supported runtime versions to catch version-specific issues. This saves 2x-3x CI runner minutes without losing coverage.
- **Trade-offs:** Faster, cheaper CI (deterministic checks run once) vs theoretical risk of missing a Node-version-specific lint/format anomaly (extremely unlikely for those tools)

#### [Gotcha] `cemReloading = true` is set when file-change event fires (line 78), but before the actual async reload begins (setTimeout at line 77). Requests during the 100ms debounce window are rejected as 'server still initializing' even when cemCache is valid. (2026-03-04)
- **Situation:** CEM cache reload protection uses a boolean flag to prevent concurrent requests during reload. Flag is set too early in the debounce window.
- **Root cause:** Simple boolean flag is cheaper than proper async locks, but semantics of 'currently reloading' don't match actual reload timing
- **How to avoid:** Simple boolean vs. accurate reload state; false rejections during debounce window vs. slightly more complex async coordination

#### [Gotcha] Health history fallback catch block at health.ts:166-177 catches *any* error, not just ENOENT. EACCES (permission denied) on new namespaced directory silently falls back to legacy path instead of surfacing the real permission error. (2026-03-04)
- **Situation:** Multi-library namespacing adds new directory structure with legacy fallback for backward compatibility. Overly broad exception handling masks real filesystem errors.
- **Root cause:** Simple try-new-then-fallback-to-old pattern often uses broad catch to mean 'if new path doesn't exist, try old path', but this catches all errors including permission, corruption, etc.
- **How to avoid:** Simple catch for any error vs. distinguishing real errors from 'not found'; fallback convenience vs. debugging visibility

#### [Gotcha] suggest.ts hardcodes `shoelace-autoloader.js` and `themes/light.css` paths in `generateImport()` even though `config.cdnBase` is now configurable. Library-specific paths are embedded in generic tool code. (2026-03-04)
- **Situation:** CDN import generation was written for Shoelace. When cdnBase config became flexible, the hardcoded paths were not revisited, creating assumption decay.
- **Root cause:** Code made implicit assumption that cdnBase = Shoelace URLs. Configuration flexibility expanded without code review for assumptions.
- **How to avoid:** Simple hardcoded paths vs. configuration complexity; works for Shoelace only vs. generic tool that supports multiple libraries

### McpWcConfig fields are individually readonly AND return type is Readonly<T>. Return type is redundant since fields are already readonly, but present for intent documentation. (2026-03-04)
- **Context:** Type system can enforce readonly on fields but cannot express at runtime that entire object was created immutable. Return type documents API contract.
- **Why:** Defensive redundancy: fields prevent direct mutation but return type tells readers 'this config is immutable by design'. TypeScript can't enforce immutability at object level without return type annotation.
- **Rejected:** Remove Readonly<> return type (simpler, DRY) but lose documentation of immutability intent in type signature
- **Trade-offs:** Defensive redundancy vs. DRY; intent documentation vs. code duplication
- **Breaking if changed:** Removing Readonly<> return type loses compile-time signal that config should not be mutated

#### [Pattern] CDN resolution tool has `register=false` as default parameter. Side effect of registration only happens explicitly, making tool composable for resolution-only use cases. (2026-03-04)
- **Problem solved:** Tool can be used both for resolution and for registration. Default behavior must not impose side effects.
- **Why this works:** Composability principle: each component should be usable in isolation. Default of no side effects allows tool to be used in more contexts without breaking callers.
- **Trade-offs:** No implicit side effects vs. more explicit code for registration case; composable vs. convenient

#### [Pattern] Health history uses new namespaced path `{dir}/{libraryId}/{tagName}` but retains silent legacy fallback to old `{dir}/{tagName}`. Enables migration without breaking existing data. (2026-03-04)
- **Problem solved:** Adding multi-library support requires new directory structure. Old single-library data cannot be moved automatically.
- **Why this works:** Graceful migration pattern: new code path is tried first, but old data is still accessible if new path doesn't exist. Prevents data loss during rollout.
- **Trade-offs:** Complex code path with two read patterns vs. simpler single path; backward compatibility vs. eventual consistency

### Five parallel CI workflows (build, test, lint, format, security) each in separate file with separate run conditions, rather than monolithic single workflow (2026-03-04)
- **Context:** Project needs multiple verification gates: type safety, test coverage, code style, formatting, dependency audit
- **Why:** Parallel workflows provide faster feedback (any can fail independently), clearer responsibility separation, and allow selective re-runs without re-running unrelated checks
- **Rejected:** Monolithic workflow would be simpler to maintain (one file instead of five) and slightly faster (no parallel overhead), but would serialize all checks
- **Trade-offs:** Faster feedback and clearer failure attribution, but requires maintaining five workflow files and ensures ALL five must pass before merge (no cherry-picking failures)
- **Breaking if changed:** If consolidated to single workflow, serial execution could slow down CI significantly; if one workflow deleted without updating documentation/branch protection, CI becomes incomplete

### Extended FilePathSchema in validation.ts rather than validating filePath locally in gitShow. This made the security check reusable and consistent across all consumers of FilePathSchema in the codebase. (2026-03-04)
- **Context:** During gitShow implementation, discovered FilePathSchema was incomplete. Could have added null byte and path traversal checks only in gitShow, or fixed them in the shared schema definition.
- **Why:** Centralizing path validation in FilePathSchema reduces the risk of inconsistent security handling. A single point of maintenance ensures all file operations (current and future) inherit the same protections without developers having to remember.
- **Rejected:** Adding validation only in gitShow method; this would have left other code using FilePathSchema vulnerable and created hidden assumptions about where validation happens
- **Trade-offs:** Centralized schema: consistent rules everywhere (good) but schema becomes critical infrastructure where bugs affect all consumers (bad). Decentralized validation: more isolated but fragile and error-prone.
- **Breaking if changed:** Removing null byte check from FilePathSchema requires all consumers to add their own validation or accept vulnerability. Any schema change now affects all code paths that use FilePathSchema, not just gitShow.

### Adding a `config: McpWcConfig` parameter to an internal private function `parseHistoryFile` requires updating both call sites in the same file. Parameter changes to internal functions create cascading updates throughout the module. (2026-03-04)
- **Context:** parseHistoryFile needed access to config.projectRoot to compute relative paths in error messages
- **Why:** Explicit parameter passing makes dependencies clear and avoids hidden coupling. Adding config as a parameter is more testable and maintainable than alternative approaches (globals, different error handling).
- **Rejected:** Could have created a version that extracts config from another source or uses a different error message approach
- **Trade-offs:** Explicit parameters increase function complexity but reduce hidden dependencies; easier to test and refactor later
- **Breaking if changed:** Any external code or tests calling parseHistoryFile directly would fail with TypeError about missing parameter

#### [Pattern] Selective error handling in fallback-chain patterns: only catch expected errors that trigger fallback, re-throw unexpected errors to preserve debugging information and permission/access issues. (2026-03-04)
- **Problem solved:** Two code paths (readLatestHistoryFile, getHealthTrend) used bare `catch {}` blocks that silently swallowed all errors including EACCES (permission denied), preventing visibility into real problems.
- **Why this works:** ENOENT specifically signals 'path not found, try alternate' (valid fallback trigger), while EACCES/EACCES means 'permission denied' (infrastructure problem). Conflating these hides permission/security issues that should surface loudly.
- **Trade-offs:** More verbose error checking (3 lines vs bare catch) prevents silent degradation at the cost of explicit error routing logic.

#### [Pattern] Silent backward-compatibility fallback pattern: new code path attempts first, silently tries legacy path on ENOENT, allowing gradual migration without forcing immediate updates to all data locations. (2026-03-04)
- **Problem solved:** Health history moved from non-namespaced to namespaced directories; fallback allows old data discovery without requiring migration scripts or user action.
- **Why this works:** Graceful migration reduces operational friction and eliminates data loss risk; users can continue working with old data structure while new code writes to new structure.
- **Trade-offs:** Easier migration experience vs. harder to detect when legacy path is actually being used in production; obscures which clients are still hitting old storage.

### cemReloading flag semantics: flag should represent 'reload I/O in progress', not 'file change event received'. Moved cemReloading = true from fsWatch callback (event fired) to inside setTimeout callback (actual reload starting). (2026-03-04)
- **Context:** Debounce window was incorrectly gating all requests even when cache was still valid. Requests arriving during 100ms debounce window before setTimeout fired were being blocked.
- **Why:** Separates the event layer (file changed) from the intent layer (reload needed). Allows cache-valid requests to proceed during debounce window while still gating during actual I/O. Improves response latency for cache hits.
- **Rejected:** Alternative: Set flag on file event immediately. Rejected because this blocks requests unnecessarily—file change events don't mean reload has started, just that a reload is scheduled.
- **Trade-offs:** Pro: Requests during debounce window proceed normally if cache valid. Con: Requires careful timing of when flag is set (must be before async I/O starts, inside setTimeout).
- **Breaking if changed:** If code assumes cemReloading tracks 'file changed' rather than 'reload in progress', downstream request gating logic will break. Callers rely on flag being false during debounce window with valid cache.

#### [Pattern] Separate debounce logic (setTimeout delay) from reload gating (cemReloading flag). Debounce determines when to *start* reload, flag determines which requests are *blocked*. These are independent concerns. (2026-03-04)
- **Problem solved:** Original design conflated 'debounce window in progress' with 'requests should be rejected'. This prevented cache-valid requests during debounce from succeeding even though reload hadn't started.
- **Why this works:** Debounce is a scheduling concern (defer expensive operation). Gating is a correctness concern (reject requests if cache is invalid). Mixing them couples unrelated issues and forces unnecessary request blocking.
- **Trade-offs:** Pro: Improves responsiveness (cache hits during debounce don't block). Clearer semantics. Con: Requires explicit state management—must ensure flag is set before I/O and cleared after, can't rely on timer state alone.

### Detect Shoelace library identity via package name match ('packageName === @shoelace-style/shoelace') rather than heuristics (URL patterns, module path inspection). (2026-03-04)
- **Context:** Code needed to route Shoelace libraries (which require autoloader.js + theme CSS) differently from generic component libraries (which get direct CDN module paths).
- **Why:** Package name is the single source of truth for library identity. It's guaranteed to exist in package.json, immutable during the build, and not subject to CDN URL formatting variations or module path conventions that differ per library.
- **Rejected:** URL-sniffing (check if cdnBase contains 'shoelace') or path heuristics (check if module path contains 'shoelace')—both are fragile across CDN providers and custom naming schemes. Package name is declarative and canonical.
- **Trade-offs:** Requires reading package.json (small I/O overhead). Much more robust and maintainable than string-matching heuristics. Enables clear, testable branching logic.
- **Breaking if changed:** If Shoelace ever changes their official package name (unlikely but possible in major versions), this detection silently fails. No runtime error; code just treats Shoelace as generic. Mitigation: document the package name assumption and catch it in CI if package.json changes.

#### [Gotcha] Bundle cache uses `${pkg}@${version}` key with no library prefix, creating silent cache collision when two libraries request same package+version in different contexts (2026-03-04)
- **Situation:** Shared cache across all libraries with package-version granularity but no library namespace
- **Root cause:** Cache was designed for single-library mode; the same package at same version in two library contexts will incorrectly reuse the first response without validating library context
- **How to avoid:** Fixing requires cache key to `${libraryId}:${pkg}@${version}` — API-invisible change but non-trivial search/replace across cache operations

#### [Gotcha] Health history directory structure already supports library namespacing (`health-history/{libraryId}/{tagName}/`), but all callers hardcode `'default'` instead of passing actual libraryId (2026-03-04)
- **Situation:** Infrastructure built for multi-library but calling code only uses single-library defaults
- **Root cause:** API (`componentHistoryDir(libraryId)`) accepts the parameter, but upstream handlers never pass it — design pattern went unused
- **How to avoid:** P0 fix is simple (thread libraryId through callers), but reveals infrastructure-implementation mismatch that persists elsewhere

#### [Pattern] Compare and Benchmark handlers already support multi-CEM by accepting explicit file paths as arguments, avoiding global state dependency entirely (2026-03-04)
- **Problem solved:** Most handlers depend on global `cemCache` singleton; these two don't
- **Why this works:** Designed for comparing/benchmarking distinct CEMs — the use case requires reading multiple files, so they were built stateless from the start
- **Trade-offs:** Isolation means no changes needed for multi-CEM, but creates inconsistency with other handlers' dependency patterns

### Replace single `cemReloading: boolean` lock with `cemReloading: Map<libraryId, boolean>` — debounce per library, not per process (2026-03-04)
- **Context:** Current debounce prevents double-reloads of a single CEM; with N libraries, single boolean becomes a bottleneck and false-positive contention
- **Why:** One library's file change should not block reload of another library's watcher. Each library needs independent debounce state to avoid cascading delays
- **Rejected:** Keep single boolean (simpler but breaks concurrent reload guarantees), or use semaphore/promise chain (over-engineered for debounce use case)
- **Trade-offs:** Map adds small memory overhead and requires Map lookup in hot path, but enables N concurrent reloads. Worth it for multi-library correctness
- **Breaking if changed:** If code inspects `cemReloading` flag directly (currently it's only used in `startCemWatcher`), the type change breaks. Recommend always using `isLibraryReloading(libraryId)` accessor

#### [Gotcha] Shoelace-specific CDN detection hardcoded in `src/handlers/suggest.ts:329` will silently fail for other libraries' components in multi-CEM mode (2026-03-04)
- **Situation:** Logic assumes all components use Shoelace's CDN URL patterns; other libraries (Fast, Ionic, etc.) have different patterns
- **Root cause:** Library-specific URL generation was hardcoded during single-library design; becomes a data-driven lookup problem in multi-CEM
- **How to avoid:** Fix requires per-library config field for CDN URL patterns. Adds config complexity but makes handler stateless and composable

#### [Pattern] Config migration strategy: keep `cemPath` as backward-compatible shorthand that populates `libraries[0]`, rather than force all configs to rewrite (2026-03-04)
- **Problem solved:** Moving from `config.cemPath: string` to `config.libraries: [{id, cemPath, prefix}]`
- **Why this works:** Allows existing configs to work unchanged; `loadConfig()` can normalize `cemPath` → `libraries[0]` with default id. Gradual migration path without breaking adopters
- **Trade-offs:** More code paths in `loadConfig()` to handle both cases, but payoff is frictionless upgrade experience. Worth the cost

#### [Gotcha] Health score normalization is per-component independent (no cross-library aggregation), but the scoring function is not library-aware — it assumes single CEM context (2026-03-04)
- **Situation:** Raw integer scores are stored per component, not compared across libraries. But `scoreAllComponents()` only works on one CEM at a time
- **Root cause:** Scoring is a local heuristic that doesn't need to be comparable across libraries. Isolation prevents meaningless cross-library comparisons
- **How to avoid:** Simpler implementation, but user cannot compare component health across libraries directly. Acceptable because libraries have different quality bars

### CDN `register` handler (currently TODO at `src/handlers/cdn.ts:186`) should write merged CEMs to in-memory `cemMap`, not file system (2026-03-04)
- **Context:** Merged CEM from registration needs to be available to other handlers; currently no persistence mechanism
- **Why:** In-memory store is fast, no I/O coupling, and merged CEM is ephemeral (doesn't need to persist). Alternative file write adds latency and cleanup complexity
- **Rejected:** Write to temp file (I/O overhead, requires cleanup), or broadcast event to all handlers (tighter coupling, harder to test)
- **Trade-offs:** In-memory approach loses persistence across restarts, but MCP is a runtime session service — not expected to persist across crashes anyway
- **Breaking if changed:** If future code expects registered CEMs to survive server restart, this design won't support it. Document as session-scoped

#### [Gotcha] Handler signature change from `handle*Call(..., cemCache: Cem)` to `handle*Call(..., cemMap: Map<id, Cem>)` is a cascading breaking change touching all handlers and callers (2026-03-04)
- **Situation:** Current architecture passes global `cemCache` to each handler; moving to map requires threadeding libraryId through the call chain
- **Root cause:** Necessary for multi-library support, but the scope of impact (P2 effort, high risk) suggests this should be deferred until config + tool schemas are stable
- **How to avoid:** Doing this first creates thrashing; recommend doing after P1 config work so tool signatures and libraryId propagation strategy are locked in

#### [Pattern] `mergeCems()` function exists and is correct but is never called — CDN register path is the explicit wiring point (marked by TODO comment) (2026-03-04)
- **Problem solved:** Infrastructure for merging multiple CEMs into one document exists, but registration flow doesn't use it
- **Why this works:** Registration is incomplete; `mergeCems()` was added anticipating multi-library merge scenario (combining CEMs for unified suggestions), but the caller wasn't wired in
- **Trade-offs:** Wiring it into CDN register path is straightforward once `cemMap` is available. Leaving it unwired is acceptable intermediate state — doesn't hide bugs, just incomplete

### Registry-specific behavior (unpkg vs jsdelivr) is centralized at prefix generation point (`expectedPrefix = registry === 'jsdelivr' ? '...cdn.jsdelivr.net/npm/' : '...unpkg.com/'`), not scattered across URL construction, validation, or formatting logic. (2026-03-04)
- **Context:** Managing CDN differences cleanly without duplication across codebase
- **Why:** Single source of truth for registry differences ensures consistency and makes future registry additions (new CDN) require changes in one place only
- **Rejected:** Spreading registry logic across multiple code paths (conditional URL assembly, conditional validation, etc.) — creates maintenance burden and inconsistency risk
- **Trade-offs:** Centralization makes registry-specific code easier to find and modify, but obscures per-operation registry differences from callers
- **Breaking if changed:** If new registry-specific logic is added elsewhere without checking this central point, silent inconsistencies emerge (e.g., validation rules that don't match URL construction)

### Registry-specific path semantics: jsDelivr requires `/npm/` prefix for npm packages, but unpkg does not — path segment is registry-specific, not universal across all CDNs. (2026-03-04)
- **Context:** Understanding CDN-specific URL formats and why naive URL construction fails
- **Why:** Each CDN has its own namespace strategy; conflating them causes bugs. jsDelivr uses `/npm/` to distinguish npm packages from other content types, unpkg uses package name directly.
- **Rejected:** Assuming `/npm/` is universal across CDNs or required for all package registries
- **Trade-offs:** Understanding registry semantics adds complexity but prevents bugs from wrong assumptions about CDN behavior
- **Breaking if changed:** If adding new CDN and copy-pasting jsDelivr format without understanding unpkg differences, same `/npm/` bug reappears

#### [Pattern] SafeFileOperations uses constructor parameter (projectRoot) to control path representation in error messages. Callers pass config.projectRoot when instantiating to enable relative path display. (2026-03-04)
- **Problem solved:** compare.ts and benchmark.ts changed from 'new SafeFileOperations()' to 'new SafeFileOperations(config.projectRoot)' to make error messages display relative paths instead of absolute.
- **Why this works:** Centralizes path sanitization logic in one component. SafeFileOperations needs project context to decide whether to return relative or absolute paths via safePath().
- **Trade-offs:** Requires callers to remember passing projectRoot (easy to forget, but failure mode is safe - just uses absolute paths). Encapsulation prevents duplication.

### Centralizing path safety logic in SafeFileOperations wrapper component instead of scattering safety checks across multiple handler files (compare.ts, benchmark.ts, health.ts, cdn.ts). (2026-03-04)
- **Context:** The same SafeFileOperations instance is used by multiple handlers that need to prevent absolute path disclosure in errors.
- **Why:** Single source of truth for path sanitization. When SafeFileOperations is updated, all handlers automatically benefit. Reduces cognitive load and bug surface area.
- **Rejected:** Duplicating sanitization logic in each handler file - error-prone and inconsistent. health.ts and cdn.ts would have divergent implementations.
- **Trade-offs:** Handlers become thinner (less code), but SafeFileOperations becomes more critical - bugs here affect all handlers. Easier to maintain but higher risk concentration.
- **Breaking if changed:** If SafeFileOperations is removed or its safePath() method changes behavior, all dependent handlers break in the same way (consistent failure but widespread impact).

#### [Pattern] Dual validation layers: pre-resolution schema validation (FilePathSchema for '..' segments, null bytes) + post-resolution containment check (resolve + startsWith). Cannot collapse into single layer. (2026-03-04)
- **Problem solved:** Both compare.ts and benchmark.ts need to prevent path escape; naive approach would combine checks, but schema validation is structural while containment depends on runtime symlink resolution.
- **Why this works:** FilePathSchema catches obvious semantic issues early and scales to multiple handlers. Containment check must happen AFTER join(projectRoot, userPath) and resolve() to catch symlink attacks that schema cannot detect.
- **Trade-offs:** Two validation points = more code, but necessary split: schema is context-free and reusable; containment is context-aware and handler-local.

### Containment validation stays in handler functions (compare.ts, benchmark.ts), not in Zod schema, because it depends on config.projectRoot context variable. (2026-03-04)
- **Context:** FilePathSchema is in shared/validation.ts and doesn't have access to handler config. Could pass projectRoot to schema, but would require passing context through every validation point.
- **Why:** Zod schemas are context-free validators; adding context dependencies would couple shared schema to specific handlers. Runtime check in handler is simpler and more maintainable.
- **Rejected:** Adding projectRoot as a Zod context parameter (creates coupling, harder to test schema independently), or moving containment check to SafeFileOperations (still needs to validate before operations begin).
- **Trade-offs:** Small code duplication across handlers (absPath.startsWith check) vs. tight coupling if schema had context. Duplication is acceptable, coupling is not.
- **Breaking if changed:** If FilePathSchema were to change structure or location, handlers would still need separate containment logic; cannot fully centralize this particular check.

#### [Pattern] Validation split into two layers: Zod schema regex on user input (src/tools/bundle.ts), and response size validation on API response (src/handlers/bundle.ts). Validates threat model at each boundary. (2026-03-04)
- **Problem solved:** Protecting bundle handler from both malicious user input and compromised/malicious third-party API responses
- **Why this works:** User input and API responses are different threat models requiring different validation. Schema validation fails early and returns helpful errors to users. Response validation prevents processing of oversized data without user visibility.
- **Trade-offs:** More validation code but clearer threat model boundaries. User sees regex validation errors directly. Response size errors fail silently (returns null).

#### [Pattern] Direct input parameters guarded at schema (Zod); derived/computed values guarded at the algorithm level. Schema validates what the user sends; function guards what the algorithm consumes. (2026-03-04)
- **Problem solved:** HTML is a direct function parameter; attribute names are extracted during internal parsing and then passed to suggest(). Different origin, different guard location.
- **Why this works:** Semantic separation: schema validates the contract at the boundary; algorithm guards protect against internal computations that depend on derived data. Schema can't easily validate properties of parsed content (attribute name lengths) without re-parsing.
- **Trade-offs:** Distributed guards are harder to audit but respect separation of concerns; centralized guards are easier to audit but more fragile when data flows through multiple transformations

#### [Gotcha] Export name collisions emerge when aggregating barrel exports from multiple modules (scoreComponent existed in both tools/discovery.ts and handlers/health.ts). TypeScript compilation fails; resolution requires manual aliasing. (2026-03-04)
- **Situation:** Creating index.ts barrel exports across packages/core modules to enable `export * from './...'`
- **Root cause:** Barrel export aggregation doesn't deduplicate names across files. When multiple modules export the same symbol, the compiler rejects the ambiguous re-export.
- **How to avoid:** Aliasing (scoreComponentSearch) makes one export awkwardly named but keeps the aggregation pattern. Trade: simpler imports later vs. slightly ugly alias names.

#### [Gotcha] TypeScript's rootDir configuration cannot accommodate multiple disconnected source trees (src/ and packages/core/src/) in a single tsc invocation. rootDir must be unset or removed entirely when spanning multiple directory hierarchies. (2026-03-04)
- **Situation:** Migrating core logic to packages/core/src/ while keeping entry points in src/ required recompiling both trees together.
- **Root cause:** rootDir constrains all source files to exist within a single directory subtree from the project root. With sources split across two independent trees, rootDir causes path resolution failures.
- **How to avoid:** Removing rootDir simplifies the build to a single tsc pass covering both trees, but loses the constraint that ensures all sources are within one logical root.

#### [Pattern] Monorepo packages can export source-level (.ts) artifacts instead of pre-built outputs when the root project's tsc compilation includes and compiles all source trees together into a single build/ directory. (2026-03-04)
- **Problem solved:** packages/core uses source-level exports without its own separate build step; root tsc handles all compilation.
- **Why this works:** This avoids the overhead of building packages/core independently while still enabling it to function as an importable package. Works because root tsc compiles everything into build/ atomically, ensuring consistency.
- **Trade-offs:** Simplicity and consistency gained, but packages/core cannot be published or used independently; tight coupling to root build process.

### Entry point dispatching via process.argv allows a single package (and single node_modules footprint) to serve multiple use cases: MCP server mode and CLI init mode. (2026-03-04)
- **Context:** npx helixir with no args starts MCP server; npx helixir init runs CLI setup. Both must coexist in one package.
- **Why:** Avoids splitting dependencies and shared logic (handlers, tools, config) across separate packages or entry points. Single dependencies list, shared test coverage, unified version.
- **Rejected:** Alternative: separate @helixir/mcp and @helixir/cli packages. This would isolate concerns but duplicate dependencies, shared code, and tests.
- **Trade-offs:** Unified package is simpler to maintain and deploy, but src/index.ts gains dispatcher logic; users running CLI must include unused MCP dependencies.
- **Breaking if changed:** Removing the dispatcher would require separate entry points, package.json exports, and likely separate packages to avoid wasted dependencies.

### Made new config fields optional (`cdnAutoloader?: string | null`) instead of required (`cdnAutoloader: string | null`) (2026-03-04)
- **Context:** Adding configurable CDN paths discovered that making fields required would break ~25 existing test files that construct McpWcConfig without these fields
- **Why:** Optional fields preserve backwards compatibility with existing code and tests; required fields would force cascading updates across the entire test suite
- **Rejected:** Making fields required and updating all 25+ test files—unnecessary churn and fragile coupling between config schema and tests
- **Trade-offs:** Easier migration path (no breaking changes), simpler PR (focused on feature not test refactoring); but slight loss of schema strictness (field absence vs null not type-distinguished)
- **Breaking if changed:** If changed to required fields, all code constructing McpWcConfig without these fields would fail type-checking

#### [Pattern] The `??` (nullish coalescing) operator treats optional fields with `undefined` the same as explicit `null`, enabling fallback logic to work for both 'field absent' and 'field set to null' cases (2026-03-04)
- **Problem solved:** Using optional fields (`cdnAutoloader?`) means the field can be `undefined` (absent from object) or `null` (present but nullish); both needed to trigger the same default behavior
- **Why this works:** Optional fields in TypeScript are `T | undefined`, and `??` coalesces both `undefined` and `null` identically—no special case handling needed for 'field not provided'
- **Trade-offs:** Simpler fallback logic; trade-off is inability to distinguish 'field omitted' from 'field explicitly null', but that distinction isn't semantically meaningful for defaults

### Library-specific defaults (Shoelace autoloader and stylesheet) only apply when `packageName === '@shoelace-style/shoelace'`; other libraries fall back to generic `${cdnBase}/${modulePath}` (2026-03-04)
- **Context:** Original code hardcoded Shoelace paths for all libraries, causing incorrect CDN links for non-Shoelace components; refactor needed to fix this
- **Why:** Each library has different CDN conventions—Shoelace has an autoloader and theme stylesheet, others don't. Applying Shoelace defaults to all libraries causes the original bug. Explicit library check prevents accidental path leakage
- **Rejected:** Keep Shoelace defaults for all libraries (causes the bug); or make all paths generic (loses Shoelace's convenient autoloader feature)
- **Trade-offs:** Slightly more complex logic (conditional by package name); preserves Shoelace convenience while fixing non-Shoelace libraries
- **Breaking if changed:** If the `isShoelace` check is removed, Shoelace defaults would apply to all libraries again, reintroducing the original bug

#### [Pattern] Three-level config precedence: explicit override (`config.cdnAutoloader`) > library-specific default (`isShoelace ? shoelace-autoloader.js : null`) > generic fallback (`${cdnBase}/${modulePath}`) (2026-03-04)
- **Problem solved:** Need to support three scenarios: hardcoded defaults (Shoelace), explicit per-environment overrides (env vars), and generic CDN support for any library
- **Why this works:** Precedence hierarchy allows maximum flexibility—env vars/config override library defaults, library defaults override generic behavior, all have sensible fallbacks
- **Trade-offs:** More complex conditional logic; enables three degrees of control (library-agnostic override, library-specific, generic)

### Selective error propagation in fallback logic: Only ENOENT (file not found) triggers fallback to legacy path; all other errors (EACCES, EACCES, etc.) are re-thrown immediately (2026-03-04)
- **Context:** health.ts readdir() on namespaced directory can fail for multiple reasons: the path doesn't exist (ENOENT) or permissions are denied (EACCES)
- **Why:** ENOENT semantically means 'try the next option'; EACCES means 'something is genuinely wrong with permissions'. Silently swallowing permission errors would hide real infrastructure/deployment problems
- **Rejected:** Blanket catch-all that silently falls back on any error—this masks permission issues and makes debugging harder
- **Trade-offs:** More lines of error handling code vs avoiding silent failures; explicit intent vs simple fallback logic
- **Breaking if changed:** If the error check is removed and all errors are caught, permission denied (EACCES) errors will be masked, application will fail silently on permission issues

#### [Gotcha] Using undefined placeholders for positional arguments (e.g., `getHealthDiff(config, tagName, baseBranch, undefined, undefined, libraryId)`) is fragile and error-prone. (2026-03-04)
- **Situation:** When threading libraryId through getHealthDiff, it's the 6th positional parameter, requiring undefined placeholders for cemDecl and gitOps.
- **Root cause:** Function signature uses positional args with many optional parameters. Placeholders work now but become unmaintainable.
- **How to avoid:** Shorter parameter lists vs explicit call sites. Type safety lost for placeholder positions - TypeScript can't catch wrong placeholder usage.

### Chose to validate libraryId only at the lowest layer (componentHistoryDir regex allowlist) rather than repeating validation at API entry points (handlers/tools). (2026-03-04)
- **Context:** libraryId is optional with default 'default', but must be validated as safe directory component. Could validate at tool dispatcher, handler level, or utility level.
- **Why:** DRY principle - validation logic already exists and componentHistoryDir is the single point where libraryId becomes a filesystem operation.
- **Rejected:** Could add explicit validation at handler/tool entry points for defense-in-depth and fail-fast semantics.
- **Trade-offs:** Saves code duplication vs explicit validation boundaries. Creates implicit contract that all callers trust lower layer validation.
- **Breaking if changed:** If future code paths bypass componentHistoryDir and use libraryId unsafely, no validation catches it. Assumes componentHistoryDir is always used.

### Did not update score_all_components tool to accept libraryId, treating it as operating on single CEM per invocation. (2026-03-04)
- **Context:** Feature adds libraryId to score_component, get_health_trend, get_health_diff but intentionally excludes score_all_components.
- **Why:** score_all_components iterates over all components in a provided CEM. Multi-CEM operation would be a separate feature.
- **Rejected:** Could add libraryId to score_all_components and have it filter/select CEMs by libraryId, opening multi-library scoring.
- **Trade-offs:** Narrower scope now vs future flexibility. Prevents scope creep but requires separate feature if multi-CEM scoring needed later.
- **Breaking if changed:** Assumes single CEM per health context. If architecture evolves to multi-CEM per request, this tool becomes unusable.

#### [Pattern] Chose explicit parameter threading through call chain (tool dispatcher → handler → utility functions) over dependency injection/context. (2026-03-04)
- **Problem solved:** libraryId must flow from tool input schema through handlers to componentHistoryDir. Each layer added the parameter.
- **Why this works:** Explicit threading makes dependencies visible in function signatures. Clearer what each layer needs.
- **Trade-offs:** More visible dependencies vs more parameter passing and function signature bloat. Explicit but verbose.

#### [Pattern] CEM tagName validation regex `^[a-z][a-z0-9]*(-[a-z0-9]+)+$` directly encodes W3C custom element spec requirements: lowercase first character, at least one hyphen, alphanumeric only. (2026-03-04)
- **Problem solved:** Adding format constraint to CemDeclarationSchema.tagName to prevent ReDoS attacks from untrusted regex metacharacters in CDN-sourced CEM metadata.
- **Why this works:** Validation should enforce platform-level requirements. Browsers reject non-spec-compliant custom element names anyway; catching them early prevents wasted processing and attack surface.
- **Trade-offs:** Strict validation ensures correctness but couples validation tightly to W3C spec. Non-compliant CEM files from external sources will be rejected at parse time.

### Keep 'npx helixir' (no subcommand) routing to MCP server instead of showing help. Use '--help' flag for help text. (2026-03-04)
- **Context:** Conflict between ideal CLI UX (show help with no args) and pre-existing startup.test.ts which expects no-arg behavior to launch MCP server
- **Why:** Changing no-arg behavior breaks existing integrations. MCP client configurations and startup tests depend on this. Backward compatibility required preserving MCP routing.
- **Rejected:** Show help on no-args (matches standard CLI UX) — breaks startup.test.ts and breaks MCP client configurations expecting server launch
- **Trade-offs:** Users must explicitly use '--help' flag rather than learning no-args convention. Maintains existing integrations at cost of UX predictability.
- **Breaking if changed:** If changed to show help on no-args, startup.test.ts fails and any external MCP clients expecting server launch behavior would break

### Composite GitHub Action commits dist/ build artifacts to repo instead of building on-demand (2026-03-04)
- **Context:** Creating a reusable GitHub Action that runs Node.js code in PR workflows
- **Why:** GitHub Actions execute from the checked-out repository, not from npm. Composite actions with Node.js steps load code from the filesystem at runtime. Without committed dist/, the action fails when GitHub tries to execute it—the build step doesn't run until after the action's own steps start.
- **Rejected:** Building dist/ in CI before the action runs, or building dynamically within the action.yml script step
- **Trade-offs:** Committing dist/ adds repo size and requires rebuild+commit on source changes; avoids runtime build overhead and ensures deterministic action execution without external build infrastructure
- **Breaking if changed:** If dist/ is excluded via .gitignore or deleted, the composite action fails at runtime with 'file not found' when it tries to execute node dist/index.js

#### [Pattern] Skip bundling Node.js GitHub Action if composite action installs dependencies in-action (2026-03-04)
- **Problem solved:** Composite GitHub Action with TypeScript source that needs to run in workflows
- **Why this works:** Composite actions have a setup step that can run npm install at github.action_path before the main script executes. This means dependencies are always available at runtime, eliminating the bundling requirement. Plain tsc output is sufficient—no need for esbuild complexity.
- **Trade-offs:** dist/index.js is larger (~50KB+ vs ~10-20KB bundled); eliminates bundler toolchain complexity and pnpm friction; install step adds ~3-5 seconds to action runtime but improves maintainability

### Allow config file auto-discovery via helixir CLI defaults instead of requiring explicit config-path input (2026-03-04)
- **Context:** GitHub Action wraps helixir CLI which already has convention-based config discovery (mcpwc.config.json)
- **Why:** helixir CLI auto-discovers config in standard locations. Duplicating this logic in the action or requiring users to explicitly pass config-path would add friction. Delegating to the CLI's existing defaults reduces configuration burden and keeps the action simple.
- **Rejected:** Could require config-path as mandatory input, ensuring explicit configuration; or hard-code config path in action
- **Trade-offs:** Easier for users (less configuration required); requires knowledge of helixir defaults; CLI command must support auto-discovery for this to work
- **Breaking if changed:** If helixir CLI stops supporting config auto-discovery or changes its default paths, action behavior becomes unpredictable unless config-path is explicitly provided

#### [Pattern] Multi-CEM namespace isolation via flat key format with colon separator (libraryId:pkg@version) in in-memory Map, rather than nested Map<libraryId, Map<pkg, CacheEntry>> (2026-03-04)
- **Problem solved:** Implementing multi-CEM readiness for bundle cache to prevent collisions across different library instances
- **Why this works:** Flat key with separator keeps cache eviction/lookup logic simple while enabling namespace isolation. Comment documents the format, making it explicit contract
- **Trade-offs:** Simpler eviction but cache key format becomes implicit API contract that must be maintained and documented

#### [Gotcha] libraryId pattern with 'default' value was already established in handlers/health.ts—this change follows existing multi-CEM conventions already baked into codebase (2026-03-04)
- **Situation:** Developer discovered via grep that libraryId wasn't new; it was already being used in related handler
- **Root cause:** Codebase was already designed for multi-CEM (multiple custom element manifests), just needed propagation to bundle cache layer. Following existing convention ensures consistency
- **How to avoid:** Easier to implement (pattern already proven) but indicates multi-CEM readiness work is partially done elsewhere—need full codebase audit

#### [Gotcha] Cache key format is implicit API contract—documentation (comment change) is critical because no migration path exists for in-memory cache if format must change (2026-03-04)
- **Situation:** Updated comment from 'keyed by "<package>@<version>"' to 'keyed by "<libraryId>:<package>@<version>"'
- **Root cause:** In-memory cache means format changes can't be migrated—old keys won't match new format. Any code that logs keys, parses keys, or assumes format depends on documentation being accurate
- **How to avoid:** Had to update docs but protects against future confusion or refactoring that changes format unexpectedly

#### [Pattern] Config generation must be validated end-to-end against actual target systems, not just theoretical correctness. MCP config assumes cwd support but never tested against Claude Desktop. (2026-03-04)
- **Problem solved:** Gap between assumed behavior of config consumers and actual behavior
- **Why this works:** Config is written by one system (helixir) but consumed by another (Claude Desktop). Assumptions about the consumer's API aren't validated.
- **Trade-offs:** End-to-end testing is expensive; theoretical validation is cheap. But theory doesn't catch API differences.

#### [Gotcha] Init wizard outputs `cwd` field in snippets; IDE config sections require `env` field. These are not equivalent and users commonly confuse them. (2026-03-04)
- **Situation:** When documenting configuration across multiple editors and the init command, discovered that the init wizard's output format differs from actual IDE config requirements.
- **Root cause:** Init wizard is REPL-focused (outputs a snippet to copy), while IDE configs are JSON-based. The init stores output in different structure than what IDEs parse.
- **How to avoid:** Requires explicit documentation of both formats; increases guide length but prevents silent config failures.

#### [Pattern] Proactive troubleshooting with 8 issue categories, each with symptoms, root causes, diagnostics, and fixes. Not reactive bug reports but predicted pain points. (2026-03-04)
- **Problem solved:** IDE integration is high-friction: different Node versions, PATH issues, restart requirements, file paths with spaces. Guide anticipates all common setup failures.
- **Why this works:** IDE setup is user's first experience with the tool. Getting stuck here causes abandonment. Root-cause diagnosis (e.g., 'Node.js version too old' → `node --version`) trains users to self-diagnose.
- **Trade-offs:** Makes guide 50% longer but reduces support volume by allowing users to fix common issues independently.

#### [Pattern] Documented the Configuration Reference with all fields (including `cdnAutoloader`, `cdnStylesheet`) not mentioned elsewhere. Single source of truth for config schema. (2026-03-04)
- **Problem solved:** Config.ts has several fields that don't appear in README. Users have no way to discover they exist for IDE config.
- **Why this works:** IDE setup is one-time, high-stakes activity. Missing config field discovery means users can't enable features they need. Central reference prevents scattered, inconsistent documentation.
- **Trade-offs:** Longer guide but all config options accessible from one place; reduces need for users to read TypeScript source.

### Created fully standalone `IDE-INTEGRATION.md` independent of README. No cross-references back to main docs; complete information in one document. (2026-03-04)
- **Context:** Guide needed to cover all 6 editors with exact paths, platform-specific instructions, framework notes, and troubleshooting without bloating README.
- **Why:** IDE integration is a distinct user journey (not everyone using helixir uses an IDE; some use CLI). Standalone doc allows independent discovery and updates without breaking main README.
- **Rejected:** Putting IDE docs in README (would double its size and mix different concerns); cross-referencing to README sections (creates maintenance coupling).
- **Trade-offs:** Users must find the guide separately, but once found, it's self-contained and doesn't require README context.
- **Breaking if changed:** If guide is removed, IDE users have no single place to find their specific editor config; they're forced to infer from code.

#### [Pattern] Platform-specific file paths documented explicitly (macOS `~/Library/Application Support/Claude/...`, Windows `%APPDATA%\Claude\...`, Linux `~/.config/...`). Not relative or generic. (2026-03-04)
- **Problem solved:** IDE config file locations vary by OS. Generic 'home directory' instructions are ambiguous and frustrating.
- **Why this works:** Copy-paste usability: users can follow exact path and immediately find their config file. Reduces 'where is my config' questions and errors from guessing paths.
- **Trade-offs:** Makes guide longer (one section per OS per editor) but eliminates path confusion entirely.

#### [Pattern] Framework-specific notes (Shoelace, Lit, Stencil, FAST, Spectrum, Polymer) included in integration guide. Not assuming generic web component compatibility. (2026-03-04)
- **Problem solved:** helixir is framework-agnostic but different frameworks have different token formats, component export patterns, and CEM generation approaches.
- **Why this works:** Users don't use helixir in isolation; they use it with their framework. If their framework's token format or component structure doesn't match documentation, they fail silently.
- **Trade-offs:** Larger guide but real-world applicable; users can configure for their specific framework without trial-and-error.

#### [Pattern] Asymmetric error handling across fallback layers: outer catch must be selective (only ENOENT triggers fallback), inner legacy-path catch can be bare (any error means 'no history available') (2026-03-04)
- **Problem solved:** Two-layer fallback chain: try new path → (if ENOENT only) try legacy path → (if any error) return null. Outer layer guards entry to fallback; inner layer is fallback itself.
- **Why this works:** Outer layer decides WHETHER to attempt fallback - permission issues should stop here entirely. Inner layer is already in 'fallback mode' where any failure simply means 'no data available' (acceptable outcome).
- **Trade-offs:** More nuanced code but correctly prevents permission errors from propagating through to legacy path while still allowing graceful degradation when legacy path genuinely unavailable

#### [Pattern] Threading optional parameters (libraryId) through an entire call stack to prepare for multi-tenancy/multi-component scenarios. Parameters are fully wired and passed through utility functions even before multiple values are actively used. (2026-03-04)
- **Problem solved:** Preparing for multi-CEM (Component Experience Module) readiness by moving away from hardcoded 'default' libraryId to accept it as a parameter throughout the system.
- **Why this works:** Enables future features to use different libraryIds without refactoring the entire call chain later. Reduces future breaking changes by establishing the infrastructure pattern now.
- **Trade-offs:** Current code complexity increases (more parameters to pass), but implementation is simpler in the future. Parameter remains optional to preserve backward compatibility.