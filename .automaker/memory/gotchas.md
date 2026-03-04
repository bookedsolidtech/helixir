---
tags: [gotchas]
summary: gotchas implementation decisions and patterns
relevantTo: [gotchas]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 42
  referenced: 36
  successfulFeatures: 36
---
# gotchas

#### [Gotcha] readLatestHistoryFile returns null when directory has no JSON files (not an error), requiring callers to handle null via fallback or throw (2026-03-03)
- **Situation:** Health handler tests reveal that empty history directories produce null, not exceptions
- **Root cause:** Null return propagates 'absence' up the stack - caller decides if it's an error (throw) or acceptable (fallback to CEM data)
- **How to avoid:** Null return requires more careful null-checking in callers, but enables flexible fallback logic (scoreComponent can use CEM data instead)

#### [Gotcha] Multiple agents worked on test coverage - Findings #23–25 (benchmark, story, composition handlers) already existed in codebase, only #26–29 needed implementation (2026-03-03)
- **Situation:** Task assumed tests needed to be created, but 3 out of 7 findings already had comprehensive test coverage
- **Root cause:** Prior agents had already completed handler-level test coverage; checking git history and existing test files revealed this
- **How to avoid:** Requires thorough codebase search before writing tests - slower initial analysis, but prevents waste

#### [Gotcha] commitlint.config.js must use .cjs extension when package.json has "type": "module" (2026-03-04)
- **Situation:** ESM-first project setup where commitlint config failed to load with .js extension
- **Root cause:** CommonJS config files cannot be properly resolved in ESM-first projects; .cjs extension forces them to be treated as CommonJS modules rather than being parsed as ESM
- **How to avoid:** One additional file extension to remember vs having working config in ESM projects. .cjs is only recognized by certain tools.

#### [Gotcha] CI badge in README pointed to deleted workflow (ci.yml) causing stale documentation. Fix required updating to active workflows (build.yml, test.yml). (2026-03-04)
- **Situation:** CI workflow files changed at some point in the past, but documentation wasn't updated accordingly
- **Root cause:** Documentation lives separately from CI configuration and doesn't auto-update when workflows change
- **How to avoid:** Parallel workflows provide faster feedback and modularity, but require documentation to track multiple file names and statuses

#### [Pattern] Documentation explicitly includes `--no-verify` bypass instructions WITH WARNING that it will fail CI on protected branches. Educates developers that governance tools CAN be bypassed locally but WILL be re-enforced at merge time. (2026-03-04)
- **Problem solved:** Teams always need emergency bypass mechanisms, but bypassing pre-commit hooks can introduce broken commits
- **Why this works:** Acknowledges that developers WILL use `--no-verify` when desperate; better to document the consequence (CI failure) than pretend it's not an option
- **Trade-offs:** Reduces friction for genuine emergencies, but requires developers to understand that local bypass ≠ passing CI merge gates

#### [Gotcha] Identical bug pattern replicated across parallel code paths in the same file (readLatestHistoryFile lines ~166 and getHealthTrend lines ~326) due to copy-paste pattern adoption, not caught by existing tests focused on only one path. (2026-03-04)
- **Situation:** Feature description cited only one location, but identical bare `catch {}` pattern existed in second independent function handling the same fallback logic.
- **Root cause:** Common patterns (try-new-path-fallback-to-legacy) get replicated across a codebase; test suites often focus on primary or most-called path, leaving parallel implementations untested.
- **How to avoid:** Discovering and fixing both locations required code inspection beyond the feature spec; benefit is consistency, but risk of incomplete specification compliance.

#### [Gotcha] Using `redirect: 'error'` to fail fast on CDN redirects. The original bug (unpkg URLs with incorrect `/npm/` path) would have been silently masked by CDN redirects that followed the URL to the correct location. (2026-03-04)
- **Situation:** Bug was URL construction error, but symptoms were masked because CDN handles the redirect transparently
- **Root cause:** With correct URLs, any redirect indicates a real problem — relying on silent redirects creates undetectable bugs. Strict behavior forces the root cause to surface.
- **How to avoid:** Stricter behavior catches bugs earlier at the cost of being less forgiving; if legitimate URL variations emerge that CDN redirects, this will require investigation

#### [Gotcha] CDN handler location: moved from `src/handlers/cdn.ts` → `packages/core/src/handlers/cdn.ts` during monorepo refactoring; old path no longer exists (2026-03-04)
- **Situation:** Developers searching or hard-coding imports to original handler location will fail to find the implementation
- **Root cause:** Repository refactored from single-package structure to monorepo with packages/core/ containing shared handlers
- **How to avoid:** Clearer monorepo structure at cost of changed import paths requiring developer updates

#### [Gotcha] compareLibraries validates paths against projectRoot using join() — absolute paths from resolve() get double-prepended and fail. Must use relative paths. (2026-03-04)
- **Situation:** compare test failed when using resolve(FIXTURE_ROOT, 'file.json') to create absolute paths for CLI arguments
- **Root cause:** compareLibraries implementation expects relative input paths and joins them against projectRoot. Absolute paths bypass this contract and cause path validation to fail internally.
- **How to avoid:** Relative paths are less explicit but match library design intent. Requires understanding library's path semantics rather than filesystem assumptions.

#### [Gotcha] ESM module resolution requires explicit .js extensions in import paths. TypeScript build outputs .js files that must be imported with extension in ESM. (2026-03-04)
- **Situation:** Adding CLI handler imports in src/cli/index.ts with ESM module resolution in NodeNext mode
- **Root cause:** Node's ESM doesn't auto-resolve extensions or handle extensionless imports like CommonJS. Built .js files must be explicitly named.
- **How to avoid:** Explicit extensions are verbose in source code but ensure deterministic module loading. Makes dependency chain explicit.

#### [Gotcha] pnpm blocks post-install scripts by default, breaking esbuild setup in monorepos (2026-03-04)
- **Situation:** Attempted to use esbuild bundler in github-action package within pnpm monorepo
- **Root cause:** pnpm has stricter security policies than npm and yarn. Post-install scripts (like esbuild's setup binary download) are blocked unless explicitly allowed in .pnpmrc. The bundler failed silently with 'Ignored build scripts' message.
- **How to avoid:** Switching to plain tsc compilation is simpler, doesn't require security exceptions, but produces larger output; esbuild would reduce bundle size but added pnpm policy friction

#### [Gotcha] MCP config generation assumes Claude Desktop respects 'cwd' key, but it ignores it. Generated snippet uses 'cwd: projectRoot' while README correctly shows 'env.MCP_WC_PROJECT_ROOT'. Every user running init gets broken config. (2026-03-04)
- **Situation:** Init wizard generates MCP server config that doesn't work in actual Claude Desktop installation
- **Root cause:** Config generation logic wasn't validated against the actual target system's behavior. Common pattern in other contexts (Node child_process, shells) supports cwd, so it was assumed to work here.
- **How to avoid:** Environment variables are less intuitive for users but are portable and actually work; cwd feels more natural but requires implementation in MCP client

#### [Gotcha] Init writes absolute 'projectRoot' path into generated mcpwc.config.json. When repo is cloned by another developer, the path is invalid and config breaks. (2026-03-04)
- **Situation:** Generated config files hard-code absolute paths instead of relative or environment-based paths
- **Root cause:** Local-first implementation: works fine on developer's machine, no consideration for shared/multi-developer scenario
- **How to avoid:** Absolute paths are simpler to implement and more explicit; relative paths require loader to understand context

#### [Gotcha] Framework detection is inconsistent across entry points: init wizard checks 'dependencies + devDependencies + peerDependencies', but suggest handler checks only 'dependencies + devDependencies'. Library authors using React/Vue as peerDeps won't get framework snippets. (2026-03-04)
- **Situation:** Multiple code paths perform similar framework detection with different logic
- **Root cause:** No unified detection function or pattern established. Each entry point was implemented independently without DRY enforcement.
- **How to avoid:** Independent implementations are flexible but diverge easily; shared function is rigid but guarantees consistency

#### [Gotcha] Malformed JSON in mcpwc.config.json is caught and reported as 'Warning: mcpwc.config.json is malformed. Using defaults.' without including the SyntaxError details (line number, column, actual error message). (2026-03-04)
- **Situation:** Config loading error handler swallows diagnostic information in attempt to be user-friendly
- **Root cause:** Generic catch block prioritized user-friendly messaging over diagnostic accuracy. The reasoning was likely 'don't overwhelm the user with technical details'.
- **How to avoid:** Friendly-only messages feel cleaner but cause hours of debugging; detailed messages are verbose but actionable

#### [Gotcha] Init wizard displays config path as '~/.claude/claude_desktop_config.json', but actual Claude Desktop stores config at '~/Library/Application Support/Claude/claude_desktop_config.json' (macOS) or '%APPDATA%\Claude\claude_desktop_config.json' (Windows). (2026-03-04)
- **Situation:** Output instructions reference wrong filesystem path for target application's config location
- **Root cause:** Path was guessed based on naming convention (~/.claude) rather than verified against actual Claude Desktop behavior. Output was never tested by actually following the instructions.
- **How to avoid:** Generic single path is simpler to display but wrong; OS-specific branching is complex but correct

#### [Gotcha] Stencil framework is detected using a heuristic: 'module.path.endsWith(".tsx")'. This is a false-positive risk for TypeScript React projects. Actual check should read package.json for '@stencil/core' dependency. (2026-03-04)
- **Situation:** Framework detection uses fragile file extension heuristic instead of available metadata
- **Root cause:** Heuristic-based detection is faster and doesn't require package.json parsing. But it trades correctness for speed. Root cause: assumed .tsx files are strongly correlated with Stencil.
- **How to avoid:** Extension-based heuristic is cheap; metadata check is more reliable but requires additional file I/O and parsing

#### [Gotcha] 'cdnBase' config parameter has no URL validation. Invalid CDN URLs silently produce broken HTML snippets, no warning. (2026-03-04)
- **Situation:** Config loading doesn't validate that URLs are well-formed or reachable
- **Root cause:** Assumed valid input or lazy implementation. No validation gate at config load time.
- **How to avoid:** No validation is faster; URL validation adds overhead but catches misconfiguration early

#### [Gotcha] Watch mode activation is completely silent. When CEM watcher is started, user has no confirmation it's running. No message printed to stderr or stdout. (2026-03-04)
- **Situation:** Async operation completes without user-visible feedback
- **Root cause:** Probable oversight. Watch mode is a background process, so developer might have assumed no output was necessary.
- **How to avoid:** Silent operation is clean but leaves user uncertain; explicit confirmation adds noise but confirms intent

#### [Gotcha] Accessing error.code requires casting caught error to NodeJS.ErrnoException; catch variables are typed as unknown in strict TypeScript, so direct .code access would fail type checking (2026-03-04)
- **Situation:** Need to distinguish ENOENT from other errors in catch block, but TypeScript doesn't know caught error has errno properties
- **Root cause:** Strict TypeScript types catch variables as unknown to enforce type safety. Not all error types have .code property (only filesystem/syscall errors do). Must assert type to access errno-specific properties.
- **How to avoid:** One-line cast adds safety guarantee: can only access .code if error is actually NodeJS.ErrnoException, preventing crashes on unexpected error types