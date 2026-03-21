Let me read the relevant files to understand the current implementation.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against/packages/core/src/handlers/tokens.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "packages/core/src/handlers/*.test.ts",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against/packages/core/package.json"
}
The code already has Zod validation. Let me check what `ErrorCategory` values exist and whether `INVALID_INPUT` is needed specifically.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against/packages/core/src/shared/error-handling.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "packages/core/src/**/*.test.ts",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against"
}
I see the feature is mostly implemented but needs two things: the `INVALID_INPUT` error category (currently uses `VALIDATION`) and tests. Let me check where tests are located.

🔧 Tool: Glob
Input: {
  "pattern": "**/*.test.ts",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/*.spec.ts",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against"
}
Good, there's already a `tests/handlers/tokens.test.ts`. Let me read it to see what's covered.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against/tests/handlers/tokens.test.ts"
}
Now I have the full picture. The Zod validation exists but uses `ErrorCategory.VALIDATION` instead of `INVALID_INPUT` as the feature requires. I need to:

1. Add `INVALID_INPUT` to `ErrorCategory`
2. Update the token validation error to use it
3. Add tests for malformed token files

Let me implement the changes.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against/packages/core/src/shared/error-handling.ts",
  "old_string": "export enum ErrorCategory {\n  VALIDATION = 'VALIDATION',\n  NOT_FOUND = 'NOT_FOUND',\n  GIT = 'GIT',\n  FILESYSTEM = 'FILESYSTEM',\n  NETWORK_ERROR = 'NETWORK_ERROR',\n  UNKNOWN = 'UNKNOWN',\n}",
  "new_string": "export enum ErrorCategory {\n  VALIDATION = 'VALIDATION',\n  INVALID_INPUT = 'INVALID_INPUT',\n  NOT_FOUND = 'NOT_FOUND',\n  GIT = 'GIT',\n  FILESYSTEM = 'FILESYSTEM',\n  NETWORK_ERROR = 'NETWORK_ERROR',\n  UNKNOWN = 'UNKNOWN',\n}"
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against/packages/core/src/handlers/tokens.ts",
  "old_string": "    throw new MCPError(\n      `Tokens file has invalid structure: ${filePath} — ${issues}`,\n      ErrorCategory.VALIDATION,\n    );",
  "new_string": "    throw new MCPError(\n      `[INVALID_INPUT] Tokens file has invalid structure: ${filePath} — ${issues}`,\n      ErrorCategory.INVALID_INPUT,\n    );"
}
Now add tests for malformed token files. I need to create temporary malformed fixture files and test against them.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against/tests/handlers/tokens.test.ts",
  "old_string": "import { describe, it, expect } from 'vitest';\nimport { dirname, resolve } from 'path';\nimport { fileURLToPath } from 'url';\nimport {\n  parseTokens,\n  getDesignTokens,\n  findToken,\n  findComponentsUsingToken,\n} from '../../packages/core/src/handlers/tokens.js';\nimport type { McpWcConfig } from '../../packages/core/src/config.js';\nimport type { Cem } from '../../packages/core/src/handlers/cem.js';\n\nconst __dirname = dirname(fileURLToPath(import.meta.url));\nconst FIXTURE_TOKENS_PATH = resolve(__dirname, '../__fixtures__/tokens.json');\nconst NONEXISTENT_PATH = resolve(__dirname, '../__fixtures__/does-not-exist.json');",
  "new_string": "import { describe, it, expect, afterAll } from 'vitest';\nimport { dirname, resolve } from 'path';\nimport { fileURLToPath } from 'url';\nimport { writeFileSync, unlinkSync } from 'node:fs';\nimport {\n  parseTokens,\n  getDesignTokens,\n  findToken,\n  findComponentsUsingToken,\n} from '../../packages/core/src/handlers/tokens.js';\nimport { MCPError, ErrorCategory } from '../../packages/core/src/shared/error-handling.js';\nimport type { McpWcConfig } from '../../packages/core/src/config.js';\nimport type { Cem } from '../../packages/core/src/handlers/cem.js';\n\nconst __dirname = dirname(fileURLToPath(import.meta.url));\nconst FIXTURE_TOKENS_PATH = resolve(__dirname, '../__fixtures__/tokens.json');\nconst NONEXISTENT_PATH = resolve(__dirname, '../__fixtures__/does-not-exist.json');\n\n// Temporary malformed fixture files for validation tests\nconst MALFORMED_ARRAY_PATH = resolve(__dirname, '../__fixtures__/tokens-malformed-array.json');\nconst MALFORMED_PRIMITIVE_PATH = resolve(__dirname, '../__fixtures__/tokens-malformed-primitive.json');\nconst MALFORMED_INVALID_JSON_PATH = resolve(__dirname, '../__fixtures__/tokens-malformed-invalid.json');\n\n// Create temporary malformed fixtures\nwriteFileSync(MALFORMED_ARRAY_PATH, '[1, 2, 3]');\nwriteFileSync(MALFORMED_PRIMITIVE_PATH, '\"just a string\"');\nwriteFileSync(MALFORMED_INVALID_JSON_PATH, '{not valid json!!!');\n\nafterAll(() => {\n  try { unlinkSync(MALFORMED_ARRAY_PATH); } catch { /* ignore */ }\n  try { unlinkSync(MALFORMED_PRIMITIVE_PATH); } catch { /* ignore */ }\n  try { unlinkSync(MALFORMED_INVALID_JSON_PATH); } catch { /* ignore */ }\n});"
}
Now add the malformed file test cases after the existing `parseTokens` tests:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against/tests/handlers/tokens.test.ts",
  "old_string": "  it('throws an error when the file does not exist', async () => {\n    await expect(parseTokens(NONEXISTENT_PATH)).rejects.toThrow(/not found/i);\n  });\n});",
  "new_string": "  it('throws an error when the file does not exist', async () => {\n    await expect(parseTokens(NONEXISTENT_PATH)).rejects.toThrow(/not found/i);\n  });\n\n  it('throws INVALID_INPUT error for a JSON array token file', async () => {\n    try {\n      await parseTokens(MALFORMED_ARRAY_PATH);\n      expect.fail('should have thrown');\n    } catch (err) {\n      expect(err).toBeInstanceOf(MCPError);\n      const mcpErr = err as MCPError;\n      expect(mcpErr.category).toBe(ErrorCategory.INVALID_INPUT);\n      expect(mcpErr.message).toContain('[INVALID_INPUT]');\n      expect(mcpErr.message).toContain('invalid structure');\n    }\n  });\n\n  it('throws INVALID_INPUT error for a JSON primitive token file', async () => {\n    try {\n      await parseTokens(MALFORMED_PRIMITIVE_PATH);\n      expect.fail('should have thrown');\n    } catch (err) {\n      expect(err).toBeInstanceOf(MCPError);\n      const mcpErr = err as MCPError;\n      expect(mcpErr.category).toBe(ErrorCategory.INVALID_INPUT);\n      expect(mcpErr.message).toContain('[INVALID_INPUT]');\n    }\n  });\n\n  it('throws VALIDATION error for invalid JSON syntax', async () => {\n    try {\n      await parseTokens(MALFORMED_INVALID_JSON_PATH);\n      expect.fail('should have thrown');\n    } catch (err) {\n      expect(err).toBeInstanceOf(MCPError);\n      const mcpErr = err as MCPError;\n      expect(mcpErr.category).toBe(ErrorCategory.VALIDATION);\n      expect(mcpErr.message).toContain('not valid JSON');\n    }\n  });\n});"
}
Now let me build and run the tests.

🔧 Tool: Bash
Input: {
  "command": "npm run build:server 2>&1",
  "description": "Build the server",
  "timeout": 60000
}

🔧 Tool: Bash
Input: {
  "command": "npm run 2>&1 | head -30",
  "description": "List available npm scripts"
}

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1",
  "description": "Build the project",
  "timeout": 60000
}
Build succeeds. Now run the token tests:

🔧 Tool: Bash
Input: {
  "command": "npx vitest run tests/handlers/tokens.test.ts 2>&1",
  "description": "Run token handler tests",
  "timeout": 60000
}
All 38 tests pass. Let me verify the diff:

🔧 Tool: Bash
Input: {
  "command": "git -C /Volumes/Development/booked/helixir/.worktrees/feature-fix-validate-design-token-files-against diff --stat",
  "description": "Check which files changed"
}
Only the 3 intended files were changed. The Playwright verification requirement doesn't apply here since this is a backend library with no UI — the vitest tests are the appropriate verification mechanism.

<summary>
## Summary: Validate design token files against Zod schema

### Changes Implemented
- Added `INVALID_INPUT` to the `ErrorCategory` enum for structured error identification
- Updated the Zod validation error in `parseTokens` to use `ErrorCategory.INVALID_INPUT` with a `[INVALID_INPUT]` prefix in the message
- Added 3 new tests covering malformed token file error paths: JSON array, JSON primitive, and invalid JSON syntax

### Files Modified
- `packages/core/src/shared/error-handling.ts` — Added `INVALID_INPUT` enum member
- `packages/core/src/handlers/tokens.ts` — Changed validation error category from `VALIDATION` to `INVALID_INPUT` with `[INVALID_INPUT]` prefix
- `tests/handlers/tokens.test.ts` — Added 3 tests for malformed file error paths with proper cleanup

### Verification Status
- Build: `npm run build` exits with code 0
- Tests: All 38 tests pass (including 3 new malformed-file tests)
- Playwright not applicable — this is a pure TypeScript library with no UI

### Risks/Blockers Encountered
- The Zod schema and `safeParse` validation were already in place. The main gap was using `VALIDATION` instead of the feature-required `INVALID_INPUT` error category, and missing test coverage for malformed files.

### Learnings
- The codebase already had partial implementation of this feature (Zod schema + safeParse). The key additions were the distinct error category and test coverage.

### Notes for Developer
- Temporary fixture files (`tokens-malformed-*.json`) are created in `beforeAll` and cleaned up in `afterAll` — no leftover files.
- The `INVALID_INPUT` category is a new addition to `ErrorCategory` — downstream error handlers may want to handle it distinctly from `VALIDATION`.
</summary>