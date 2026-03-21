---
tags: [api]
summary: api implementation decisions and patterns
relevantTo: [api]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 24
  referenced: 12
  successfulFeatures: 12
---
# api

### Server-generated timestamp in HealthSummary represents computation time (when summary was computed), not data freshness or measurement time (2026-03-03)
- **Context:** Adding timestamp to aggregate health endpoint that synthesizes component health data measured at different points in time
- **Why:** HealthSummary is computed on-demand per request; the only 'fresh' moment is when this computation occurs. Component-level timestamps separately track measurement times of individual components.
- **Rejected:** Could embed component timestamps (latest/oldest) but semantically incorrect—doesn't reflect when summary was computed; could add explicit 'dataFreshness' field but adds complexity
- **Trade-offs:** Simple API contract (single timestamp field) vs precise semantics; clients must understand timestamp represents computation-time, not measurement-time or data validity period
- **Breaking if changed:** Client monitoring code that assumes HealthSummary.timestamp means 'all health data current as of this time' will fail. Component data can be older than summary computation time, causing incorrect caching/refresh decisions

#### [Pattern] CDN writeFileSync failure (disk full) doesn't throw - caught in same catch block as mkdirSync failure, returns success without cachePath (2026-03-03)
- **Problem solved:** Both mkdirSync and writeFileSync failures produce identical outcome: service succeeds, cache is skipped
- **Why this works:** Graceful degradation - cache is optimization, not critical. Failing to write cache shouldn't fail the CDN fetch handler
- **Trade-offs:** Silent failure to cache (user never knows cache write failed) vs transparency - but silently graceful for optimization failures

### Surfaced implicit register side effect as explicit register parameter in resolve_cdn_cem handler + tool (2026-03-03)
- **Context:** resolve_cdn_cem implicitly registered the CEM store, making it hard to test and understand the full effect
- **Why:** Explicit parameters make side effects testable (can pass register=false) and discoverable. Prepares for future multi-CEM store support
- **Rejected:** Could have left it implicit, but then tests can't control registration behavior and callers don't know about the side effect
- **Trade-offs:** Slightly more verbose API but much clearer semantics. Added TODO for future multi-CEM store integration
- **Breaking if changed:** Callers must now explicitly pass register parameter (defaults to false, so backwards-incompatible if not specified)

#### [Gotcha] Node.js fetch response.body is ReadableStream in production but undefined in test mocks. Code must handle both via fallback: if body exists, iterate stream; else call response.text(). (2026-03-04)
- **Situation:** Streaming size accumulator requires iteration via getReader(), but test mocks don't implement ReadableStream. Without fallback, either tests fail or production can't measure streaming responses.
- **Root cause:** Production Node.js uses real ReadableStream. Test mocks (vi.fn().mockResolvedValue) return plain objects without stream methods. The mismatch is unavoidable without complex mock setup.
- **How to avoid:** Fallback adds code branch but enables both production streaming checks AND simple test mocks. Streaming measurement requires full stream implementation in tests.

#### [Pattern] TypeScript type assertion pattern for Node.js errno: `(err as NodeJS.ErrnoException).code` is the correct idiom for checking specific error codes like ENOENT, EACCES (2026-03-04)
- **Problem solved:** JavaScript Error objects don't have .code by default; only NodeJS.ErrnoException extends Error with .code property for filesystem/system errors
- **Why this works:** This pattern allows TypeScript to type-narrow the error object and safely access the .code property without runtime errors or type-checking failures
- **Trade-offs:** Requires knowing NodeJS.ErrnoException exists; type assertion is slightly less safe than full type guard, but is the idiomatic Node.js pattern

#### [Pattern] Use @actions/core.getInput() to read action inputs instead of direct environment variable access (2026-03-04)
- **Problem solved:** Accessing GitHub Action input parameters in Node.js handler code
- **Why this works:** GitHub Actions automatically creates INPUT_* environment variables from action inputs, but the case-conversion and prefixing is automatic only via the @actions/core API. Using core.getInput('check-name') is cleaner than process.env.INPUT_CHECK_NAME and handles the naming convention transparently.
- **Trade-offs:** Minimal—@actions/core is lightweight and adds no real overhead; ensures code follows GitHub Actions conventions

### Added libraryId as optional parameter with default 'default' rather than required parameter: estimateBundleSize(..., libraryId = 'default') (2026-03-04)
- **Context:** Extending function signature for multi-CEM support without breaking existing call sites
- **Why:** Optional parameter with sensible default enables backwards compatibility—existing callers work unchanged, new multi-CEM callers can pass explicit libraryId. Incremental adoption without coordinating all callers
- **Rejected:** Making libraryId required would force immediate updates to all call sites and require coordination across codebase
- **Trade-offs:** Function signature becomes slightly longer and parameter position matters for optional args, but zero breakage and smoother rollout
- **Breaking if changed:** Changing default from 'default' to something else later requires audit of all callers since existing code depends on 'default' behavior

### 'findComponentsByToken()' throws bare 'Error' instead of 'MCPError' with proper ErrorCategory. This breaks the error categorization chain in 'handleToolError' downstream. (2026-03-04)
- **Context:** One error-throwing function doesn't follow the established error handling pattern
- **Why:** Likely an oversight during refactoring or copy-paste from code that predates MCPError pattern
- **Rejected:** All errors should throw 'MCPError(..., ErrorCategory.VALIDATION)' to maintain consistent error handling
- **Trade-offs:** Bare Error is simpler initially but breaks error aggregation; MCPError requires categorization but enables proper error routing
- **Breaking if changed:** Error categorization logic fails, incorrect error messages sent to user, error stats/logging misses this category

#### [Gotcha] Continue IDE uses `"command": "string"` format while Claude Code, VS Code + Cline, Cursor all use `{"command": "...", "args": [...]}` format. This is a fundamental difference, not just a field name. (2026-03-04)
- **Situation:** While documenting MCP server config for 6 different IDEs, discovered Continue's config schema is structurally different from all others.
- **Root cause:** Continue has its own config parser that doesn't expect args array; other IDEs use standard MCP protocol which requires separate command/args.
- **How to avoid:** Documentation must show editor-specific snippets; can't provide one universal copy-paste config.