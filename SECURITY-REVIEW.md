# Security Review: wc-tools v0.1.0 — 10-Fix Audit

**Review Date:** 2026-03-03
**Methodology:** Antagonistic — every claim treated as guilty until the code proves otherwise
**Files Examined:** `src/shared/git.ts`, `src/shared/validation.ts`, `src/index.ts`, `src/handlers/cdn.ts`, `src/handlers/health.ts`, `src/shared/file-ops.ts`, `src/handlers/suggest.ts`, and corresponding test files

---

## Summary Table

| #   | Finding                        | Claimed                                        | Actual Status                          | Evidence (file:line)                               | Gaps                                                                                  |
| --- | ------------------------------ | ---------------------------------------------- | -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Git ref injection fix          | `GIT_REF_REGEX` + 30s timeout                  | **CONFIRMED** (with gaps)              | `src/shared/git.ts:7,12`                           | `filePath` param completely unvalidated                                               |
| 2   | CEM path containment           | `startsWith(projectRoot + sep)` check          | **CONFIRMED** (with gaps)              | `src/index.ts:100-109`                             | No integration test; symlink TOCTOU; no re-check in watcher                           |
| 3   | FilePathSchema hardening       | Rejects drive letters, UNC, `isAbsolute`       | **CONFIRMED** (with gaps)              | `src/shared/validation.ts:34-50`                   | Null byte injection; URL-encoded traversal; `README..md` false positive               |
| 4   | CDN version sanitization       | Strict semver regex                            | **CONFIRMED**                          | `src/handlers/cdn.ts:19-26`                        | No version string length limit                                                        |
| 5   | CDN package name validation    | `NPM_PACKAGE_NAME_REGEX`                       | **CONFIRMED** (with gaps)              | `src/handlers/cdn.ts:13-18`                        | No max-length limit; scope allows `.` and `_` (not valid per npm spec)                |
| 6   | Health tag name allowlist      | `TAG_NAME_ALLOWLIST_REGEX`                     | **CONFIRMED**                          | `src/handlers/health.ts:110-130`                   | Applied to both `tagName` and `libraryId` — thorough                                  |
| 7   | CDN URL assertion              | `url.startsWith(expectedPrefix)`               | **PARTIAL** (tautological + wrong URL) | `src/handlers/cdn.ts:75-87`                        | Check can never fail; unpkg URL has wrong `/npm/` path segment — **production bug**   |
| 8   | CDN cache write error handling | `try-catch` around `mkdirSync`/`writeFileSync` | **CONFIRMED**                          | `src/handlers/cdn.ts:130-137`                      | Cache dir inherits `projectRoot` trust; no response size limit                        |
| 9   | Error message path stripping   | `relative()` in error messages                 | **PARTIAL**                            | `src/shared/file-ops.ts:14-19`, `src/index.ts:112` | Absolute path leaked in `health.ts:139`; absolute `cachePath` in CDN success response |
| 10  | CDN redirect safety            | `redirect: 'error'` on fetch                   | **CONFIRMED** (with interaction bug)   | `src/handlers/cdn.ts:94`                           | Combined with wrong unpkg URL (Claim 7), all unpkg fetches fail with redirect error   |

---

## Detailed Findings

### Claim 1: Git Ref Injection Fix — CONFIRMED (gaps)

**Evidence:** `src/shared/git.ts:7` — `GIT_REF_REGEX`; `src/shared/git.ts:12` — `timeout: 30_000`

```ts
const GIT_REF_REGEX = /^[a-zA-Z0-9._\-/]+$/;
// ...
const { stdout } = await execFileAsync('git', args, { timeout: 30_000 });
```

The primary shell injection defense is the use of `execFile` (arguments as array, not passed through shell). The regex is defense-in-depth. The `timeout: 30_000` is present. Both claimed controls exist.

**Gaps:**

- **CRITICAL: `filePath` parameter is completely unvalidated.** `gitShow(ref, filePath)` at line 29 validates `ref` but passes `filePath` directly into `git show ${ref}:${filePath}` with zero checks. An attacker controlling `filePath` could read arbitrary git-tracked files (information disclosure). Since `execFile` is used, there is no code execution risk, but the attack surface is half-covered.
- Regex hyphen placement `[...\-/]` — functionally safe with backslash, but non-canonical style for character classes.
- No maximum length check on `ref`.

**Test quality: GOOD** for `ref`; **MISSING** for `filePath` injection. `tests/shared/git.test.ts` tests semicolons, pipes, null bytes, spaces, backticks, and double-dash injection in `ref`. Zero tests for `filePath` traversal.

---

### Claim 2: CEM Path Containment — CONFIRMED (gaps)

**Evidence:** `src/index.ts:100-109`

```ts
const resolvedProjectRoot = resolve(config.projectRoot);
const cemAbsPath = resolve(resolvedProjectRoot, config.cemPath);

if (!cemAbsPath.startsWith(resolvedProjectRoot + sep) && cemAbsPath !== resolvedProjectRoot) {
  process.stderr.write(`Fatal: cemPath resolves outside of projectRoot. Refusing to load.\n`);
  process.exit(1);
}
```

The `+ sep` suffix prevents the `/tmp/foo` vs `/tmp/foobar` prefix collision. The `cemAbsPath !== resolvedProjectRoot` guard handles the edge case of `cemPath` resolving to exactly `projectRoot`. `resolve()` normalizes `..` components correctly. `process.exit(1)` makes the check non-bypassable.

**Gaps:**

- **Symlink traversal:** `resolve()` is string normalization only — does not call `fs.realpathSync`. A symlink inside `projectRoot` pointing outside it passes this check.
- **Startup-only check:** `startCemWatcher` (called at line 70) uses the already-validated `cemAbsPath`, but if the file is later replaced with a symlink, the watcher reads the new target without re-validation (TOCTOU).
- **No integration test** for the `main()` startup path containment check. `tests/shared/path-containment.test.ts` tests `FilePathSchema`, which is a separate layer.

**Test quality: PARTIAL** — schema-level containment tested, but `src/index.ts` startup guard has no direct test.

---

### Claim 3: FilePathSchema Hardening — CONFIRMED (gaps)

**Evidence:** `src/shared/validation.ts:34-50`

```ts
export const FilePathSchema = z
  .string()
  .refine((p) => !p.includes('..'), { message: 'Path traversal (..) is not allowed' })
  .refine((p) => !p.startsWith('/'), { message: 'Absolute paths are not allowed' })
  .refine((p) => !/^[a-zA-Z]:/.test(p), { message: 'Windows drive letter paths are not allowed' })
  .refine((p) => !p.startsWith('\\\\'), { message: 'Network share paths are not allowed' })
  .refine((p) => !isAbsolute(p), { message: 'Absolute paths are not allowed' });
```

All four claimed checks are present. The final `isAbsolute()` is redundant on POSIX but catches Windows absolute paths. Defense-in-depth.

**Gaps:**

- **Null byte injection:** `"\x00"` passes all five checks. OS-level calls treat null as string terminator; this could cause path truncation leading to unexpected file access.
- **URL-encoded traversal:** `%2e%2e/etc/passwd` passes all checks. Depends on whether the framework decodes before schema validation.
- **Over-broad `..` check:** `README..md` contains `..` and would be **incorrectly rejected**. This is a false positive that could block legitimate filenames.

**Test quality: GOOD** overall. Missing: null byte case, URL-encoded traversal, legitimate `..`-containing filenames (false positive case).

---

### Claim 4: CDN Version Sanitization — CONFIRMED

**Evidence:** `src/handlers/cdn.ts:19-26`

```ts
const STRICT_SEMVER_REGEX =
  /^(?:latest|\d+\.\d+\.\d+(?:-[a-zA-Z0-9._-]+)?(?:\+[a-zA-Z0-9._-]+)?)$/;

function sanitizeVersion(version: string): string {
  if (!STRICT_SEMVER_REGEX.test(version)) {
    throw new MCPError(...);
  }
  return version;
}
```

Anchored regex. Rejects `^1.2.3`, `~1.2.3`, `../evil`, `; rm -rf`, spaces, newlines, empty string. Sanitized version is `encodeURIComponent`-encoded in URL and used verbatim in cache filename (safe character set).

**Minor gaps:** No upper bound on major/minor/patch integer values. Build metadata `+` in cache filenames is filesystem-safe on POSIX and Windows.

**Test quality: GOOD.** Tests `../evil`, `; rm -rf`, `^2.15.0`, `2.15.0-beta.1`, `latest`.

---

### Claim 5: CDN Package Name Validation — CONFIRMED (gaps)

**Evidence:** `src/handlers/cdn.ts:13-18`

```ts
const NPM_PACKAGE_NAME_REGEX = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9._-]*$/;
```

Blocks null bytes, newlines, spaces, shell metacharacters, path separators, `..`. Scoped and unscoped packages accepted.

**Gaps:**

- **No maximum length.** npm registry enforces 214 chars. Arbitrarily long names pass validation and create long URLs and filenames.
- **Scope allows `.` and `_`** which are not valid per the npm registry's own rules for scope names (only `[a-z0-9-]` valid in scopes). Looser than the spec — not a security risk, but `@my.org/pkg` would pass validation yet return 404 from the real registry.

**Test quality: GOOD.** Tests null bytes, newlines, spaces, uppercase, `../evil`. Missing: max-length boundary, scope with embedded `.`/`_`.

---

### Claim 6: Health Tag Name Allowlist — CONFIRMED

**Evidence:** `src/handlers/health.ts:110-130`

```ts
const TAG_NAME_ALLOWLIST_REGEX = /^[a-z0-9:_-]+$/i;

function componentHistoryDir(config, tagName, libraryId) {
  if (!TAG_NAME_ALLOWLIST_REGEX.test(tagName)) {
    throw new MCPError(`Invalid tag name...`);
  }
  if (!TAG_NAME_ALLOWLIST_REGEX.test(libraryId)) {
    throw new MCPError(`Invalid libraryId...`);
  }
  return resolve(config.projectRoot, config.healthHistoryDir, libraryId, tagName);
}
```

Regex blocks all path separators, dots, null bytes, spaces, and metacharacters. Applied to **both** `tagName` and `libraryId`. `resolve()` adds string normalization as additional layer. Dots excluded is correct for HTML custom element tag names.

**Test quality: GOOD.** Tests `../evil`, null bytes, `/`, `\`, valid `pkg:my-button`.

---

### Claim 7: CDN URL Assertion — PARTIAL (tautological + production bug)

**Evidence:** `src/handlers/cdn.ts:75-87`

```ts
const protocol = 'https';
const host = registry === 'jsdelivr' ? 'cdn.jsdelivr.net' : 'unpkg.com';
const expectedPrefix = `${protocol}://${host}/npm/`;
const url = `${expectedPrefix}${encodedPkg}@${encodeURIComponent(safeVersion)}/custom-elements.json`;

if (!url.startsWith(expectedPrefix)) {
  throw new MCPError(`Constructed CDN URL does not match expected prefix. Refusing to fetch.`);
}
```

**The assertion can never be false** — `url` is constructed as `${expectedPrefix}...` by template literal. The check would only fire if the template literal system itself were broken. This is safety theater, not functional protection.

**Production bug:** The unpkg URL prefix is `https://unpkg.com/npm/...` but the real unpkg CDN uses `https://unpkg.com/@scope/pkg@ver/file` (no `/npm/` path component). This means **all unpkg registry fetches will fail** — the CDN will return 404 or redirect, and since `redirect: 'error'` is set (Claim 10), redirects throw errors. The test suite at line 219 asserts `unpkg.com/npm/` which matches the code but is wrong relative to the actual CDN.

**Test quality: BROKEN** — tests confirm the wrong URL format. The URL assertion check itself has no meaningful test since it cannot fail.

---

### Claim 8: CDN Cache Write Error Handling — CONFIRMED

**Evidence:** `src/handlers/cdn.ts:130-137`

```ts
try {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cem, null, 2), 'utf-8');
  cacheWritten = true;
} catch (err) {
  process.stderr.write(`[wc-tools] CDN cache write failed (non-fatal): ${String(err)}\n`);
}
```

Both operations in single try block. Non-fatal error logged to stderr. Function returns useful result regardless of cache success. `cacheWritten` flag correctly reflects outcome.

**Minor concerns:** No CDN response body size limit before writing to cache. Cache directory rooted at `config.projectRoot` (operator-trusted).

**Test quality: GOOD.** Tests `mkdirSync` ENOSPC failure and `writeFileSync` failure independently, verifying `componentCount` returned and `cachePath` undefined in both cases.

---

### Claim 9: Error Message Path Stripping — PARTIAL

**Evidence (correct):** `src/shared/file-ops.ts:14-19`, `src/index.ts:112`

```ts
// file-ops.ts
private safePath(filePath: string): string {
  if (this.projectRoot) {
    return relative(this.projectRoot, filePath);
  }
  return filePath;
}
```

`SafeFileOperations` correctly wraps paths with `relative()` before using in error messages. `src/index.ts` uses `relative()` at line 112. These are correct.

**Evidence (gaps):**

- **`src/handlers/health.ts:139`** — `parseHistoryFile` includes the **absolute** `filePath` in `MCPError` message without `relative()`:

  ```ts
  throw new MCPError(`Invalid health history file "${filePath}": ...`);
  ```

  This leaks the server's filesystem layout to MCP callers.

- **`src/handlers/cdn.ts:147-148`** — Success response includes absolute `cachePath`:
  ```ts
  `Resolved ${pkg}@${version} from ${registry}: ${componentCount} component(s). Cached to ${cachePath}.`;
  ```
  Absolute path returned to MCP tool caller on success.

**Test quality: NOT TESTED.** No test asserts that error or success messages are free of absolute paths.

---

### Claim 10: CDN Redirect Safety — CONFIRMED (with interaction bug)

**Evidence:** `src/handlers/cdn.ts:94`

```ts
response = await fetch(url, { signal: controller.signal, redirect: 'error' });
```

`redirect: 'error'` causes `fetch` to throw `TypeError` on any 3xx response. Combined with Claim 8's `try/finally`, the abort controller is properly cleared.

**Interaction bug with Claim 7:** The wrong unpkg URL (`/npm/` prefix) means the real unpkg CDN returns either 404 or a redirect. Since `redirect: 'error'` is set, the redirect case throws a `TypeError`. All unpkg fetches therefore fail in production — either HTTP 404 or a redirect error. This effectively disables the unpkg registry option.

**Test quality: PARTIAL.** Abort case tested. No test simulates a 3xx redirect response to verify `redirect: 'error'` throws.

---

## New Security Concerns Introduced

### NC-1: `filePath` in `gitShow` Is Completely Unvalidated

**File:** `src/shared/git.ts:35`

The `ref` parameter is validated by `GIT_REF_REGEX` but `filePath` is not. `filePath` is passed as part of `${ref}:${filePath}` directly to `git show`. An attacker controlling `filePath` could read any git-tracked file (information disclosure). This is not code execution (execFile used), but it is an incomplete fix — half the attack surface was addressed.

### NC-2: unpkg Registry URL Is Structurally Wrong (Production Bug)

**File:** `src/handlers/cdn.ts:77`

`expectedPrefix = 'https://unpkg.com/npm/'` is not valid. The real unpkg CDN serves packages at `https://unpkg.com/@scope/pkg@ver/file` (no `/npm/` segment). All unpkg registry fetches fail in production. The test suite masks this by asserting the wrong URL format at `tests/handlers/cdn.test.ts:219`.

### NC-3: Absolute Path Disclosure in CDN Success Response

**File:** `src/handlers/cdn.ts:147-148`

The `formatted` success string includes the absolute `cachePath`. Example: `Cached to /home/user/project/.mcp-wc/cdn-cache/shoelace@2.15.0.json`. This is returned to MCP tool callers, revealing server filesystem layout.

### NC-4: Absolute Path Disclosure in Health History Error

**File:** `src/handlers/health.ts:139`

`parseHistoryFile` includes absolute `filePath` in `MCPError` without `relative()` wrapping. Leaks server filesystem path to MCP callers on malformed health history files.

### NC-5: No Response Body Size Limit on CDN Fetch

**File:** `src/handlers/cdn.ts:106`

`response.text()` reads the entire CDN response body without size cap. A CDN returning a multi-gigabyte response would exhaust process memory before schema validation rejects it. No `Content-Length` check or streaming size limit applied.

### NC-6: CEM Watcher TOCTOU (Startup vs. Runtime)

**File:** `src/index.ts:69-93`

Path containment is checked at startup against the resolved `cemAbsPath`. If the CEM file is later replaced with a symlink pointing outside `projectRoot`, the watcher reads the symlink target without re-validation. Low practical risk given operator-controlled config, but worth noting.

---

## Test Coverage Assessment

| Claim                              | Test File                                                      | Coverage                                               | Quality           |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ | ----------------- |
| 1 — Git ref injection              | `tests/shared/git.test.ts`                                     | `ref` parameter thorough; `filePath` zero              | GOOD (incomplete) |
| 2 — CEM path containment           | `tests/shared/path-containment.test.ts`                        | Schema layer only; `main()` startup guard untested     | PARTIAL           |
| 3 — FilePathSchema hardening       | `tests/shared/validation.test.ts` + `path-containment.test.ts` | Good coverage; null byte and URL-encoded missing       | GOOD              |
| 4 — CDN version sanitization       | `tests/handlers/cdn.test.ts`                                   | Traversal, special chars, semver variants              | GOOD              |
| 5 — CDN package name validation    | `tests/handlers/cdn.test.ts`                                   | Injection chars covered; no max-length test            | GOOD              |
| 6 — Health tag name allowlist      | `tests/handlers/health.test.ts`                                | Path separators, null bytes, valid names               | GOOD              |
| 7 — CDN URL assertion              | `tests/handlers/cdn.test.ts`                                   | Tests wrong unpkg URL format; assertion cannot fail    | BROKEN            |
| 8 — CDN cache write error handling | `tests/handlers/cdn.test.ts`                                   | `mkdirSync` and `writeFileSync` failures independently | GOOD              |
| 9 — Error message path stripping   | (none)                                                         | Zero dedicated tests for path stripping behavior       | NOT TESTED        |
| 10 — CDN redirect safety           | `tests/handlers/cdn.test.ts`                                   | Abort case only; no 3xx redirect simulation            | PARTIAL           |

---

## Overall Verdict: PARTIAL PASS

**CONFIRMED and functional (7/10):** Claims 1, 2, 3, 4, 5, 6, 8, 10 are implemented and provide real security value, though all have gaps.

**PARTIAL — tautological or incompletely applied (2/10):**

- Claim 7 (CDN URL assertion) — the assertion can never fail; also masks a production bug (wrong unpkg URL)
- Claim 9 (Error path stripping) — correctly implemented in `SafeFileOperations` and startup code, but missed in `health.ts:139` and CDN success response

**CRITICAL BUG INTRODUCED:** The unpkg registry URL format is wrong (`/npm/` path prefix). Combined with `redirect: 'error'`, all unpkg registry fetches fail in production. The test suite does not catch this because tests assert the wrong URL.

**Recommended actions (priority order):**

1. **Fix unpkg URL** — remove `/npm/` from `expectedPrefix` in `src/handlers/cdn.ts:77`
2. **Validate `filePath` in `gitShow`** — add allowlist regex similar to `GIT_REF_REGEX`
3. **Apply `relative()` in `health.ts:139`** and in CDN success response
4. **Add null byte rejection** to `FilePathSchema`
5. **Add response size limit** before `response.text()` in CDN handler
6. **Fix or remove** the tautological URL prefix assertion
7. **Add tests** for: `filePath` injection in gitShow, 3xx redirect rejection, absolute path stripping in error messages, `main()` startup path containment
