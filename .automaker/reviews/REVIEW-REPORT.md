# HELiXiR MCP Server — Security & Architecture Review Report

**Date:** 2026-03-03
**Reviewer:** Automated antagonistic review
**Scope:** Full codebase (40+ source files, 48 test files, 1047 test cases)
**Version:** v0.1.x (post-Multi-CEM integration)

---

## Executive Summary

The helixir MCP server is well-structured and demonstrates security awareness (Zod validation, `resolve()` for paths, no `eval`/`exec`). However, several medium-severity issues need addressing before the server handles untrusted input in production.

### Top 5 Priorities

1. **[HIGH] Git command injection via `ref` parameter** — `baseBranch` is interpolated into a git command without character validation (`src/shared/git.ts`). A maliciously crafted ref could escape the intended command.

2. **[MEDIUM] CEM path not confirmed to stay within `projectRoot`** — `resolve(projectRoot, cemPath)` does NOT guarantee containment when `cemPath` is absolute. An admin-supplied `/etc/shadow` in `MCP_WC_CEM_PATH` would be read directly.

3. **[MEDIUM] `FilePathSchema` misses Windows drive letters and UNC paths** — The schema blocks `..` and absolute `/` paths but allows `C:\..` and `\\server\share` which are absolute on Windows.

4. **[MEDIUM] Inconsistent error types** — Some handlers throw plain `Error`, others `MCPError`. Plain errors lose their category context when caught and downgrade to `ErrorCategory.UNKNOWN`.

5. **[MEDIUM] Benchmark handler has zero test coverage** — `src/handlers/benchmark.ts` has no test file. Combined with the new `src/tools/benchmark.ts`, this is an untested code path.

---

## 1. Security Audit

### 1.1 Input Validation

#### [HIGH] Git command injection via `ref` parameter

- **File:** `src/shared/git.ts:22–23`
- **Description:** `git show ${ref}:${filePath}` passes `ref` (the `baseBranch` tool argument) via string interpolation into an `execFileAsync` call. Although `execFileAsync` does not spawn a shell by default, certain git ref strings containing `--upload-pack=` or similar flags may alter git's behaviour.
- **Suggested fix:** Validate `ref` with a strict allowlist before use:
  ```typescript
  if (!/^[a-zA-Z0-9._\-/]+$/.test(ref)) {
    throw new MCPError('Invalid branch/ref name', ErrorCategory.VALIDATION);
  }
  ```

#### [MEDIUM] `FilePathSchema` validation is incomplete

- **File:** `src/shared/validation.ts:31–38`
- **Description:** Blocks `..` and leading `/` but misses:
  - Windows drive letters (`C:\file.ts` starts with a letter, not `/`)
  - UNC paths (`\\?\C:\...`)
  - Unicode normalization tricks (`\u002e\u002e`)
- **Suggested fix:**
  ```typescript
  const FilePathSchema = z
    .string()
    .refine((p) => !p.includes('..'), 'Path traversal not allowed')
    .refine((p) => !p.startsWith('/'), 'Absolute paths not allowed')
    .refine((p) => !/^[a-zA-Z]:/.test(p), 'Windows drive letters not allowed')
    .refine((p) => !p.startsWith('\\\\'), 'UNC paths not allowed')
    .refine((p) => !path.isAbsolute(p), 'Must be a relative path');
  ```

#### [MEDIUM] CDN version string sanitization is overly permissive

- **File:** `src/handlers/cdn.ts:20–28`
- **Description:** `sanitizeVersion()` allows any character matching `[a-zA-Z0-9._\-+~^]+`. This is broader than semver and could admit strings like `2.0.0../../etc`. The safe `join()` call normalises the cache path (mitigating the immediate risk), but the value is also embedded in the fetched URL.
- **Suggested fix:**
  ```typescript
  if (version === 'latest') return version;
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/.test(version)) {
    throw new MCPError('Invalid semver format', ErrorCategory.VALIDATION);
  }
  return version;
  ```

#### [MEDIUM] Package name sanitisation may not cover all filesystem-invalid characters

- **File:** `src/handlers/cdn.ts:11–12`
- **Description:** `sanitizePackageName()` replaces whitespace with `-` but does not reject null bytes, newlines, or Windows-reserved characters (`<>:"|?*`). The package name is used in a cache filename.
- **Suggested fix:** Apply npm package name spec validation:
  ```typescript
  if (!/^(@?[a-z0-9]([a-z0-9._-]*[a-z0-9])?)(\\/[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$/i.test(pkg)) {
    throw new MCPError('Invalid npm package name', ErrorCategory.VALIDATION);
  }
  ```

#### [MEDIUM] Health history tag name allowlist is too loose

- **File:** `src/handlers/health.ts:106–114`
- **Description:** Tag names are checked for `..`, `/`, and `\` but the positive allowlist is not enforced. A tag like `my-button%00evil` or a Unicode-encoded traversal sequence would pass.
- **Suggested fix:** Replace with a positive allowlist:
  ```typescript
  if (!/^[a-z0-9:_-]+$/i.test(tagName)) {
    throw new MCPError('Invalid tag name', ErrorCategory.VALIDATION);
  }
  ```

---

### 1.2 File System Access

#### [MEDIUM] Resolved CEM path not verified to stay within `projectRoot`

- **File:** `src/index.ts:96`
- **Description:**
  ```typescript
  const cemAbsPath = resolve(config.projectRoot, config.cemPath);
  ```
  `path.resolve()` with an absolute second argument ignores the first. If `MCP_WC_CEM_PATH=/etc/shadow`, `cemAbsPath` becomes `/etc/shadow`. The file is then read and parsed.
- **Suggested fix:**
  ```typescript
  const cemAbsPath = resolve(config.projectRoot, config.cemPath);
  if (!cemAbsPath.startsWith(resolve(config.projectRoot) + path.sep)) {
    throw new Error('CEM path must be inside projectRoot');
  }
  ```

#### [LOW] Silent file-access failures hide permission errors

- **File:** `src/handlers/health.ts:137–147`, `src/tools/discovery.ts:437–472`
- **Description:** Broad `catch` blocks swallow all errors, including `EACCES` (permission denied). Users see partial results without understanding why.
- **Suggested fix:** Distinguish `ENOENT` (expected — no history yet) from `EACCES` (unexpected — should surface as an error):
  ```typescript
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EACCES') {
      throw new MCPError('Permission denied reading health history', ErrorCategory.FILESYSTEM);
    }
    return null;
  }
  ```

---

### 1.3 External Network Calls

#### [MEDIUM] SSRF risk in CDN fetch — no post-encoding URL validation

- **File:** `src/handlers/cdn.ts:42–56`
- **Description:** The registry host is whitelisted (good), but there is no final assertion that the constructed URL actually starts with the expected CDN prefix after encoding. Package names with unusual characters that survive sanitisation could produce unexpected URLs.
- **Suggested fix:** Assert the URL before fetching:
  ```typescript
  const expectedPrefix = `https://${host}/npm/`;
  if (!url.startsWith(expectedPrefix)) {
    throw new MCPError('Unexpected CDN URL constructed', ErrorCategory.VALIDATION);
  }
  ```

#### [LOW] No timeout on git commands

- **File:** `src/shared/git.ts:7–14`
- **Description:** `execFileAsync('git', ...)` has no timeout. A hung git operation could block the server thread indefinitely.
- **Suggested fix:**
  ```typescript
  await execFileAsync('git', args, { timeout: 30_000 });
  ```

#### [LOW] CDN fetch does not disable redirects

- **File:** `src/handlers/cdn.ts:48–56`
- **Description:** HTTP redirects are followed by default. A redirect from `cdn.jsdelivr.net` to an internal IP would not be caught.
- **Suggested fix:**
  ```typescript
  const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
  ```

---

### 1.4 Error Message Leakage

#### [LOW] Absolute paths in error responses

- **Files:** `src/index.ts:100, 109`, `src/shared/file-ops.ts:18, 28, 36`, `src/handlers/suggest.ts:100`
- **Description:** Full absolute paths (e.g. `/home/user/project/.mcp-wc/health`) are included in error messages returned to MCP clients. This leaks deployment topology.
- **Suggested fix:** Strip `projectRoot` prefix from paths in error strings:
  ```typescript
  const rel = path.relative(config.projectRoot, absPath);
  throw new MCPError(`CEM file not found at '${rel}'`, ErrorCategory.FILESYSTEM);
  ```

---

## 2. Architecture Review

### 2.1 Module Coupling & State Management

#### [MEDIUM] Module-level CEM cache creates global mutable state

- **File:** `src/index.ts:46–84`
- **Description:**
  ```typescript
  let cemCache: Cem | null = null;
  let cemLoadedAt: Date | null = null;
  ```
  All handlers depend on this global cache being passed as a parameter. Watch-mode debounce could race with concurrent requests. Testing requires carefully resetting module state.
- **Suggested fix:** Wrap in a `CemCacheManager` class with explicit lifecycle methods and pass it through the tool registry.

#### [MEDIUM] `bundleCache` is an unbounded in-memory map

- **File:** `src/handlers/bundle.ts:32–38`
- **Description:** The bundle cache has a 24-hour TTL per entry but no maximum size. Repeated requests for distinct package/version combinations grow the map without bound.
- **Suggested fix:**
  ```typescript
  const MAX_CACHE_SIZE = 1000;
  // Evict oldest entry when limit is exceeded
  ```

#### [MEDIUM] `McpWcConfig` properties are mutable

- **File:** `src/config.ts:39–89`
- **Description:** Config is passed as a plain object. Any handler could mutate `config.projectRoot` at runtime, silently affecting all subsequent calls.
- **Suggested fix:** Add `readonly` modifiers:
  ```typescript
  export interface McpWcConfig {
    readonly cemPath: string;
    readonly projectRoot: string;
    // ...
  }
  ```

---

### 2.2 Error Handling Consistency

#### [MEDIUM] Inconsistent error types across handlers

- **Files:**
  - `src/handlers/health.ts:110, 122, 258, 296` — plain `Error`
  - `src/handlers/tokens.ts:62, 71, 77, 99, 116` — plain `Error`
  - `src/handlers/typescript.ts:37, 80` — plain `Error`
  - `src/handlers/cem.ts:160, 168` — `MCPError` ✓
  - `src/handlers/cdn.ts:22, 59, 69, 79` — `MCPError` ✓
- **Description:** Plain errors lose their category context when caught by `handleToolError()` and are downgraded to `ErrorCategory.UNKNOWN`.
- **Suggested fix:** Standardise all handler throws to `MCPError`:
  ```typescript
  throw new MCPError('Invalid tag name', ErrorCategory.VALIDATION);
  ```

#### [LOW] `handleToolError()` always assigns `UNKNOWN` category to non-MCPError exceptions

- **File:** `src/shared/error-handling.ts:23–33`
- **Description:** The fallback path creates `new MCPError(error.message, ErrorCategory.UNKNOWN)` for all non-MCPError errors, discarding any inferred category.
- **Suggested fix:** Infer from well-known error properties:
  ```typescript
  let category = ErrorCategory.UNKNOWN;
  if (error instanceof SyntaxError) category = ErrorCategory.VALIDATION;
  else if ((error as NodeJS.ErrnoException).code === 'ENOENT') category = ErrorCategory.FILESYSTEM;
  ```

---

### 2.3 Type Safety

#### [MEDIUM] `Record<string, unknown>` used as handler argument type

- **Files:** `src/index.ts:141`, all `src/tools/*.ts` handler interfaces
- **Description:** The initial `args` type is `Record<string, unknown>` before Zod parsing. Zod parse results are typed correctly, but the cast `as Record<string, unknown>` is unsafe and could hide bugs.
- **Suggested fix:** Use generics to thread Zod schema types through handler signatures.

#### [LOW] Double type cast in response adapter

- **File:** `src/index.ts:207`
- **Description:**
  ```typescript
  return result as unknown as Record<string, unknown>;
  ```
  Indicates a type mismatch between `MCPToolResult` and the SDK's `CallToolResult`. The cast hides the real type incompatibility.
- **Suggested fix:** Define an explicit adapter function with a proper return type annotation.

---

### 2.4 Specific Known Issues

#### [MEDIUM] `resolve_cdn_cem` registers CEM in memory as a side effect

- **File:** `src/handlers/cdn.ts` + `src/tools/cdn.ts`
- **Description:** Calling `resolve_cdn_cem` implicitly adds the fetched CEM to the in-memory multi-CEM store. This side effect is not communicated in the tool's description or return value. A caller that simply wants to preview a CDN CEM will permanently mutate server state.
- **Suggested fix:** Make registration explicit via a separate `register_cdn_cem` step or a boolean `register: true` parameter.

#### [MEDIUM] Silent CDN registration failure in `library.ts`

- **File:** `src/handlers/library.ts` (load_library path)
- **Description:** If CDN fetch or cache write fails during a `load_library` call that specifies a CDN source, the error is caught silently and the library is treated as if it loaded successfully with an empty CEM.
- **Suggested fix:** Propagate the error to the caller.

#### [MEDIUM] `health` and `diff` tools not multi-library-aware

- **File:** `src/handlers/health.ts`, `src/tools/health.ts`
- **Description:** Health history is stored by tag name only, not `libraryId:tagName`. Two libraries with a component named `my-button` will share history files, producing incorrect trend data.
- **Suggested fix:** Namespace history files: `{healthHistoryDir}/{libraryId}/{tagName}/`.

#### [MEDIUM] Path traversal in `load_library` cemPath (multi-CEM)

- **File:** `src/handlers/library.ts`
- **Description:** `cemPath` supplied in a `load_library` call is resolved relative to `projectRoot` without verifying it stays within `projectRoot` (same issue as §1.2).
- **Suggested fix:** Apply the same containment check described in §1.2.

---

## 3. Test Coverage Analysis

### 3.1 Untested Handlers

#### [MEDIUM] `src/handlers/benchmark.ts` has no test file

- **Description:** The benchmark handler was added with `src/tools/benchmark.ts` but no corresponding test file exists. Zero assertions against the benchmark logic.
- **Suggested fix:** Create `tests/handlers/benchmark.test.ts`.

#### [MEDIUM] `src/handlers/story.ts` has no dedicated handler tests

- **Description:** Story handler is exercised only indirectly through tool-level tests. Handler-level edge cases (missing CEM declaration, empty slots/events) are untested.

#### [MEDIUM] `src/handlers/compose.ts` handler-level tests are absent

- **Description:** Composition logic is tested via `tests/tools/composition.test.ts` but not at the handler layer.

---

### 3.2 Git Test Coverage

#### [MEDIUM] `tests/shared/git.test.ts` has only 3 test cases

- **Description:** No adversarial tests for:
  - Branch names with special characters
  - Non-existent files referenced in git
  - Large files
- **Suggested fix:**
  ```typescript
  it('rejects ref names containing special characters', async () => {
    await expect(gitOps.gitShow('main; echo hacked', 'file.json')).rejects.toThrow();
  });
  ```

---

### 3.3 Path Containment Tests

#### [MEDIUM] No test verifies CEM path stays within `projectRoot`

- **File:** `tests/config.test.ts`
- **Description:** Config loading is tested (23 cases) but no test covers absolute `cemPath` values. A regression fix in §1.2 has no test guard.
- **Suggested fix:**
  ```typescript
  it('rejects CEM path that escapes projectRoot', () => {
    expect(() => resolvedCemPath('/etc/shadow', projectRoot)).toThrow();
  });
  ```

---

### 3.4 Mock Quality

#### [MEDIUM] CDN tests mock only happy paths and basic error cases

- **File:** `tests/handlers/cdn.test.ts:55–100`
- **Description:** Missing test coverage for:
  - Fetch timeout (abort signal)
  - `mkdirSync` / `writeFileSync` failure
  - Concurrent requests (cache race)
  - URL encoding edge cases

#### [MEDIUM] Health handler tests don't cover corrupted history files

- **File:** `tests/handlers/health.test.ts`
- **Description:** All tests use well-formed fixtures. No test for malformed JSON, missing fields, or non-numeric scores.
- **Suggested fix:** Add `tests/__fixtures__/health-history/my-button/corrupted.json` and test that `getHealthTrend` skips it gracefully.

---

### 3.5 Integration Tests

#### [LOW] End-to-end server tests are limited to single-tool calls

- **Files:** `tests/integration/server.test.ts`, `tests/integration/acceptance.test.ts`
- **Description:** 38 integration tests total but no test for:
  - Watch mode with concurrent CEM changes
  - Multiple tools in rapid succession
  - Memory usage under load

---

## 4. Code Quality

### 4.1 Performance

#### [LOW] `parseCem()` does linear search through all modules per call

- **File:** `src/handlers/cem.ts`
- **Description:** Every `get_component` call iterates all modules and declarations: O(n). For large CEMs (Shoelace: 100+ components), repeated calls are wasteful.
- **Suggested fix:** Build a `Map<tagName, CemDeclaration>` index once on load.

#### [LOW] Discovery scoring is O(query_tokens × components × levenshtein)

- **File:** `src/tools/discovery.ts:388–414`
- **Description:** For each candidate component, scoring calls `levenshtein()` for each query token — O(|query| × |name|) per component. Acceptable for most libraries but could reach 1–2 seconds for very large CEMs.
- **Suggested fix:** Early-exit on exact-match token; memoize levenshtein results per (token, candidate) pair.

---

### 4.2 Sync vs Async Inconsistency

#### [LOW] Mix of synchronous and asynchronous file operations

- **Files:**
  - `src/handlers/suggest.ts:16–17` — `readFileSync()`
  - `src/handlers/framework.ts:64–66` — `existsSync()` + async `readFile()`
  - `src/handlers/bundle.ts:76` — async only
- **Description:** Sync file ops block the Node.js event loop while async calls are in flight from other tools.
- **Suggested fix:** Standardise on async `readFile` / `access` from `node:fs/promises`.

---

### 4.3 Error Message Format

#### [LOW] Error messages lack consistent structure

- **Description:** Messages range from `"Failed to read file..."` to `"Component ... not found in CEM"` with no uniform format. Clients cannot reliably parse error details.
- **Suggested fix:** Adopt a `[VERB] [NOUN]: [DETAIL]` convention (e.g., `"Failed to read CEM file: ENOENT"`).

---

### 4.4 Cache Write Error Handling

#### [MEDIUM] CDN cache write failure is not caught or reported

- **File:** `src/handlers/cdn.ts:85–89`
- **Description:**
  ```typescript
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cem, null, 2), 'utf-8');
  ```
  No try/catch. If the write fails (permissions, disk full), the tool still returns a success message saying "Cached to [path]".
- **Suggested fix:**
  ```typescript
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cem, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[warn] CDN CEM cache write failed: ${String(err)}`);
    // Return success — in-memory use still works; caching is best-effort
  }
  ```

---

## 5. Strengths

The following patterns demonstrate good security hygiene and should be maintained:

- **Zod validation on all tool arguments** — prevents unvalidated inputs from reaching handlers
- **`path.resolve()` + `path.join()`** — used throughout to normalise paths (prevents most traversal attacks)
- **No `eval`, `Function()`, or `exec` with shell expansion** — no dynamic code execution
- **Registry whitelist on CDN fetches** — limits SSRF surface to two known hosts
- **Comprehensive test suite** — 1047 test cases across 48 test files
- **`adversarial.test.ts`** — dedicated file for edge cases (empty CEM, malformed declarations)
- **`MCPError` taxonomy** — `ErrorCategory` enum provides a consistent error classification base
- **Stateless handler design** — most handlers receive CEM as a parameter, avoiding implicit state

---

## 6. Finding Index

| #   | Severity | Category     | File                              | Summary                                               |
| --- | -------- | ------------ | --------------------------------- | ----------------------------------------------------- |
| 1   | HIGH     | Security     | `src/shared/git.ts:22`            | Git ref injection — no character validation           |
| 2   | MEDIUM   | Security     | `src/index.ts:96`                 | CEM path not contained within projectRoot             |
| 3   | MEDIUM   | Security     | `src/shared/validation.ts:31`     | FilePathSchema misses Windows/UNC paths               |
| 4   | MEDIUM   | Security     | `src/handlers/cdn.ts:20`          | Version sanitisation too permissive                   |
| 5   | MEDIUM   | Security     | `src/handlers/cdn.ts:11`          | Package name misses null bytes and Windows chars      |
| 6   | MEDIUM   | Security     | `src/handlers/health.ts:106`      | Tag name allowlist uses negative checks only          |
| 7   | MEDIUM   | Security     | `src/handlers/cdn.ts:42`          | No post-encoding URL assertion before fetch           |
| 8   | MEDIUM   | Security     | `src/handlers/cdn.ts:85`          | Cache write failure not caught                        |
| 9   | LOW      | Security     | `src/index.ts:100`                | Absolute paths leaked in error messages               |
| 10  | LOW      | Security     | `src/shared/git.ts:7`             | No timeout on git commands                            |
| 11  | LOW      | Security     | `src/handlers/cdn.ts:48`          | CDN fetch does not disable redirects                  |
| 12  | MEDIUM   | Architecture | `src/index.ts:46`                 | Global mutable CEM cache                              |
| 13  | MEDIUM   | Architecture | `src/handlers/bundle.ts:32`       | Unbounded in-memory bundle cache                      |
| 14  | MEDIUM   | Architecture | `src/config.ts:39`                | Config properties are mutable                         |
| 15  | MEDIUM   | Architecture | Multiple handlers                 | Inconsistent error types (plain Error vs MCPError)    |
| 16  | LOW      | Architecture | `src/shared/error-handling.ts:23` | handleToolError always assigns UNKNOWN category       |
| 17  | MEDIUM   | Architecture | `src/index.ts:141`                | Loose Record<string, unknown> args type               |
| 18  | LOW      | Architecture | `src/index.ts:207`                | Double type cast in response adapter                  |
| 19  | MEDIUM   | Architecture | `src/handlers/cdn.ts`             | resolve_cdn_cem implicit side effect                  |
| 20  | MEDIUM   | Architecture | `src/handlers/library.ts`         | Silent CDN registration failure                       |
| 21  | MEDIUM   | Architecture | `src/handlers/health.ts`          | Health/diff not multi-library-aware                   |
| 22  | MEDIUM   | Architecture | `src/handlers/library.ts`         | load_library cemPath not contained within projectRoot |
| 23  | MEDIUM   | Tests        | `src/handlers/benchmark.ts`       | No tests for benchmark handler                        |
| 24  | MEDIUM   | Tests        | `src/handlers/story.ts`           | No handler-level tests                                |
| 25  | MEDIUM   | Tests        | `src/handlers/compose.ts`         | No handler-level tests                                |
| 26  | MEDIUM   | Tests        | `tests/shared/git.test.ts`        | Only 3 git tests; no adversarial inputs               |
| 27  | MEDIUM   | Tests        | `tests/config.test.ts`            | No path containment tests                             |
| 28  | MEDIUM   | Tests        | `tests/handlers/cdn.test.ts`      | CDN tests miss timeout/write-failure scenarios        |
| 29  | MEDIUM   | Tests        | `tests/handlers/health.test.ts`   | No corrupted-file fixture tests                       |
| 30  | LOW      | Tests        | Integration tests                 | No concurrent/load/watch-mode tests                   |
| 31  | LOW      | Quality      | `src/handlers/cem.ts`             | Linear CEM search; no index                           |
| 32  | LOW      | Quality      | `src/tools/discovery.ts:388`      | O(n×m×levenshtein) scoring on large CEMs              |
| 33  | LOW      | Quality      | Multiple handlers                 | Sync file ops mixed with async                        |
| 34  | LOW      | Quality      | Multiple handlers                 | Inconsistent error message format                     |

---

## 7. Dependency Audit

Run `pnpm audit` to check for known CVEs in the current dependency tree. No dependencies were flagged in this review, but the following deserve periodic monitoring:

- **`@modelcontextprotocol/sdk`** — actively developed; watch for breaking changes in tool call signatures (relates to finding #18)
- **`@custom-elements/analyzer`** — CEM parsing library; validate that untrusted CEM files cannot trigger ReDoS in the parser
- **`vite` / `rollup`** (used for bundling) — check for supply-chain advisories on major versions

---

_This report covers findings as of the review date. No code changes were made. Each finding includes file:line, severity, description, and a concrete suggested fix._
