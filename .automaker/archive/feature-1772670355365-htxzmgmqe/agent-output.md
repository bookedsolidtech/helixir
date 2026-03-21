Let me find the relevant files quickly.

🔧 Tool: Grep
Input: {
  "pattern": "estimate_bundle_size|estimateBundleSize|estimate-bundle-size",
  "output_mode": "files_with_matches"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/README.md"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-document-estimatebundlesize-package/packages/core/src/tools/bundle.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-document-estimatebundlesize-package/packages/core/src/handlers/bundle.ts"
}

🔧 Tool: Grep
Input: {
  "pattern": "estimate_bundle_size|estimateBundleSize",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-document-estimatebundlesize-package/README.md",
  "output_mode": "content",
  "-C": 10
}
Now I have a clear picture. I need to:
1. Add documentation in the README for the `estimate_bundle_size` tool explaining the `package` parameter derivation
2. Add JSDoc on the handler

Let me see more context around the README tools table to know where to add the documentation.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-document-estimatebundlesize-package/README.md",
  "offset": 295,
  "limit": 40
}
Now I'll add the documentation. I'll add a note block after the Bundle table explaining the `package` parameter derivation, and enhance the JSDoc on the handler.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-document-estimatebundlesize-package/README.md",
  "old_string": "### Bundle\n\n| Tool                   | Description                                                                                 | Required Args |\n| ---------------------- | ------------------------------------------------------------------------------------------- | ------------- |\n| `estimate_bundle_size` | Estimates minified + gzipped bundle size for a component's npm package via bundlephobia/npm | `tagName`     |\n\n### Benchmark",
  "new_string": "### Bundle\n\n| Tool                   | Description                                                                                 | Required Args |\n| ---------------------- | ------------------------------------------------------------------------------------------- | ------------- |\n| `estimate_bundle_size` | Estimates minified + gzipped bundle size for a component's npm package via bundlephobia/npm | `tagName`     |\n\n**`package` parameter derivation:**\n\nThe `estimate_bundle_size` tool accepts an optional `package` argument — the npm package name to look up (e.g. `\"@shoelace-style/shoelace\"`). When omitted, the tool derives the package name from your `componentPrefix` config value using a built-in prefix-to-package map:\n\n| Prefix     | npm Package                    |\n| ---------- | ------------------------------ |\n| `sl`       | `@shoelace-style/shoelace`     |\n| `fluent-`  | `@fluentui/web-components`     |\n| `mwc-`     | `@material/web`                |\n| `ion-`     | `@ionic/core`                  |\n| `vaadin-`  | `@vaadin/components`           |\n| `lion-`    | `@lion/ui`                     |\n| `pf-`      | `@patternfly/elements`         |\n| `carbon-`  | `@carbon/web-components`       |\n\nIf your prefix is **not** in the list above and you omit `package`, the tool returns a `VALIDATION` error. In that case, pass the `package` argument explicitly.\n\n### Benchmark"
}
Now add JSDoc to the `derivePackageFromPrefix` function and enhance the `estimateBundleSize` JSDoc.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-document-estimatebundlesize-package/packages/core/src/handlers/bundle.ts",
  "old_string": "/**\n * Derives an npm package name from the configured componentPrefix.\n * Returns null when no mapping can be determined.\n * Exported for testing.\n */",
  "new_string": "/**\n * Derives an npm package name from the configured `componentPrefix`.\n *\n * Uses a built-in map of well-known prefixes to npm packages:\n * - `\"sl\"` → `@shoelace-style/shoelace`\n * - `\"fluent-\"` → `@fluentui/web-components`\n * - `\"mwc-\"` → `@material/web`\n * - `\"ion-\"` → `@ionic/core`\n * - `\"vaadin-\"` → `@vaadin/components`\n * - `\"lion-\"` → `@lion/ui`\n * - `\"pf-\"` → `@patternfly/elements`\n * - `\"carbon-\"` → `@carbon/web-components`\n *\n * Returns `null` when the prefix does not match any known mapping.\n * In that case, callers should provide the npm package name explicitly\n * via the `package` parameter.\n *\n * Exported for testing.\n */"
}
Now update the `estimateBundleSize` JSDoc.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-document-estimatebundlesize-package/packages/core/src/handlers/bundle.ts",
  "old_string": "/**\n * Estimates the bundle size for a given web component tag name.\n *\n * @param tagName - The custom element tag name (e.g. \"sl-button\")\n * @param config  - Loaded MCP config (used to derive the npm package name)\n * @param packageOverride - Optional explicit npm package name (skips auto-detection)\n * @param version - Package version to query; defaults to \"latest\"\n */",
  "new_string": "/**\n * Estimates the bundle size for a given web component tag name.\n *\n * **Package name resolution order:**\n * 1. If `packageOverride` is provided, it is used directly.\n * 2. Otherwise, the package is derived from `config.componentPrefix` via\n *    {@link derivePackageFromPrefix} (see that function for the full prefix→package map).\n * 3. If neither resolves a package name, a `VALIDATION` error is thrown.\n *\n * @param tagName - The custom element tag name (e.g. \"sl-button\")\n * @param config  - Loaded MCP config (used to derive the npm package name via `componentPrefix`)\n * @param packageOverride - Optional explicit npm package name (e.g. \"@shoelace-style/shoelace\").\n *                          When provided, skips the prefix-based auto-detection.\n * @param version - Package version to query; defaults to \"latest\"\n */"
}
Now let me run the build and verify.

🔧 Tool: Bash
Input: {
  "command": "npm run build:server 2>&1",
  "timeout": 60000
}

🔧 Tool: Bash
Input: {
  "command": "npm run 2>&1 | head -30"
}

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1",
  "timeout": 60000
}
Build succeeds. Let me run the bundle-related tests.

🔧 Tool: Bash
Input: {
  "command": "npx vitest run tests/handlers/bundle.test.ts 2>&1",
  "timeout": 60000
}
All 73 tests pass. Let me verify the diff.

🔧 Tool: Bash
Input: {
  "command": "git diff --stat"
}
Only the two intended files changed. This is a documentation-only change so Playwright verification is not applicable (no UI behavior to test).

<summary>
## Summary: Document estimate_bundle_size package-name derivation

### Changes Implemented
- Added a documentation block in the README under the Bundle tools section explaining the `package` parameter: what it accepts, how the prefix-to-package derivation works, and the full mapping table
- Enhanced JSDoc on `derivePackageFromPrefix` with the complete prefix→package map and guidance on what happens when no match is found
- Enhanced JSDoc on `estimateBundleSize` documenting the three-step package name resolution order

### Files Modified
- `README.md` — Added prefix→package mapping table and derivation explanation after the Bundle tool table
- `packages/core/src/handlers/bundle.ts` — Enhanced JSDoc on `derivePackageFromPrefix` and `estimateBundleSize`

### Verification Status
- Build: `npm run build` — exit code 0
- Tests: `npx vitest run tests/handlers/bundle.test.ts` — 73/73 tests passed
- Playwright: Not applicable (documentation-only change, no UI behavior)
- `git diff --stat` confirms only 2 intended files changed

### Risks/Blockers Encountered
- None

### Learnings
- The build script is `npm run build` (not `build:server`) in this repo

### Notes for Developer
- The acceptance criteria are met: users can now understand what `package` accepts and how it's derived without reading source code
</summary>