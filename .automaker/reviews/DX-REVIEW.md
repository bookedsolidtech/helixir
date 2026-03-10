# DX-REVIEW.md — Developer Experience Audit

**Project:** helixir
**Audit date:** 2026-03-04
**Reviewer:** Code-only static analysis (no code changes)
**Scope:** First-run experience, config footguns, error message quality, CLI output, framework detection, MCP client configuration snippets.

---

## 1. First-Run Friction Log

Simulated path: fresh developer, component library using Lit, no prior MCP experience.

### Step 1 — `npx helixir` with no config

**What actually happens** (from `src/index.ts`):

The dispatch logic in `src/index.ts` routes to the MCP server when no subcommand is given. The server calls `loadConfig()`, which — finding no `mcpwc.config.json` — auto-discovers CEM paths. If no CEM file is found, `FRIENDLY_CEM_ERROR` is written to stderr as a warning. Then `existsSync(cemAbsPath)` is checked and the server exits with:

```
Fatal: CEM file not found at custom-elements.json. Set MCP_WC_CEM_PATH or add cemPath to mcpwc.config.json
```

**Pain points:**

- Running `npx helixir` with no args **starts the MCP server**, not a help screen. A developer expecting onboarding sees nothing on stdout (MCP servers speak JSON-RPC, not human text). They only see the fatal on stderr.
- `FRIENDLY_CEM_ERROR` fires during `loadConfig()` but then a _second_ message fires when `existsSync` fails. The developer sees two stderr messages for the same root cause — the more helpful one first, the less helpful one after.
- There is no `npx helixir help` short-circuit that prints human-readable usage. (`--help` flag is handled correctly — see CLI section.)

---

### Step 2 — `npx helixir --help`

**What actually happens:**

`src/index.ts` detects the `--help` flag before dispatching and routes to the CLI. The CLI prints `HELP_TEXT` with all subcommands, options, and exit codes. **This works well.**

**Minor issue:** The `serve` subcommand appears in `HELP_TEXT` but is not in the CLI `switch` statement (`src/cli/index.ts`). It works because `src/index.ts` intercepts `serve` before the CLI runs — but this is a maintenance trap. If `serve` is ever accidentally routed through the CLI switch, it hits "Unknown subcommand: serve".

---

### Step 3 — `npx helixir init`

**What happens step-by-step** (from `src/cli/index.ts`, `runInit()`):

| Step                | Output                                                                 | Pain point                                                                          |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Framework detection | `✓ Detected: Lit 3.x (found in package.json)`                          | Good                                                                                |
| CEM found           | `✓ Found CEM: custom-elements.json. Use this? [Y/n]`                   | Good                                                                                |
| Tokens prompt       | `Do you have a design tokens file? (e.g. tokens.json) [path or skip]:` | ⚠️ "skip" is not a valid input; empty Enter skips — but the prompt doesn't say that |
| Config write        | `✓ Written: mcpwc.config.json`                                         | Good                                                                                |
| IDE snippet         | Prints snippet with `cwd: projectRoot`                                 | **Critical bug — see Section 6**                                                    |

**Specific pain points:**

1. **`projectRoot` hardcoded as absolute path in generated config.** The init wizard writes `"projectRoot": "/absolute/path/to/your/project"` into `mcpwc.config.json`. When this file is committed to git, it breaks every other developer on every other machine. The config should omit `projectRoot` (it defaults to `process.cwd()` correctly) or document that it should not be committed.

2. **`componentPrefix` never asked.** Defaulted silently to `""`. For any design system using a prefix (virtually all do), this means the `bundle` command cannot auto-detect the npm package name and will fail:

   ```
   Cannot determine npm package name for tag <sl-button>. Set componentPrefix in mcpwc.config.json or provide the package explicitly.
   ```

   One init question would eliminate this.

3. **CEM path not validated before writing config.** If the developer types a path that doesn't exist, the wizard writes it without warning. The server will fail at startup.

4. **No "next step" guidance.** After printing the IDE snippet, the process exits. There is no "Restart Claude Desktop to pick up changes" or "Run `helixir serve` to test" message.

5. **`init` wizard and runtime use different CEM candidate lists.** `src/cli/index.ts` checks 5 candidates including `custom-elements-manifest.json`. Runtime `packages/core/src/shared/discovery.ts` checks 4 candidates (omits `custom-elements-manifest.json`). A file found during init may not be found at runtime.

---

### Step 4 — No CEM file

- **MCP server:** `Fatal: CEM file not found at {relPath}. Set MCP_WC_CEM_PATH or add cemPath to mcpwc.config.json` — actionable.
- **CLI:** `Error: CEM file not found at {absPath}` — includes full absolute path, good.
- **`FRIENDLY_CEM_ERROR`** (emitted during discovery): lists exact paths tried + per-framework generator commands. Excellent — but only shown during auto-discovery, not appended to the fatal exit.

---

### Step 5 — Multiple CEM files

`packages/core/src/shared/discovery.ts` emits to stderr:

```
[helixir] Warning: Multiple custom-elements.json files found. Using first: custom-elements.json
  Candidates: custom-elements.json, dist/custom-elements.json
  Set cemPath in mcpwc.config.json to suppress this warning.
```

**Good message.** The init wizard, however, does NOT surface this — it silently uses the first candidate without warning.

---

## 2. Config Footgun Inventory

| Key                 | Bad input                                     | What happens                                                                                                          | Severity | Message quality                                                           |
| ------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `cemPath`           | Non-existent file                             | MCP: fatal exit with relative path + config suggestion. CLI: exit 1 with absolute path.                               | Handled  | ✅ Actionable, but doesn't append `FRIENDLY_CEM_ERROR` generator commands |
| `projectRoot`       | Absolute path from another machine            | Silent wrong-resolution. First file operation fails with raw ENOENT from Node.                                        | **High** | ❌ No validation at config load time                                      |
| `projectRoot`       | Relative path                                 | Works only if server starts from the right CWD — which it may not with `npx`.                                         | **High** | ❌ No warning about relative path                                         |
| `componentPrefix`   | Correct prefix but component not in CEM       | `Cannot determine npm package name for tag <{tag}>. Set componentPrefix...`                                           | Handled  | ✅ Names config key, explains fix                                         |
| `watch: true`       | CEM never changes                             | Server watches silently, no feedback that watch mode is active                                                        | Low      | ⚠️ Silent                                                                 |
| `tokensPath`        | Non-existent file                             | `MCPError: Tokens file not found: {filePath}`                                                                         | Handled  | ✅ Shows path                                                             |
| `tokensPath`        | Invalid JSON                                  | `MCPError: Tokens file is not valid JSON: {filePath} — {json error}`                                                  | Handled  | ✅ Shows path + error                                                     |
| `tokensPath`        | Valid JSON, wrong structure (array/primitive) | `MCPError: Tokens file has invalid structure: {filePath} — Token file must be a JSON object`                          | Handled  | ✅ Clear                                                                  |
| `cdnBase`           | Invalid URL (e.g. `not-a-url`)                | No validation. String used verbatim in generated `<script>` tags.                                                     | **High** | ❌ No validation whatsoever                                               |
| `healthHistoryDir`  | Wrong path                                    | `getHealthTrend` throws "No health history found for '{tag}'" — misleading, sounds like no data rather than wrong dir | Medium   | ⚠️ Misleading root cause                                                  |
| `mcpwc.config.json` | Malformed JSON                                | `[helixir] Warning: mcpwc.config.json is malformed. Using defaults.`                                                 | **High** | ❌ Swallows the SyntaxError; no line/column info                          |
| `mcpwc.config.json` | Missing                                       | Silent — defaults used with no warning                                                                                | Medium   | ⚠️ No hint that config is being ignored                                   |

---

## 3. Error Message Quality Scorecard

**Scoring:** Clarity (1–3) + Actionability (1–3) + Context (1–3) = max 9.

| Location                                                              | Message                                                                                                                            | C   | A   | X   | Score   | Notes                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --- | --- | --- | ------- | ------------------------------------------------------------ |
| `src/index.ts` — cemPath outside projectRoot                          | `Fatal: cemPath resolves outside of projectRoot. Refusing to load.`                                                                | 3   | 1   | 1   | 5/9     | No suggestion to fix cemPath                                 |
| `src/index.ts` — CEM not found                                        | `Fatal: CEM file not found at {relPath}. Set MCP_WC_CEM_PATH or add cemPath to mcpwc.config.json`                                  | 3   | 2   | 3   | 8/9     | Good; could append FRIENDLY_CEM_ERROR for generator commands |
| `src/index.ts` — CEM invalid                                          | `Fatal: CEM file at {relPath} is invalid: {ZodError}`                                                                              | 2   | 1   | 2   | 5/9     | Raw Zod output is technical                                  |
| `src/index.ts` — CEM reloading                                        | `CEM not yet loaded — server is still initializing. Please retry.`                                                                 | 3   | 3   | 1   | 7/9     | Good                                                         |
| `src/index.ts` — TypeScript unavailable                               | `TypeScript diagnostics require TypeScript to be installed.\nRun: npm install typescript --save-dev\nThen restart helixir.`       | 3   | 3   | 3   | **9/9** | Best-in-class                                                |
| `src/index.ts` — token tools not enabled                              | `Token tools are not enabled. Set tokensPath in mcpwc.config.json or MCP_WC_TOKENS_PATH.`                                          | 3   | 3   | 2   | 8/9     | Good                                                         |
| `packages/core/src/config.ts` — malformed config                      | `[helixir] Warning: mcpwc.config.json is malformed. Using defaults.`                                                              | 2   | 1   | 1   | **4/9** | Swallows SyntaxError; worst message in codebase              |
| `packages/core/src/shared/discovery.ts` — FRIENDLY_CEM_ERROR          | Multi-line: paths tried + generator commands                                                                                       | 3   | 3   | 3   | **9/9** | Best-in-class                                                |
| `packages/core/src/shared/discovery.ts` — multi-CEM                   | `[helixir] Warning: Multiple CEM files found. Using first: ... Set cemPath to suppress.`                                          | 3   | 3   | 3   | **9/9** |                                                              |
| `packages/core/src/handlers/cem.ts` — component not found             | `Component "{tag}" not found in CEM.`                                                                                              | 3   | 1   | 2   | 6/9     | No "did you mean?" or list suggestion                        |
| `packages/core/src/handlers/bundle.ts` — no package                   | `Cannot determine npm package name for tag <{tag}>. Set componentPrefix in mcpwc.config.json or provide the package explicitly.`   | 3   | 3   | 2   | **8/9** | Excellent actionable message                                 |
| `packages/core/src/handlers/tokens.ts` — tokensPath not set (handler) | `Token tools are disabled: tokensPath is not configured`                                                                           | 3   | 1   | 1   | 5/9     | Doesn't say HOW to configure it                              |
| `packages/core/src/handlers/tokens.ts` — file not found               | `MCPError: Tokens file not found: {filePath}`                                                                                      | 3   | 1   | 3   | 7/9     | Good path context; no config-fix hint                        |
| `packages/core/src/handlers/tokens.ts` — invalid JSON                 | `MCPError: Tokens file is not valid JSON: {filePath} — {json error}`                                                               | 3   | 2   | 3   | 8/9     |                                                              |
| `packages/core/src/handlers/health.ts` — tag name invalid             | `Invalid tag name for health history lookup: "{tag}". Only alphanumeric characters, hyphens, colons, and underscores are allowed.` | 3   | 2   | 3   | 8/9     | Very clear                                                   |
| `packages/core/src/handlers/health.ts` — no history                   | `No health history found for '{tag}'`                                                                                              | 2   | 1   | 2   | 5/9     | Misleading — could be wrong dir, not missing data            |
| `packages/core/src/handlers/cem.ts` — findComponentsByToken prefix    | `CSS custom property name must start with "--": "{token}"` (throws `Error`, not `MCPError`)                                        | 3   | 2   | 2   | 7/9     | Correct but uses wrong error class                           |
| `src/mcp/index.ts` — bundleCache eviction                             | `[helixir] bundleCache evicted "{key}" (cache full at 500 entries)`                                                               | 3   | 1   | 2   | 6/9     | **Internal detail leaking to stderr** — not user-relevant    |

**Summary:**

- Best-in-class (9/9): TypeScript unavailable, FRIENDLY_CEM_ERROR, multi-CEM warning, bundle no-package.
- Worst (4/9): malformed `mcpwc.config.json` warning.
- Average: ~7/9.
- Consistency gap: `findComponentsByToken` throws `new Error()` instead of `new MCPError()` — breaks `handleToolError` categorization (lands as `UNKNOWN` instead of `VALIDATION`).

---

## 4. CLI Output and Logging

### stdout vs stderr

| Source                                                          | Destination | Verdict                                                                 |
| --------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| All MCP tool JSON responses                                     | stdout      | ✅ Correct — MCP protocol                                               |
| Fatal errors (`src/index.ts`)                                   | stderr      | ✅                                                                      |
| Config warnings (`packages/core/src/config.ts`)                 | stderr      | ✅                                                                      |
| `FRIENDLY_CEM_ERROR`, multi-CEM warning                         | stderr      | ✅                                                                      |
| CEM reload messages (`src/mcp/index.ts`)                        | stderr      | ✅                                                                      |
| Init wizard prompts and confirmation lines (`src/cli/index.ts`) | stdout      | ⚠️ Prompts should go to stderr; stdout should be clean for piped output |
| Init wizard MCP snippet                                         | stdout      | ✅ Intended output                                                      |
| bundleCache eviction note                                       | stderr      | ⚠️ Internal detail polluting user-visible channel                       |

### `--help` / help text

`--help` and `-h` flags are correctly intercepted in `src/index.ts` before server dispatch. The HELP_TEXT in `src/cli/index.ts` is comprehensive — all subcommands, options, and exit codes documented. **No issue.**

### `--watch` feedback

`watch: true` starts `fsWatch()` on the CEM file (`src/mcp/index.ts`). No startup confirmation is emitted. A developer enabling watch mode has no indication the watcher is running.

### Unknown subcommand

```
Unknown subcommand: {subcommand}

<full HELP_TEXT>
```

Followed by `process.exit(1)`. Reasonable behavior — shows help on error.

---

## 5. Framework Detection Accuracy Report

### Init wizard — `detectFramework()` in `src/cli/index.ts`

Checks `dependencies + devDependencies + peerDependencies` (all three). **Thorough.**

| Framework    | Package                    | Status |
| ------------ | -------------------------- | ------ |
| Lit 3.x      | `lit`                      | ✅     |
| Stencil      | `@stencil/core`            | ✅     |
| Shoelace     | `@shoelace-style/shoelace` | ✅     |
| FAST Element | `@microsoft/fast-element`  | ✅     |
| Haunted      | `haunted`                  | ✅     |
| Hybrids      | `hybrids`                  | ✅     |
| Catalyst     | `@github/catalyst`         | ✅     |

**Issues:**

- Only checks `lit` (3.x). A project on `lit-element` (2.x) or `@polymer/lit-element` goes undetected.
- **Multiple frameworks:** returns first match silently. A monorepo with both Shoelace (consumer) and Lit (authoring) reports "Shoelace" — no warning.
- **None detected:** prints "No known framework detected" — handled gracefully.

### Suggest handler — `detectFrontendFramework()` in `packages/core/src/handlers/suggest.ts`

Checks only `dependencies + devDependencies` — **does not check `peerDependencies`**. Inconsistent with init wizard. Library authors who consume React/Vue as peer dependencies will not get framework snippets.

| Framework | peerDeps checked? |
| --------- | ----------------- |
| React     | ❌                |
| Vue       | ❌                |
| Svelte    | ❌                |
| Angular   | ❌                |

### Stencil detection heuristic in `suggestUsage()`

Stencil is detected by checking if any module path ends in `.tsx`:

```typescript
const isStencil = resolvedCem.modules.some((mod) => mod.path.endsWith('.tsx'));
```

This is a **false-positive risk** for TypeScript React projects that happen to use `.tsx` file extensions. A proper check would read `package.json` for `@stencil/core`.

---

## 6. MCP Client Configuration Snippet Validation

### Init wizard — generated snippet (`src/cli/index.ts`, `runInit()`)

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "cwd": "<projectRoot>"
    }
  }
}
```

| Check                              | Result                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Valid JSON                         | ✅                                                                                          |
| `npx helixir` launches MCP server | ✅ (via `src/index.ts` dispatch)                                                            |
| `cwd` key works in Claude Desktop  | **❌ Claude Desktop ignores `cwd`** — the server starts from Claude's own working directory |
| `cwd` key works in Claude Code     | ❌ Not a supported MCP config key                                                           |
| Cross-platform `cwd` path          | ⚠️ Hardcodes OS-absolute path — breaks on other machines                                    |
| Correct pattern                    | ❌ Should use `env.MCP_WC_PROJECT_ROOT` as shown in README examples                         |

**This is the most impactful DX bug in the project.** Every user who runs `init` gets a broken config. The MCP server starts from the wrong directory and immediately exits with `Fatal: CEM file not found`.

The README correctly uses `env.MCP_WC_PROJECT_ROOT` in all its examples, creating a direct contradiction with `init`.

### Claude Desktop config path shown in `init` output

The wizard prints: `Add this to your Claude Desktop config (~/.claude/claude_desktop_config.json)`

The correct path on **macOS** is:

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

On **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

`~/.claude/claude_desktop_config.json` does not exist on a default Claude Desktop installation.

### `args` array correctness

All generated snippets use `args: ["helixir"]` with `command: "npx"`. This is correct — `npx helixir` runs the binary.

---

## 7. Top 10 DX Improvements (Prioritized by Impact)

### #1 — Fix `init` snippet: use `env.MCP_WC_PROJECT_ROOT`, not `cwd`

**Impact: Critical — primary first-run path broken for most users.**

File: `src/cli/index.ts`, `runInit()`, the `snippet` object.

Current:

```javascript
const snippet = {
  mcpServers: { 'helixir': { command: 'npx', args: ['helixir'], cwd: projectRoot } },
};
```

Should be:

```javascript
const snippet = {
  mcpServers: {
    'helixir': {
      command: 'npx',
      args: ['helixir'],
      env: { MCP_WC_PROJECT_ROOT: projectRoot },
    },
  },
};
```

---

### #2 — Fix Claude Desktop config path in `init` output

**Impact: High — wrong path shown to every user.**

File: `src/cli/index.ts`, the `process.stdout.write` with path guidance.

Should show the OS-correct path (`~/Library/Application Support/Claude/...` on macOS).

---

### #3 — Include SyntaxError in malformed config warning

**Impact: High — silently swallowed config errors cause hours of debugging.**

File: `packages/core/src/config.ts`, `readConfigFile()` catch block.

Current: `Warning: mcpwc.config.json is malformed. Using defaults.`
Should be: `Warning: mcpwc.config.json is malformed (SyntaxError: Unexpected token '}' at line 7). Using defaults.`

---

### #4 — Don't write absolute `projectRoot` in generated `mcpwc.config.json`

**Impact: High — breaks other developers who clone the repo.**

File: `src/cli/index.ts`, the `configObj` in `runInit()`.

Remove `projectRoot` from the written config entirely (the loader defaults to `process.cwd()`), or write `"."` (relative) and document it.

---

### #5 — Append `FRIENDLY_CEM_ERROR` to fatal CEM-not-found message

**Impact: High — turns a dead-end error into actionable guidance.**

File: `src/mcp/index.ts`, the `!existsSync(cemAbsPath)` branch.

Import `FRIENDLY_CEM_ERROR` from discovery module and append it after the fatal message. Zero new code to write.

---

### #6 — Add `componentPrefix` prompt to init wizard

**Impact: Medium — prevents silent bundle command failures.**

File: `src/cli/index.ts`, `runInit()`.

Add one prompt: `What tag prefix do your components use? (e.g. "my-", "sl-", or press Enter to skip):`.

---

### #7 — Add URL validation for `cdnBase`

**Impact: Medium — silent misconfiguration produces broken HTML snippets.**

File: `packages/core/src/config.ts`, end of `loadConfig()`.

Add: `try { new URL(config.cdnBase!); } catch { process.stderr.write('[helixir] Warning: cdnBase is not a valid URL: ...'); }`

---

### #8 — Emit confirmation when watch mode is active

**Impact: Medium — currently completely silent.**

File: `src/mcp/index.ts`, after `startCemWatcher()` call.

Print to stderr: `[helixir] Watch mode enabled. CEM will reload automatically when {cemAbsPath} changes.`

---

### #9 — Fix `findComponentsByToken` to throw `MCPError` instead of `Error`

**Impact: Medium — breaks error category chain in `handleToolError`.**

File: `packages/core/src/handlers/cem.ts`, `findComponentsByToken()`.

Change `throw new Error(...)` to `throw new MCPError(..., ErrorCategory.VALIDATION)`.

---

### #10 — Remove bundleCache eviction message from stderr

**Impact: Low — internal detail pollutes user-visible channel.**

File: `packages/core/src/handlers/bundle.ts`, `setBundleCacheEntry()`.

Remove or guard behind a `DEBUG` env var check.

---

## Appendix: Files Audited

| File                                         | Purpose                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| `src/index.ts`                               | Binary entry point — dispatch logic                      |
| `src/cli/index.ts`                           | CLI subcommand handler, init wizard, framework detection |
| `src/mcp/index.ts`                           | MCP server, CEM cache, tool routing                      |
| `packages/core/src/config.ts`                | Config loading, env vars, defaults                       |
| `packages/core/src/shared/discovery.ts`      | CEM auto-discovery, `FRIENDLY_CEM_ERROR`                 |
| `packages/core/src/shared/error-handling.ts` | `MCPError`, `handleToolError`                            |
| `packages/core/src/handlers/cem.ts`          | CEM parsing, diffing, aggregation                        |
| `packages/core/src/handlers/bundle.ts`       | Bundle size estimation, cache                            |
| `packages/core/src/handlers/health.ts`       | Health scoring, trend, diff                              |
| `packages/core/src/handlers/suggest.ts`      | Usage snippet generation, framework detection            |
| `packages/core/src/handlers/tokens.ts`       | Design token tools                                       |
