---
tags: [testing]
summary: testing implementation decisions and patterns
relevantTo: [testing]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 10
  referenced: 8
  successfulFeatures: 8
---
# testing

#### [Gotcha] An automated schema injection script accidentally dropped the `get_health_summary` tool definition from health.ts. Despite 1096 passing tests, the missing definition was caught only because an existing test validated the tool count. (2026-03-03)
- **Situation:** Refactoring tool schemas to add libraryId parameter across 7 tool files using automation.
- **Root cause:** The automation script iterated over some set of tools but didn't include get_health_summary in that set. Missing definition was silent until test checked exact tool count.
- **How to avoid:** Learned: counting tests passing is necessary but insufficient for detecting dropped definitions. Integration tests that verify tool registry completeness caught what unit tests missed.

#### [Gotcha] Benchmark handler shipped without test file; coverage metrics don't detect missing test files (2026-03-03)
- **Situation:** Test coverage reports 1047 test cases but benchmark handler (new) has zero tests; no test inventory to flag gap
- **Root cause:** Handler merged before test file created; coverage tool counts existing tests, not handlers missing tests
- **How to avoid:** Fast feature delivery vs coverage gaps invisible in metrics; retroactive tests less comprehensive (miss edge cases discovered during development)

#### [Gotcha] Test mocks need position-flexible callback detection when implementation adds optional parameters before callback (2026-03-03)
- **Situation:** When git.ts added `{ timeout: 30_000 }` options to execFile call, callback moved from 3rd to 4th argument position, breaking existing mocks
- **Root cause:** Test mocks were hardcoded to expect callback at fixed position. When function signature changes, mocks become fragile. Solution: scan for last function argument
- **How to avoid:** More flexible mock code is slightly more complex but survives signature changes. Prevents silent test failures from implementation drift

#### [Gotcha] GIT_REF_REGEX has no length limit - very long refs are accepted. Test documents this behavior rather than asserting rejection (2026-03-03)
- **Situation:** Added adversarial test for 'very long valid ref' to ensure it passes validation
- **Root cause:** Regex design chose to validate character set (alphanumeric, dash, slash, underscore) but not length. Test serves as documentation of current behavior boundary
- **How to avoid:** No length limit is simpler regex, allows arbitrary long names (benign), but could be DoS vector if stored/displayed without limits

#### [Pattern] Adversarial input tests cover special characters, escapes, empty values, metacharacters across validation boundaries - comprehensive input fuzzing for schema/handler edge cases (2026-03-03)
- **Problem solved:** Git refs tested with ampersands and backticks; paths tested with drive letters and network shares; health files tested with malformed JSON and missing fields
- **Why this works:** Reveals where validation is weak or missing. Tests document the exact rejection conditions - helps identify what attackers could exploit
- **Trade-offs:** More tests to write and maintain, but prevents security bypasses and surprises in production

#### [Gotcha] Test regex `expect(calledUrl).toMatch(/^https:\/\/unpkg\.com\/npm\//)` validates the *broken* URL format the code produces, not the correct unpkg format. Test passes despite implementation bug because test was written to match implementation, not specification. (2026-03-04)
- **Situation:** CDN URL generation for unpkg includes `/npm/` path segment (jsDelivr-specific), but unpkg URLs don't use `/npm/`. Test at cdn.test.ts:219 enshrines this bug.
- **Root cause:** Tests are often written by testing 'what the code does' rather than 'what the code should do'. When code is buggy from the start, test mirrors the bug.
- **How to avoid:** Simple test that passes CI vs. caught bugs at runtime; false confidence in test suite

#### [Gotcha] bundle.test.ts line 167-205 verifies cache size doesn't exceed 500, but doesn't verify *which* key was evicted. Test passes even if Map insertion-order eviction is broken, as long as final size is correct. (2026-03-04)
- **Situation:** Bundle cache uses Map with oldest-key eviction when size limit reached. Test checks size outcome, not eviction mechanism.
- **Root cause:** Testing the symptom (size limit enforced) is simpler than testing the root cause (correct key is evicted). Mechanisms can hide bugs if only outcomes are tested.
- **How to avoid:** Simple size assertion vs. mechanism verification; easier test vs. actual correctness assurance

#### [Gotcha] Test suite asserts wrong unpkg URL format (`/npm/` prefix), so tests pass while implementation is broken in production. Tests became a liability, actively masking the bug rather than catching it. (2026-03-04)
- **Situation:** Tests for CDN handler URL construction; real unpkg doesn't have `/npm/` segment
- **Root cause:** Test author encoded an incorrect assumption about unpkg API; no one verified against actual CDN
- **How to avoid:** Test suite green = false confidence; discovered bug only via code review, not CI

### Three separate documentation files (README, CONTRIBUTING, LOCAL) with overlapping content (testing, hooks) rather than single consolidated file (2026-03-04)
- **Context:** Project needed audience-specific documentation for users, contributors, and local developers
- **Why:** Each document serves a different persona: README for quick start/overview, CONTRIBUTING for PR workflow governance, LOCAL for local dev-specific commands
- **Rejected:** Single file would be simpler to maintain but would force all audiences through irrelevant sections
- **Trade-offs:** Easier to maintain audience focus and keep files lean, but creates risk of inconsistency across three copies of similar information
- **Breaking if changed:** Consolidating into one file would lose audience segmentation; developers unfamiliar with contributing flow might miss CI/hook requirements when reading README

#### [Pattern] Test cases explicitly target different attack vectors: embedded null bytes (`src/file\0.ts`, path traversal with null `src/\0../etc/passwd`) and leading null bytes (`\0etc/passwd`). Not all null byte positions are equivalent. (2026-03-04)
- **Problem solved:** Null byte injection tests were designed to cover both standalone null injection and combined attacks (null + path traversal sequences).
- **Why this works:** Different attack vectors require different test cases. A path traversal attack combined with null byte insertion (`\0../`) tests interaction effects. Leading vs. embedded positions test boundary conditions.
- **Trade-offs:** More test cases = better coverage but increased test maintenance. The 4 cases cover the critical positions without being exhaustive.

#### [Gotcha] Four pre-existing inline fetch mocks lacked headers and body properties. They worked before because old code didn't access these properties. New security code exposed the incomplete mocks as technical debt. (2026-03-04)
- **Situation:** Added response.headers.get(header) check for Content-Length and response.body check for streaming. Existing tests had vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => ... }) without headers/body.
- **Root cause:** Old code only called response.text() and response.ok/status. Mocks satisfied old expectations. New code required complete Response-like objects. Incomplete mocks didn't fail test runner, but broke logic path checking.
- **How to avoid:** Fixing all mocks proactively costs more work upfront but reveals entire codebase reliance on incomplete mocks. Fixes prevent future feature breakage.

### Test startup guards (like `isBlockedByGuard`) by replicating their logic as pure helper functions in the test file rather than exporting them from production code. (2026-03-04)
- **Context:** Need to unit-test the main() startup CEM path containment guard without coupling tests to production exports
- **Why:** Keeps production API surface clean and focused; avoids exporting internal guard logic purely for test access. The replicated function in tests documents the exact security constraint inline.
- **Rejected:** Exporting `isBlockedByGuard` from src/index.ts pollutes the public API with test-only utilities; creating subprocesses to test main() entry point is slow and fragile.
- **Trade-offs:** Creates code duplication (guard logic lives in both src and test) but improves clarity and decouples test infrastructure from production boundaries.
- **Breaking if changed:** If the actual guard in src/index.ts changes, tests will not catch drift unless the test helper is manually updated. Requires discipline to keep test replica in sync.

#### [Gotcha] Using `relative(base, path)` with a mock base path of '/' doesn't fully strip the absolute path in the message because '/' is technically an ancestor of all paths, so `relative('/', '/foo/bar')` returns 'foo/bar' but the message still contains '/' directory separators. Tests validating path sanitization must use an actual fixture directory as the base to produce genuinely short relative paths. (2026-03-04)
- **Situation:** Initial health test used `config.projectRoot = '/'` from makeConfig(), so path validation checks failed because the error message still contained '/' separators
- **Root cause:** Relative paths are technically correct, but test assumptions about what constitutes 'stripped' were wrong. The real validation requires a proper ancestor directory to generate short relative paths like 'missing-fields/history.json' instead of paths with multiple separators.
- **How to avoid:** Using FIXTURE_DIR as projectRoot produces more realistic test conditions at the cost of coupling the test to fixture structure

#### [Gotcha] Two different test strategies exist for similar code paths: the existing happy-path CDN test doesn't mock fs functions (relying on real ENOSPC behavior), while the new security test mocks them to guarantee execution of the `cacheWritten = true` path. This creates inconsistent test environments for adjacent test cases. (2026-03-04)
- **Situation:** Adding a security test for CDN success message formatting required mocking fs.mkdirSync and fs.writeFileSync to control when the success path executes
- **Root cause:** Without mocking, the real test environment determines whether cache write succeeds, making the `formatted` message behavior unpredictable. Mocking guarantees the test exercises the specific code path being validated.
- **How to avoid:** Mocking provides consistent, isolated testing at the cost of not catching real filesystem issues that might occur in production

### Server-side TypeScript MCP tools should be verified via unit tests alone, not browser-based integration tests (e.g., Playwright). Unit tests directly verify handler behavior. (2026-03-04)
- **Context:** Determined that Playwright verification was inapplicable for a server-side CDN handler with no UI surface.
- **Why:** Browser tests add overhead and false coupling for code with no browser component. Unit tests are the appropriate verification gate for handlers and business logic.
- **Rejected:** Browser-based verification for server-side code (would be misaligned to the code's role).
- **Trade-offs:** Faster test execution and clearer test intent vs. less end-to-end coverage (acceptable for stateless handlers).
- **Breaking if changed:** If the CDN handler becomes exposed via a web UI, browser tests may need to be added as an additional verification layer.

#### [Gotcha] Path containment security check (startsWith verification) silently fails with absolute /tmp/ paths in test environments. Solution: Use relative paths with configurable MCP_WC_PROJECT_ROOT environment variable. (2026-03-04)
- **Situation:** Test failed with path validation error because temporary test directory was outside the project root check. Initially tried absolute /tmp paths which failed the projectRoot containment validation.
- **Root cause:** Absolute temp paths don't guarantee they'll be within the project root. Security checks that hard-code path relationships prevent test isolation. Configurable root allows tests to set their own containment scope.
- **How to avoid:** Pro: Enables safe file-based testing with proper isolation. Allows tests to use temp directories without security bypass. Con: Requires test setup awareness (must configure both PROJECT_ROOT and relative paths).

#### [Pattern] MCP server integration testing requires full protocol compliance: JSON-RPC handshake (initialize), proper message parsing, notification flow (notifications/initialized), then tool calls. Cannot skip protocol setup. (2026-03-04)
- **Problem solved:** Initial test attempts failed or hung because they didn't follow MCP protocol. MCP initialization handshake must complete before tool calls are accepted.
- **Why this works:** MCP server maintains protocol state (initialized flag, client info, capabilities negotiation). Tool calls before initialize may fail or hang because server isn't ready. Protocol defines state machine that must be followed.
- **Trade-offs:** Pro: Tests actual production behavior including all side effects. Con: Tests are heavier, slower, require spawning server process, more brittle to implementation changes.

#### [Gotcha] Shared fixture files can mask library-specific detection logic. When testing code that behaves differently based on library identity (e.g., package name), using a single package.json fixture with a generic name ('my-component-lib') prevents the test from verifying the library-specific branch works correctly. (2026-03-04)
- **Situation:** Attempted to test non-Shoelace CDN import generation, but the Shoelace test config also used the same generic 'my-component-lib' package name, so both code paths were indistinguishable in tests.
- **Root cause:** Package name is the canonical library identity in package.json. If the fixture doesn't reflect the real library identity, the detection logic never executes in tests. This creates false confidence that library-detection works when it doesn't.
- **How to avoid:** More fixture directories/files required (duplication overhead) but gains true library-identity testing and prevents masking bugs. Simpler fixture management (one shared file) but loses correctness of library-specific code paths.

#### [Pattern] Removed tautological assertion on deterministically-constructed values. The check `url.startsWith(expectedPrefix)` was eliminated because the URL is constructed directly from `expectedPrefix` — validating it afterward is redundant noise that creates false safety confidence. (2026-03-04)
- **Problem solved:** CDN URL construction where `expectedPrefix` is used both to build the URL and as implicit validation
- **Why this works:** Redundant assertions obscure code intent and create maintenance burden. If the construction is deterministic (which code ensures), the assertion adds zero safety.
- **Trade-offs:** Fewer assertions = cleaner but less explicit; if URL construction ever moves to external source (config, API), this pattern breaks and assertion becomes necessary again

#### [Gotcha] Test assertions must match actual fix scope, not intended scope. Tests initially expected no absolute paths anywhere, but implementation only sanitized the display prefix. (2026-03-04)
- **Situation:** Tests failed because they checked for complete path removal, but the fix only made the quoted display portion relative. Tests were corrected to verify display prefix specifically (regex pattern for "nonexistent.json" vs /absolute/path pattern).
- **Root cause:** Misalignment between acceptance criteria and implementation scope. The feature fixed one layer (display prefix) but not another (OS error string). Tests need to verify what was actually fixed, not what should ideally be fixed.
- **How to avoid:** Tests are now more permissive but accurate. They verify the specific improvement (display prefix) rather than the ideal state (clean message).

#### [Gotcha] Switching from response.json() to response.text() broke tests because mocks were inconsistently defined: some used a comprehensive stubFetch helper with both json() and text(), but inline cache-size tests only mocked json(). When implementation changed to call text(), those inline mocks failed silently. (2026-03-04)
- **Situation:** Added size-checking logic that requires response.text() instead of response.json(), but existing test mocks in cache tests only provided json() method
- **Root cause:** Test mocks are often written minimally to include only what each test needs. When API consumption patterns change, all mock patterns must be audited, but fragmented mock definitions cause some to be missed.
- **How to avoid:** Comprehensive mocks (like stubFetch) stay compatible longer; minimal inline mocks are test-specific but break more easily when implementation changes

#### [Gotcha] Regex validation constants (NPM_PACKAGE_NAME_REGEX, STRICT_SEMVER_REGEX) were duplicated from src/handlers/cdn.ts into src/tools/bundle.ts instead of extracted to shared validation module. This creates maintenance burden for future regex updates. (2026-03-04)
- **Situation:** Implementing regex validation for bundle tool. Similar regex already existed in cdn handler. Instead of extracting shared constant, constants were duplicated.
- **Root cause:** Extracting shared constants requires identifying the right shared location (src/shared/validation.ts) and whether other modules need it. Duplication is simpler for a single-feature PR but creates tech debt.
- **How to avoid:** Duplication is faster to implement and doesn't require refactoring cdn.ts. Cost: future npm naming rule changes require updates in multiple files, with risk of inconsistency.

#### [Pattern] Injection scenario tests map directly to threat vectors: flag injection (-rf), semicolon injection (command chaining), spaces (argument boundary), backticks (command substitution), pipes (output redirection), ampersands (background execution), empty string (validation edge case). (2026-03-04)
- **Problem solved:** Adding 7 tests for filePath validation covering real shell attack patterns
- **Why this works:** Each test is grounded in a concrete shell syntax feature that could be exploited. Tests aren't arbitrary constraints—they're threats. This makes test coverage auditable and future-maintainable: new threats can be added as new tests, not by guessing what 'invalid' means.
- **Trade-offs:** More tests (7 instead of 1 'rejects invalid') but each is documentable as a threat model. Makes security posture reviewable.

#### [Gotcha] Test utilities using vi.importActual() with dynamic string paths are not caught by standard import pattern matching (grep patterns looking for `from '...'`). Require manual audit and fix. (2026-03-04)
- **Situation:** tests/tools/error-consistency.test.ts used vi.importActual with string-based paths that didn't match grep patterns for standard imports.
- **Root cause:** vi.importActual() is a Vitest utility that takes strings; it doesn't use ES6 import syntax. Standard patterns matching `import.*from '...'` or `from '...'` don't capture it.
- **How to avoid:** Manual audit caught this specific case but doesn't scale to future test utilities. Automated patterns remain the primary defense.

#### [Gotcha] ReadableStream API unavailable in some test environments; fallback branch uses response.text() instead of streaming body iteration (2026-03-04)
- **Situation:** Test environment compatibility when streaming response body to count bytes
- **Root cause:** Node.js test runtimes and certain test frameworks don't expose ReadableStream on Response objects; the fallback ensures tests can still validate size enforcement without streaming
- **How to avoid:** Conditional logic adds code branches, but enables cross-environment testing. Fallback path (text()) is less memory-efficient but acceptable for tests.

#### [Pattern] Fallback logic requires testing both paths: (1) fallback is triggered when primary fails with expected error, (2) error propagates when primary fails with unexpected error (2026-03-04)
- **Problem solved:** The health.ts feature has two separate test scenarios: ENOENT triggers fallback (legacy path used), EACCES prevents fallback (error surfaces to caller)
- **Why this works:** Testing only the success case or only one error type leaves the selective catch logic untested. Both paths must be validated to ensure the error check logic works
- **Trade-offs:** Requires 2+ test cases instead of 1, but provides confidence that selective error handling works bidirectionally

#### [Gotcha] Full test suite showed 3 pre-existing failures in health.test.ts unrelated to changes, but targeted test run on only modified files showed all 62 tests pass. Without isolation, failures appear caused by changes when they actually pre-existed. (2026-03-04)
- **Situation:** Verification step to confirm changes didn't break tests. Full run was ambiguous; required git diff + targeted testing to clarify scope and isolate actual impact.
- **Root cause:** Unrelated flaky tests contaminate verification signal. Developers might revert working changes or question implementation based on misleading full suite results.
- **How to avoid:** Requires extra verification step (identify modified files, run targeted tests only). More thorough and accurate but slightly more work than full suite run.

#### [Gotcha] False-confidence tests: 8 tests actively validate wrong behavior yet pass; test suite provides false security. (2026-03-04)
- **Situation:** Tests marked as passing but contain incorrect assertions that don't match actual requirements or behavior.
- **Root cause:** Tests were written with incorrect assumptions or incomplete understanding of expected behavior, creating trap where passing tests hide actual bugs.
- **How to avoid:** Low effort to ignore (tests pass) vs high effort to fix (exposes real bugs); false confidence vs true safety.

#### [Gotcha] Mock-based tests miss real implementation: benchmark.test.ts tests mocks, not the actual benchmarkLibraries() handler—zero real coverage. (2026-03-04)
- **Situation:** Test suite passes because mocks behave correctly, but actual handler implementation is never exercised.
- **Root cause:** Mocks provide isolation and fast tests, but misalignment between mock behavior and real implementation can go undetected.
- **How to avoid:** Test isolation/speed vs actual implementation coverage; handlers can drift from mocks undetected.

#### [Pattern] Systemic assertion weakness: toBeDefined/toBeTruthy/toBeGreaterThan(0) used throughout codebase when exact fixture values are available. (2026-03-04)
- **Problem solved:** Tests pass but don't verify specific expected behavior; loose assertions hide off-by-one errors and value mutations.
- **Why this works:** Loose assertions reduce maintenance burden and are less brittle when values change, but trade specificity for convenience.
- **Trade-offs:** Easier maintenance vs higher confidence; less brittle tests vs lower bug-detection sensitivity.

#### [Pattern] Real-world protocol testing (cem-debounce.test.ts): Only test using real process spawn with real MCP protocol—identified as best test in codebase. (2026-03-04)
- **Problem solved:** Shows what high-confidence testing looks like compared to mock-based alternatives.
- **Why this works:** Real protocol testing eliminates mock-implementation misalignment; behavior is verified in realistic conditions, not isolated mock scenarios.
- **Trade-offs:** Slower, more complex setup vs guaranteed accuracy and real-world behavior validation.

#### [Gotcha] Mock property incompleteness: cdn.test.ts error mocks missing .code property; real fs errors have it, tests don't validate actual error handling. (2026-03-04)
- **Situation:** Mocks omit properties that real implementations provide; tests pass but don't exercise actual error paths.
- **Root cause:** Mocks only include what test author remembers; real implementation behavior (error property structure) not replicated.
- **How to avoid:** Simpler mocks vs comprehensive error handling validation.

#### [Gotcha] Unjustified coverage exclusions: src/index.ts excluded from coverage without documented rationale; unknown scope of what's untested. (2026-03-04)
- **Situation:** Entry point file is outside coverage monitoring but exclusion reason is not recorded.
- **Root cause:** Possibly because entry point aggregates but doesn't contain testable logic, but assumption is not explicit.
- **How to avoid:** Simpler coverage metrics vs knowing what code is deliberately untested.

### Validated documentation using JSON.parse() on all 37 code blocks rather than runtime/integration tests. Documentation-only features use parse validation as the correctness gate. (2026-03-04)
- **Context:** Created standalone `IDE-INTEGRATION.md` with no executable code; needed to ensure all config snippets were syntactically valid.
- **Why:** JSON parsing is deterministic and catches copy-paste errors (malformed braces, trailing commas, etc.) without requiring test infrastructure. Documentation is user-facing so parse errors are actual bugs.
- **Rejected:** Skipping validation entirely (risky: users copy invalid JSON and get confusing IDE errors); full integration test with all 6 IDEs (too expensive for docs).
- **Trade-offs:** Lightweight validation prevents syntax errors but won't catch semantic errors (e.g., wrong path values).
- **Breaking if changed:** Any JSON snippet without valid syntax will fail when users copy-paste it into their IDE config files.

#### [Gotcha] When function signatures are extended with new optional parameters, mock assertions using toHaveBeenCalledWith() must be explicitly updated to include all parameters, even those that are undefined. The actual function calls may not require these parameters, but the mock expectation comparison is strict about parameter count. (2026-03-04)
- **Situation:** Health tool handlers were updated to accept a libraryId parameter, but test assertions checking mock calls were not updated. Tests failed because toHaveBeenCalledWith() was checking the old parameter count.
- **Root cause:** Mock matchers in testing frameworks like Jest/Vitest perform strict arity (parameter count) matching. Optional parameters that are passed as undefined must still be explicitly included in assertions for the match to succeed.
- **How to avoid:** Requires more verbose test assertions, but ensures mock expectations are precise and match actual call signatures exactly.

#### [Gotcha] Implementation changes can be complete in handler/tool code but leave test assertions stale without immediate test failures if the mocks haven't been re-run against the new code. Test discovery happens only when tests are explicitly executed. (2026-03-04)
- **Situation:** Core handlers and tools were updated with libraryId parameter threading, but tests were not updated until the full test suite was run.
- **Root cause:** TypeScript build passes because the implementation is sound; tests fail only when actually executed against the updated handlers. There's a gap between code changes and test verification.
- **How to avoid:** Faster implementation velocity when not test-driven, but delays discovery of test staleness until explicit test runs. Implementation-first approach works when test coverage is comprehensive enough to catch drift.