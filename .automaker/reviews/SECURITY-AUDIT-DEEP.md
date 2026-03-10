# Security Audit Report — HELiXiR (Deep Audit)

**Date:** 2026-03-04
**Scope:** All MCP tool input parameters, data flows, handler logic, shared utilities
**Auditor:** Automated deep-review
**Build status:** PASS (`npm run build` exits 0, no source modifications made)

---

## Table of Contents

1. [Trust Boundary Diagram](#1-trust-boundary-diagram)
2. [MCP Tool Input Parameter Map](#2-mcp-tool-input-parameter-map)
3. [Data Flow Traces](#3-data-flow-traces)
4. [Vulnerability Findings](#4-vulnerability-findings)
5. [Vulnerability Category Coverage Matrix](#5-vulnerability-category-coverage-matrix)
6. [Recommended Fixes](#6-recommended-fixes)

---

## 1. Trust Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  UNTRUSTED — MCP Client (LLM / Agent)                                       │
│                                                                             │
│  Sends: tool calls with arbitrary string/number/boolean arguments           │
│  Examples: tagName, html, cemPathA, baseBranch, package, version, filePath  │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │  MCP stdio transport
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SEMI-TRUSTED — MCP Server Process (helixir)                               │
│                                                                             │
│  Entry point: src/index.ts → CallToolRequestSchema handler                  │
│  First validation: Zod schema per-tool (args checked at dispatch boundary)  │
│  Internal state: cemCache (loaded at startup from disk)                     │
│                                                                             │
│  ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌───────────┐  ┌──────────┐ │
│  │ health/  │  │ validate/ │  │ typescript/│  │  cdn/     │  │ compare/ │ │
│  │ cem/     │  │ component │  │ bundle     │  │  bundle   │  │ benchmark│ │
│  │ suggest  │  │ handlers  │  │ handlers   │  │  handlers │  │ handlers │ │
│  └────┬─────┘  └─────┬─────┘  └─────┬──────┘  └─────┬─────┘  └────┬─────┘ │
│       │              │               │                │              │       │
└───────┼──────────────┼───────────────┼────────────────┼──────────────┼───────┘
        │              │               │                │              │
        ▼              ▼               ▼                ▼              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  TRUSTED (Operator-Controlled) — Filesystem & External Services            │
│                                                                            │
│  Filesystem:                                                               │
│    • projectRoot  (MCP_WC_PROJECT_ROOT env var — operator)                 │
│    • cemPath      (MCP_WC_CEM_PATH env var or mcpwc.config.json)           │
│    • healthHistoryDir (MCP_WC_HEALTH_HISTORY_DIR — operator)               │
│    • tsconfigPath (MCP_WC_TSCONFIG_PATH — operator)                       │
│    • tokensPath   (MCP_WC_TOKENS_PATH — operator)                         │
│    • cdnBase      (MCP_WC_CDN_BASE — operator)                            │
│                                                                            │
│  External Services:                                                        │
│    • https://cdn.jsdelivr.net (CDN CEM fetch)                              │
│    • https://unpkg.com        (CDN CEM fetch)                              │
│    • https://bundlephobia.com (bundle size estimation)                     │
│    • https://registry.npmjs.org (bundle size fallback)                     │
│    • git (local process via execFile — validated args only)                │
└────────────────────────────────────────────────────────────────────────────┘

Trust boundary crossing points:
  A. MCP args → Zod schema parse  (primary validation gate)
  B. Zod-parsed value → filesystem path (join/resolve — containment varies)
  C. Zod-parsed value → git execFile (GIT_REF_REGEX + FilePathSchema)
  D. Zod-parsed value → external fetch (URL construction)
  E. JSON from CDN / disk → JSON.parse → Zod schema (CemSchema/HistoryFileSchema)
  F. Operator env var → config object (no containment check on most paths)
```

---

## 2. MCP Tool Input Parameter Map

| Tool                          | Parameter           | Schema                         | Validator                                                     | Consumers                                      |
| ----------------------------- | ------------------- | ------------------------------ | ------------------------------------------------------------- | ---------------------------------------------- |
| `get_component`               | tagName             | `z.string()`                   | CEM lookup (throws if not found)                              | `parseCem()`, `analyzeAccessibility()`         |
| `validate_cem`                | tagName             | `z.string()`                   | CEM lookup                                                    | `validateCompleteness()`                       |
| `suggest_usage`               | tagName             | `z.string()`                   | CEM lookup                                                    | `parseCem()`, `detectFrontendFramework()`      |
| `suggest_usage`               | framework           | `z.enum(...)`                  | Zod enum                                                      | snippet builders                               |
| `generate_import`             | tagName             | `z.string()`                   | CEM lookup                                                    | `parseCem()`, `readFile(package.json)`         |
| `get_component_narrative`     | tagName             | `z.string()`                   | CEM lookup                                                    | narrative builder                              |
| `get_prop_constraints`        | tagName             | `z.string()`                   | CEM lookup                                                    | `parseCem()`                                   |
| `get_prop_constraints`        | attributeName       | `z.string()`                   | CEM lookup                                                    | member search                                  |
| `find_components_by_token`    | tokenName           | `z.string()`                   | prefix check `--`                                             | CEM property search                            |
| `find_components_using_token` | tokenName           | `z.string()`                   | none                                                          | CEM property search                            |
| `get_component_dependencies`  | tagName             | `z.string()`                   | CEM lookup                                                    | dependency resolver                            |
| `score_component`             | tagName             | `z.string()`                   | `TAG_NAME_ALLOWLIST_REGEX` (inside handler)                   | `readdir()` in healthHistoryDir                |
| `score_all_components`        | (none)              | —                              | —                                                             | all CEM declarations                           |
| `get_health_trend`            | tagName             | `z.string()`                   | `TAG_NAME_ALLOWLIST_REGEX` (inside handler)                   | `readdir()` in healthHistoryDir                |
| `get_health_trend`            | days                | `z.number().int().positive()`  | Zod                                                           | array slice                                    |
| `get_health_diff`             | tagName             | `z.string()`                   | `TAG_NAME_ALLOWLIST_REGEX` (inside handler)                   | `readdir()`, `git show` (via config.cemPath)   |
| `get_health_diff`             | baseBranch          | `z.string().optional()`        | `GIT_REF_REGEX` (inside `gitShow`)                            | `git show <baseBranch>:<cemPath>`              |
| `analyze_accessibility`       | tagName             | `z.string().optional()`        | CEM lookup                                                    | `analyzeAccessibility()`                       |
| `get_file_diagnostics`        | filePath            | `FilePathSchema`               | Full: null bytes, `..`, `/`, drive letters, UNC, `isAbsolute` | `resolve(projectRoot, filePath)` → TS compiler |
| `get_project_diagnostics`     | (none)              | —                              | —                                                             | tsconfig + TS compiler                         |
| `validate_usage`              | tagName             | `z.string()`                   | CEM lookup (throws if not found)                              | `new RegExp(<tagName>...)`                     |
| `validate_usage`              | html                | `z.string()`                   | none                                                          | regex parsing (Levenshtein suggest)            |
| `estimate_bundle_size`        | tagName             | `z.string()`                   | none                                                          | display only (not used in URL/FS)              |
| `estimate_bundle_size`        | package             | `z.string().optional()`        | **none**                                                      | `encodeURIComponent()` → bundlephobia/npm URL  |
| `estimate_bundle_size`        | version             | `z.string().optional()`        | **none**                                                      | `encodeURIComponent()` → bundlephobia/npm URL  |
| `resolve_cdn_cem`             | package             | `z.string()`                   | `NPM_PACKAGE_NAME_REGEX`                                      | URL construction → CDN fetch                   |
| `resolve_cdn_cem`             | version             | `z.string()`                   | `STRICT_SEMVER_REGEX`                                         | URL construction, cache file path              |
| `resolve_cdn_cem`             | registry            | `z.enum(['jsdelivr','unpkg'])` | Zod enum                                                      | selects hardcoded host                         |
| `compare_libraries`           | cemPathA/B          | inline `..` + `/` check        | weaker than FilePathSchema                                    | `join(projectRoot, cemPathA)` → `readFile`     |
| `benchmark_libraries`         | libraries[].cemPath | inline `..` + `/` check        | weaker than FilePathSchema                                    | `join(projectRoot, cemPath)` → `readFile`      |
| `generate_migration_guide`    | tagName             | `z.string()`                   | CEM lookup                                                    | `diffCem()` → `git show`                       |
| `generate_migration_guide`    | baseBranch          | `z.string()`                   | `GIT_REF_REGEX`                                               | `git show <baseBranch>:<cemPath>`              |

---

## 3. Data Flow Traces

### 3.1 `tagName` / `componentName` → Filesystem

**Tool:** `score_component`, `get_health_trend`, `get_health_diff`
**Path:**

```
MCP args.tagName
  → ScoreComponentArgsSchema.parse(args)  [z.string() — no regex]
  → scoreComponent(config, tagName, cemDecl)
    → readLatestHistoryFile(config, tagName)
      → componentHistoryDir(config, tagName, 'default')
          ← TAG_NAME_ALLOWLIST_REGEX tested HERE: /^[a-z0-9:_-]+$/i
          → resolve(projectRoot, healthHistoryDir, 'default', tagName)
      → readdir(namespacedDir)
      → [ENOENT fallback] legacyDir = resolve(projectRoot, healthHistoryDir, tagName)
         NOTE: tagName already validated by componentHistoryDir() above — safe
      → readdir(legacyDir)
      → parseHistoryFile(join(dir, files[0]))
        → readFile(filePath)  ← file chosen from readdir listing, not user input
```

**Assessment:** SAFE. tagName is validated by TAG_NAME_ALLOWLIST_REGEX before any path construction. The legacy fallback path reuses the already-validated tagName.

### 3.2 `version` and `packageName` → CDN URL + Cache File Path

**Tool:** `resolve_cdn_cem`
**Path:**

```
MCP args.package   → ResolveCdnCemArgsSchema.parse [z.string()]
MCP args.version   → ResolveCdnCemArgsSchema.parse [z.string().optional().default('latest')]
MCP args.registry  → z.enum(['jsdelivr','unpkg'])

  → resolveCdnCem(pkg, version, registry, config)
    → validatePackageName(pkg)    [NPM_PACKAGE_NAME_REGEX]
    → sanitizePackageName(pkg)    [strips @, replaces / and whitespace with -]
    → sanitizeVersion(version)    [STRICT_SEMVER_REGEX]
    → encodedPkg = encodeURIComponent(pkg).replace('%40','@').replace('%2F','/')
    → url = `https://${host}/${encodedPkg}@${encodeURIComponent(safeVersion)}/custom-elements.json`
    → fetch(url, {redirect: 'error'})  ← redirect:error prevents open-redirect SSRF
    → cachePath = join(projectRoot, '.mcp-wc', 'cdn-cache', `${sanitized}@${safeVersion}.json`)
       NOTE: sanitized = pkg without @ and / replaced with -, safeVersion is semver-validated
    → writeFileSync(cachePath)
```

**Assessment:** SAFE. Both package name and version are validated with strict regexes before use in URL construction or cache file paths. `redirect: 'error'` blocks redirect-based SSRF. Registry is limited to an enum.

### 3.3 `filePath` → TypeScript Diagnostics

**Tool:** `get_file_diagnostics`
**Path:**

```
MCP args.filePath
  → GetFileDiagnosticsArgsSchema.parse(args)  [FilePathSchema]
      ← rejects: null bytes, "..", leading "/", Windows drive "C:", UNC "\\", isAbsolute()
  → getFileDiagnostics(config, filePath)
    → FilePathSchema.parse(filePath)  ← second parse (redundant but harmless)
    → absoluteFilePath = resolve(config.projectRoot, filePath)
    → tsModule.createProgram([absoluteFilePath], compilerOptions)
```

**Assessment:** SAFE. FilePathSchema prevents path traversal and absolute paths. No post-validation containment check (not needed since traversal is blocked at the schema level).

### 3.4 `config.projectRoot` from Environment Variable

**Path:**

```
process.env.MCP_WC_PROJECT_ROOT  (operator-controlled)
  → effectiveRoot = process.env.MCP_WC_PROJECT_ROOT ?? process.cwd()
  → config.projectRoot = effectiveRoot
  → resolvedProjectRoot = resolve(config.projectRoot)
  → cemAbsPath = resolve(resolvedProjectRoot, config.cemPath)
  → CHECK: cemAbsPath.startsWith(resolvedProjectRoot + sep)  ← containment enforced
  → EXIT(1) if cemAbsPath is outside resolvedProjectRoot
```

**For health/tokens/tsconfig paths:**

```
  → resolve(config.projectRoot, config.healthHistoryDir, ...) — NOT checked against projectRoot
  → resolve(config.projectRoot, config.tokensPath)            — NOT checked against projectRoot
  → resolve(config.projectRoot, config.tsconfigPath)          — NOT checked against projectRoot
```

**Assessment:** Partial. The CEM path is correctly constrained to projectRoot. Other operator-configured paths (healthHistoryDir, tokensPath, tsconfigPath) are NOT constrained. This is a LOW/INFO finding because these are operator-controlled (not user-controlled).

---

## 4. Vulnerability Findings

---

### Finding #1 — MEDIUM: `estimate_bundle_size` Package Parameter Missing Validation

**Severity:** MEDIUM
**Category:** Input Validation / Partial SSRF
**File:** `src/tools/bundle.ts`, `src/handlers/bundle.ts`

**Description:**
The `estimate_bundle_size` tool accepts an optional `package` parameter as `z.string().optional()` with no format validation. This value is passed directly as `packageOverride` to `estimateBundleSize()`, then used without calling `validatePackageName()` (which applies `NPM_PACKAGE_NAME_REGEX`). The value is encoded via `encodeURIComponent()` before use in URLs to `bundlephobia.com` and `registry.npmjs.org`, which limits direct injection.

However, the CDN handler (`resolve_cdn_cem`) correctly applies `NPM_PACKAGE_NAME_REGEX` to its `package` parameter. The bundle handler does not, creating an inconsistency.

Additionally, `bundle.ts` does not set `redirect: 'error'` on fetch calls (unlike `cdn.ts`), meaning HTTP redirects from `bundlephobia.com` or `registry.npmjs.org` are followed. Since the destination hosts are hardcoded, this does not enable SSRF to internal services, but could be exploited if the external CDN is compromised (open redirect at CDN side).

**PoC Input:**

```json
{
  "tool": "estimate_bundle_size",
  "args": {
    "tagName": "my-button",
    "package": "UPPERCASE-INVALID@../../../etc",
    "version": "latest"
  }
}
```

With `encodeURIComponent`, this becomes `UPPERCASE-INVALID%40..%2F..%2F..%2Fetc@latest` in the URL path. The hardcoded host prevents SSRF to internal services, but the package name does not match npm naming conventions and could produce confusing error messages.

**PoC for version parameter (also unvalidated):**

```json
{
  "tool": "estimate_bundle_size",
  "args": {
    "tagName": "sl-button",
    "package": "@shoelace-style/shoelace",
    "version": "latest; rm -rf /"
  }
}
```

The version becomes `latest%3B%20rm%20-rf%20%2F` in the URL — encoded safely by `encodeURIComponent`. No shell injection is possible because `fetch()` is used (not exec), but the unvalidated version is also used as a cache key and in the in-memory `BundleSizeResult.version` field.

**Root cause:**

- `src/handlers/bundle.ts` line 189: `const pkg = packageOverride ?? derivePackageFromPrefix(config.componentPrefix);` — no validation of `packageOverride`
- Compare with `src/handlers/cdn.ts` line 70: `validatePackageName(pkg);` — properly validated

---

### Finding #2 — MEDIUM: `validate_usage` HTML Parameter — Unbounded Levenshtein DoS

**Severity:** MEDIUM
**Category:** Denial of Service
**File:** `src/handlers/validate.ts`

**Description:**
The `validate_usage` tool accepts an `html` parameter as `z.string()` with no size limit. The handler parses attributes from this HTML and calls `suggest()` for each unknown attribute. The `suggest()` function computes Levenshtein distance between the user-supplied attribute name and all valid attribute names from the CEM.

The Levenshtein implementation is O(n × m) where n = length of user-supplied attribute name and m = length of each candidate. Both inputs come from the untrusted user (the attribute name from the `html` parameter). With no length bound, a sufficiently long attribute name forces O(n × m) computation per candidate.

**PoC Input:**

```json
{
  "tool": "validate_usage",
  "args": {
    "tagName": "sl-button",
    "html": "<sl-button AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\"x\"></sl-button>"
  }
}
```

**Measured impact:**

```
levenshtein(1000, 1000) ≈ 31ms
levenshtein(5000, 5000) ≈ 747ms
```

With many attributes in the CEM (e.g., 30 candidates) and an input string of 5000 characters, one `validate_usage` call could take ~22 seconds of CPU time. An LLM-driven attacker calling this tool repeatedly could monopolize the MCP server process.

**Secondary issue:** `parseOpeningTagAttributes()` uses `attrPattern.exec(attrStr)` in a `while` loop where `attrStr` is the raw content of the opening tag from the `html` input. No size limit is applied.

---

### Finding #3 — MEDIUM: `compare_libraries` and `benchmark_libraries` — Weaker Path Validation than `FilePathSchema`

**Severity:** MEDIUM
**Category:** Path Traversal (partial)
**Files:** `src/handlers/compare.ts`, `src/handlers/benchmark.ts`

**Description:**
Both handlers implement inline path validation that is weaker than the canonical `FilePathSchema` from `src/shared/validation.ts`. The inline schemas only check:

1. Path does not include `..`
2. Path does not start with `/`

The `FilePathSchema` additionally checks:

- Null bytes (`\0`) in path
- Windows drive letter paths (`C:\`)
- UNC/network share paths (`\\server\share`)
- `isAbsolute()` (catches some edge cases the string checks miss)

On Linux/macOS, the missing null byte check is the most operationally relevant gap. Null bytes in a path can cause unexpected behavior in some Node.js filesystem calls.

**PoC Input for `compare_libraries`:**

```json
{
  "tool": "compare_libraries",
  "args": {
    "cemPathA": "custom-elements.json\x00evil",
    "cemPathB": "custom-elements.json"
  }
}
```

(Where `\x00` is a literal null byte character in the string.) Node.js `fs.readFile` throws `ERR_INVALID_ARG_VALUE` for null bytes in paths on modern versions, so this does not currently lead to a vulnerability — but the defense is provided by the runtime, not the validation schema.

**Additionally:** Neither `compare_libraries` nor `benchmark_libraries` performs a post-resolution containment check to ensure the resolved absolute path lies within `config.projectRoot`. Paths like `valid-subdir/../../other-project/cem.json` pass the `..` check only if they don't contain literal `..` at the string level, but that check IS present.

However, a null-byte terminated path like `custom-elements.json\0` would pass both `!p.includes('..')` and `!p.startsWith('/')` checks.

---

### Finding #4 — LOW: `validate_usage` — `tagName` Used Directly in `new RegExp()` Construction

**Severity:** LOW
**Category:** ReDoS / Regex Injection
**File:** `src/handlers/validate.ts`

**Description:**
The `validateUsage()` function constructs a regex using the `tagName` parameter:

```typescript
// Line 26
const tagPattern = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'i');
```

The `tagName` comes from user input (`validate_usage` → `ValidateUsageArgsSchema.parse(args)` → `z.string()`). If `tagName` contains regex metacharacters (e.g., `(`, `[`, `*`, `+`), the constructed regex could fail or behave unexpectedly.

**However**, there is a partial mitigation: `findDeclaration(cem, tagName)` is called on line 126 BEFORE `parseOpeningTagAttributes()` on line 172. If the `tagName` does not exist in the CEM, an `MCPError` is thrown and the RegExp construction is never reached.

The CEM validates `tagName` as `z.string().optional()` — no format constraint. A malicious CEM file (from CDN) could theoretically contain a tag name like `my.(evil)+button` that would pass Zod validation but cause regex injection when `validateUsage` is subsequently called.

**PoC requiring a malicious CEM:**

```json
{
  "tagName": "a(b+)+c",
  "kind": "class",
  "name": "EvilComponent"
}
```

If a CEM declaration contains `tagName: "a(b+)+c"` (which passes `z.string().optional()`), then:

```typescript
new RegExp(`<a(b+)+c(\\s[^>]*)?>`, 'i');
```

This creates a ReDoS-vulnerable pattern `(b+)+` that takes exponential time to match on a long non-matching string.

**Severity rationale:** LOW rather than MEDIUM because exploiting this requires (a) control over the CEM content AND (b) a subsequent `validate_usage` call. The CEM is nominally operator-controlled, but the `resolve_cdn_cem` tool allows fetching CEMs from external CDNs.

---

### Finding #5 — LOW: GIT_REF_REGEX Allows `--`-Prefixed Strings

**Severity:** LOW
**Category:** Command Injection (flag injection)
**File:** `src/shared/git.ts`

**Description:**

```typescript
const GIT_REF_REGEX = /^[a-zA-Z0-9._\-/]+$/;
```

This regex allows strings like `--no-pager` and `--output=FILE` because `--` consists only of characters in the character class `[a-zA-Z0-9._\-/]`. The intent documented in the comment is "prevent flag injection (e.g., refs starting with '--')" but the regex does not achieve this for values starting with two hyphens.

**However**, there is a structural mitigation: the validated `ref` is used as part of the compound argument `${ref}:${filePath}`, not as a standalone argument. For example, if `ref = "--no-pager"`, the git command receives `['show', '--no-pager:path/to/file']` — the colon makes this a treeish reference, not a flag. Git flags do not contain colons, so `git show` treats `--no-pager:file` as a bad object reference and fails gracefully.

**PoC (demonstrating passing but non-exploitable):**

```json
{
  "tool": "get_health_diff",
  "args": {
    "tagName": "my-button",
    "baseBranch": "--no-pager"
  }
}
```

Result: `git show` receives `['show', '--no-pager:custom-elements.json']` — git rejects this as invalid reference, `gitShow` throws `MCPError`, error is returned to caller. No execution.

**Severity rationale:** LOW because the compound `ref:path` argument structure prevents practical exploitation, even though the regex intent is not fully achieved.

---

### Finding #6 — LOW: Operator Config (`healthHistoryDir`, `tokensPath`) Not Constrained to `projectRoot`

**Severity:** LOW
**Category:** Path Traversal (operator trust boundary)
**Files:** `src/config.ts`, `src/handlers/health.ts`, `src/handlers/tokens.ts`

**Description:**
`src/index.ts` enforces that `cemAbsPath` lies within `resolvedProjectRoot + sep` (lines 103–109). However, the following operator-configured paths are not similarly constrained:

- `config.healthHistoryDir` (via `MCP_WC_HEALTH_HISTORY_DIR`)
- `config.tokensPath` (via `MCP_WC_TOKENS_PATH`)
- `config.tsconfigPath` (via `MCP_WC_TSCONFIG_PATH`)

**Proof:**

```
MCP_WC_HEALTH_HISTORY_DIR="../../tmp/evil" MCP_WC_PROJECT_ROOT="/home/user/project"
→ resolve('/home/user/project', '../../tmp/evil', 'default', 'my-button')
= '/home/tmp/evil/default/my-button'  ← outside projectRoot
```

```
MCP_WC_TOKENS_PATH="../../etc/passwd"
→ resolve('/home/user/project', '../../etc/passwd')
= '/home/etc/passwd'  ← reads outside projectRoot
```

**Severity rationale:** LOW because these variables are operator-set (not MCP client-controlled). In a compromised or misconfigured deployment, a malicious operator could read arbitrary files. Since this requires operator-level access (setting environment variables), the threat model is limited.

---

### Finding #7 — LOW: `mcpwc.config.json` Loaded via `Object.assign` — Unexpected Property Override

**Severity:** LOW
**Category:** Config Injection (operator trust boundary)
**File:** `src/config.ts`

**Description:**
Config file values are merged via:

```typescript
const fileConfig = readConfigFile(effectiveRoot);
Object.assign(config, fileConfig);
```

`fileConfig` is typed as `Partial<McpWcConfig>` but is actually `JSON.parse(raw) as Partial<McpWcConfig>` — the type cast does not enforce shape at runtime. A malicious `mcpwc.config.json` could contain any key, including `__proto__`.

**Prototype pollution test result:**

```javascript
const evil = JSON.parse('{"__proto__":{"isAdmin":true},"cemPath":"evil.json"}');
const config = {};
Object.assign(config, evil);
// {}['isAdmin'] === undefined (V8 does NOT pollute Object.prototype)
// BUT Object.getPrototypeOf(config) !== Object.prototype (prototype chain changed!)
```

Modern V8 (Node.js 20+) treats `__proto__` as an accessor and does not propagate prototype pollution via `Object.assign`. However, setting `config.__proto__` to a crafted object changes the prototype chain of the `config` object itself, which could affect `instanceof` checks or `hasOwnProperty` calls.

**Severity rationale:** LOW because (a) this requires control over `mcpwc.config.json` (operator-level), (b) V8 mitigates the worst-case prototype pollution, and (c) the codebase does not appear to use `instanceof McpWcConfig` or prototype-dependent checks on config.

---

### Finding #8 — INFO: CEM `tagName` Field Has No Format Constraint in Zod Schema

**Severity:** INFO
**Category:** Defense in depth gap
**File:** `src/handlers/cem.ts`

**Description:**
The `CemDeclarationSchema` defines `tagName` as `z.string().optional()` with no regex constraint:

```typescript
const CemDeclarationSchema = z.object({
  // ...
  tagName: z.string().optional(),
  // ...
});
```

This means CEM files (from disk or CDN) can contain tag names with regex metacharacters, spaces, or other special values. These propagate through the system until they hit secondary validators:

- `TAG_NAME_ALLOWLIST_REGEX` in health handler (would reject)
- `new RegExp(<tagName>...)` in validate.ts (could be dangerous — see Finding #4)

The custom element HTML specification requires tag names to match `[a-z][a-z0-9]*(-[a-z0-9]+)+`. Enforcing this constraint in `CemDeclarationSchema` would prevent the vector described in Finding #4.

---

### Finding #9 — INFO: `resolve_cdn_cem` Writes Cache Files to Disk Without Containment Check

**Severity:** INFO
**Category:** Defense in depth
**File:** `src/handlers/cdn.ts`

**Description:**
The cache path is constructed as:

```typescript
const cacheDir = join(config.projectRoot, '.mcp-wc', 'cdn-cache');
const cachePath = join(cacheDir, `${sanitized}@${safeVersion}.json`);
```

`sanitized` = `pkg.replace(/^@/, '').replace(/\//g, '-').replace(/\s+/g, '-')`
`safeVersion` = validated by `STRICT_SEMVER_REGEX`

Both `sanitized` and `safeVersion` are derived from values that pass `NPM_PACKAGE_NAME_REGEX` and `STRICT_SEMVER_REGEX` respectively, which exclude path separators and most special characters. The risk is theoretically low. However, `sanitized` is not verified to not start with `..` — since `NPM_PACKAGE_NAME_REGEX` requires starting with `[a-z0-9]`, this is safe in practice.

---

### Finding #10 — INFO: No Request Rate Limiting or Concurrency Control on External Fetches

**Severity:** INFO
**Category:** DoS / resource exhaustion
**Files:** `src/handlers/cdn.ts`, `src/handlers/bundle.ts`

**Description:**
Both CDN and bundle size fetch operations have 10-second timeouts but no rate limiting or concurrency control. A client calling `resolve_cdn_cem` or `estimate_bundle_size` in rapid succession could exhaust file descriptors or hit external service rate limits. The CDN handler has a 10 MB response size limit; the bundle handler has no size limit on responses from `bundlephobia.com` or `registry.npmjs.org`.

The bundle handler's `response.json()` call (lines 124, 157 in bundle.ts) reads the full response body without a size limit check, unlike the CDN handler which streams with a byte counter.

---

### Finding #11 — INFO: `validate_usage` `html` Parameter Has No Size Limit

**Severity:** INFO (compound with Finding #2 = MEDIUM)
**Category:** DoS
**File:** `src/tools/validate.ts`

**Description:**
The `html` parameter in `validate_usage` is `z.string()` with no `max()` constraint. This compounds with the Levenshtein DoS finding (#2). Large HTML inputs also increase the time spent in `parseOpeningTagAttributes()` and `parseUsedSlots()` which use regex loops over the full input.

---

### Finding #12 — INFO: CEM Cache Race Condition (acknowledged in source)

**Severity:** INFO
**Category:** Concurrency / data integrity
**File:** `src/index.ts`

**Description:**
The code comment on lines 49–52 explicitly acknowledges this:

```typescript
// CONCURRENCY NOTE (Finding #12): cemCache and cemLoadedAt are global mutable state.
// A request arriving during the debounced reload window may read a partially-stale cache.
```

The `cemReloading` sentinel prevents reads during active reloads, but there is no mutex preventing a race between the debounce timer firing and an in-flight request. In watch mode (`--watch` flag), this could lead to stale CEM data being served for a brief window.

---

### Finding #13 — INFO: `bundle.ts` External Fetch Does Not Set `redirect: 'error'`

**Severity:** INFO
**Category:** Defense in depth
**File:** `src/handlers/bundle.ts`

**Description:**
The CDN handler correctly sets `redirect: 'error'`:

```typescript
response = await fetch(url, { signal: controller.signal, redirect: 'error' });
```

The bundle handler omits this:

```typescript
response = await fetch(url, { signal: controller.signal }); // redirects followed
```

Since the destination hosts (`bundlephobia.com`, `registry.npmjs.org`) are hardcoded strings, SSRF to internal services via redirect is not possible. However, if either external service were compromised and served open redirects, the bundle handler would follow them. Setting `redirect: 'error'` uniformly would be a consistent hardening measure.

---

### Finding #14 — INFO: Error Messages May Leak Internal File Paths

**Severity:** INFO
**Category:** Information disclosure
**Files:** `src/shared/file-ops.ts`, `src/handlers/health.ts`

**Description:**
`SafeFileOperations.readJSON()` uses `displayPath = this.safePath(filePath)` which is relative to `projectRoot` when `projectRoot` is set. However, some callers instantiate `SafeFileOperations()` without a `projectRoot` argument:

```typescript
// compare.ts line 132 and benchmark.ts line 218
const fileOps = new SafeFileOperations(); // no projectRoot
```

In this case, `safePath()` returns the raw absolute path in error messages. The MCP client (LLM) receives error messages like:

```
Failed to read file "/Users/alice/project/libs/other-lib/custom-elements.json": ENOENT
```

This reveals the absolute filesystem path. While this is only visible to the LLM session (not a public endpoint), it constitutes information disclosure that could aid lateral movement in a compromised session.

---

## 5. Vulnerability Category Coverage Matrix

| Category                                           | Status                                                   | Relevant Finding(s) |
| -------------------------------------------------- | -------------------------------------------------------- | ------------------- |
| Command injection (`exec`/`spawn`)                 | CLEAR — `execFile` with array args, no shell             | —                   |
| Path traversal (`..` in user input)                | PARTIAL — inline checks weaker than FilePathSchema       | #3                  |
| SSRF (server-side request forgery)                 | LOW RISK — hosts hardcoded; `redirect:error` in CDN only | #1, #13             |
| Regex injection / ReDoS                            | LOW RISK — secondary mitigation via CEM lookup           | #2, #4              |
| Prototype pollution                                | MITIGATED — V8 handles `__proto__` in Object.assign      | #7                  |
| Code execution (`eval`, `new Function`, `vm.run*`) | CLEAR — none found                                       | —                   |
| Input validation inconsistency                     | FOUND — bundle pkg/version vs cdn pkg/version            | #1                  |
| Denial of service                                  | FOUND — unbounded Levenshtein + html size                | #2, #11             |
| Information disclosure                             | LOW — absolute paths in errors                           | #14                 |
| CEM JSON parsing / code execution                  | CLEAR — JSON.parse + Zod schema, no eval                 | —                   |
| Health history JSON prototype pollution            | MITIGATED — Zod HistoryFileSchema validates structure    | —                   |
| CDN response integrity                             | GOOD — CemSchema validates after fetch                   | —                   |
| Git command injection                              | MITIGATED — execFile array args + GIT_REF_REGEX          | #5                  |
| Operator config path escaping                      | FOUND — healthHistoryDir/tokensPath not bounded          | #6                  |
| CEM tagName format constraint                      | GAP — z.string().optional() with no regex                | #8                  |

---

## 6. Recommended Fixes

### Fix for Finding #1 (MEDIUM) — Validate `package` and `version` in bundle handler

In `src/tools/bundle.ts` and `src/handlers/bundle.ts`, apply the same `NPM_PACKAGE_NAME_REGEX` and `STRICT_SEMVER_REGEX` validation used in `cdn.ts`:

```typescript
// In src/tools/bundle.ts, update EstimateBundleSizeArgsSchema:
const EstimateBundleSizeArgsSchema = z.object({
  tagName: z.string(),
  package: z
    .string()
    .regex(/^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9._-]*$/, 'package must be a valid npm package name')
    .optional(),
  version: z
    .string()
    .regex(
      /^(?:latest|\d+\.\d+\.\d+(?:-[a-zA-Z0-9._-]+)?(?:\+[a-zA-Z0-9._-]+)?)$/,
      'version must be "latest" or a valid semver',
    )
    .optional()
    .default('latest'),
  include_full_package: z.boolean().optional().default(true),
});
```

Also add `redirect: 'error'` to both fetch calls in `src/handlers/bundle.ts`.

### Fix for Finding #2 (MEDIUM) — Bound `html` parameter size and Levenshtein input length

```typescript
// In src/tools/validate.ts:
const ValidateUsageArgsSchema = z.object({
  tagName: z.string(),
  html: z.string().max(50_000, 'html must not exceed 50,000 characters'),
});

// In src/handlers/validate.ts, bound the suggest() call:
function suggest(name: string, candidates: string[]): string | null {
  const LEVENSHTEIN_MAX = 200; // skip suggestion for very long attribute names
  if (name.length > LEVENSHTEIN_MAX) return null;
  // ... rest of function
}
```

### Fix for Finding #3 (MEDIUM) — Replace inline path validation with `FilePathSchema`

In `src/handlers/compare.ts` and `src/handlers/benchmark.ts`, replace the inline Zod refinements:

```typescript
// Before (compare.ts):
cemPathA: z
  .string()
  .refine((p) => !p.includes('..'), { message: 'Path traversal (..) is not allowed' })
  .refine((p) => !p.startsWith('/'), { message: 'Absolute paths are not allowed' }),

// After:
import { FilePathSchema } from '../shared/validation.js';
cemPathA: FilePathSchema,
cemPathB: FilePathSchema,
```

Additionally, add a post-resolution containment check:

```typescript
// After resolving absPathA and absPathB:
const sep = require('path').sep;
if (!absPathA.startsWith(config.projectRoot + sep) && absPathA !== config.projectRoot) {
  throw new MCPError('cemPathA resolves outside projectRoot', ErrorCategory.VALIDATION);
}
```

### Fix for Finding #4 (LOW) — Add format constraint to `CemDeclarationSchema.tagName`

```typescript
// In src/handlers/cem.ts:
const CemDeclarationSchema = z.object({
  // ...
  tagName: z
    .string()
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/, 'tagName must be a valid custom element name')
    .optional(),
  // ...
});
```

This fixes the root cause of Finding #4 and provides defense-in-depth for validate.ts.

### Fix for Finding #5 (LOW) — Fix GIT_REF_REGEX to exclude leading `--`

```typescript
// In src/shared/git.ts:
// Before:
const GIT_REF_REGEX = /^[a-zA-Z0-9._\-/]+$/;

// After: explicitly exclude leading hyphens
const GIT_REF_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\-/]*$/;
```

This prevents `--option` style strings while still allowing branch names with embedded hyphens.

### Fix for Finding #6 (LOW) — Add containment checks for operator paths

```typescript
// In src/index.ts, after resolving all config paths:
function assertInsideProjectRoot(absPath: string, name: string, projectRoot: string): void {
  if (!absPath.startsWith(projectRoot + sep) && absPath !== projectRoot) {
    process.stderr.write(
      `Fatal: ${name} resolves outside of projectRoot (${absPath}). Refusing to start.\n`,
    );
    process.exit(1);
  }
}

// Apply to:
assertInsideProjectRoot(
  resolve(resolvedProjectRoot, config.healthHistoryDir),
  'healthHistoryDir',
  resolvedProjectRoot,
);
if (config.tokensPath) {
  assertInsideProjectRoot(
    resolve(resolvedProjectRoot, config.tokensPath),
    'tokensPath',
    resolvedProjectRoot,
  );
}
```

### Fix for Finding #8 (INFO) — Tag name format in CemSchema

As described in Fix #4 above — adding the regex to `CemDeclarationSchema.tagName` closes the gap.

### Fix for Finding #10 (INFO) — Add response size limit to bundle handler

```typescript
// In src/handlers/bundle.ts, after receiving response:
const MAX_BUNDLE_RESPONSE_BYTES = 1 * 1024 * 1024; // 1 MB
const text = await response.text();
if (text.length > MAX_BUNDLE_RESPONSE_BYTES) {
  return null; // treat as unavailable
}
const data = JSON.parse(text);
```

### Fix for Finding #14 (INFO) — Pass `projectRoot` to `SafeFileOperations` in compare/benchmark

```typescript
// In src/handlers/compare.ts line 132:
const fileOps = new SafeFileOperations(config.projectRoot);

// In src/handlers/benchmark.ts line 218:
const fileOps = new SafeFileOperations(config.projectRoot);
```

---

## Appendix: Attack Vectors Checked and Cleared

### No `eval`, `new Function`, or `vm.runIn*` Usage

Searched all TypeScript source files:

```
grep -r "eval\|new Function\|vm\.run" src/
```

Result: Zero occurrences. No dynamic code execution patterns found.

### JSON Parsing — No Code Execution Risk

All `JSON.parse()` calls in the codebase are immediately followed by Zod schema validation (`CemSchema.parse()`, `HistoryFileSchema.safeParse()`, `TokenFileSchema.safeParse()`, etc.). JSON parsing alone cannot execute code in JavaScript.

### Prototype Pollution via JSON

Testing confirmed that V8 (Node.js 20+) does not propagate `__proto__` keys from `JSON.parse()` through `Object.assign()` to `Object.prototype`. The vector was tested and found non-exploitable in the current runtime.

### CEM Content — No Code Execution During Parsing

CEM files are parsed with `JSON.parse` followed by Zod schema validation. The Zod schemas use `z.string()`, `z.number()`, `z.boolean()`, `z.array()`, and `z.record()` — no `z.transform()` with user-supplied functions, no template literal evaluation, and no `eval`-like constructs. A malicious CEM file can cause Zod validation to fail (raising a `ZodError` caught by `handleToolError`) but cannot execute code.

### Git Command Injection

The `git` helper function uses `execFile` (not `exec`) with an argument array:

```typescript
const { stdout } = await execFileAsync('git', args, { timeout: 30_000 });
```

`execFile` with an array does not invoke a shell, making shell injection (`;`, `&&`, `|`, etc.) impossible regardless of what the arguments contain. Git flag injection via `--option` is additionally blocked by the compound `ref:path` argument structure.

### CDN SSRF Beyond Registry Enum

The CDN handler limits the target host via `registry: z.enum(['jsdelivr', 'unpkg'])` which maps to `cdn.jsdelivr.net` or `unpkg.com` — hardcoded strings. The `redirect: 'error'` option prevents redirect-based SSRF. No SSRF to internal services is possible via this handler.

---

_End of Security Audit Report_
