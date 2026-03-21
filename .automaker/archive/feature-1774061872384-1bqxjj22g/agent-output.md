
🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/src/",
  "description": "List src directory structure"
}

🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/",
  "description": "List root directory"
}

🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/src/handlers/ && ls /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/src/mcp/",
  "description": "List handlers and mcp directories"
}

🔧 Tool: Bash
Input: {
  "command": "ls /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/src/mcp/ 2>/dev/null || echo \"no mcp dir\"; ls /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/src/api/ 2>/dev/null || echo \"no api dir\"",
  "description": "Check mcp and api subdirs"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/src -type f | head -40",
  "description": "Find all source files"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/packages -type f | head -60",
  "description": "Find all package files"
}

🔧 Tool: Bash
Input: {
  "command": "find /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/tests -type f | head -30",
  "description": "Find all test files"
}
Let me read a few key files to understand the patterns.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/packages/core/src/handlers/validate.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/packages/core/src/tools/validate.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/packages/core/src/handlers/cem.ts",
  "offset": 1,
  "limit": 60
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/packages/core/src/shared/mcp-helpers.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/packages/core/src/handlers/cem.ts",
  "offset": 60,
  "limit": 80
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/tests/tools/safety.test.ts"
}
Now I have enough context. Let me check the handler index and how `parseCem` works (mentioned in the instructions).

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/packages/core/src/handlers/index.ts"
}

🔧 Tool: Bash
Input: {
  "command": "grep -n \"parseCem\\|getCssParts\\|getCssProperties\\|cssParts\\|cssProperties\" /Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/packages/core/src/handlers/cem.ts | head -30",
  "description": "Find parseCem or related functions in cem.ts"
}
I have everything I need. Now let me create the handler and tool files.

🔧 Tool: ToolSearch
Input: {
  "query": "select:TodoWrite",
  "max_results": 1
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create shadow-dom-checker handler",
      "activeForm": "Creating shadow-dom-checker handler",
      "status": "in_progress"
    },
    {
      "content": "Create styling.ts tool registration",
      "activeForm": "Creating styling.ts tool registration",
      "status": "pending"
    },
    {
      "content": "Create shadow-dom-checker tests",
      "activeForm": "Creating shadow-dom-checker tests",
      "status": "pending"
    },
    {
      "content": "Build and verify",
      "activeForm": "Building and verifying",
      "status": "pending"
    }
  ]
}
Now let me write the handler first:

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/packages/core/src/handlers/shadow-dom-checker.ts",
  "content": "import type { Cem } from './cem.js';\nimport { parseCem } from './cem.js';\n\nexport type DiagnosticSeverity = 'error' | 'warning' | 'info';\n\nexport interface ShadowDomDiagnostic {\n  type: string;\n  severity: DiagnosticSeverity;\n  line: number;\n  message: string;\n  suggestion: string;\n}\n\nexport interface ShadowDomCheckResult {\n  diagnostics: ShadowDomDiagnostic[];\n}\n\nfunction getLines(css: string): string[] {\n  return css.split('\\n');\n}\n\n/**\n * Detects Shadow DOM styling anti-patterns in consumer CSS or JavaScript.\n *\n * @param css - The CSS (or JS) content string to analyze.\n * @param tagName - Optional custom element tag name to scope CEM-based checks.\n * @param cem - Optional parsed CEM for component-specific checks (parts, custom properties).\n */\nexport function checkShadowDomUsage(css: string, tagName?: string, cem?: Cem): ShadowDomCheckResult {\n  const diagnostics: ShadowDomDiagnostic[] = [];\n  const lines = getLines(css);\n\n  // Resolve known parts and properties from CEM when tagName is provided\n  let knownParts: Set<string> = new Set();\n  let knownProperties: string[] = [];\n\n  if (tagName && cem) {\n    try {\n      const meta = parseCem(tagName, cem);\n      knownParts = new Set(meta.cssParts.map((p) => p.name));\n      knownProperties = meta.cssProperties.map((p) => p.name);\n    } catch {\n      // Component not found in CEM — skip CEM-based checks\n    }\n  }\n\n  for (let i = 0; i < lines.length; i++) {\n    const line = lines[i] ?? '';\n    const lineNumber = i + 1;\n\n    // 1. Shadow DOM piercing: descendant selector after custom element (e.g. sl-button .button__label)\n    // Pattern: custom-element-tag followed by whitespace and a class selector\n    const piercingPattern = /\\b([\\w][\\w-]*-[\\w-]+)\\s+\\.[\\w-]+/g;\n    let m: RegExpExecArray | null;\n    while ((m = piercingPattern.exec(line)) !== null) {\n      diagnostics.push({\n        type: 'shadow-piercing-selector',\n        severity: 'error',\n        line: lineNumber,\n        message: `Descendant selector \"${m[0].trim()}\" attempts to pierce Shadow DOM. Internal classes are not accessible from outside.`,\n        suggestion:\n          'Use ::part() to style exposed parts, or CSS custom properties to customize internals. Example: sl-button::part(base) { color: red; }',\n      });\n    }\n\n    // 2. !important that won't cross shadow boundaries (targeting likely shadow-internal class/element)\n    const importantPattern = /!important/g;\n    while ((importantPattern.exec(line)) !== null) {\n      // Only flag if the rule looks like it's trying to override something inside a web component\n      const trimmed = line.trim();\n      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {\n        diagnostics.push({\n          type: 'important-shadow-boundary',\n          severity: 'warning',\n          line: lineNumber,\n          message: '`!important` cannot override styles inside a Shadow DOM boundary.',\n          suggestion:\n            'Use CSS custom properties (e.g. --sl-color-primary-600) to customize component internals instead of !important overrides.',\n        });\n      }\n    }\n\n    // 3. Incorrect ::part() usage — descendant selector after ::part()\n    const partDescendantPattern = /::part\\([^)]+\\)\\s+[\\w.#[\\s]/g;\n    while ((partDescendantPattern.exec(line)) !== null) {\n      diagnostics.push({\n        type: 'part-descendant-selector',\n        severity: 'error',\n        line: lineNumber,\n        message: `Descendant selector after ::part() is invalid. CSS cannot reach inside a Shadow DOM part's children.`,\n        suggestion:\n          'Apply styles directly to the ::part() selector without further descendants. Example: sl-button::part(base) { font-size: 16px; }',\n      });\n    }\n\n    // 4. Chained ::part() — not valid in CSS\n    const chainedPartPattern = /::part\\([^)]+\\)::part/g;\n    while ((chainedPartPattern.exec(line)) !== null) {\n      diagnostics.push({\n        type: 'chained-part-selector',\n        severity: 'error',\n        line: lineNumber,\n        message: '`::part()::part()` is invalid CSS. Parts cannot be chained.',\n        suggestion:\n          'Use a single ::part() selector. Nested parts must be individually exposed by the component author.',\n      });\n    }\n\n    // 5. ::slotted() in consumer CSS — only valid inside Shadow DOM\n    const slottedPattern = /::slotted\\s*\\(/g;\n    while ((slottedPattern.exec(line)) !== null) {\n      diagnostics.push({\n        type: 'slotted-in-consumer-css',\n        severity: 'error',\n        line: lineNumber,\n        message: '`::slotted()` is only valid inside a Shadow DOM stylesheet, not in consumer CSS.',\n        suggestion:\n          'Style slotted content directly via regular CSS selectors in your consumer stylesheet, targeting the elements you slot in.',\n      });\n    }\n\n    // 6. JavaScript shadow root penetration\n    const jsPenetrationPattern = /shadowRoot\\s*\\.\\s*(querySelector|getElementById|style)/g;\n    while ((jsPenetrationPattern.exec(line)) !== null) {\n      diagnostics.push({\n        type: 'js-shadow-penetration',\n        severity: 'warning',\n        line: lineNumber,\n        message: '`shadowRoot.querySelector/getElementById/style` directly manipulates Shadow DOM internals.',\n        suggestion:\n          'Use the component\\'s public API (properties, attributes, events, CSS custom properties, or ::part()) instead of accessing shadowRoot directly.',\n      });\n    }\n\n    // CEM-based checks (only when tagName + cem provided)\n    if (tagName && cem && knownParts.size >= 0) {\n      // 7. Unknown ::part() name — check against CEM\n      const partNamePattern = /::part\\(\\s*([\\w-]+)\\s*\\)/g;\n      while ((m = partNamePattern.exec(line)) !== null) {\n        const partName = m[1] ?? '';\n        // Only flag if we have a known parts list from CEM and the part isn't in it\n        if (knownParts.size > 0 && partName && !knownParts.has(partName)) {\n          diagnostics.push({\n            type: 'unknown-css-part',\n            severity: 'warning',\n            line: lineNumber,\n            message: `\"${partName}\" is not an exposed CSS part on <${tagName}>. Known parts: ${Array.from(knownParts).join(', ') || '(none)'}.`,\n            suggestion: `Check the component's documentation for valid parts. Valid parts: ${Array.from(knownParts).join(', ') || '(none)'}.`,\n          });\n        }\n      }\n\n      // 8. Fuzzy-match CSS custom properties against known ones\n      const cssVarUsagePattern = /var\\(\\s*(--[\\w-]+)/g;\n      while ((m = cssVarUsagePattern.exec(line)) !== null) {\n        const usedProp = m[1] ?? '';\n        if (knownProperties.length > 0 && usedProp && !knownProperties.includes(usedProp)) {\n          // Check for close match via simple prefix similarity\n          const closeMatch = findCloseMatch(usedProp, knownProperties);\n          if (closeMatch) {\n            diagnostics.push({\n              type: 'wrong-css-custom-property',\n              severity: 'info',\n              line: lineNumber,\n              message: `CSS custom property \"${usedProp}\" is not documented for <${tagName}>. Did you mean \"${closeMatch}\"?`,\n              suggestion: `Use \"${closeMatch}\" instead. Run the list_component_info tool for all documented custom properties.`,\n            });\n          }\n        }\n      }\n    }\n  }\n\n  return { diagnostics };\n}\n\nfunction findCloseMatch(name: string, candidates: string[]): string | null {\n  let best: string | null = null;\n  let bestDist = Infinity;\n  for (const c of candidates) {\n    const d = levenshtein(name, c);\n    if (d < bestDist && d <= 4) {\n      bestDist = d;\n      best = c;\n    }\n  }\n  return best;\n}\n\nfunction levenshtein(a: string, b: string): number {\n  const rows = a.length + 1;\n  const cols = b.length + 1;\n  const dp: number[] = Array.from({ length: rows * cols }, (_, k) => {\n    const i = Math.floor(k / cols);\n    const j = k % cols;\n    return i === 0 ? j : j === 0 ? i : 0;\n  });\n  for (let i = 1; i < rows; i++) {\n    for (let j = 1; j < cols; j++) {\n      const idx = i * cols + j;\n      dp[idx] =\n        a[i - 1] === b[j - 1]\n          ? (dp[(i - 1) * cols + (j - 1)] ?? 0)\n          : 1 +\n            Math.min(\n              dp[(i - 1) * cols + j] ?? 0,\n              dp[i * cols + (j - 1)] ?? 0,\n              dp[(i - 1) * cols + (j - 1)] ?? 0,\n            );\n    }\n  }\n  return dp[(rows - 1) * cols + (cols - 1)] ?? 0;\n}\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create shadow-dom-checker handler",
      "activeForm": "Creating shadow-dom-checker handler",
      "status": "completed"
    },
    {
      "content": "Create styling.ts tool registration",
      "activeForm": "Creating styling.ts tool registration",
      "status": "in_progress"
    },
    {
      "content": "Create shadow-dom-checker tests",
      "activeForm": "Creating shadow-dom-checker tests",
      "status": "pending"
    },
    {
      "content": "Build and verify",
      "activeForm": "Building and verifying",
      "status": "pending"
    }
  ]
}

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/packages/core/src/tools/styling.ts",
  "content": "import { z } from 'zod';\nimport type { Cem } from '../handlers/cem.js';\nimport { checkShadowDomUsage } from '../handlers/shadow-dom-checker.js';\nimport { createErrorResponse, createSuccessResponse } from '../shared/mcp-helpers.js';\nimport type { MCPToolResult } from '../shared/mcp-helpers.js';\nimport { handleToolError } from '../shared/error-handling.js';\n\nconst CheckShadowDomUsageArgsSchema = z.object({\n  css: z.string().max(100_000, 'css must not exceed 100,000 characters'),\n  tagName: z.string().optional(),\n});\n\nexport const STYLING_TOOL_DEFINITIONS = [\n  {\n    name: 'check_shadow_dom_usage',\n    description:\n      'Analyzes consumer CSS or JavaScript for Shadow DOM styling anti-patterns. Detects: descendant selectors that pierce Shadow DOM, !important that won\\'t cross shadow boundaries, incorrect ::part() usage (unknown parts, chained parts, descendant selectors after ::part), ::slotted() misuse in consumer CSS, and JavaScript shadowRoot penetration. Returns an array of diagnostics with severity, line numbers, and suggested fixes.',\n    inputSchema: {\n      type: 'object' as const,\n      properties: {\n        libraryId: {\n          type: 'string',\n          description:\n            'Optional library ID to target a specific loaded library instead of the default.',\n        },\n        css: {\n          type: 'string',\n          description: 'The CSS (or JS) content string to analyze for Shadow DOM anti-patterns.',\n        },\n        tagName: {\n          type: 'string',\n          description:\n            'Optional custom element tag name (e.g. \"sl-button\") to enable CEM-based checks for unknown ::part() names and incorrect CSS custom property names.',\n        },\n      },\n      required: ['css'],\n      additionalProperties: false,\n    },\n  },\n];\n\n/**\n * Dispatches a styling tool call by name and returns an MCPToolResult.\n */\nexport function handleStylingCall(\n  name: string,\n  args: Record<string, unknown>,\n  cem: Cem,\n): MCPToolResult {\n  try {\n    if (name === 'check_shadow_dom_usage') {\n      const { css, tagName } = CheckShadowDomUsageArgsSchema.parse(args);\n      const result = checkShadowDomUsage(css, tagName, cem);\n      const formatted = formatDiagnostics(result.diagnostics, tagName);\n      return createSuccessResponse(formatted);\n    }\n    return createErrorResponse(`Unknown styling tool: ${name}`);\n  } catch (err) {\n    const mcpErr = handleToolError(err);\n    return createErrorResponse(`[${mcpErr.category}] ${mcpErr.message}`);\n  }\n}\n\n/**\n * Returns true if the given tool name belongs to the styling tool group.\n */\nexport function isStylingTool(name: string): boolean {\n  return STYLING_TOOL_DEFINITIONS.some((t) => t.name === name);\n}\n\nfunction formatDiagnostics(\n  diagnostics: ReturnType<typeof checkShadowDomUsage>['diagnostics'],\n  tagName?: string,\n): string {\n  const header = tagName\n    ? `Shadow DOM Usage Check${tagName ? ` for <${tagName}>` : ''}:`\n    : 'Shadow DOM Usage Check:';\n\n  const lines: string[] = [header];\n\n  if (diagnostics.length === 0) {\n    lines.push('No Shadow DOM anti-patterns detected.');\n    return lines.join('\\n');\n  }\n\n  for (const d of diagnostics) {\n    const icon = d.severity === 'error' ? '[ERROR]' : d.severity === 'warning' ? '[WARN]' : '[INFO]';\n    lines.push(`${icon} Line ${d.line} (${d.type}): ${d.message}`);\n    lines.push(`  Suggestion: ${d.suggestion}`);\n  }\n\n  const errors = diagnostics.filter((d) => d.severity === 'error').length;\n  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;\n  lines.push('');\n  lines.push(`Summary: ${diagnostics.length} issue(s) found — ${errors} error(s), ${warnings} warning(s).`);\n\n  return lines.join('\\n');\n}\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create shadow-dom-checker handler",
      "activeForm": "Creating shadow-dom-checker handler",
      "status": "completed"
    },
    {
      "content": "Create styling.ts tool registration",
      "activeForm": "Creating styling.ts tool registration",
      "status": "completed"
    },
    {
      "content": "Create shadow-dom-checker tests",
      "activeForm": "Creating shadow-dom-checker tests",
      "status": "in_progress"
    },
    {
      "content": "Build and verify",
      "activeForm": "Building and verifying",
      "status": "pending"
    }
  ]
}
Now write the test file:

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-new-mcp-tool-checkshadowdomusage-anti/tests/handlers/shadow-dom-checker.test.ts",
  "content": "import { describe, it, expect } from 'vitest';\nimport { checkShadowDomUsage } from '../../packages/core/src/handlers/shadow-dom-checker.js';\nimport type { Cem } from '../../packages/core/src/handlers/cem.js';\n\n// Minimal CEM fixture with a sl-button component\nconst minimalCem: Cem = {\n  schemaVersion: '1.0.0',\n  modules: [\n    {\n      kind: 'javascript-module',\n      path: 'src/components/button/button.js',\n      declarations: [\n        {\n          kind: 'class',\n          name: 'SlButton',\n          tagName: 'sl-button',\n          cssParts: [\n            { name: 'base', description: 'The component base wrapper.' },\n            { name: 'label', description: 'The button label.' },\n          ],\n          cssProperties: [\n            { name: '--sl-color-primary-600', description: 'Primary color.' },\n            { name: '--sl-border-radius-medium', description: 'Border radius.' },\n          ],\n        },\n      ],\n    },\n  ],\n};\n\ndescribe('checkShadowDomUsage — shadow piercing selector', () => {\n  it('flags descendant selector after custom element tag', () => {\n    const css = `sl-button .button__label { color: red; }`;\n    const result = checkShadowDomUsage(css);\n    const match = result.diagnostics.find((d) => d.type === 'shadow-piercing-selector');\n    expect(match).toBeDefined();\n    expect(match?.severity).toBe('error');\n    expect(match?.line).toBe(1);\n    expect(match?.suggestion).toMatch(/::part\\(\\)/);\n  });\n\n  it('flags multi-word custom element descendant selector', () => {\n    const css = `my-nav-bar .nav-item { font-size: 14px; }`;\n    const result = checkShadowDomUsage(css);\n    expect(result.diagnostics.some((d) => d.type === 'shadow-piercing-selector')).toBe(true);\n  });\n\n  it('does NOT flag non-custom-element selectors', () => {\n    const css = `.container .button { color: red; }`;\n    const result = checkShadowDomUsage(css);\n    expect(result.diagnostics.some((d) => d.type === 'shadow-piercing-selector')).toBe(false);\n  });\n});\n\ndescribe('checkShadowDomUsage — !important abuse', () => {\n  it('flags !important usage', () => {\n    const css = `sl-button { color: red !important; }`;\n    const result = checkShadowDomUsage(css);\n    const match = result.diagnostics.find((d) => d.type === 'important-shadow-boundary');\n    expect(match).toBeDefined();\n    expect(match?.severity).toBe('warning');\n    expect(match?.suggestion).toMatch(/CSS custom properties/);\n  });\n\n  it('flags !important on its own line', () => {\n    const css = `  color: blue !important;`;\n    const result = checkShadowDomUsage(css);\n    expect(result.diagnostics.some((d) => d.type === 'important-shadow-boundary')).toBe(true);\n  });\n});\n\ndescribe('checkShadowDomUsage — descendant after ::part()', () => {\n  it('flags descendant selector after ::part()', () => {\n    const css = `sl-button::part(base) span { font-size: 16px; }`;\n    const result = checkShadowDomUsage(css);\n    const match = result.diagnostics.find((d) => d.type === 'part-descendant-selector');\n    expect(match).toBeDefined();\n    expect(match?.severity).toBe('error');\n    expect(match?.line).toBe(1);\n  });\n\n  it('flags class descendant selector after ::part()', () => {\n    const css = `sl-button::part(base) .inner { color: blue; }`;\n    const result = checkShadowDomUsage(css);\n    expect(result.diagnostics.some((d) => d.type === 'part-descendant-selector')).toBe(true);\n  });\n\n  it('does NOT flag valid ::part() usage without descendants', () => {\n    const css = `sl-button::part(base) { color: blue; }`;\n    const result = checkShadowDomUsage(css);\n    expect(result.diagnostics.some((d) => d.type === 'part-descendant-selector')).toBe(false);\n  });\n});\n\ndescribe('checkShadowDomUsage — chained ::part()', () => {\n  it('flags chained ::part()::part()', () => {\n    const css = `sl-button::part(base)::part(inner) { color: red; }`;\n    const result = checkShadowDomUsage(css);\n    const match = result.diagnostics.find((d) => d.type === 'chained-part-selector');\n    expect(match).toBeDefined();\n    expect(match?.severity).toBe('error');\n    expect(match?.message).toMatch(/chained/i);\n  });\n});\n\ndescribe('checkShadowDomUsage — ::slotted() in consumer CSS', () => {\n  it('flags ::slotted() used in consumer CSS', () => {\n    const css = `::slotted(p) { color: blue; }`;\n    const result = checkShadowDomUsage(css);\n    const match = result.diagnostics.find((d) => d.type === 'slotted-in-consumer-css');\n    expect(match).toBeDefined();\n    expect(match?.severity).toBe('error');\n    expect(match?.suggestion).toMatch(/slotted content/);\n  });\n\n  it('flags ::slotted() with element argument', () => {\n    const css = `  ::slotted(span) { font-weight: bold; }`;\n    const result = checkShadowDomUsage(css);\n    expect(result.diagnostics.some((d) => d.type === 'slotted-in-consumer-css')).toBe(true);\n  });\n});\n\ndescribe('checkShadowDomUsage — JS shadow penetration', () => {\n  it('flags shadowRoot.querySelector', () => {\n    const js = `el.shadowRoot.querySelector('.internal').style.color = 'red';`;\n    const result = checkShadowDomUsage(js);\n    const match = result.diagnostics.find((d) => d.type === 'js-shadow-penetration');\n    expect(match).toBeDefined();\n    expect(match?.severity).toBe('warning');\n    expect(match?.suggestion).toMatch(/public API/);\n  });\n\n  it('flags shadowRoot.getElementById', () => {\n    const js = `const el = component.shadowRoot.getElementById('btn');`;\n    const result = checkShadowDomUsage(js);\n    expect(result.diagnostics.some((d) => d.type === 'js-shadow-penetration')).toBe(true);\n  });\n\n  it('flags shadowRoot.style', () => {\n    const js = `component.shadowRoot.style.display = 'none';`;\n    const result = checkShadowDomUsage(js);\n    expect(result.diagnostics.some((d) => d.type === 'js-shadow-penetration')).toBe(true);\n  });\n});\n\ndescribe('checkShadowDomUsage — unknown ::part() name (CEM-based)', () => {\n  it('flags unknown part name when CEM is provided', () => {\n    const css = `sl-button::part(nonexistent) { color: blue; }`;\n    const result = checkShadowDomUsage(css, 'sl-button', minimalCem);\n    const match = result.diagnostics.find((d) => d.type === 'unknown-css-part');\n    expect(match).toBeDefined();\n    expect(match?.severity).toBe('warning');\n    expect(match?.message).toContain('nonexistent');\n    expect(match?.message).toContain('sl-button');\n  });\n\n  it('does NOT flag known part names', () => {\n    const css = `sl-button::part(base) { color: blue; }`;\n    const result = checkShadowDomUsage(css, 'sl-button', minimalCem);\n    expect(result.diagnostics.some((d) => d.type === 'unknown-css-part')).toBe(false);\n  });\n\n  it('skips CEM checks when no CEM provided', () => {\n    const css = `sl-button::part(nonexistent) { color: blue; }`;\n    const result = checkShadowDomUsage(css, 'sl-button');\n    expect(result.diagnostics.some((d) => d.type === 'unknown-css-part')).toBe(false);\n  });\n});\n\ndescribe('checkShadowDomUsage — wrong CSS custom property (CEM-based)', () => {\n  it('flags typo in CSS custom property with a close match', () => {\n    // sl-color-primary-60 is close to --sl-color-primary-600\n    const css = `sl-button { color: var(--sl-color-primary-60); }`;\n    const result = checkShadowDomUsage(css, 'sl-button', minimalCem);\n    const match = result.diagnostics.find((d) => d.type === 'wrong-css-custom-property');\n    expect(match).toBeDefined();\n    expect(match?.severity).toBe('info');\n    expect(match?.message).toContain('--sl-color-primary-60');\n    expect(match?.suggestion).toContain('--sl-color-primary-600');\n  });\n\n  it('does NOT flag correct CSS custom property', () => {\n    const css = `sl-button { color: var(--sl-color-primary-600); }`;\n    const result = checkShadowDomUsage(css, 'sl-button', minimalCem);\n    expect(result.diagnostics.some((d) => d.type === 'wrong-css-custom-property')).toBe(false);\n  });\n});\n\ndescribe('checkShadowDomUsage — clean CSS', () => {\n  it('returns no diagnostics for valid CSS', () => {\n    const css = `\nsl-button::part(base) { color: red; }\nsl-button { --sl-color-primary-600: hotpink; }\n    `.trim();\n    const result = checkShadowDomUsage(css, 'sl-button', minimalCem);\n    expect(result.diagnostics).toHaveLength(0);\n  });\n\n  it('returns empty diagnostics for empty input', () => {\n    const result = checkShadowDomUsage('');\n    expect(result.diagnostics).toHaveLength(0);\n  });\n});\n\ndescribe('checkShadowDomUsage — line numbers', () => {\n  it('reports correct line numbers for multi-line CSS', () => {\n    const css = [\n      `sl-button::part(base) { color: red; }`,\n      `/* comment */`,\n      `::slotted(p) { margin: 0; }`,\n    ].join('\\n');\n    const result = checkShadowDomUsage(css);\n    const slotted = result.diagnostics.find((d) => d.type === 'slotted-in-consumer-css');\n    expect(slotted?.line).toBe(3);\n  });\n});\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create shadow-dom-checker handler",
      "activeForm": "Creating shadow-dom-checker handler",
      "status": "completed"
    },
    {
      "content": "Create styling.ts tool registration",
      "activeForm": "Creating styling.ts tool registration",
      "status": "completed"
    },
    {
      "content": "Create shadow-dom-checker tests",
      "activeForm": "Creating shadow-dom-checker tests",
      "status": "completed"
    },
    {
      "content": "Build and verify",
      "activeForm": "Building and verifying",
      "status": "in_progress"
    }
  ]
}

🔧 Tool: Bash
Input: {
  "command": "cat package.json | grep -E '\"build|scripts\"' -A 20 | head -30",
  "description": "Check build scripts"
}

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1",
  "description": "Run build",
  "timeout": 60000
}
Build succeeds. Now run the tests:

🔧 Tool: Bash
Input: {
  "command": "npm run test -- tests/handlers/shadow-dom-checker.test.ts 2>&1",
  "description": "Run shadow-dom-checker tests",
  "timeout": 60000
}
All 22 tests pass. Let me also verify the git diff to confirm only the intended files were changed:

🔧 Tool: Bash
Input: {
  "command": "git diff --stat",
  "description": "Check git diff stat"
}

🔧 Tool: Bash
Input: {
  "command": "git status",
  "description": "Check git status"
}
Exactly 3 new files, nothing else modified.

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create shadow-dom-checker handler",
      "activeForm": "Creating shadow-dom-checker handler",
      "status": "completed"
    },
    {
      "content": "Create styling.ts tool registration",
      "activeForm": "Creating styling.ts tool registration",
      "status": "completed"
    },
    {
      "content": "Create shadow-dom-checker tests",
      "activeForm": "Creating shadow-dom-checker tests",
      "status": "completed"
    },
    {
      "content": "Build and verify",
      "activeForm": "Building and verifying",
      "status": "completed"
    }
  ]
}
Note: The feature description mentions a Playwright verification step, but this is a pure TypeScript/MCP tool with no browser UI — Playwright is not applicable here. The vitest test suite fully covers all 6 anti-pattern types.

<summary>
## Summary: Create check_shadow_dom_usage MCP Tool

### Changes Implemented
- Handler `checkShadowDomUsage()` detecting 6 Shadow DOM anti-patterns + 2 CEM-based checks (unknown parts, fuzzy CSS custom property matching)
- Tool registration `STYLING_TOOL_DEFINITIONS` with `handleStylingCall()` and `isStylingTool()` dispatcher
- 22 tests covering each anti-pattern type, line number accuracy, clean CSS (no false positives), and CEM-scoped checks

### Files Modified
- `packages/core/src/handlers/shadow-dom-checker.ts` (new)
- `packages/core/src/tools/styling.ts` (new)
- `tests/handlers/shadow-dom-checker.test.ts` (new)

### Risks/Blockers Encountered
- None. Build and all 22 tests pass cleanly.

### Learnings
- The feature description said `src/handlers/` but actual code lives in `packages/core/src/handlers/` — used the correct path
- `parseCem()` is already exported from `cem.ts` — no helper needed, used it directly for CEM-based checks
- Pattern for tool groups: `TOOL_DEFINITIONS` array + `handleXxxCall()` + `isXxxTool()` — followed consistently

### Notes for Developer
- `styling.ts` tool group is not yet wired into the MCP server dispatch (that's a separate integration feature per scope discipline)
- `parseCem()` throws if `tagName` is not in CEM — the handler catches this gracefully and skips CEM checks
- The `::part()` descendant check regex `::part\([^)]+\)\s+[\w.#[\s]` uses character class `[\s` which intentionally also matches the space already consumed — tested working correctly

### Verification Status
- Build: `npm run build` → exit 0
- Tests: `vitest run tests/handlers/shadow-dom-checker.test.ts` → 22/22 passed
- Playwright: Not applicable (MCP tool, no browser UI to verify)
</summary>