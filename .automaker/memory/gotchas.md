---
tags: [gotchas]
summary: gotchas implementation decisions and patterns
relevantTo: [gotchas]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 91
  referenced: 53
  successfulFeatures: 53
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

#### [Gotcha] A feature branch was created to fix a HUMAN TASK comment in README.md, but the fix had already been applied in a prior commit before the feature branch was picked up. (2026-03-12)
- **Situation:** The feature 'fix: remove HUMAN TASK comment from README before npm publish' was implemented but the target artifact (HUMAN TASK comment) no longer existed in README.md. References remained only in audit/tracking docs (DX_REVIEW.md, AUDIT_SUMMARY.md).
- **Root cause:** The fix was applied directly or in another branch/commit before this feature branch was started, leaving the feature branch with nothing to do.
- **How to avoid:** By correctly scoping the fix to only README.md and not touching audit docs, historical tracking integrity is preserved. The risk is that documentation references to 'HUMAN TASK' could cause future confusion about whether the issue is still open.

#### [Gotcha] Auto-generated features from audit snapshots can describe issues that no longer exist in the codebase, creating ghost work items. (2026-03-12)
- **Situation:** A feature ticket was created to fix a 'your-org' placeholder CI badge URL in README.md, but the fix had already been applied in a prior commit (1708102) before the feature work began.
- **Root cause:** Audit documents capture point-in-time snapshots. If the underlying issue is fixed between audit generation and feature execution, the feature becomes a no-op — but this isn't discoverable without reading both the code and the audit history.
- **How to avoid:** Audit-driven development is efficient for surfacing issues at scale, but introduces lag between issue discovery and resolution that can generate duplicate/stale work items if fixes land out-of-band.

#### [Gotcha] Historical audit and review documents (DX_REVIEW.md, AUDIT_SUMMARY.md, principal-review-*.md) describing old incorrect states should not be treated as actionable bugs — they are immutable snapshots, not living specifications. (2026-03-12)
- **Situation:** After the 'your-org' placeholder was fixed in code, references to the old incorrect state persisted in docs/DX_REVIEW.md, docs/AUDIT_SUMMARY.md, and .automaker/reviews/, causing confusion about whether the issue was truly resolved.
- **Root cause:** Audit docs represent the state at time of review, not current state. Updating them retroactively would destroy their value as historical records.
- **How to avoid:** Preserving audit doc integrity means developers must cross-check code vs docs to determine actual current state, adding cognitive overhead during triage.

#### [Gotcha] Repo name drift between feature description and actual codebase (wc-tools vs helixir) is a signal that a feature ticket was generated from a stale or wrong-repo audit context. (2026-03-12)
- **Situation:** The feature description referenced 'bookedsolidtech/wc-tools' but the actual repo is 'bookedsolidtech/helixir', indicating the audit that generated the ticket was run against a different or renamed repo.
- **Root cause:** Repo renames or forks can cause audit tooling to carry forward stale identifiers if not re-seeded after structural changes.
- **How to avoid:** Catching this mismatch requires the implementer to read actual file content and compare against the ticket — automated feature execution without human review would have introduced a bug.

#### [Gotcha] Feature branch was opened for work that was already completed in a prior commit — the codebase was already fully converted before the task ran (2026-03-12)
- **Situation:** The implementation log shows all acceptance criteria (async parseTokens, fs/promises imports, awaited callers, no sync I/O) were already satisfied with a clean git diff
- **Root cause:** Likely a timing issue — the fix was committed to the branch before the automated task was triggered, or the task was queued after a manual fix was already applied
- **How to avoid:** Wasted CI/agent time verifying already-complete work; however, verification still provides confidence the implementation is correct

#### [Gotcha] Feature branch described converting readFileSync at specific line numbers (~65, ~109) that no longer existed — the fix had already been applied in a prior commit (2026-03-12)
- **Situation:** Feature ticket/branch name referenced a specific sync-to-async migration, but the target file already used async readFile with no readFileSync remaining
- **Root cause:** Likely a race condition between the feature branch creation and a prior fix landing on the base branch, or the branch was created from a stale ref
- **How to avoid:** Time spent investigating a completed task; highlights the risk of feature descriptions referencing specific line numbers which drift as code evolves

#### [Gotcha] Feature branch was created to convert readFileSync to async but the code was already async, resulting in a no-op implementation (2026-03-12)
- **Situation:** A feature ticket described converting buildSuggestedUsage to async and replacing readFileSync with readFile from fs/promises, but the codebase had already been updated prior to branch creation
- **Root cause:** The divergence between the feature description and actual code state suggests the async conversion was completed in a prior commit or the feature description was written against an older version of the code
- **How to avoid:** No-op feature branches waste CI time and developer effort but confirm correctness; the alternative of forcing unnecessary code changes would introduce churn and potential regression

#### [Gotcha] Feature tickets referencing ci.yml may be written without awareness that the project uses split workflow files, causing implementation work to be scoped to the wrong file or duplicated (2026-03-12)
- **Situation:** Chore ticket explicitly requested adding a pnpm audit step to ci.yml, but no ci.yml exists and the step was already present in security.yml
- **Root cause:** Ticket authors likely assumed a standard single-file CI convention without auditing the actual workflow structure first
- **How to avoid:** Granular workflows improve CI clarity but increase the chance of misalignment between ticket descriptions and actual file structure

#### [Gotcha] A single long function signature on one line can silently break CI format checks (Prettier line-length enforcement) even when the logic is correct (2026-03-21)
- **Situation:** The buildStyling function in suggest.ts had its full signature — including a complex inline object type — written on a single line, causing a Prettier line-length violation that failed CI
- **Root cause:** Prettier's line-length rule is enforced as a CI gate, so a violation blocks merging regardless of functional correctness. The fix is mechanical: break the signature across multiple lines per Prettier conventions for complex parameter types
- **How to avoid:** Multi-line signatures are more verbose but are significantly more readable for complex inline types and avoid CI failures. Single-line is compact but brittle against line-length thresholds

#### [Gotcha] Escalation branch was based off `main`, not the open PR branch — fixes intended for an open PR must be pushed directly to the PR's feature branch, not to any escalation branch (2026-03-21)
- **Situation:** An autonomous escalation agent checked out or created a branch from `main` to address PR review warnings, but that branch did not contain the PR's in-flight changes, making the fix invisible to the PR
- **Root cause:** GitHub MCP `push_files` was used to target the PR branch directly (`feature/enhance-suggestusage-to-include-styling`) once the branch mismatch was identified
- **How to avoid:** Direct push to PR branch is clean but bypasses any local validation; the trade-off is accepted because CI runs on the PR branch post-push

#### [Pattern] Multi-agent escalation chains can result in split work: one agent applies code fixes and pushes, but fails to close the feedback loop (PR comment/thread reply), requiring a verify-and-respond retry rather than a full re-implementation (2026-03-21)
- **Problem solved:** CodeRabbit warning on PR #98 was escalated; prior agent had already pushed all 4 workflow file changes but left the CodeRabbit review thread unacknowledged
- **Why this works:** Agent handoffs lack shared state about what communication actions (vs code actions) were completed — code changes are verifiable via GitHub API but comment actions are not surfaced in PR state the same way
- **Trade-offs:** Retry agents must always independently verify prior work before acting, which adds latency but prevents double-application of changes

#### [Gotcha] When an escalation signal references a closed PR, the work may already be resolved by a prior escalation attempt. Always verify PR state via GitHub before implementing any changes. (2026-03-21)
- **Situation:** Retry #1 of an escalation for PR #101 was triggered, but the PR was already closed and all CodeRabbit warnings had been addressed in the prior attempt (retry #0).
- **Root cause:** Escalation retry systems do not always have visibility into whether a prior attempt succeeded — they may re-trigger based on stale signal state. Checking PR state first prevents redundant or conflicting work.
- **How to avoid:** Adding a PR state check step adds latency to escalation resolution but prevents wasted effort and potential regressions from double-applying changes.

#### [Gotcha] Escalation/retry agents should first verify prior agent work before applying changes — duplicate work risk is real when multiple agents handle the same PR (2026-03-21)
- **Situation:** This was a retry escalation of a prior agent task on PR #98; the prior agent had already applied all fixes and posted a PR comment
- **Root cause:** Agent retry pipelines can re-execute work already completed if they don't check current state first via API reads
- **How to avoid:** Adding a verification step at the start of each agent run adds latency but prevents duplicate/conflicting mutations

#### [Gotcha] CodeRabbit review threads remain unresolved on the PR UI even after a direct reply comment is posted via GitHub API — manual resolution or a CodeRabbit re-review is required (2026-03-21)
- **Situation:** Agent posted PR comment #4102117661 addressing the CodeRabbit thread at package.json line 45, but the thread status in the PR UI does not auto-resolve
- **Root cause:** CodeRabbit tracks its own review thread state independently of GitHub comment replies — a reply does not signal resolution to CodeRabbit's system
- **How to avoid:** Developers must manually resolve CodeRabbit threads or wait for CodeRabbit to re-review; automated agents cannot fully close these threads

#### [Gotcha] Prior agent summaries claimed suggest.ts was updated to use getShadowDomWarnings() helper, but the actual file still contained the inline warnings array. The helper was added to mcp-helpers.ts in commit 7523ab6 but the consumer (suggest.ts) was never wired up. (2026-03-21)
- **Situation:** PR #101 CodeRabbit flagged duplicated Shadow DOM warning text across handlers. Two prior agent attempts both reported the fix as complete without verifying the actual file contents.
- **Root cause:** Agents summarized intent rather than verified outcome — the mcp-helpers.ts change was real but the suggest.ts import/usage change was never committed.
- **How to avoid:** Verification via direct file reads adds time but is the only reliable signal; summary narratives are lossy and can overstate completion

#### [Gotcha] The inline warning text in suggest.ts used '.label' as the descendant selector example while the getShadowDomWarnings() helper used '.inner' — confirming the two code paths were never synchronized despite claiming to express the same constraint. (2026-03-21)
- **Situation:** Shadow DOM styling constraint warnings needed to be consistent across suggest_usage, narrative, and quick-ref MCP tool handlers
- **Root cause:** The inline array predated the shared helper and was written independently; small textual drift is a reliable indicator that centralization was never completed
- **How to avoid:** Centralized helper enforces single source of truth for warning text; any future wording change propagates automatically to all handlers