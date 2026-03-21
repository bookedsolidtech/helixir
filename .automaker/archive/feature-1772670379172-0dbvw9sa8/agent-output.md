Let me read the relevant source and test files to understand the patterns.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-add-edge-case-tests-for-suggest/packages/core/src/handlers/suggest.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "tests/handlers/suggest*",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-add-edge-case-tests-for-suggest"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-add-edge-case-tests-for-suggest/tests/handlers/suggest.test.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-add-edge-case-tests-for-suggest/packages/core/src/handlers/cem.ts"
}
Now I understand the code. I need to add edge-case tests for `suggest.ts` covering: component with no members and no description. Let me add these tests.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-add-edge-case-tests-for-suggest/tests/handlers/suggest.test.ts",
  "offset": 590
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-fix-add-edge-case-tests-for-suggest/tests/handlers/suggest.test.ts",
  "old_string": "  it('cdnScriptLink points to the component module path for non-Shoelace library', async () => {\n    const result = await generateImport('my-button', makeNonShoelaceCdnConfig());\n    expect(result.cdnScriptLink).toContain(result.modulePath);\n    expect(result.cdnScriptLink).toContain('https://cdn.example.com/my-component-lib@1');\n  });\n});",
  "new_string": "  it('cdnScriptLink points to the component module path for non-Shoelace library', async () => {\n    const result = await generateImport('my-button', makeNonShoelaceCdnConfig());\n    expect(result.cdnScriptLink).toContain(result.modulePath);\n    expect(result.cdnScriptLink).toContain('https://cdn.example.com/my-component-lib@1');\n  });\n});\n\n// ---------------------------------------------------------------------------\n// suggestUsage — component with no members\n// ---------------------------------------------------------------------------\n\ndescribe('suggestUsage — component with no members', () => {\n  const noMembersCem = {\n    schemaVersion: '1.0.0',\n    modules: [\n      {\n        kind: 'javascript-module' as const,\n        path: 'src/x-empty.js',\n        declarations: [\n          {\n            kind: 'class' as const,\n            name: 'XEmpty',\n            tagName: 'x-empty',\n            members: [],\n            events: [],\n            slots: [],\n          },\n        ],\n      },\n    ],\n  };\n\n  it('returns empty requiredAttributes when component has no members', async () => {\n    const result = await suggestUsage('x-empty', makeConfig(), noMembersCem as never);\n    expect(result.requiredAttributes).toHaveLength(0);\n  });\n\n  it('returns empty optionalAttributes when component has no members', async () => {\n    const result = await suggestUsage('x-empty', makeConfig(), noMembersCem as never);\n    expect(result.optionalAttributes).toHaveLength(0);\n  });\n\n  it('returns empty variantOptions when component has no members', async () => {\n    const result = await suggestUsage('x-empty', makeConfig(), noMembersCem as never);\n    expect(Object.keys(result.variantOptions)).toHaveLength(0);\n  });\n\n  it('returns empty slots array when component has no slots', async () => {\n    const result = await suggestUsage('x-empty', makeConfig(), noMembersCem as never);\n    expect(result.slots).toHaveLength(0);\n  });\n\n  it('generates a simple open/close tag snippet with no attributes', async () => {\n    const result = await suggestUsage('x-empty', makeConfig(), noMembersCem as never);\n    expect(result.htmlSnippet).toBe('<x-empty></x-empty>');\n  });\n});\n\n// ---------------------------------------------------------------------------\n// suggestUsage — component with no description (slots without descriptions)\n// ---------------------------------------------------------------------------\n\ndescribe('suggestUsage — component with no description', () => {\n  const noDescCem = {\n    schemaVersion: '1.0.0',\n    modules: [\n      {\n        kind: 'javascript-module' as const,\n        path: 'src/x-bare.js',\n        declarations: [\n          {\n            kind: 'class' as const,\n            name: 'XBare',\n            tagName: 'x-bare',\n            description: undefined,\n            members: [\n              {\n                kind: 'field' as const,\n                name: 'label',\n                type: { text: 'string' },\n              },\n            ],\n            events: [],\n            slots: [\n              { name: '', description: undefined },\n              { name: 'icon', description: undefined },\n            ],\n          },\n        ],\n      },\n    ],\n  };\n\n  it('uses fallback \"content\" for default slot with no description', async () => {\n    const result = await suggestUsage('x-bare', makeConfig(), noDescCem as never);\n    expect(result.htmlSnippet).toContain('<!-- content -->');\n  });\n\n  it('uses slot name as fallback for named slot with no description', async () => {\n    const result = await suggestUsage('x-bare', makeConfig(), noDescCem as never);\n    expect(result.htmlSnippet).toContain('<!-- icon -->');\n  });\n\n  it('treats a required string field as a required attribute', async () => {\n    const result = await suggestUsage('x-bare', makeConfig(), noDescCem as never);\n    expect(result.requiredAttributes).toContain('label');\n    expect(result.htmlSnippet).toContain('label=\"\"');\n  });\n\n  it('returns slot objects with empty description strings', async () => {\n    const result = await suggestUsage('x-bare', makeConfig(), noDescCem as never);\n    for (const slot of result.slots) {\n      expect(typeof slot.description).toBe('string');\n    }\n  });\n});"
}
Now let me run the tests and build to verify.

🔧 Tool: Bash
Input: {
  "command": "npx vitest run tests/handlers/suggest.test.ts 2>&1",
  "description": "Run suggest handler tests",
  "timeout": 60000
}
All 69 tests pass (60 existing + 9 new). Now let me run the coverage check and build.

🔧 Tool: Bash
Input: {
  "command": "npx vitest run tests/handlers/suggest.test.ts --coverage 2>&1 | tail -30",
  "description": "Run suggest tests with coverage",
  "timeout": 60000
}

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1 | tail -20",
  "description": "Build the project",
  "timeout": 60000
}
Build succeeds. The coverage errors are global thresholds unrelated to my changes (they're for unrelated files with 0% coverage). Let me check the specific coverage for `suggest.ts`.

🔧 Tool: Bash
Input: {
  "command": "npx vitest run tests/handlers/suggest.test.ts --coverage 2>&1 | grep \"suggest.ts\"",
  "description": "Check suggest.ts coverage specifically",
  "timeout": 60000
}
`suggest.ts` has 94.28% branch coverage (well above the 75% threshold). Let me verify only the intended file was changed.

🔧 Tool: Bash
Input: {
  "command": "git diff --stat",
  "description": "Check changed files"
}
Only the intended test file was modified. Let me also run the full test suite to make sure nothing is broken.

🔧 Tool: Bash
Input: {
  "command": "npx vitest run 2>&1 | tail -15",
  "description": "Run full test suite",
  "timeout": 120000
}
All 1327 tests pass across 53 test files.

<summary>
## Summary: Add edge-case tests for suggest handler

### Changes Implemented
- Added "component with no members" test suite (5 tests): verifies empty arrays for attributes, variants, slots, and a simple tag snippet when a component has zero members
- Added "component with no description" test suite (4 tests): verifies fallback behavior for slots without descriptions ("content" for default slot, slot name for named slots), required string field detection, and empty description string handling

### Files Modified
- `tests/handlers/suggest.test.ts` — added 110 lines (9 new edge-case tests)

### Verification Status
- All 69 suggest tests pass (60 existing + 9 new)
- Full test suite: 1327 tests pass across 53 files
- `suggest.ts` branch coverage: 94.28% (exceeds 75% threshold)
- Build: exits with code 0
- Playwright verification not applicable — these are unit tests for handler logic, not UI features

### Risks/Blockers Encountered
- None

### Learnings
- Inline CEMs with `as never` cast are an effective pattern for testing edge cases without fixture files
- The `suggest.ts` handler uses fallback strings (`'content'` for default slot, slot name for named slots) when descriptions are missing

### Notes for Developer
- Global coverage thresholds fail due to unrelated files at 0% coverage — this is pre-existing and not caused by these changes
</summary>