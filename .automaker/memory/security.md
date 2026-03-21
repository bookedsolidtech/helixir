---
tags: [security]
summary: security implementation decisions and patterns
relevantTo: [security]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 43
  referenced: 27
  successfulFeatures: 27
---
# security

### Zod runtime validation covers schema/type shape but not semantic safety (git ref injection vulnerability) (2026-03-03)
- **Context:** baseBranch parameter validated by Zod schema but lacks character-level validation before passing to git commands
- **Why:** Zod provides declarative input validation; adding semantic validation per domain (git-safe chars) requires separate layer and domain knowledge
- **Rejected:** Regex allowlist in schema (but git ref rules are complex), using git-rev-parse to validate, blocklist approach
- **Trade-offs:** Schema validation is fast/declarative vs semantic validation requires case-by-case consideration
- **Breaking if changed:** If semantic layer added retroactively, may reject previously-working branch names or require escaping

#### [Gotcha] Path normalization via path.resolve()/path.join() is insufficient; containment still requires explicit boundary check (2026-03-03)
- **Situation:** CEM path and load_library paths normalize but don't verify result stays within projectRoot
- **Root cause:** Path operations prevent most traversal (../) but don't enforce containment constraint; these are orthogonal concerns
- **How to avoid:** Single path normalization is cheap; adding containment verification adds check cost but closes TOCTOU/symlink gaps

#### [Gotcha] FilePathSchema regex validation is Linux-biased; Windows UNC paths (\\server\share) rejected as invalid (2026-03-03)
- **Situation:** Path validation uses forward-slash patterns; Windows absolute paths and UNC paths fail schema check
- **Root cause:** Regex-based path validation assumes POSIX conventions; cross-platform support added without regex adjustment
- **How to avoid:** Simple regex is clear but platform-naive; using path library is correct but harder to validate in schema

### Strict semver enforcement for CDN versions: exact versions or 'latest' only, rejecting range operators (^, ~, >=) (2026-03-03)
- **Context:** CDN handler version parameter was previously accepting permissive regex; needed to harden against injection
- **Why:** CDN URLs require exact versions for reproducibility and security. Version ranges belong in package.json, not CDN URLs. Prevents typosquatting variations and pre-release injection
- **Rejected:** Permissive regex approach; blocklist of bad operators (would miss new techniques like '>=' written differently)
- **Trade-offs:** Reduces flexibility (no ranges in CDN URLs) but ensures reproducible, verifiable deployments. Slightly more friction for users who expect ranges
- **Breaking if changed:** Any code or scripts that pass version ranges to CDN handler will be rejected with validation error

#### [Pattern] Path containment check uses `path.startsWith(resolve(projectRoot) + sep)` rather than just `startsWith(resolve(projectRoot))` (2026-03-03)
- **Problem solved:** When resolving CEM path, need to ensure it stays within projectRoot, preventing directory traversal and symlink escapes
- **Why this works:** Adding separator prevents false positive: `/project/root` would pass `startsWith('/project')` but adding `/test` would bypass. Separator ensures boundary is real directory boundary
- **Trade-offs:** Slightly more verbose check but correctly prevents directory traversal. Trade-off: symlinks pointing outside projectRoot are now rejected (stricter but more secure)

#### [Pattern] Layered FilePathSchema validation: isAbsolute() check + Windows drive letter rejection + UNC path rejection + containment check (2026-03-03)
- **Problem solved:** Single path escape technique can be missed by individual checks (Windows D: drives pass some isAbsolute() implementations, UNC \\server\share doesn't always fail isAbsolute)
- **Why this works:** Different path escape techniques bypass different checks. Windows drive letters (`D:`) and UNC shares (`\\`) need explicit rejection because isAbsolute() behavior varies. Layering catches what individual checks miss
- **Trade-offs:** Multiple checks slightly slower (negligible) but catch more edge cases. More verbose but more resilient to platform-specific path tricks

#### [Pattern] Switched health tag name validation from negative blocklist (`reject bad chars`) to positive allowlist (`[a-z0-9:_-]+` only) (2026-03-03)
- **Problem solved:** Tag names were blocked on specific characters but allowed anything else, which can be bypassed with new character variations or encoding tricks
- **Why this works:** Allowlists are resilient to new bypass techniques. Negative lists require knowing all dangerous variations. Positive lists enumerate exactly what's allowed, impossible to bypass with new characters
- **Trade-offs:** Stricter (some valid tag names outside allowlist rejected) but vastly more resilient. Requires defining what's actually valid

### Error messages strip absolute paths using `relative(projectRoot, filePath)` to prevent filesystem information disclosure (2026-03-03)
- **Context:** Error messages are logged and may be exposed to users or external systems; absolute paths leak filesystem structure (user names, directory structure)
- **Why:** Error messages are observable (logs, user-facing errors). Exposing `/home/alice/projects/...` reveals filesystem layout and usernames. Relative paths are sufficient for debugging
- **Rejected:** Keeping absolute paths (simpler but info disclosure); redacting all paths (loses debugging info)
- **Trade-offs:** Slightly less precise debugging (relative paths require context) but prevents information leakage. Small performance cost from relative() calls (negligible)
- **Breaking if changed:** Error messages now show relative paths; debugging tools parsing error messages expecting absolute paths will need updates

#### [Pattern] Path containment validation (FilePathSchema) rejects absolute paths, `..` traversal, Windows drive letters, and network shares at schema parse time, not at file access time (2026-03-03)
- **Problem solved:** cemPath and similar config values could escape project root if not validated before use
- **Why this works:** Validates at parse boundary (schema) rather than at each usage site - single source of truth, cheaper than runtime checks on every file access
- **Trade-offs:** Strictness at config time (rejects absolute paths entirely) vs flexibility - but config is trusted input, runtime paths from users would be different

### Security workflow intentionally omits || true fallback, making pnpm audit failures block PR merges (2026-03-04)
- **Context:** Implementing pre-PR quality gates; preventing insecure dependencies from reaching main branch
- **Why:** Security must be non-negotiable and blocking. Optional security checks are de facto skipped; hard-fails force resolution before merge, preventing accumulation of vulnerable dependencies
- **Rejected:** Making security optional with || true fallback - would allow developers to bypass security checks under time pressure
- **Trade-offs:** Stricter enforcement prevents insecure code merging but increases dev friction when dealing with vulnerable transitive dependencies that require upstream fixes
- **Breaking if changed:** Changing to optional security (|| true) would allow insecure code to merge, defeating the quality gate

#### [Gotcha] URL prefix assertion in CDN handler tests a hardcoded string (can never fail) instead of validating what was actually constructed. Masks the real bug: unpkg URL format is wrong (`/npm/` prefix doesn't exist). (2026-03-04)
- **Situation:** Claim 7 — attempting to verify CDN URL construction is correct
- **Root cause:** Author wrote as self-documenting contract assertion rather than runtime check. Feels secure but is tautological.
- **How to avoid:** Easier to write (one less real check) but creates false confidence; actual bug goes undetected

#### [Pattern] Selective validation of multi-parameter attack surface: gitShow validates `ref` parameter with regex but completely ignores `filePath`. Path stripping applied in SafeFileOperations but missed in health.ts and CDN success response. (2026-03-04)
- **Problem solved:** Defensive hardening of input validation and output sanitization
- **Why this works:** Implicit assumption that 'obviously dangerous' parameters or code paths are the ones to protect; systematic coverage not applied
- **Trade-offs:** Faster to implement (less code) but creates pockets of vulnerability; some threats addressed while others remain undefended

#### [Gotcha] Security feature (`redirect: 'error'` to prevent redirect attacks) combined with configuration bug (wrong unpkg URL) completely disables unpkg registry. Security decision amplifies config bug into total feature failure. (2026-03-04)
- **Situation:** CDN handler fetches from unpkg with `redirect: 'error'` set; unpkg URL has non-existent `/npm/` prefix
- **Root cause:** Redirect rejection is sound security choice in isolation, but config bug makes it unreachable
- **How to avoid:** Code looks secure but feature is broken; hard to debug because the security mechanism is correct

#### [Pattern] Path containment validated only at startup (when config loaded), not at runtime. CEM file could be replaced with symlink pointing outside projectRoot after startup; watcher would follow without re-validation. (2026-03-04)
- **Problem solved:** Ensuring CEM file stays within projectRoot boundary
- **Why this works:** Operator controls config and filesystem; practicality choice to avoid per-read overhead; assumes operator doesn't act maliciously
- **Trade-offs:** Fast (O(1) per read) but vulnerable to TOCTOU if operator's machine is later compromised; single point of validation creates brittle security

#### [Pattern] CDN response body read with `response.text()` without size limit. No Content-Length check or streaming validation. Entire response loaded into memory before schema validation. (2026-03-04)
- **Problem solved:** Validating JSON schema of CDN response for package metadata
- **Why this works:** Implicit decision to load-then-validate rather than stream-then-validate; simpler code path
- **Trade-offs:** Simpler validation logic but creates DoS vector: attacker-controlled CDN can exhaust server memory with large response before validation rejects it

#### [Gotcha] Path stripping applied asymmetrically: error messages stripped via `relative()` but CDN success response includes absolute `cachePath`. Inconsistent application suggests author only thought about error cases, not success cases. (2026-03-04)
- **Situation:** Preventing filesystem path disclosure to MCP callers
- **Root cause:** Mental model focused on 'error messages leak secrets' but not 'success messages can too'
- **How to avoid:** Errors are safe but success responses leak filesystem layout; asymmetry creates false sense of coverage

#### [Pattern] Explicit requirement for `additionalProperties: false` in Zod JSON schemas to prevent schema creep and unvalidated fields from reaching handlers (2026-03-04)
- **Problem solved:** Input validation is critical security boundary for a tool/agent system
- **Why this works:** Zod allows unknown fields by default; disabling this prevents silent acceptance of unexpected properties that could be exploited
- **Trade-offs:** Requires discipline and explicit validation on every schema (more boilerplate), but eliminates entire class of injection/overflow attacks

#### [Gotcha] Zod string() validation does not inherently reject null bytes. FilePathSchema required explicit .refine((p) => !p.includes('\0')) check to prevent null byte injection, which was discovered during test execution. (2026-03-04)
- **Situation:** When implementing filePath validation in gitShow, FilePathSchema validation was added but tests still failed. The assumption was that Zod's string type handles all string safety concerns, but null bytes were not being rejected.
- **Root cause:** Zod's string() primitive focuses on type validation, not string content sanitization. Security-critical inputs require explicit checks beyond framework defaults for each specific attack vector.
- **How to avoid:** Explicit sanitization adds clarity but requires developers to be aware of specific attack vectors. Framework-level magic would be safer but less transparent.

#### [Pattern] Define security-critical input validation (like path safety) in centralized, reusable schemas rather than inline in business logic functions. This ensures consistent protection and makes the contract explicit. (2026-03-04)
- **Problem solved:** File paths in gitShow can enable multiple attack vectors simultaneously: directory traversal (../secret), absolute path access (/etc/passwd), and null byte injection. Without centralization, each function must remember all rules.
- **Why this works:** Reduces cognitive burden on developers and the chance of missing an attack vector. Changes to security rules automatically propagate to all consumers. Makes security properties auditable in one place.
- **Trade-offs:** Schema-driven validation is invisible when working correctly (developers might not realize what protection they're getting), but failures are widespread if the schema has a bug. Inline validation is explicit but duplicated.

#### [Gotcha] Security control was implemented (.refine to reject null bytes) but lacked corresponding test coverage. Test gap discovered only when reading implementation file first. (2026-03-04)
- **Situation:** FilePathSchema had null byte rejection logic (line 36-38 in validation.ts) but zero tests for it. Task required adding tests to demonstrate the control works.
- **Root cause:** Security controls without tests are fragile—they can be accidentally removed during refactoring without breaking the build. Test coverage is part of the acceptance criteria for security features, not optional.
- **How to avoid:** Reading first adds discovery overhead but prevents duplication and reveals gaps (like this one). Skipping read-first means risk of breaking the DRY principle.

### Implemented two-layer size validation: Content-Length header check (before body read) + streaming accumulator (during body read). Both layers are active and necessary. (2026-03-04)
- **Context:** Preventing memory exhaustion from oversized CDN responses. Initial Content-Length check is cheap, but not all responses include Content-Length or it may be inaccurate/malicious.
- **Why:** Content-Length check rejects large responses before any bytes are consumed (early exit, bandwidth save). Streaming accumulator catches missing or false Content-Length headers and aborts mid-stream if limit is exceeded. Single layer leaves gaps: Content-Length-only fails on missing header; accumulator-only wastes network on large responses.
- **Rejected:** Single-layer approach (either header OR accumulator) leaves vulnerability window. Only checking Content-Length skips responses without header. Only accumulating allows full header read before rejection.
- **Trade-offs:** Two checks = slight latency increase, but provides comprehensive protection. Early rejection saves bandwidth; late rejection saves CPU (trade-off favors bandwidth/memory)
- **Breaking if changed:** Removing Content-Length check: slow rejection on oversized responses. Removing accumulator: vulnerable to responses without Content-Length header. Removing both: unprotected against memory exhaustion.

#### [Pattern] Reject at earliest safe point in pipeline (Content-Length header check) before expensive operations (body read/parse). Subsequent checks (stream accumulator) are defensive layers. (2026-03-04)
- **Problem solved:** Memory exhaustion requires preventing large payloads from entering memory. Different layers of defense activate at different pipeline stages.
- **Why this works:** Content-Length check costs header parsing only (~KB). Rejecting here saves network bandwidth (server keeps sending) and avoids wasting compute on large payloads. Each downstream layer (stream read, JSON parse) is more expensive if size is already known.
- **Trade-offs:** Early rejection requires parsing headers (cheap). Late rejection catches inaccurate headers (expensive). Early layer assumes headers are trustworthy; needs secondary accumulator.

#### [Gotcha] Path containment check requires `startsWith(resolvedProjectRoot + sep)` rather than bare `startsWith()` to prevent sibling-directory false positives. Without the separator, `/tmp/test-project-evil` would incorrectly match as a subdirectory of `/tmp/test-project`. (2026-03-04)
- **Situation:** Validating that a resolved cemPath stays within the project root at runtime
- **Root cause:** String prefix matching alone creates a vulnerability where similarly-named sibling directories bypass the check. The separator ensures only actual subdirectories match.
- **How to avoid:** Slightly longer expression but prevents a genuine security edge case; makes the test suite more comprehensive with explicit sibling-directory test case.

#### [Pattern] Implement path validation as two independent layers: schema-level rejection (FilePathSchema) and runtime guard check (startup main() verification). (2026-03-04)
- **Problem solved:** Ensuring that cemPath and similar config values cannot escape the project root
- **Why this works:** Defence-in-depth principle: if an edge case slips through schema validation (e.g., due to a bug in FilePathSchema or a code path that bypasses it), the runtime guard provides a final backstop.
- **Trade-offs:** Adds redundancy and slight performance cost, but dramatically improves robustness against both logic errors and unexpected code paths.

#### [Gotcha] Fetch `redirect: 'error'` option throws a TypeError on redirect responses, which must not be silently caught or swallowed. Tests must explicitly verify the error propagates to the caller. (2026-03-04)
- **Situation:** Rejecting 3xx redirects in CDN fetch handler to prevent SSRF via redirect chains
- **Root cause:** The error behavior is non-obvious: developers may assume silent rejection or a success flag; the test documents that TypeError propagation is the actual mechanism.
- **How to avoid:** Throwing TypeError makes the caller's error handling responsibility explicit and prevents accidental silent failure modes.

#### [Pattern] Sanitize error messages by using `relative()` to strip absolute filesystem paths before exposing messages to callers, preventing information leakage about system layout. (2026-03-04)
- **Problem solved:** CDN handler error messages should not reveal the absolute projectRoot path
- **Why this works:** Absolute paths in error output leak filesystem structure to logs, error reports, and diagnostics; relative paths are sufficient for user context while hiding internal topology.
- **Trade-offs:** Slight reduction in raw debugging signal (developers need access to projectRoot separately) but improved security posture and log hygiene.

#### [Pattern] Security tests for path leakage use dual assertions: negative (path doesn't appear with leading '/') and positive (absolute fixture path doesn't appear). Separate describe blocks explicitly isolate security concerns from functional tests. (2026-03-04)
- **Problem solved:** Adding tests to verify absolute filesystem paths don't leak in error messages and success responses
- **Why this works:** Explicit, isolated security tests make the concern discoverable by maintainers, easier to audit, and prevent regression. Dual assertions (what should NOT be there) are more robust than single positive assertions.
- **Trade-offs:** Separate test blocks increase test file size but significantly improve clarity and auditability of security boundaries

#### [Gotcha] Type-casting to `NodeJS.ErrnoException` and immediately accessing `.code` property without validation creates a silent failure mode if non-errno errors are thrown. (2026-03-04)
- **Situation:** Code pattern `(err as NodeJS.ErrnoException).code !== 'ENOENT'` assumes all thrown errors have a `.code` property; if any other Error type is thrown, `.code` is undefined, comparison succeeds, and the exception is NOT re-thrown.
- **Root cause:** Node.js filesystem errors (from readdir) have a `code` property, so the cast is usually safe in practice; however, TypeScript 'as' casts are not runtime assertions, only compiler directives.
- **How to avoid:** Simpler casting syntax vs. defensive programming; works correctly for expected errors but creates a hidden assumption about error types.

#### [Pattern] Security boundary should be at input validation (allowlist regex, enum-restricted registries, sanitized versions), not at post-construction output checks. When construction is deterministic (e.g., template literal), output validation becomes tautological. (2026-03-04)
- **Problem solved:** CDN handler had a runtime check validating constructed URL started with expected prefix, but the prefix was always guaranteed by the template literal construction itself.
- **Why this works:** Input-layer validation with whitelists prevents bad data entry; post-construction checks are redundant if the construction path cannot fail. Simpler, fewer assumptions.
- **Trade-offs:** Removes apparent safety check for cleaner code, but ONLY safe if construction is truly deterministic and controlled.

#### [Gotcha] Defensive URL prefix assertion can be tautological if the URL is always constructed via template literal starting with the prefix constant. The check never executes the throw path. (2026-03-04)
- **Situation:** Developer added guard against open redirect attacks, but didn't account for the immutable construction pattern.
- **Root cause:** Over-engineered defensive programming — assumed construction could fail or be subverted, but template literals are lexically bound.
- **How to avoid:** Dead code persists until recognized; removing it simplifies the codebase but requires confidence the construction is truly deterministic.

#### [Gotcha] Path validation requires both static AND post-resolution containment checks (2026-03-04)
- **Situation:** compare_libraries and benchmark_libraries handlers validated paths with inline checks (!includes('..'), !startsWith('/')) but this is insufficient because relative paths can resolve outside projectRoot through symlinks or canonicalization
- **Root cause:** Static validation only checks the string before resolution. The actual security boundary is where the path resolves to after filesystem operations, which can differ from what the string pattern suggests
- **How to avoid:** Post-resolution containment check adds runtime overhead but catches escape attempts that static validation would miss. Must use canonical FilePathSchema to prevent duplication of logic across handlers

### Consistency of input validation across semantically similar handlers is a security boundary (2026-03-04)
- **Context:** bundle handler and cdn handler both accept package/version parameters and use fetch, but bundle was missing the NPM_PACKAGE_NAME_REGEX and STRICT_SEMVER_REGEX validation that cdn handler enforced
- **Why:** When multiple handlers perform similar operations, validators in one place act as implicit contract for all. Visual similarity between handlers masks validation gaps - developers assume inherited patterns but don't verify
- **Rejected:** Each handler having its own validation logic (even if similar) allows inconsistency to creep in during refactoring or when adding new handlers
- **Trade-offs:** Using shared validation schemas (NPM_PACKAGE_NAME_REGEX, STRICT_SEMVER_REGEX) requires extracting patterns early but prevents cross-handler validation divergence. More code to maintain but better security surface visibility
- **Breaking if changed:** Without enforcing consistency, new handlers handling the same inputs could accidentally bypass validation. The bundle handler vulnerability only surfaced because of this hidden inconsistency pattern

### Schema-enforced format constraints are necessary when schema values flow into code generation (regex, commands, etc.) (2026-03-04)
- **Context:** CemDeclarationSchema.tagName needed regex constraint to match custom element naming rules ([a-z][a-z0-9]*(-[a-z0-9]+)+). Without this, malicious CEM could inject ReDoS metacharacters because tagName is later used in `new RegExp('<' + tagName)`
- **Why:** When a schema field is used to dynamically construct executable code (regex, command, template), that field must be restricted to safe format, not just type-checked. This is a data-to-code flow boundary
- **Rejected:** Could escape/sanitize the tagName before using it in RegExp - but this patches the symptom. The root cause is that CEM should enforce web platform's custom element naming rules anyway. Schema validation catches this early
- **Trade-offs:** Adding regex to tagName field means CEM files must follow stricter format, but this aligns with web standards. Alternative of escaping in code means same check scattered across all places tagName is used
- **Breaking if changed:** Removing the regex allows ReDoS injection through CEM files. Any schema field that flows into dynamic code construction needs similar format enforcement - this is a recurring pattern in security-sensitive systems

#### [Pattern] Operator-controlled configuration requires the same boundary enforcement as user input (2026-03-04)
- **Problem solved:** healthHistoryDir, tokensPath, tsconfigPath were configuration options set by operators but weren't validated to stay within projectRoot, even though file operations assumed they would be
- **Why this works:** Configuration written by operators is often treated as trusted, but: (1) operators can misconfigure by mistake, (2) config files can be tampered with, (3) treating config as inherently safe blurs the trust boundary
- **Trade-offs:** Adding startup validation (assertInsideProjectRoot) with explicit error messages on startup is better than silent failures later during file operations. Makes configuration errors obvious immediately

#### [Pattern] Defense-in-depth validation applies even when structural mitigations exist (2026-03-04)
- **Problem solved:** GIT_REF_REGEX was updated to exclude leading hyphens (--option patterns) even though git command injection is structurally prevented by using execFile with array args instead of exec
- **Why this works:** Multiple layers prevent different attack classes: (1) execFile array args prevents shell metacharacters, (2) regex validation prevents obviously wrong input formats, (3) structural arg arrangement prevents flag injection. Each layer catches different threat models
- **Trade-offs:** Adding regex validation adds minimal overhead but catches attempts earlier. More importantly, it documents the intent (git refs shouldn't look like flags) to future maintainers

#### [Gotcha] OS-level error string representations include absolute paths even when display prefix is sanitized. String(err) appends full filesystem path to ENOENT errors, bypassing sanitization. (2026-03-04)
- **Situation:** Fixed SafeFileOperations to use relative paths via safePath(), but tests revealed error messages still contained absolute paths because ${String(err)} in file-ops.ts:34 appends the raw OS error.
- **Root cause:** Node.js ENOENT errors inherently include full paths in their string representation. Sanitizing only the display prefix leaves the OS error appended to the message vulnerable.
- **How to avoid:** Display prefix is now safe (relative paths), but complete message safety requires additional sanitization of String(err) in the file operations layer itself.

#### [Gotcha] String includes('..')-based path traversal validation is over-broad and rejects legitimate filenames. Changed to segment-level check: split(/[\/]/).some(seg => seg === '..'). (2026-03-04)
- **Situation:** FilePathSchema was rejecting filenames like 'README..md' because !p.includes('..') treats '..' as a substring, not a path component.
- **Root cause:** Path traversal attacks use '..' as a distinct segment (e.g., 'foo/../bar'), not embedded in filenames. Segment-level validation preserves legitimate names while blocking attacks.
- **How to avoid:** More code (split + some) but correctly distinguishes attack patterns from benign filenames.

#### [Gotcha] Containment check using .startsWith(root) is vulnerable to sibling directory prefix collisions. Must use .startsWith(root + '/') to force path separator. (2026-03-04)
- **Situation:** Post-resolution check verifies resolved paths stay within projectRoot: if (!absPath.startsWith(root + '/') && absPath !== root).
- **Root cause:** '/project' prefix matches '/project' AND '/project-extra'. Adding '/' ensures only true children match, preventing escapes to sibling directories.
- **How to avoid:** Single extra character prevents subtle security bypass; maintainers must understand why the slash matters.

#### [Gotcha] Null byte rejection was already present in FilePathSchema before this feature; the real hardening was fixing the overly-broad '..' check and adding post-resolution containment. (2026-03-04)
- **Situation:** Feature description promised 'null byte rejection + use in compare/benchmark', but implementation shows null bytes were already being rejected; feature scope was actually narrower.
- **Root cause:** Null bytes had been correctly handled as part of earlier security work; this feature was primarily about (a) fixing segment-level '..' validation, (b) centralizing schema use, (c) adding containment check.
- **How to avoid:** Smaller actual scope than feature title suggested, but more focused implementation (no redundant null byte code).

#### [Pattern] Size-checking response.text() before JSON.parse() (1MB limit) prevents DoS attacks. The order is critical: measure string length first, then parse, never parse-then-check. (2026-03-04)
- **Problem solved:** Fetching npm registry metadata from third-party API. Without size limits, attacker-controlled responses with large JSON payloads could cause parsing DoS via CPU/memory exhaustion
- **Why this works:** JSON.parse() is expensive on large inputs (O(n) with high constant factors). Checking text length first is O(1) and gates parsing. Bounds before parsing is standard DoS mitigation.
- **Trade-offs:** Added string allocation (response.text() vs streaming parse), but gained bounded resource consumption. Silent failure if response exceeds 1MB.

### Added redirect: 'error' to both fetchBundlephobia and fetchNpmRegistrySize calls, preventing automatic follow-redirects. Unknown redirects are rejected as failure instead of silently followed. (2026-03-04)
- **Context:** Hardening against server-compromise scenarios where npm.org or bundlephobia.com domains are compromised and redirect to attacker-controlled servers
- **Why:** If the API domain is compromised and returns a redirect, following it silently could leak sensitive data or hit attacker infrastructure. Failing fast is safer than following unknown redirects.
- **Rejected:** Could use response.url to detect and warn on redirects instead of blocking them, but that's less safe (you process the attacker's response before detecting the compromise)
- **Trade-offs:** Any legitimate redirect from these APIs will now break the handler. More secure but less resilient to API changes. Assumes npm and bundlephobia never use redirects.
- **Breaking if changed:** If npm.org starts using 301 redirects for canonical URLs, this breaks. Would require explicit allowlist of trusted redirect targets.

#### [Pattern] Two-tier DoS defense: input-level boundary (Zod schema for html size) + algorithm-level guard (Levenshtein function for name length). Input guards catch direct parameters at entry; algorithm guards protect expensive internal operations. (2026-03-04)
- **Problem solved:** Preventing both memory exhaustion (large HTML) and computational explosion (Levenshtein quadratic complexity on unbounded inputs)
- **Why this works:** HTML size is a direct user parameter—validate at schema boundary. Levenshtein name length is derived from parsing—guard where the algorithm is vulnerable (O(n*m) complexity). Different threat vectors need different defense placement.
- **Trade-offs:** Schema validation is declarative and fails fast; function-level guard is imperative but consolidates logic for multiple call sites (attributes + slots). Code is more distributed but more resilient.

### Levenshtein guard placed inside suggest() function rather than at call sites, despite being called from multiple locations (attribute validation + slot validation). Single guard covers both without duplication. (2026-03-04)
- **Context:** The suggest() function is invoked from at least two different code paths that need protection. Could guard at each call site or at the function itself.
- **Why:** Encapsulation: the algorithm's complexity vulnerability is intrinsic to Levenshtein, not the specific caller. Guarding at the source prevents accidental bypass if a new call site is added, and ensures consistency.
- **Rejected:** Guarding at each call site would repeat the same check and require remembering to add it to future callers; guarding at Zod schema would conflate input validation with algorithmic constraints
- **Trade-offs:** Function-level guard is harder to discover (not visible in schema docs) but more maintainable; schema-level would be more visible but artificially conflate concerns
- **Breaking if changed:** Removing this guard allows O(n*m) complexity exploits; moving it to callers risks incomplete coverage if new callers are added

#### [Gotcha] The Levenshtein guard uses `> 200` (strictly greater), meaning exactly 200-char attribute names still get processed. Not a rounding preference—a deliberate permissive boundary that rejects 'excessive' input while accepting edge cases. (2026-03-04)
- **Situation:** Tests explicitly verify both 201-char (rejected) and 200-char (accepted) cases, confirming the boundary is intentional
- **Root cause:** 200 chars is the limit where Levenshtein distance computation remains reasonable (compared to arbitrary HTML attribute names, which can be quite long for valid use cases). Boundary inclusivity prevents false rejections of legitimate, though unusual, 200-char attributes.
- **How to avoid:** Inclusive boundary is safer (no false positives on legitimate long names) but requires algorithm to handle 200-char inputs; exclusive boundary (`>= 200`) is simpler but rejects more data

#### [Pattern] Three-layer validation stack: (1) character allowlist regex, (2) prefix guard (-), (3) path traversal schema. Each layer catches a distinct attack class rather than one monolithic check. (2026-03-04)
- **Problem solved:** Validating filePath parameter in gitShow to prevent shell injection, flag injection, and path traversal
- **Why this works:** Separating concerns allows each validation to be simple and testable. Character allowlist is fast to reject obvious injection patterns; prefix guard prevents flag injection specifically; schema handles path normalization and traversal. Layers complement rather than overlap.
- **Trade-offs:** More code/layers to maintain vs clearer security model and easier testing per attack vector

#### [Gotcha] Character allowlist regex alone cannot prevent path traversal because individual safe characters (., /) combine into unsafe patterns (../, /etc/passwd). Allowlist validates character-level safety, not path-level semantics. (2026-03-04)
- **Situation:** Initially might assume /^[a-zA-Z0-9._\-/]+$/ is sufficient validation since it's restrictive
- **Root cause:** The regex operates on individual characters in a stream; it has no knowledge of sequence meaning. '..' as a sequence means 'parent directory' at the filesystem level, but regex sees two valid characters. Path traversal is a semantic property, not a character property.
- **How to avoid:** Adding FilePathSchema layer increases validation cost but provides semantic safety. Keeping only regex is simpler but leaves path traversal vulnerability.

### '-' prefix check is separate from character allowlist regex, not excluded from regex, because '-' is valid in the middle of filenames (e.g., my-file.json) but dangerous at the start (flag injection). (2026-03-04)
- **Context:** Preventing git flag injection like '-rf' while still allowing hyphens in normal filenames
- **Why:** The danger of '-' is positional: it signals a flag only when it's the first character. A character-level allowlist can't express positional constraints. Separating the prefix check makes the intent explicit and the rule unambiguous.
- **Rejected:** Excluding '-' from the regex altogether (would break valid filenames); trying to encode prefix constraint in regex (too complex, reduces readability)
- **Trade-offs:** Two explicit checks instead of one complex regex: slightly more code but much clearer intent and easier to verify
- **Breaking if changed:** Removing the startsWith check allows '-rf' and other flag-like inputs to pass, enabling command injection.

#### [Pattern] Dual-stage size validation: Content-Length header check BEFORE reading body + running byte counter during streaming body read (2026-03-04)
- **Problem solved:** Protecting against arbitrarily large CDN responses that could exhaust memory
- **Why this works:** Content-Length header can be missing, misreported, or absent entirely. Single-stage header-only check fails when header is absent. Streaming counter catches the real body size regardless of declared headers.
- **Trade-offs:** Added complexity and two code paths, but achieves defense-in-depth: fast-fail on declared size + runtime protection against actual body size

### Existing componentHistoryDir validator (regex allowlist) covers libraryId validation across all new layers - no additional security work needed. (2026-03-04)
- **Context:** When threading libraryId through multiple functions, could have added validation at each layer or only at lowest layer.
- **Why:** componentHistoryDir is the narrowest point where libraryId becomes a directory path. Single validation source reduces risk of bypass.
- **Rejected:** Could add validation at each layer for defense-in-depth, but creates duplication and maintenance burden.
- **Trade-offs:** Simpler code vs distributed validation. Single point of validation may hide assumption about all code paths reaching it.
- **Breaking if changed:** If libraryId is used for non-filesystem operations later (e.g., API calls, database queries), existing regex allowlist may not be appropriate.

#### [Gotcha] GIT_FILE_PATH_REGEX had both regex constraint AND runtime check (`filePath.startsWith('-')`), but GIT_REF_REGEX had only regex with no fallback. This asymmetric defense-in-depth meant refs remained vulnerable despite identical attack vector. (2026-03-04)
- **Situation:** While hardening git reference validation to prevent `--no-pager` style flag injection, discovered related validators had inconsistent security patterns.
- **Root cause:** Likely evolved separately without unified security review. File path validation may have been audited more thoroughly, or added during different periods with different security standards.
- **How to avoid:** Pure regex solution cleaner than mixed regex+runtime patterns, but any code depending on refs allowing leading hyphens must be updated in parallel.

#### [Pattern] Selective error re-throw pattern: only specific filesystem errors (ENOENT) trigger fallback to legacy code path; other errors (EACCES, EPERM) must be re-thrown to surface permission/access issues (2026-03-04)
- **Problem solved:** Health history reading attempts new path first, falls back to legacy path on failure. Original bug: all errors were silently caught, hiding permission denied (EACCES) issues.
- **Why this works:** ENOENT is 'expected absence' (new feature doesn't exist), so fallback is safe. EACCES is 'unexpected access denial' (permission/security problem) that must not be silently hidden.
- **Trade-offs:** Selective catching is more complex (requires error code inspection) but prevents silent failure of legitimate security issues

#### [Pattern] SECURITY.md placed at repo root with dual reporting paths: GitHub Security Advisory (preferred) and email fallback (2026-03-12)
- **Problem solved:** OSS npm package needing a standardized vulnerability disclosure policy that integrates with GitHub's private reporting infrastructure
- **Why this works:** GitHub natively surfaces SECURITY.md in the repo UI and auto-links it from the Security tab; using GitHub Security Advisories keeps the vulnerability private until a coordinated patch is released, preventing premature disclosure
- **Trade-offs:** Easier: GitHub tooling auto-discovers the file, reporters get a frictionless private channel. Harder: maintainers must monitor both GitHub advisory inbox and the security email alias

### Response SLA tiered as 48h acknowledgment + 7-day status update rather than a single flat SLA (2026-03-12)
- **Context:** Setting reporter expectations for an open-source project where maintainer bandwidth is limited
- **Why:** A tiered SLA acknowledges receipt quickly (builds trust) while giving realistic time for triage and patch development; a single flat 'we will fix in N days' is often broken and erodes trust more than a missed status update
- **Rejected:** Single flat SLA (e.g., '30-day fix guarantee') — rejected because fix timelines depend on severity and complexity, making guarantees unreliable
- **Trade-offs:** Easier: reporters know when to expect feedback; reduces follow-up noise. Harder: maintainers must track two separate clock windows per report
- **Breaking if changed:** Collapsing to a vague 'we will respond eventually' policy damages reporter trust and may cause researchers to skip private disclosure entirely

#### [Gotcha] Supported versions table initially lists only 0.1.x — requires manual update on each major/minor release or it becomes misleading (2026-03-12)
- **Situation:** Early-stage package (0.1.x) with a SECURITY.md committed before a stable release cadence is established
- **Root cause:** The table was seeded with the current version at time of file creation, which is correct now but has no automated update mechanism
- **How to avoid:** Easier: reporters immediately know patch support scope. Harder: the file becomes a maintenance liability if version bumps are not accompanied by a SECURITY.md update

#### [Pattern] pnpm audit is run with --audit-level=high, intentionally allowing moderate vulnerabilities to pass CI without blocking (2026-03-12)
- **Problem solved:** Balancing security enforcement with practical development velocity — moderate vulnerabilities are common and often have no immediate fix
- **Why this works:** High and critical vulnerabilities represent genuine immediate risk; moderate vulnerabilities may have no upstream fix and blocking on them creates friction without proportional security benefit
- **Trade-offs:** CI remains unblocked by moderate dependency issues, but moderate vulnerabilities require a separate triage process to avoid being silently ignored long-term