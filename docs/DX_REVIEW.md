# wc-mcp Developer Experience Review

Generated: 2026-03-02

## Summary

This review audits wc-mcp from the perspective of a skeptical first-time user: install from npm, point at a CEM, call every tool. Two HIGH findings were fixed inline: a missing MIT LICENSE file (npm publish would silently ship without one) and a pervasive snake_case parameter naming inconsistency (`tag_name`, `tag_names`, `base_branch`) across health, bundle, and composition tools while all other tools use camelCase (`tagName`, etc.). Both fixes were committed before this document. Four MEDIUM and three LOW issues were filed as board features for follow-up.

---

## npm Publish Readiness

**READY** (after inline fixes)

### Verified

| Check                                                            | Result                       |
| ---------------------------------------------------------------- | ---------------------------- |
| `files` array includes `build/`, `README.md`, `CHANGELOG.md`     | ✅ `package.json:10-14`      |
| `main` points to `build/index.js`                                | ✅ `package.json:9`          |
| `bin` points to `./build/index.js`                               | ✅ `package.json:6-8`        |
| `engines.node >= 20.0.0`                                         | ✅ `package.json:66-68`      |
| `typescript` is optional peerDependency (not devDep runtime use) | ✅ `package.json:45-52`      |
| Version `0.1.0` consistent in `package.json` and `src/index.ts`  | ✅ `src/index.ts:86`         |
| `npm pack --dry-run` — no test fixtures or `.automaker` dirs     | ✅ 159 files, 98.9kB tarball |
| `prepublishOnly` runs build + test before publish                | ✅ `package.json:26`         |

### Blockers Fixed

- **HIGH (fixed)**: `package.json` declared `"license": "MIT"` but no `LICENSE` file existed on disk. npm always auto-includes a LICENSE file from the package root, so the file must exist. Created `LICENSE` with MIT text.

### Remaining Notes

- Source map files (`.js.map`) are included in the tarball, adding ~200KB. Not harmful but avoidable. See board feature `feature-1772441443222-gifv7f5tt`.
- `HUMAN TASK` demo comment remains in `README.md:11-13`. See board feature `feature-1772441443216-acsnww76w`.
- CI badge in `README.md:9` references placeholder `your-org`. See board feature `feature-1772441443219-m7y1jw7cn`.

---

## README Accuracy

**Accurate** (after inline fixes)

All 33 tools present in the codebase are listed in the README tools reference tables. No tools are listed in README that don't exist in code. Environment variable names in README exactly match `src/config.ts`.

### Tool Count Verified

| File                       | Tools  | README Section         |
| -------------------------- | ------ | ---------------------- |
| `src/tools/discovery.ts`   | 7      | Discovery              |
| `src/tools/component.ts`   | 9      | Component              |
| `src/tools/safety.ts`      | 2      | Safety                 |
| `src/tools/health.ts`      | 5      | Health                 |
| `src/tools/cdn.ts`         | 1      | CDN                    |
| `src/tools/story.ts`       | 1      | Story                  |
| `src/tools/tokens.ts`      | 2      | Tokens                 |
| `src/tools/typescript.ts`  | 2      | TypeScript             |
| `src/tools/validate.ts`    | 1      | Component (co-located) |
| `src/tools/composition.ts` | 1      | Composition            |
| `src/tools/framework.ts`   | 1      | Framework              |
| `src/tools/bundle.ts`      | 1      | Bundle                 |
| **Total**                  | **33** | All listed ✅          |

### Parameter Name Issues Fixed

The following tools used snake_case parameters inconsistent with the rest of the API:

| Tool                      | Old Param     | New Param    | File                          |
| ------------------------- | ------------- | ------------ | ----------------------------- |
| `score_component`         | `tag_name`    | `tagName`    | `src/tools/health.ts:22`      |
| `get_health_trend`        | `tag_name`    | `tagName`    | `src/tools/health.ts:28`      |
| `get_health_diff`         | `tag_name`    | `tagName`    | `src/tools/health.ts:33`      |
| `get_health_diff`         | `base_branch` | `baseBranch` | `src/tools/health.ts:34`      |
| `estimate_bundle_size`    | `tag_name`    | `tagName`    | `src/tools/bundle.ts:9`       |
| `get_composition_example` | `tag_names`   | `tagNames`   | `src/tools/composition.ts:10` |

README, tests, and source files all updated. Committed in `fix: add LICENSE file and normalize snake_case params to camelCase`.

---

## Runtime Edge Case Findings

| Severity | Tool                          | Input                         | Behavior                                                        | Expected                                                            |
| -------- | ----------------------------- | ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| LOW      | `get_health_trend`            | No history files exist        | Throws `[UNKNOWN] No health history found for...`               | Should throw `MCPError` with `NOT_FOUND` category for cleaner error |
| LOW      | `score_component`             | No history, no CEM decl       | Throws `[UNKNOWN] No health history for...`                     | `[NOT_FOUND]` category                                              |
| LOW      | `validate_usage`              | Component not in CEM          | Throws `[NOT_FOUND] Component "x" not found in CEM.`            | ✅ Correct — caught by dispatcher                                   |
| OK       | `diff_cem`                    | Non-existent baseBranch       | Git error caught, returns `[UNKNOWN] git show...`               | Acceptable — actionable error                                       |
| OK       | `diff_cem`                    | Identical CEMs                | Returns "no changes" correctly                                  | ✅                                                                  |
| OK       | `find_components_by_token`    | Token not starting with `--`  | Returns `[VALIDATION] CSS custom property must start with "--"` | ✅ Actionable                                                       |
| OK       | `resolve_cdn_cem`             | 404 response                  | Returns `[NETWORK_ERROR] CDN fetch failed: HTTP 404`            | ✅ Actionable                                                       |
| OK       | `resolve_cdn_cem`             | Non-JSON response             | Returns `[VALIDATION] CDN response is not valid JSON`           | ✅ Actionable                                                       |
| OK       | `resolve_cdn_cem`             | Invalid CEM schema            | Returns `[VALIDATION] does not match CEM schema`                | ✅ Actionable                                                       |
| OK       | `generate_story`              | Component with no attrs/slots | Generates minimal `render: () => html\`<tag></tag>\``           | ✅ Graceful                                                         |
| OK       | `list_components`             | Empty CEM (zero modules)      | Returns empty array                                             | ✅                                                                  |
| OK       | `list_components_by_category` | No components match category  | Returns category key with empty array                           | ✅                                                                  |
| OK       | `validate_usage`              | Malformed HTML                | Regex-based parsing is resilient, returns result                | ✅                                                                  |
| OK       | `score_component`             | Zero documentation component  | Returns score=0 via CEM fallback, not an error                  | ✅                                                                  |

---

## API Surface Issues

| Severity     | File:line                     | Description                                                                                                                                                  |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HIGH (fixed) | `src/tools/health.ts:22-35`   | `tag_name`/`base_branch` snake_case params — all other tools use camelCase                                                                                   |
| HIGH (fixed) | `src/tools/bundle.ts:9`       | `tag_name` snake_case param                                                                                                                                  |
| HIGH (fixed) | `src/tools/composition.ts:10` | `tag_names` snake_case param                                                                                                                                 |
| MEDIUM       | `src/tools/health.ts`         | `get_health_diff` and `get_health_trend` still error (not degrade) when history is absent — unlike `score_component` which gracefully falls back to CEM data |
| LOW          | `src/tools/component.ts:74`   | `validate_cem` has no description on what "score 100 = PASS" threshold means                                                                                 |

---

## Error Quality Issues

| Severity | File:line                    | Current message                                                            | Suggested message                                                                                                                                   |
| -------- | ---------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| MEDIUM   | `src/handlers/health.ts:240` | `No health history found for '${tagName}'` (plain Error → [UNKNOWN])       | `MCPError(NOT_FOUND)`: "No health history found for '${tagName}'. Run a health snapshot first or use score_component which falls back to CEM data." |
| MEDIUM   | `src/handlers/health.ts:249` | `No health history files found for '${tagName}'` (plain Error → [UNKNOWN]) | Same fix: use `MCPError(NOT_FOUND)`                                                                                                                 |
| LOW      | `src/config.ts:34`           | `[wc-mcp] Warning: mcpwc.config.json is malformed. Using defaults.`        | Include the parse error: `...is malformed (${err}). Using defaults.`                                                                                |
| LOW      | `src/handlers/health.ts`     | `No health history for '${tagName}' and no CEM data provided for fallback` | More actionable: add "Pass a CEM declaration or ensure the component exists in the loaded CEM."                                                     |

---

## Findings by Severity

| Severity | Count | Status                                         |
| -------- | ----- | ---------------------------------------------- |
| CRITICAL | 0     | —                                              |
| HIGH     | 2     | 2 fixed inline                                 |
| MEDIUM   | 4     | 4 board features created                       |
| LOW      | 7     | 3 board features created (4 minor notes below) |

### Additional LOW notes (no tickets needed)

- `src/config.ts:34`: Malformed config warning doesn't include the actual parse error — low value to most users
- `src/tools/component.ts:74`: `validate_cem` success/fail threshold (100 = PASS) is obvious from the score field
- `src/tools/health.ts`: `analyze_accessibility` already uses camelCase `tagName` — correct and consistent
- All health tools pass `cem` as optional argument but `score_component` reads `cem` in the server — consistent

---

## Go/No-Go

**GO**

All 33 tools are wired, tested, and documented. The two HIGH blockers (missing LICENSE, snake_case API inconsistency) are fixed. The remaining MEDIUM/LOW issues are quality improvements, not publish blockers. `pnpm run build && pnpm test && pnpm run lint && pnpm run format:check` all exit 0. The package is ready for a v0.1.0 npm publish.
