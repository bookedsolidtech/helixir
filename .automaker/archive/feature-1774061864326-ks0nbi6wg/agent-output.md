
🔧 Tool: Glob
Input: {
  "pattern": "src/**/*.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "tests/**/*.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/src/index.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "src/tools/*.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "src/handlers/*.ts"
}

🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/src/"
}

🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/src/mcp/ && ls /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/src/api/"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/src/mcp/index.ts"
}

🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/src/ 2>/dev/null || echo \"no src in main\""
}

🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/packages/core/src/tools/ && ls /Volumes/Development/booked/helixir/packages/core/src/handlers/"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/packages/core/src/tools/component.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/packages/core/src/handlers/suggest.ts"
}
Now let me check the test fixture and `parseCem` return type:

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir -name \"custom-elements.json\" -path \"*/fixtures/*\" 2>/dev/null | head -3"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/packages/core/src/handlers/cem.ts",
  "limit": 80
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/packages/core/src/handlers/cem.ts",
  "limit": 150,
  "offset": 80
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir -name \"*.json\" -path \"*__fixtures__*\" 2>/dev/null | head -5"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/tests/handlers/suggest.test.ts",
  "limit": 60
}

🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/tests/__fixtures__/"
}

🔧 Tool: Bash
Input: {
  "command": "cat /Volumes/Development/booked/helixir/tests/__fixtures__/custom-elements.json | python3 -m json.tool | head -100"
}

🔧 Tool: Bash
Input: {
  "command": "cat /Volumes/Development/booked/helixir/tests/__fixtures__/custom-elements.json | python3 -m json.tool | grep -A 5 \"cssProperties\\|cssParts\" | head -50"
}

🔧 Tool: Bash
Input: {
  "command": "cat /Volumes/Development/booked/helixir/tests/__fixtures__/custom-elements.json | python3 -c \"import json,sys; d=json.load(sys.stdin); [print(decl.get('tagName','?'), 'props:', len(decl.get('cssProperties',[])), 'parts:', len(decl.get('cssParts',[]))) for m in d['modules'] for decl in m.get('declarations',[])]\""
}

🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/"
}

🔧 Tool: Bash
Input: {
  "command": "cat /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/package.json | python3 -m json.tool | head -30"
}
Good, the worktree mirrors the main repo. Now I have everything I need. Let me implement the feature:

1. `packages/core/src/handlers/styling-diagnostics.ts` - the handler
2. `packages/core/src/tools/styling.ts` - tool definitions  
3. Register in `src/mcp/index.ts`
4. Test at `tests/handlers/styling-diagnostics.test.ts`
5. Add fixture data to `tests/__fixtures__/custom-elements.json`

🔧 Tool: Bash
Input: {
  "command": "cat /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/tests/__fixtures__/custom-elements.json | python3 -m json.tool | tail -30"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/packages/core/src/shared/mcp-helpers.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/packages/core/src/shared/error-handling.ts",
  "limit": 30
}
Now I have all the context I need. Let me implement the feature. I'll start with the handler, then the tool, then update the fixture, then write the test, and finally register in mcp/index.ts.

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/packages/core/src/handlers/styling-diagnostics.ts",
  "content": "import { z } from 'zod';\nimport { parseCem } from './cem.js';\nimport type { Cem } from './cem.js';\nimport { MCPError, ErrorCategory } from '../shared/error-handling.js';\n\n// ─── Arg schema ───────────────────────────────────────────────────────────────\n\nexport const DiagnoseStylingArgsSchema = z.object({\n  tagName: z.string(),\n  libraryId: z.string().optional(),\n});\n\n// ─── Return types ─────────────────────────────────────────────────────────────\n\nexport interface CssPropEntry {\n  name: string;\n  description: string;\n  default: string;\n  example: string;\n}\n\nexport interface CssPartEntry {\n  name: string;\n  description: string;\n  selector: string;\n}\n\nexport type ThemingApproach = 'token-based' | 'class-based' | 'data-attribute' | 'none';\n\nexport interface StylingDiagnosticsResult {\n  tagName: string;\n  cssProperties: CssPropEntry[];\n  cssParts: CssPartEntry[];\n  themingApproach: ThemingApproach;\n  darkModeSupport: boolean;\n  antiPatterns: string[];\n  cssSnippet: string;\n}\n\n// ─── Token prefix detection ───────────────────────────────────────────────────\n\n/**\n * Returns the common namespace prefix from a list of CSS custom property names.\n * e.g. [\"--sl-color-primary\", \"--sl-spacing-sm\"] → \"--sl-\"\n * Returns null when there are no properties or no common prefix can be found.\n */\nexport function detectTokenPrefix(propNames: string[]): string | null {\n  if (propNames.length === 0) return null;\n  // Strip leading \"--\", split on \"-\", find longest common prefix of segments\n  const segments = propNames.map((n) => n.replace(/^--/, '').split('-'));\n  const first = segments[0];\n  let commonLen = first.length;\n  for (let i = 1; i < segments.length; i++) {\n    let j = 0;\n    while (j < commonLen && j < segments[i].length && segments[i][j] === first[j]) j++;\n    commonLen = j;\n  }\n  if (commonLen === 0) return null;\n  // Require at least 2 segments (e.g. \"--hx-\") to qualify as a namespace prefix\n  if (commonLen < 2) return null;\n  return '--' + first.slice(0, commonLen).join('-') + '-';\n}\n\n/**\n * Detects theming approach from CSS property names and component description.\n */\nexport function detectThemingApproach(\n  propNames: string[],\n  description: string,\n): ThemingApproach {\n  if (propNames.length > 0) return 'token-based';\n  if (/\\bdata-theme\\b|\\bdata-mode\\b/i.test(description)) return 'data-attribute';\n  if (/\\btheme\\b|\\bclass\\b/i.test(description)) return 'class-based';\n  return 'none';\n}\n\n/**\n * Detect dark-mode support heuristically:\n * - Any CSS property name containing \"dark\"\n * - Description mentioning dark mode\n * - A property whose name ends with the word \"dark\"\n */\nexport function detectDarkModeSupport(propNames: string[], description: string): boolean {\n  if (/dark/i.test(description)) return true;\n  return propNames.some((n) => /dark/i.test(n));\n}\n\n/**\n * Build anti-pattern guidance specific to this component.\n */\nexport function buildAntiPatterns(\n  tagName: string,\n  propCount: number,\n  partCount: number,\n): string[] {\n  const patterns: string[] = [];\n\n  if (propCount > 0) {\n    patterns.push(\n      `Do not use inline \\`style\\` to override internals — prefer the exposed CSS custom properties instead.`,\n    );\n    patterns.push(\n      `Avoid !important overrides; CSS custom properties cascade correctly without it.`,\n    );\n  }\n\n  if (partCount > 0) {\n    patterns.push(\n      `Do not target internal Shadow DOM selectors directly (e.g. \\`${tagName} > div\\`) — use \\`::part()\\` selectors for exposed parts.`,\n    );\n  }\n\n  if (propCount === 0 && partCount === 0) {\n    patterns.push(\n      `This component exposes no CSS custom properties or CSS parts. Styling its internals via Shadow DOM piercing selectors (::slotted, :host deep selectors) is not supported and may break across versions.`,\n    );\n    patterns.push(\n      `Wrap the component or use slotted content to apply your own styles where possible.`,\n    );\n  }\n\n  return patterns;\n}\n\n/**\n * Generates a ready-to-use CSS snippet showing how to customise this component.\n */\nexport function buildCssSnippet(\n  tagName: string,\n  props: CssPropEntry[],\n  parts: CssPartEntry[],\n): string {\n  const lines: string[] = [];\n\n  if (props.length > 0) {\n    lines.push(`/* Customise ${tagName} via CSS custom properties */`);\n    lines.push(`${tagName} {`);\n    for (const prop of props.slice(0, 5)) {\n      const comment = prop.default ? ` /* default: ${prop.default} */` : '';\n      lines.push(`  ${prop.name}: ;${comment}`);\n    }\n    if (props.length > 5) {\n      lines.push(`  /* … ${props.length - 5} more properties available */`);\n    }\n    lines.push(`}`);\n  }\n\n  if (parts.length > 0) {\n    if (lines.length > 0) lines.push('');\n    lines.push(`/* Style exposed CSS parts */`);\n    for (const part of parts.slice(0, 3)) {\n      lines.push(`${tagName}::part(${part.name}) {`);\n      lines.push(`  /* ${part.description || part.name} */`);\n      lines.push(`}`);\n    }\n    if (parts.length > 3) {\n      lines.push(`/* … ${parts.length - 3} more parts available */`);\n    }\n  }\n\n  if (lines.length === 0) {\n    lines.push(\n      `/* ${tagName} does not expose CSS custom properties or CSS parts. */`,\n      `/* Use slotted content or wrapper elements for custom styling. */`,\n    );\n  }\n\n  return lines.join('\\n');\n}\n\n// ─── Public API ───────────────────────────────────────────────────────────────\n\nexport function diagnoseStyling(tagName: string, cem: Cem): StylingDiagnosticsResult {\n  const meta = parseCem(tagName, cem);\n\n  if (!meta.tagName) {\n    throw new MCPError(`Component \"${tagName}\" not found in CEM.`, ErrorCategory.NOT_FOUND);\n  }\n\n  const cssProperties: CssPropEntry[] = meta.cssProperties.map((p) => ({\n    name: p.name,\n    description: p.description ?? '',\n    default: (p as { name: string; description: string; default?: string }).default ?? '',\n    example: `${tagName} { ${p.name}: value; }`,\n  }));\n\n  const cssParts: CssPartEntry[] = meta.cssParts.map((pt) => ({\n    name: pt.name,\n    description: pt.description ?? '',\n    selector: `${tagName}::part(${pt.name})`,\n  }));\n\n  const propNames = cssProperties.map((p) => p.name);\n  const themingApproach = detectThemingApproach(propNames, meta.description);\n  const darkModeSupport = detectDarkModeSupport(propNames, meta.description);\n  const antiPatterns = buildAntiPatterns(tagName, cssProperties.length, cssParts.length);\n  const cssSnippet = buildCssSnippet(tagName, cssProperties, cssParts);\n\n  return {\n    tagName,\n    cssProperties,\n    cssParts,\n    themingApproach,\n    darkModeSupport,\n    antiPatterns,\n    cssSnippet,\n  };\n}\n"
}

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/packages/core/src/tools/styling.ts",
  "content": "import { z } from 'zod';\nimport { DiagnoseStylingArgsSchema, diagnoseStyling } from '../handlers/styling-diagnostics.js';\nimport type { Cem } from '../handlers/cem.js';\nimport { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';\nimport type { MCPToolResult } from '../shared/mcp-helpers.js';\nimport { handleToolError } from '../shared/error-handling.js';\n\nexport const STYLING_TOOL_DEFINITIONS = [\n  {\n    name: 'diagnose_styling',\n    description:\n      'Returns a comprehensive styling guide for a web component: available CSS custom properties and CSS parts with examples, theming approach detection, light/dark mode support, common anti-patterns, and a ready-to-use CSS snippet.',\n    inputSchema: {\n      type: 'object' as const,\n      properties: {\n        libraryId: {\n          type: 'string',\n          description:\n            'Optional library ID to target a specific loaded library instead of the default.',\n        },\n        tagName: {\n          type: 'string',\n          description: 'The custom element tag name (e.g. \"my-button\").',\n        },\n      },\n      required: ['tagName'],\n      additionalProperties: false,\n    },\n  },\n];\n\nexport function isStylingTool(name: string): boolean {\n  return STYLING_TOOL_DEFINITIONS.some((t) => t.name === name);\n}\n\nexport async function handleStylingCall(\n  name: string,\n  args: Record<string, unknown>,\n  cem: Cem,\n): Promise<MCPToolResult> {\n  try {\n    if (name === 'diagnose_styling') {\n      const { tagName } = DiagnoseStylingArgsSchema.parse(args);\n      const result = diagnoseStyling(tagName, cem);\n      return createSuccessResponse(JSON.stringify(result, null, 2));\n    }\n    return createErrorResponse(`Unknown styling tool: ${name}`);\n  } catch (err) {\n    const mcpErr = handleToolError(err);\n    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);\n  }\n}\n"
}
Now register in `src/mcp/index.ts`:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/src/mcp/index.ts",
  "old_string": "import {\n  TYPEGENERATE_TOOL_DEFINITIONS,\n  handleTypegenerateCall,\n  isTypegenerateTool,\n} from '../../packages/core/src/tools/typegenerate.js';\nimport { createErrorResponse } from '../../packages/core/src/shared/mcp-helpers.js';",
  "new_string": "import {\n  TYPEGENERATE_TOOL_DEFINITIONS,\n  handleTypegenerateCall,\n  isTypegenerateTool,\n} from '../../packages/core/src/tools/typegenerate.js';\nimport {\n  STYLING_TOOL_DEFINITIONS,\n  handleStylingCall,\n  isStylingTool,\n} from '../../packages/core/src/tools/styling.js';\nimport { createErrorResponse } from '../../packages/core/src/shared/mcp-helpers.js';"
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/src/mcp/index.ts",
  "old_string": "    ...TYPEGENERATE_TOOL_DEFINITIONS,\n    ...tsTools,\n  ];",
  "new_string": "    ...TYPEGENERATE_TOOL_DEFINITIONS,\n    ...STYLING_TOOL_DEFINITIONS,\n    ...tsTools,\n  ];"
}
Now add the dispatcher branch:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/src/mcp/index.ts",
  "old_string": "      if (isTokenTool(name)) {",
  "new_string": "      if (isStylingTool(name)) {\n        if (cemCache === null || cemReloading)\n          return createErrorResponse(\n            'CEM not yet loaded — server is still initializing. Please retry.',\n          );\n        return handleStylingCall(name, typedArgs, resolveCem(libraryId, cemCache));\n      }\n      if (isTokenTool(name)) {"
}
Now update the fixture to add a component with only props (no parts) and one with neither:

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/tests/__fixtures__/custom-elements.json",
  "limit": 10
}

🔧 Tool: Bash
Input: {
  "command": "wc -l /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/tests/__fixtures__/custom-elements.json"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/tests/__fixtures__/custom-elements.json",
  "offset": 430,
  "limit": 10
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/tests/__fixtures__/custom-elements.json",
  "old_string": "      \"exports\": [\n        {\n          \"kind\": \"custom-element-definition\",\n          \"name\": \"my-select\",\n          \"declaration\": { \"name\": \"MySelect\", \"module\": \"src/components/my-select.js\" }\n        }\n      ]\n    }\n  ]\n}",
  "new_string": "      \"exports\": [\n        {\n          \"kind\": \"custom-element-definition\",\n          \"name\": \"my-select\",\n          \"declaration\": { \"name\": \"MySelect\", \"module\": \"src/components/my-select.js\" }\n        }\n      ]\n    },\n    {\n      \"kind\": \"javascript-module\",\n      \"path\": \"src/components/my-badge.js\",\n      \"declarations\": [\n        {\n          \"kind\": \"class\",\n          \"description\": \"A simple badge component for displaying status labels.\",\n          \"name\": \"MyBadge\",\n          \"tagName\": \"my-badge\",\n          \"members\": [],\n          \"events\": [],\n          \"slots\": [],\n          \"cssParts\": [],\n          \"cssProperties\": [\n            {\n              \"name\": \"--my-badge-bg\",\n              \"default\": \"#e0e7ff\",\n              \"description\": \"Background color of the badge.\"\n            },\n            {\n              \"name\": \"--my-badge-color\",\n              \"default\": \"#3730a3\",\n              \"description\": \"Text color of the badge.\"\n            }\n          ],\n          \"superclass\": { \"name\": \"HTMLElement\" }\n        }\n      ],\n      \"exports\": [\n        {\n          \"kind\": \"custom-element-definition\",\n          \"name\": \"my-badge\",\n          \"declaration\": { \"name\": \"MyBadge\", \"module\": \"src/components/my-badge.js\" }\n        }\n      ]\n    },\n    {\n      \"kind\": \"javascript-module\",\n      \"path\": \"src/components/my-divider.js\",\n      \"declarations\": [\n        {\n          \"kind\": \"class\",\n          \"description\": \"A simple horizontal divider.\",\n          \"name\": \"MyDivider\",\n          \"tagName\": \"my-divider\",\n          \"members\": [],\n          \"events\": [],\n          \"slots\": [],\n          \"cssParts\": [],\n          \"cssProperties\": [],\n          \"superclass\": { \"name\": \"HTMLElement\" }\n        }\n      ],\n      \"exports\": [\n        {\n          \"kind\": \"custom-element-definition\",\n          \"name\": \"my-divider\",\n          \"declaration\": { \"name\": \"MyDivider\", \"module\": \"src/components/my-divider.js\" }\n        }\n      ]\n    }\n  ]\n}"
}
Now write the test file:

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/tests/handlers/styling-diagnostics.test.ts",
  "content": "import { describe, it, expect } from 'vitest';\nimport { readFileSync } from 'fs';\nimport { resolve, dirname } from 'path';\nimport { fileURLToPath } from 'url';\nimport { CemSchema } from '../../packages/core/src/handlers/cem.js';\nimport {\n  diagnoseStyling,\n  detectTokenPrefix,\n  detectThemingApproach,\n  detectDarkModeSupport,\n  buildAntiPatterns,\n  buildCssSnippet,\n} from '../../packages/core/src/handlers/styling-diagnostics.js';\n\nconst __dirname = dirname(fileURLToPath(import.meta.url));\nconst FIXTURE = resolve(__dirname, '../__fixtures__/custom-elements.json');\n\nfunction loadFixtureCem() {\n  return CemSchema.parse(JSON.parse(readFileSync(FIXTURE, 'utf-8')));\n}\n\n// ─── detectTokenPrefix ─────────────────────────────────────────────────────\n\ndescribe('detectTokenPrefix', () => {\n  it('returns the common prefix for namespaced tokens', () => {\n    expect(detectTokenPrefix(['--sl-color-primary', '--sl-color-secondary', '--sl-spacing-sm'])).toBe('--sl-');\n  });\n\n  it('returns null for an empty array', () => {\n    expect(detectTokenPrefix([])).toBeNull();\n  });\n\n  it('returns null when no common multi-segment prefix exists', () => {\n    expect(detectTokenPrefix(['--color-primary', '--spacing-sm'])).toBeNull();\n  });\n\n  it('handles single-entry arrays', () => {\n    const result = detectTokenPrefix(['--hx-color-base']);\n    // single entry has trivially common prefix of full name; requires ≥2 segments\n    expect(result).not.toBeNull();\n  });\n});\n\n// ─── detectThemingApproach ─────────────────────────────────────────────────\n\ndescribe('detectThemingApproach', () => {\n  it('returns token-based when cssProperties are present', () => {\n    expect(detectThemingApproach(['--my-bg'], '')).toBe('token-based');\n  });\n\n  it('returns data-attribute when description mentions data-theme', () => {\n    expect(detectThemingApproach([], 'Supports data-theme attribute')).toBe('data-attribute');\n  });\n\n  it('returns class-based when description mentions theme class', () => {\n    expect(detectThemingApproach([], 'Apply the theme class for dark mode')).toBe('class-based');\n  });\n\n  it('returns none for a component with no props and no theme hints', () => {\n    expect(detectThemingApproach([], 'A simple horizontal divider.')).toBe('none');\n  });\n});\n\n// ─── detectDarkModeSupport ─────────────────────────────────────────────────\n\ndescribe('detectDarkModeSupport', () => {\n  it('returns true when a property name contains \"dark\"', () => {\n    expect(detectDarkModeSupport(['--my-bg-dark'], '')).toBe(true);\n  });\n\n  it('returns true when description mentions dark mode', () => {\n    expect(detectDarkModeSupport([], 'Supports dark mode via CSS custom properties.')).toBe(true);\n  });\n\n  it('returns false when no dark-mode signals present', () => {\n    expect(detectDarkModeSupport(['--my-bg', '--my-color'], 'A badge component.')).toBe(false);\n  });\n});\n\n// ─── buildAntiPatterns ─────────────────────────────────────────────────────\n\ndescribe('buildAntiPatterns', () => {\n  it('includes CSS custom property guidance when props are present', () => {\n    const patterns = buildAntiPatterns('my-button', 3, 2);\n    expect(patterns.some((p) => p.includes('CSS custom properties'))).toBe(true);\n  });\n\n  it('includes ::part() guidance when parts are present', () => {\n    const patterns = buildAntiPatterns('my-button', 3, 2);\n    expect(patterns.some((p) => p.includes('::part()'))).toBe(true);\n  });\n\n  it('returns shadow-dom piercing warning when component has nothing', () => {\n    const patterns = buildAntiPatterns('my-divider', 0, 0);\n    expect(patterns.some((p) => p.includes('no CSS custom properties or CSS parts'))).toBe(true);\n  });\n});\n\n// ─── buildCssSnippet ──────────────────────────────────────────────────────\n\ndescribe('buildCssSnippet', () => {\n  it('includes the tagName selector when props are present', () => {\n    const props = [{ name: '--my-bg', description: 'Background', default: '#fff', example: '' }];\n    const snippet = buildCssSnippet('my-badge', props, []);\n    expect(snippet).toContain('my-badge {');\n    expect(snippet).toContain('--my-bg');\n  });\n\n  it('includes ::part selectors when parts are present', () => {\n    const parts = [{ name: 'base', description: 'Root element', selector: 'my-button::part(base)' }];\n    const snippet = buildCssSnippet('my-button', [], parts);\n    expect(snippet).toContain('my-button::part(base)');\n  });\n\n  it('returns a fallback comment when component has nothing', () => {\n    const snippet = buildCssSnippet('my-divider', [], []);\n    expect(snippet).toContain('does not expose');\n  });\n});\n\n// ─── diagnoseStyling — component with parts + props (my-button) ───────────\n\ndescribe('diagnoseStyling — my-button (parts + props)', () => {\n  const cem = loadFixtureCem();\n\n  it('returns the correct tagName', () => {\n    const result = diagnoseStyling('my-button', cem);\n    expect(result.tagName).toBe('my-button');\n  });\n\n  it('returns cssProperties with name, description, default, and example', () => {\n    const result = diagnoseStyling('my-button', cem);\n    expect(result.cssProperties.length).toBeGreaterThan(0);\n    const prop = result.cssProperties[0];\n    expect(prop).toHaveProperty('name');\n    expect(prop).toHaveProperty('description');\n    expect(prop).toHaveProperty('default');\n    expect(prop).toHaveProperty('example');\n    expect(prop.example).toContain('my-button');\n  });\n\n  it('returns cssParts with name, description, and selector', () => {\n    const result = diagnoseStyling('my-button', cem);\n    expect(result.cssParts.length).toBeGreaterThan(0);\n    const part = result.cssParts[0];\n    expect(part).toHaveProperty('name');\n    expect(part).toHaveProperty('description');\n    expect(part).toHaveProperty('selector');\n    expect(part.selector).toMatch(/my-button::part\\(/);\n  });\n\n  it('detects token-based theming', () => {\n    const result = diagnoseStyling('my-button', cem);\n    expect(result.themingApproach).toBe('token-based');\n  });\n\n  it('returns antiPatterns array', () => {\n    const result = diagnoseStyling('my-button', cem);\n    expect(Array.isArray(result.antiPatterns)).toBe(true);\n    expect(result.antiPatterns.length).toBeGreaterThan(0);\n  });\n\n  it('returns a non-empty cssSnippet', () => {\n    const result = diagnoseStyling('my-button', cem);\n    expect(result.cssSnippet.length).toBeGreaterThan(0);\n    expect(result.cssSnippet).toContain('my-button');\n  });\n});\n\n// ─── diagnoseStyling — component with only props (my-badge) ───────────────\n\ndescribe('diagnoseStyling — my-badge (only props)', () => {\n  const cem = loadFixtureCem();\n\n  it('returns cssProperties', () => {\n    const result = diagnoseStyling('my-badge', cem);\n    expect(result.cssProperties.length).toBeGreaterThan(0);\n  });\n\n  it('returns empty cssParts', () => {\n    const result = diagnoseStyling('my-badge', cem);\n    expect(result.cssParts).toHaveLength(0);\n  });\n\n  it('detects token-based theming', () => {\n    const result = diagnoseStyling('my-badge', cem);\n    expect(result.themingApproach).toBe('token-based');\n  });\n\n  it('cssSnippet contains the property block but no ::part selector', () => {\n    const result = diagnoseStyling('my-badge', cem);\n    expect(result.cssSnippet).toContain('my-badge {');\n    expect(result.cssSnippet).not.toContain('::part(');\n  });\n});\n\n// ─── diagnoseStyling — component with neither (my-divider) ────────────────\n\ndescribe('diagnoseStyling — my-divider (no props, no parts)', () => {\n  const cem = loadFixtureCem();\n\n  it('returns empty cssProperties', () => {\n    const result = diagnoseStyling('my-divider', cem);\n    expect(result.cssProperties).toHaveLength(0);\n  });\n\n  it('returns empty cssParts', () => {\n    const result = diagnoseStyling('my-divider', cem);\n    expect(result.cssParts).toHaveLength(0);\n  });\n\n  it('detects none theming approach', () => {\n    const result = diagnoseStyling('my-divider', cem);\n    expect(result.themingApproach).toBe('none');\n  });\n\n  it('cssSnippet contains fallback comment', () => {\n    const result = diagnoseStyling('my-divider', cem);\n    expect(result.cssSnippet).toContain('does not expose');\n  });\n\n  it('antiPatterns mention shadow DOM limitation', () => {\n    const result = diagnoseStyling('my-divider', cem);\n    expect(result.antiPatterns.some((p) => p.includes('no CSS custom properties or CSS parts'))).toBe(true);\n  });\n});\n\n// ─── diagnoseStyling — not found ──────────────────────────────────────────\n\ndescribe('diagnoseStyling — unknown component', () => {\n  const cem = loadFixtureCem();\n\n  it('throws MCPError when component is not in CEM', () => {\n    expect(() => diagnoseStyling('my-unknown', cem)).toThrow();\n  });\n});\n"
}
Now let's run the tests to confirm they pass (first confirm red, then green after fixing any issues):

🔧 Tool: Bash
Input: {
  "command": "npm run build:server 2>&1 | tail -20",
  "timeout": 60000
}

🔧 Tool: Bash
Input: {
  "command": "npm run 2>&1 | head -30"
}

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1 | tail -20",
  "timeout": 60000
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/packages/core/src/handlers/styling-diagnostics.ts",
  "old_string": "export function detectTokenPrefix(propNames: string[]): string | null {\n  if (propNames.length === 0) return null;\n  // Strip leading \"--\", split on \"-\", find longest common prefix of segments\n  const segments = propNames.map((n) => n.replace(/^--/, '').split('-'));\n  const first = segments[0];\n  let commonLen = first.length;\n  for (let i = 1; i < segments.length; i++) {\n    let j = 0;\n    while (j < commonLen && j < segments[i].length && segments[i][j] === first[j]) j++;\n    commonLen = j;\n  }\n  if (commonLen === 0) return null;\n  // Require at least 2 segments (e.g. \"--hx-\") to qualify as a namespace prefix\n  if (commonLen < 2) return null;\n  return '--' + first.slice(0, commonLen).join('-') + '-';\n}",
  "new_string": "export function detectTokenPrefix(propNames: string[]): string | null {\n  if (propNames.length === 0) return null;\n  // Strip leading \"--\", split on \"-\", find longest common prefix of segments\n  const segments = propNames.map((n) => n.replace(/^--/, '').split('-'));\n  const first = segments[0];\n  if (!first) return null;\n  let commonLen = first.length;\n  for (let i = 1; i < segments.length; i++) {\n    const seg = segments[i];\n    if (!seg) { commonLen = 0; break; }\n    let j = 0;\n    while (j < commonLen && j < seg.length && seg[j] === first[j]) j++;\n    commonLen = j;\n  }\n  if (commonLen === 0) return null;\n  // Require at least 2 segments (e.g. \"--hx-\") to qualify as a namespace prefix\n  if (commonLen < 2) return null;\n  return '--' + first.slice(0, commonLen).join('-') + '-';\n}"
}

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1 | tail -20",
  "timeout": 60000
}
Build passes. Now run the tests:

🔧 Tool: Bash
Input: {
  "command": "npx vitest run tests/handlers/styling-diagnostics.test.ts 2>&1",
  "timeout": 60000
}
The issue is the `commonLen < 2` check — `--sl-` is a single segment prefix (`sl`), so `commonLen=1` suffices. Let me fix:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom/packages/core/src/handlers/styling-diagnostics.ts",
  "old_string": "  if (commonLen === 0) return null;\n  // Require at least 2 segments (e.g. \"--hx-\") to qualify as a namespace prefix\n  if (commonLen < 2) return null;\n  return '--' + first.slice(0, commonLen).join('-') + '-';",
  "new_string": "  if (commonLen === 0) return null;\n  return '--' + first.slice(0, commonLen).join('-') + '-';"
}

🔧 Tool: Bash
Input: {
  "command": "npx vitest run tests/handlers/styling-diagnostics.test.ts 2>&1 | tail -20",
  "timeout": 30000
}
All 33 tests pass. Now rebuild to confirm still clean:

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1",
  "timeout": 60000
}

🔧 Tool: Bash
Input: {
  "command": "git -C /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom diff --stat"
}

🔧 Tool: Bash
Input: {
  "command": "git -C /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-diagnosestyling-shadow-dom status"
}
All 5 intended files changed, nothing extra. The feature is complete.

<summary>
## Summary: Create `diagnose_styling` MCP Tool

### Changes Implemented
- New handler `packages/core/src/handlers/styling-diagnostics.ts` — `diagnoseStyling()` function with helpers: `detectTokenPrefix`, `detectThemingApproach`, `detectDarkModeSupport`, `buildAntiPatterns`, `buildCssSnippet`
- New tool group `packages/core/src/tools/styling.ts` — `STYLING_TOOL_DEFINITIONS`, `handleStylingCall()`, `isStylingTool()`
- Registered in `src/mcp/index.ts` — import, added to `coreTools` array, added dispatcher branch
- Updated `tests/__fixtures__/custom-elements.json` — added `my-badge` (props only, no parts) and `my-divider` (no props, no parts)
- New test `tests/handlers/styling-diagnostics.test.ts` — 33 tests covering all acceptance criteria

### Files Modified
- `packages/core/src/handlers/styling-diagnostics.ts` (new)
- `packages/core/src/tools/styling.ts` (new)
- `src/mcp/index.ts` (modified)
- `tests/__fixtures__/custom-elements.json` (modified)
- `tests/handlers/styling-diagnostics.test.ts` (new)

### Risks/Blockers Encountered
- `detectTokenPrefix` initially used `commonLen < 2` to gate on "at least 2 common segments" — wrong logic. `--sl-` is formed from a single common segment (`sl`). Fixed to `commonLen === 0` guard only.
- TypeScript strict-mode flagged `first` possibly undefined in array indexing — added null guards.

### Learnings
- The token prefix algorithm needed `commonLen >= 1` not `>= 2` — vendor prefixes like `--sl-` are single-segment.
- The `parseCem` return `cssProperties` has `default` at the Zod level but the `ComponentMetadata` interface only types `{name, description}` — needed a cast to access `default`.

### Notes for Developer
- `diagnoseStyling` is registered via the same CEM-guarded pattern as `handleCompositionCall`. No standalone config needed.
- `darkModeSupport` detection is heuristic (property names or description containing "dark"). Real dark-mode detection would require source analysis.
- The Playwright verification step was skipped — this is a pure MCP tool with no UI, so browser-based verification doesn't apply. Build + 33 unit tests are the verification.

### Verification Status
- `npm run build` — exit code 0
- `npx vitest run tests/handlers/styling-diagnostics.test.ts` — 33/33 passed
- `git diff --stat` — exactly 5 files (2 modified, 3 new), no scope creep
- Playwright N/A — MCP tool, no browser surface
</summary>