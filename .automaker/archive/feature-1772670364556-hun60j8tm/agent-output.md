Let me check the relevant config files to understand the current setup.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package/package.json"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package/tsconfig.json"
}

🔧 Tool: Glob
Input: {
  "pattern": ".npmignore",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package"
}
The `files` array already has `"!build/**/*.map"` at line 29. Let me verify if it's actually working.

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1 | tail -5",
  "description": "Build the project"
}

🔧 Tool: Bash
Input: {
  "command": "npm pack --dry-run 2>&1",
  "description": "Check what files would be in the npm package"
}
The `!build/**/*.map` exclusion is already present at line 29 of `package.json`, and the `npm pack --dry-run` output confirms no `.map` files are included. Let me check if this was already on main or is a new change.

🔧 Tool: Bash
Input: {
  "command": "git log main..HEAD --oneline 2>&1",
  "description": "Check commits on this branch vs main"
}

🔧 Tool: Bash
Input: {
  "command": "git diff main -- package.json 2>&1",
  "description": "Check if package.json differs from main"
}
The `!build/**/*.map` is already in `package.json` on main — it's not a new change. The exclusion is already working. But the feature asks to strip source maps. Let me check if there's still value in disabling source map generation entirely for cleaner builds, or if the current approach is sufficient.

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package/build -name \"*.map\" | head -5 && echo \"---\" && find /Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package/build -name \"*.map\" | wc -l",
  "description": "Count .map files in build directory"
}

🔧 Tool: Bash
Input: {
  "command": "du -sh /Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package/build/**/*.map 2>/dev/null | tail -1 && find /Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package/build -name \"*.map\" -exec du -ch {} + 2>/dev/null | tail -1",
  "description": "Total size of .map files"
}
Source maps are 324KB in the build directory but already excluded from the npm tarball via `!build/**/*.map`. The feature description mentions ~200KB of unnecessary size — but the exclusion is already in place.

The remaining improvement is to stop generating source maps entirely (since they're excluded from the package anyway and only add noise to the build directory). The feature description suggests checking if `tsconfig.json` can be updated to not emit source maps. However, it also says to verify this doesn't break the dev workflow — `tsc --watch` during dev benefits from source maps for debugging.

The cleanest approach: keep `sourceMap: true` in tsconfig for dev, but create a `tsconfig.build.json` that extends it with `sourceMap: false`, and update the build script to use it. Actually, the simplest approach per the feature description is just to set `sourceMap: false` in tsconfig since the maps are already excluded from npm anyway and this is a CLI/MCP tool where source maps aren't critical for debugging.

Let me go with the simplest approach — disable source map generation in `tsconfig.json` since they're never shipped.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package/tsconfig.json",
  "old_string": "    \"sourceMap\": true,",
  "new_string": "    \"sourceMap\": false,"
}
Now verify: build, tests, and npm pack.

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1",
  "description": "Build the project"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package/build -name \"*.map\" | wc -l",
  "description": "Verify no .map files generated"
}

🔧 Tool: Bash
Input: {
  "command": "npm pack --dry-run 2>&1 | grep -i \"\\.map\" ; echo \"Exit: $?\"",
  "description": "Verify no .map files in package"
}
Old `.map` files are still in the build directory from the previous build. Let me clean and rebuild.

🔧 Tool: Bash
Input: {
  "command": "rm -rf /Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package/build && npm run build 2>&1",
  "description": "Clean build directory and rebuild"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-chore-strip-source-maps-from-npm-package/build -name \"*.map\" | wc -l",
  "description": "Verify no .map files after clean build"
}

🔧 Tool: Bash
Input: {
  "command": "npm pack --dry-run 2>&1 | tail -10",
  "description": "Check package size and contents"
}
Zero `.map` files in the build. No `.map` files in the npm package. Now run tests.

🔧 Tool: Bash
Input: {
  "command": "npm test 2>&1",
  "description": "Run tests",
  "timeout": 120000
}
All 1318 tests pass. Now verify the diff.

🔧 Tool: Bash
Input: {
  "command": "git diff --stat",
  "description": "Show changed files"
}
Only `tsconfig.json` was changed. The Playwright verification requirement doesn't apply here since this is a build configuration change, not a UI feature. The acceptance criteria are met:

1. `npm pack --dry-run` shows no `.js.map` files
2. No source maps are generated in the build (0 `.map` files)
3. Build succeeds (exit code 0) and all 1318 tests pass

<summary>
## Summary: Strip source maps from npm package

### Changes Implemented
- Set `sourceMap: false` in `tsconfig.json` to stop generating `.js.map` files during build
- The `package.json` already had `!build/**/*.map` in the `files` array, but source maps were still being generated unnecessarily in the build directory

### Files Modified
- `tsconfig.json` — changed `sourceMap` from `true` to `false`

### Verification Status
- **Build**: `npm run build` exits cleanly with no errors
- **Tests**: All 1318 tests pass (53 test files)
- **npm pack --dry-run**: Zero `.map` files in the package tarball (134.1 kB package size)
- **Build directory**: Zero `.map` files after clean build
- **git diff --stat**: Only `tsconfig.json` modified (1 insertion, 1 deletion)
- Playwright verification skipped — this is a build config change, not a UI feature

### Risks/Blockers Encountered
- None. The change is minimal and low-risk.

### Learnings
- The `!build/**/*.map` exclusion in `package.json` was already preventing `.map` files from shipping, but source maps were still being generated in the build directory. Disabling generation entirely is cleaner.

### Notes for Developer
- If source maps are ever needed for debugging during development, you can run `tsc --sourceMap` directly or temporarily re-enable in tsconfig.
</summary>