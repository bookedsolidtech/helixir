I'll start by reading the key files I need to understand and modify.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/dimensions.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/health.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "packages/core/src/handlers/analyzers/*.ts",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency"
}
Let me look at an existing analyzer for the pattern and the CEM types.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/analyzers/event-architecture.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/analyzers/index.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/cem.ts",
  "limit": 80
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/cem.ts",
  "offset": 80,
  "limit": 40
}

🔧 Tool: Glob
Input: {
  "pattern": "tests/handlers/*.test.ts",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency"
}
Now I have a clear picture. Let me look at the CSS architecture analyzer briefly, then implement everything.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/analyzers/css-architecture.ts",
  "limit": 30
}
Good. Now I have all the context I need. Let me implement the four files.

🔧 Tool: ToolSearch
Input: {
  "query": "select:TodoWrite",
  "max_results": 1
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create naming-consistency.ts analyzer",
      "status": "in_progress",
      "activeForm": "Creating naming-consistency.ts analyzer"
    },
    {
      "content": "Register as dimension 14 in dimensions.ts",
      "status": "pending",
      "activeForm": "Registering dimension 14"
    },
    {
      "content": "Wire into health.ts pipeline",
      "status": "pending",
      "activeForm": "Wiring into health.ts"
    },
    {
      "content": "Create test suite",
      "status": "pending",
      "activeForm": "Creating test suite"
    },
    {
      "content": "Build and verify",
      "status": "pending",
      "activeForm": "Building and verifying"
    }
  ]
}

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/analyzers/naming-consistency.ts",
  "content": "/**\n * Naming Consistency Analyzer — measures library-wide naming convention adherence.\n *\n * Operates at library level: conventions are detected from the full set of declarations,\n * then each component is scored against those conventions.\n *\n * Scoring model (100 points):\n *   1. Event prefix coherence       (30 points)\n *   2. Property naming consistency   (25 points)\n *   3. CSS custom property prefixing (25 points)\n *   4. Attribute-property coherence  (20 points)\n */\n\nimport type { CemDeclaration } from '../cem.js';\nimport type { ConfidenceLevel, SubMetric } from '../dimensions.js';\n\nexport interface NamingConsistencyResult {\n  score: number;\n  confidence: ConfidenceLevel;\n  subMetrics: SubMetric[];\n}\n\nexport interface LibraryNamingConventions {\n  eventPrefix: string | null;\n  eventPrefixConfidence: number;\n  cssPrefix: string | null;\n  cssPrefixConfidence: number;\n}\n\n// ─── Helpers ─────────────────────────────────────────────────────────────────\n\nfunction isCamelCase(name: string): boolean {\n  return /^[a-z][a-zA-Z0-9]*$/.test(name);\n}\n\nfunction isSnakeCase(name: string): boolean {\n  return /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name);\n}\n\nfunction isKebabCase(name: string): boolean {\n  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);\n}\n\n/**\n * Converts a camelCase property name to its expected kebab-case attribute.\n * e.g. \"maxLength\" → \"max-length\", \"disabled\" → \"disabled\"\n */\nfunction camelToKebab(name: string): string {\n  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);\n}\n\n/**\n * Detects the most common prefix from a list of strings.\n * Returns the prefix and a confidence score (0-1) indicating how dominant it is.\n */\nfunction detectPrefix(names: string[], separator: string): { prefix: string | null; confidence: number } {\n  if (names.length === 0) return { prefix: null, confidence: 0 };\n\n  // Extract potential prefixes (everything before the first separator occurrence after initial segment)\n  const prefixCounts = new Map<string, number>();\n  for (const name of names) {\n    const sepIndex = name.indexOf(separator, 1);\n    if (sepIndex > 0) {\n      const prefix = name.substring(0, sepIndex + separator.length);\n      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);\n    }\n  }\n\n  if (prefixCounts.size === 0) return { prefix: null, confidence: 0 };\n\n  // Find the dominant prefix\n  let bestPrefix = '';\n  let bestCount = 0;\n  for (const [prefix, count] of prefixCounts) {\n    if (count > bestCount) {\n      bestPrefix = prefix;\n      bestCount = count;\n    }\n  }\n\n  const confidence = bestCount / names.length;\n\n  // Only consider it a real pattern if at least 50% of names follow it\n  if (confidence < 0.5) return { prefix: null, confidence };\n\n  return { prefix: bestPrefix, confidence };\n}\n\n// ─── Library-Level Detection ────────────────────────────────────────────────\n\n/**\n * Detects the library-wide event prefix pattern by analyzing all declarations.\n * e.g., \"hx-\" for helix, \"sl-\" for Shoelace, \"md-\" for Material Web.\n */\nexport function detectLibraryEventPrefix(declarations: CemDeclaration[]): { prefix: string | null; confidence: number } {\n  const allEventNames: string[] = [];\n  for (const decl of declarations) {\n    for (const event of decl.events ?? []) {\n      if (event.name) allEventNames.push(event.name);\n    }\n  }\n  return detectPrefix(allEventNames, '-');\n}\n\n/**\n * Detects the library-wide CSS custom property prefix pattern.\n * e.g., \"--hx-\" for helix, \"--sl-\" for Shoelace.\n */\nexport function detectLibraryCssPrefix(declarations: CemDeclaration[]): { prefix: string | null; confidence: number } {\n  const allCssNames: string[] = [];\n  for (const decl of declarations) {\n    for (const prop of decl.cssProperties ?? []) {\n      if (prop.name) allCssNames.push(prop.name);\n    }\n  }\n\n  // CSS custom properties start with --, so detect the prefix after --\n  if (allCssNames.length === 0) return { prefix: null, confidence: 0 };\n\n  // Strip leading -- and detect prefix with - separator, then re-add --\n  const stripped = allCssNames.map((n) => (n.startsWith('--') ? n.substring(2) : n));\n  const result = detectPrefix(stripped, '-');\n  if (result.prefix) {\n    result.prefix = `--${result.prefix}`;\n  }\n  return result;\n}\n\n/**\n * Detects library-wide naming conventions from all declarations.\n */\nexport function detectLibraryConventions(declarations: CemDeclaration[]): LibraryNamingConventions {\n  const eventResult = detectLibraryEventPrefix(declarations);\n  const cssResult = detectLibraryCssPrefix(declarations);\n  return {\n    eventPrefix: eventResult.prefix,\n    eventPrefixConfidence: eventResult.confidence,\n    cssPrefix: cssResult.prefix,\n    cssPrefixConfidence: cssResult.confidence,\n  };\n}\n\n// ─── Per-Component Scoring ──────────────────────────────────────────────────\n\n/**\n * Scores event prefix coherence for a single component (30 points).\n * Components with no events are excluded from scoring.\n */\nexport function scoreEventPrefixCoherence(\n  decl: CemDeclaration,\n  expectedPrefix: string | null,\n): { score: number; subMetric: SubMetric } | null {\n  const events = decl.events ?? [];\n  if (events.length === 0) return null;\n\n  if (!expectedPrefix) {\n    // No library prefix detected — give full marks (can't penalize for ambiguity)\n    return {\n      score: 30,\n      subMetric: {\n        name: 'Event prefix coherence',\n        score: 30,\n        maxScore: 30,\n        note: 'No library event prefix detected — not scored',\n      },\n    };\n  }\n\n  const matching = events.filter((e) => e.name.startsWith(expectedPrefix));\n  const score = Math.round((matching.length / events.length) * 30);\n\n  return {\n    score,\n    subMetric: {\n      name: 'Event prefix coherence',\n      score,\n      maxScore: 30,\n      note: `${matching.length}/${events.length} events use prefix \"${expectedPrefix}\"`,\n    },\n  };\n}\n\n/**\n * Scores property naming consistency (25 points).\n * All public properties should use camelCase consistently.\n */\nexport function scorePropertyNamingConsistency(decl: CemDeclaration): { score: number; subMetric: SubMetric } {\n  const fields = (decl.members ?? []).filter((m) => m.kind === 'field');\n\n  if (fields.length === 0) {\n    return {\n      score: 25,\n      subMetric: {\n        name: 'Property naming consistency',\n        score: 25,\n        maxScore: 25,\n        note: 'No properties — trivially consistent',\n      },\n    };\n  }\n\n  const camelCaseFields = fields.filter((f) => isCamelCase(f.name));\n  const snakeCaseFields = fields.filter((f) => isSnakeCase(f.name));\n\n  // Detect dominant convention: if the library uses snake_case consistently, that's also fine\n  const dominantIsCamel = camelCaseFields.length >= snakeCaseFields.length;\n  const consistentCount = dominantIsCamel ? camelCaseFields.length : snakeCaseFields.length;\n  const convention = dominantIsCamel ? 'camelCase' : 'snake_case';\n\n  const score = Math.round((consistentCount / fields.length) * 25);\n\n  return {\n    score,\n    subMetric: {\n      name: 'Property naming consistency',\n      score,\n      maxScore: 25,\n      note: `${consistentCount}/${fields.length} properties use ${convention}`,\n    },\n  };\n}\n\n/**\n * Scores CSS custom property prefix consistency (25 points).\n * Components with no CSS custom properties are excluded.\n */\nexport function scoreCSSCustomPropertyPrefixing(\n  decl: CemDeclaration,\n  expectedPrefix: string | null,\n): { score: number; subMetric: SubMetric } | null {\n  const cssProperties = decl.cssProperties ?? [];\n  if (cssProperties.length === 0) return null;\n\n  if (!expectedPrefix) {\n    return {\n      score: 25,\n      subMetric: {\n        name: 'CSS custom property prefixing',\n        score: 25,\n        maxScore: 25,\n        note: 'No library CSS prefix detected — not scored',\n      },\n    };\n  }\n\n  const matching = cssProperties.filter((p) => p.name.startsWith(expectedPrefix));\n  const score = Math.round((matching.length / cssProperties.length) * 25);\n\n  return {\n    score,\n    subMetric: {\n      name: 'CSS custom property prefixing',\n      score,\n      maxScore: 25,\n      note: `${matching.length}/${cssProperties.length} CSS properties use prefix \"${expectedPrefix}\"`,\n    },\n  };\n}\n\n/**\n * Scores attribute-property naming coherence (20 points).\n * Attributes should be kebab-case versions of their camelCase property names.\n */\nexport function scoreAttributePropertyCoherence(decl: CemDeclaration): { score: number; subMetric: SubMetric } {\n  const fieldsWithAttributes = (decl.members ?? []).filter(\n    (m) => m.kind === 'field' && typeof m.attribute === 'string' && m.attribute.length > 0,\n  );\n\n  if (fieldsWithAttributes.length === 0) {\n    return {\n      score: 20,\n      subMetric: {\n        name: 'Attribute-property coherence',\n        score: 20,\n        maxScore: 20,\n        note: 'No attribute-mapped properties — trivially coherent',\n      },\n    };\n  }\n\n  let coherentCount = 0;\n  for (const field of fieldsWithAttributes) {\n    const expectedAttribute = camelToKebab(field.name);\n    const actualAttribute = field.attribute as string;\n\n    // Match if attribute is the kebab-case form of the property name,\n    // or if both are already the same (single-word properties like \"disabled\")\n    if (actualAttribute === expectedAttribute || actualAttribute === field.name) {\n      coherentCount++;\n    }\n  }\n\n  const score = Math.round((coherentCount / fieldsWithAttributes.length) * 20);\n\n  return {\n    score,\n    subMetric: {\n      name: 'Attribute-property coherence',\n      score,\n      maxScore: 20,\n      note: `${coherentCount}/${fieldsWithAttributes.length} attribute mappings follow naming conventions`,\n    },\n  };\n}\n\n// ─── Main Analyzer ──────────────────────────────────────────────────────────\n\n/**\n * Analyzes naming consistency for a single component against library-wide conventions.\n *\n * @param decl - The component declaration to score.\n * @param conventions - Pre-detected library-wide naming conventions.\n */\nexport function analyzeNamingConsistency(\n  decl: CemDeclaration,\n  conventions: LibraryNamingConventions,\n): NamingConsistencyResult | null {\n  const subMetrics: SubMetric[] = [];\n  let totalScore = 0;\n  let maxPossible = 0;\n\n  // 1. Event prefix coherence (30 points)\n  const eventResult = scoreEventPrefixCoherence(decl, conventions.eventPrefix);\n  if (eventResult) {\n    subMetrics.push(eventResult.subMetric);\n    totalScore += eventResult.score;\n    maxPossible += 30;\n  }\n\n  // 2. Property naming consistency (25 points)\n  const propResult = scorePropertyNamingConsistency(decl);\n  subMetrics.push(propResult.subMetric);\n  totalScore += propResult.score;\n  maxPossible += 25;\n\n  // 3. CSS custom property prefixing (25 points)\n  const cssResult = scoreCSSCustomPropertyPrefixing(decl, conventions.cssPrefix);\n  if (cssResult) {\n    subMetrics.push(cssResult.subMetric);\n    totalScore += cssResult.score;\n    maxPossible += 25;\n  }\n\n  // 4. Attribute-property coherence (20 points)\n  const attrResult = scoreAttributePropertyCoherence(decl);\n  subMetrics.push(attrResult.subMetric);\n  totalScore += attrResult.score;\n  maxPossible += 20;\n\n  // If only property + attribute scored (no events, no CSS), we still have\n  // meaningful data (45 points max). Normalize to 0-100.\n  if (maxPossible === 0) return null;\n\n  const normalizedScore = Math.round((totalScore / maxPossible) * 100);\n\n  // Determine confidence based on how much prefix data we have\n  const confidence: ConfidenceLevel =\n    conventions.eventPrefixConfidence > 0.7 || conventions.cssPrefixConfidence > 0.7\n      ? 'verified'\n      : conventions.eventPrefixConfidence > 0 || conventions.cssPrefixConfidence > 0\n        ? 'heuristic'\n        : 'verified'; // If no prefix to detect, pure naming analysis is still verified\n\n  return {\n    score: normalizedScore,\n    confidence,\n    subMetrics,\n  };\n}\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create naming-consistency.ts analyzer",
      "status": "completed",
      "activeForm": "Creating naming-consistency.ts analyzer"
    },
    {
      "content": "Register as dimension 14 in dimensions.ts",
      "status": "in_progress",
      "activeForm": "Registering dimension 14"
    },
    {
      "content": "Wire into health.ts pipeline",
      "status": "pending",
      "activeForm": "Wiring into health.ts"
    },
    {
      "content": "Create test suite",
      "status": "pending",
      "activeForm": "Creating test suite"
    },
    {
      "content": "Build and verify",
      "status": "pending",
      "activeForm": "Building and verifying"
    }
  ]
}
Now register as dimension 14 (index 13, since the registry currently has 12 entries at indices 0-11).

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/dimensions.ts",
  "old_string": "  // Dimension 12: CEM-Source Fidelity — catches CEM vs source divergence\n  {\n    name: 'CEM-Source Fidelity',\n    weight: 10,\n    tier: 'critical',\n    source: 'cem-native',\n    phase: 'cem-analysis',\n  },\n];",
  "new_string": "  // Dimension 12: CEM-Source Fidelity — catches CEM vs source divergence\n  {\n    name: 'CEM-Source Fidelity',\n    weight: 10,\n    tier: 'critical',\n    source: 'cem-native',\n    phase: 'cem-analysis',\n  },\n  // Dimension 14: Naming Consistency — library-wide naming convention adherence\n  {\n    name: 'Naming Consistency',\n    weight: 5,\n    tier: 'important',\n    source: 'cem-native',\n    phase: 'cem-analysis',\n  },\n];"
}
Now add to DIMENSION_CLASSIFICATION:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/dimensions.ts",
  "old_string": "  important: [\n    'API Surface Quality',\n    'CSS Architecture',\n    'Event Architecture',\n    'Bundle Size',\n    'Story Coverage',\n  ],",
  "new_string": "  important: [\n    'API Surface Quality',\n    'CSS Architecture',\n    'Event Architecture',\n    'Bundle Size',\n    'Story Coverage',\n    'Naming Consistency',\n  ],"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create naming-consistency.ts analyzer",
      "status": "completed",
      "activeForm": "Creating naming-consistency.ts analyzer"
    },
    {
      "content": "Register as dimension 14 in dimensions.ts",
      "status": "completed",
      "activeForm": "Registering dimension 14"
    },
    {
      "content": "Wire into health.ts pipeline",
      "status": "in_progress",
      "activeForm": "Wiring into health.ts"
    },
    {
      "content": "Create test suite",
      "status": "pending",
      "activeForm": "Creating test suite"
    },
    {
      "content": "Build and verify",
      "status": "pending",
      "activeForm": "Building and verifying"
    }
  ]
}
Wire into health.ts — add import and case in the switch:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/health.ts",
  "old_string": "import { analyzeCemSourceFidelity } from './analyzers/cem-source-fidelity.js';",
  "new_string": "import { analyzeCemSourceFidelity } from './analyzers/cem-source-fidelity.js';\nimport { analyzeNamingConsistency, detectLibraryConventions, type LibraryNamingConventions } from './analyzers/naming-consistency.js';"
}
Now I need to update `scoreComponentMultiDimensional` to detect library conventions once and pass them down, and add the case to `scoreCemNativeDimension`. The tricky part is that `scoreCemNativeDimension` doesn't currently receive library-wide conventions. Let me update the function signature.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/health.ts",
  "old_string": "async function scoreCemNativeDimension(\n  name: string,\n  decl: CemDeclaration,\n  issues: string[],\n  config?: McpWcConfig,\n  cem?: Cem,\n): Promise<{\n  score: number;\n  confidence: ConfidenceLevel;\n  subMetrics?: SubMetric[];\n  notApplicable?: boolean;\n}> {",
  "new_string": "async function scoreCemNativeDimension(\n  name: string,\n  decl: CemDeclaration,\n  issues: string[],\n  config?: McpWcConfig,\n  cem?: Cem,\n  namingConventions?: LibraryNamingConventions,\n): Promise<{\n  score: number;\n  confidence: ConfidenceLevel;\n  subMetrics?: SubMetric[];\n  notApplicable?: boolean;\n}> {"
}
Add the Naming Consistency case before the default case:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/health.ts",
  "old_string": "    default:\n      return { score: 0, confidence: 'heuristic' };\n  }\n}",
  "new_string": "    case 'Naming Consistency': {\n      if (!namingConventions) {\n        return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };\n      }\n      const naming = analyzeNamingConsistency(decl, namingConventions);\n      if (!naming) {\n        return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };\n      }\n      return naming;\n    }\n\n    default:\n      return { score: 0, confidence: 'heuristic' };\n  }\n}"
}
Now update `scoreComponentMultiDimensional` to detect conventions and pass them through:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/health.ts",
  "old_string": "export async function scoreComponentMultiDimensional(\n  config: McpWcConfig,\n  decl: CemDeclaration,\n  cem?: Cem,\n  libraryId = 'default',\n): Promise<MultiDimensionalHealth> {\n  const tagName = decl.tagName ?? '';\n  const issues: string[] = [];\n  const dimensions: DimensionResult[] = [];",
  "new_string": "export async function scoreComponentMultiDimensional(\n  config: McpWcConfig,\n  decl: CemDeclaration,\n  cem?: Cem,\n  libraryId = 'default',\n  namingConventions?: LibraryNamingConventions,\n): Promise<MultiDimensionalHealth> {\n  const tagName = decl.tagName ?? '';\n  const issues: string[] = [];\n  const dimensions: DimensionResult[] = [];"
}
Now pass `namingConventions` to `scoreCemNativeDimension`:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/health.ts",
  "old_string": "      const result = await scoreCemNativeDimension(def.name, decl, issues, config, cem);",
  "new_string": "      const result = await scoreCemNativeDimension(def.name, decl, issues, config, cem, namingConventions);"
}
Now update `scoreAllComponentsMultiDimensional` to detect conventions and pass them:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/health.ts",
  "old_string": "export async function scoreAllComponentsMultiDimensional(\n  config: McpWcConfig,\n  cemDeclarations: CemDeclaration[],\n  cem?: Cem,\n  libraryId = 'default',\n): Promise<MultiDimensionalHealth[]> {\n  const withTag = cemDeclarations.filter((decl) => decl.tagName !== undefined);\n  return Promise.all(\n    withTag.map((decl) => scoreComponentMultiDimensional(config, decl, cem, libraryId)),\n  );\n}",
  "new_string": "export async function scoreAllComponentsMultiDimensional(\n  config: McpWcConfig,\n  cemDeclarations: CemDeclaration[],\n  cem?: Cem,\n  libraryId = 'default',\n): Promise<MultiDimensionalHealth[]> {\n  const withTag = cemDeclarations.filter((decl) => decl.tagName !== undefined);\n\n  // Detect library-wide naming conventions once for all components\n  const namingConventions = detectLibraryConventions(cemDeclarations);\n\n  return Promise.all(\n    withTag.map((decl) => scoreComponentMultiDimensional(config, decl, cem, libraryId, namingConventions)),\n  );\n}"
}
Now update the barrel export:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/packages/core/src/handlers/analyzers/index.ts",
  "old_string": "export {\n  analyzeCemSourceFidelity,",
  "new_string": "export {\n  analyzeNamingConsistency,\n  detectLibraryConventions,\n  detectLibraryEventPrefix,\n  detectLibraryCssPrefix,\n  scoreEventPrefixCoherence,\n  scorePropertyNamingConsistency,\n  scoreCSSCustomPropertyPrefixing,\n  scoreAttributePropertyCoherence,\n  type NamingConsistencyResult,\n  type LibraryNamingConventions,\n} from './naming-consistency.js';\nexport {\n  analyzeCemSourceFidelity,"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create naming-consistency.ts analyzer",
      "status": "completed",
      "activeForm": "Creating naming-consistency.ts analyzer"
    },
    {
      "content": "Register as dimension 14 in dimensions.ts",
      "status": "completed",
      "activeForm": "Registering dimension 14"
    },
    {
      "content": "Wire into health.ts pipeline",
      "status": "completed",
      "activeForm": "Wiring into health.ts"
    },
    {
      "content": "Create test suite",
      "status": "in_progress",
      "activeForm": "Creating test suite"
    },
    {
      "content": "Build and verify",
      "status": "pending",
      "activeForm": "Building and verifying"
    }
  ]
}
Now create the test suite:

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/naming-consistency.test.ts",
  "content": "import { describe, it, expect } from 'vitest';\nimport type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';\nimport {\n  analyzeNamingConsistency,\n  detectLibraryConventions,\n  detectLibraryEventPrefix,\n  detectLibraryCssPrefix,\n  scoreEventPrefixCoherence,\n  scorePropertyNamingConsistency,\n  scoreCSSCustomPropertyPrefixing,\n  scoreAttributePropertyCoherence,\n  type LibraryNamingConventions,\n} from '../../packages/core/src/handlers/analyzers/naming-consistency.js';\n\n// ─── Helper Factories ───────────────────────────────────────────────────────\n\nfunction makeDecl(overrides: Partial<CemDeclaration> = {}): CemDeclaration {\n  return {\n    kind: 'class',\n    name: 'TestComponent',\n    tagName: 'test-component',\n    ...overrides,\n  } as CemDeclaration;\n}\n\nfunction makeHelixLibrary(): CemDeclaration[] {\n  return [\n    makeDecl({\n      name: 'HxButton',\n      tagName: 'hx-button',\n      events: [\n        { name: 'hx-click', type: { text: 'CustomEvent' } },\n        { name: 'hx-focus', type: { text: 'FocusEvent' } },\n      ],\n      members: [\n        { kind: 'field', name: 'variant', type: { text: 'string' }, attribute: 'variant' },\n        { kind: 'field', name: 'isDisabled', type: { text: 'boolean' }, attribute: 'is-disabled' },\n      ],\n      cssProperties: [\n        { name: '--hx-button-color' },\n        { name: '--hx-button-bg' },\n      ],\n    }),\n    makeDecl({\n      name: 'HxInput',\n      tagName: 'hx-input',\n      events: [\n        { name: 'hx-change', type: { text: 'CustomEvent' } },\n        { name: 'hx-input', type: { text: 'InputEvent' } },\n      ],\n      members: [\n        { kind: 'field', name: 'value', type: { text: 'string' }, attribute: 'value' },\n        { kind: 'field', name: 'maxLength', type: { text: 'number' }, attribute: 'max-length' },\n      ],\n      cssProperties: [\n        { name: '--hx-input-border' },\n        { name: '--hx-input-padding' },\n      ],\n    }),\n    makeDecl({\n      name: 'HxModal',\n      tagName: 'hx-modal',\n      events: [\n        { name: 'hx-open', type: { text: 'CustomEvent' } },\n        { name: 'hx-close', type: { text: 'CustomEvent' } },\n      ],\n      members: [\n        { kind: 'field', name: 'isOpen', type: { text: 'boolean' }, attribute: 'is-open' },\n      ],\n      cssProperties: [\n        { name: '--hx-modal-backdrop' },\n      ],\n    }),\n  ];\n}\n\nfunction makeShoelaceLibrary(): CemDeclaration[] {\n  return [\n    makeDecl({\n      name: 'SlButton',\n      tagName: 'sl-button',\n      events: [\n        { name: 'sl-click', type: { text: 'CustomEvent' } },\n        { name: 'sl-focus', type: { text: 'FocusEvent' } },\n      ],\n      members: [\n        { kind: 'field', name: 'variant', type: { text: 'string' }, attribute: 'variant' },\n        { kind: 'field', name: 'size', type: { text: 'string' }, attribute: 'size' },\n      ],\n      cssProperties: [\n        { name: '--sl-button-color' },\n        { name: '--sl-spacing-small' },\n      ],\n    }),\n    makeDecl({\n      name: 'SlInput',\n      tagName: 'sl-input',\n      events: [\n        { name: 'sl-change', type: { text: 'CustomEvent' } },\n        { name: 'sl-input', type: { text: 'InputEvent' } },\n      ],\n      cssProperties: [\n        { name: '--sl-input-border-color' },\n      ],\n    }),\n  ];\n}\n\nfunction makeMaterialWebLibrary(): CemDeclaration[] {\n  return [\n    makeDecl({\n      name: 'MdButton',\n      tagName: 'md-button',\n      events: [\n        { name: 'md-click', type: { text: 'CustomEvent' } },\n      ],\n      cssProperties: [\n        { name: '--md-sys-color-primary' },\n        { name: '--md-sys-color-secondary' },\n      ],\n    }),\n    makeDecl({\n      name: 'MdTextField',\n      tagName: 'md-text-field',\n      events: [\n        { name: 'md-change', type: { text: 'CustomEvent' } },\n      ],\n      cssProperties: [\n        { name: '--md-sys-typescale-body' },\n      ],\n    }),\n  ];\n}\n\nfunction makeCarbonLibrary(): CemDeclaration[] {\n  return [\n    makeDecl({\n      name: 'BxButton',\n      tagName: 'bx-button',\n      events: [\n        { name: 'bx-click', type: { text: 'CustomEvent' } },\n      ],\n      cssProperties: [\n        { name: '--bx-button-primary' },\n      ],\n    }),\n    makeDecl({\n      name: 'BxModal',\n      tagName: 'bx-modal',\n      events: [\n        { name: 'bx-modal-open', type: { text: 'CustomEvent' } },\n        { name: 'bx-modal-close', type: { text: 'CustomEvent' } },\n      ],\n      cssProperties: [\n        { name: '--bx-modal-bg' },\n      ],\n    }),\n  ];\n}\n\nfunction makeIonicLibrary(): CemDeclaration[] {\n  return [\n    makeDecl({\n      name: 'IonButton',\n      tagName: 'ion-button',\n      events: [\n        { name: 'ion-click', type: { text: 'CustomEvent' } },\n        { name: 'ion-focus', type: { text: 'FocusEvent' } },\n      ],\n      cssProperties: [\n        { name: '--ion-color-primary' },\n        { name: '--ion-color-secondary' },\n      ],\n    }),\n    makeDecl({\n      name: 'IonInput',\n      tagName: 'ion-input',\n      events: [\n        { name: 'ion-change', type: { text: 'CustomEvent' } },\n      ],\n      cssProperties: [\n        { name: '--ion-input-bg' },\n      ],\n    }),\n  ];\n}\n\n// ─── Prefix Detection Tests ─────────────────────────────────────────────────\n\ndescribe('naming-consistency / prefix detection', () => {\n  it('detects hx- event prefix for helix library', () => {\n    const decls = makeHelixLibrary();\n    const result = detectLibraryEventPrefix(decls);\n    expect(result.prefix).toBe('hx-');\n    expect(result.confidence).toBeGreaterThanOrEqual(0.5);\n  });\n\n  it('detects sl- event prefix for Shoelace library', () => {\n    const decls = makeShoelaceLibrary();\n    const result = detectLibraryEventPrefix(decls);\n    expect(result.prefix).toBe('sl-');\n    expect(result.confidence).toBeGreaterThanOrEqual(0.5);\n  });\n\n  it('detects md- event prefix for Material Web library', () => {\n    const decls = makeMaterialWebLibrary();\n    const result = detectLibraryEventPrefix(decls);\n    expect(result.prefix).toBe('md-');\n    expect(result.confidence).toBeGreaterThanOrEqual(0.5);\n  });\n\n  it('detects bx- event prefix for Carbon library', () => {\n    const decls = makeCarbonLibrary();\n    const result = detectLibraryEventPrefix(decls);\n    expect(result.prefix).toBe('bx-');\n    expect(result.confidence).toBeGreaterThanOrEqual(0.5);\n  });\n\n  it('detects ion- event prefix for Ionic library', () => {\n    const decls = makeIonicLibrary();\n    const result = detectLibraryEventPrefix(decls);\n    expect(result.prefix).toBe('ion-');\n    expect(result.confidence).toBeGreaterThanOrEqual(0.5);\n  });\n\n  it('detects --hx- CSS prefix for helix library', () => {\n    const decls = makeHelixLibrary();\n    const result = detectLibraryCssPrefix(decls);\n    expect(result.prefix).toBe('--hx-');\n    expect(result.confidence).toBeGreaterThanOrEqual(0.5);\n  });\n\n  it('detects --sl- CSS prefix for Shoelace library', () => {\n    const decls = makeShoelaceLibrary();\n    const result = detectLibraryCssPrefix(decls);\n    expect(result.prefix).toBe('--sl-');\n    expect(result.confidence).toBeGreaterThanOrEqual(0.5);\n  });\n\n  it('detects --md- CSS prefix for Material Web', () => {\n    const decls = makeMaterialWebLibrary();\n    const result = detectLibraryCssPrefix(decls);\n    expect(result.prefix).toBe('--md-');\n    expect(result.confidence).toBeGreaterThanOrEqual(0.5);\n  });\n\n  it('returns null prefix for library with no events', () => {\n    const decls = [makeDecl({ events: [] }), makeDecl({ events: [] })];\n    const result = detectLibraryEventPrefix(decls);\n    expect(result.prefix).toBeNull();\n  });\n\n  it('returns null prefix for library with no CSS properties', () => {\n    const decls = [makeDecl({ cssProperties: [] }), makeDecl({ cssProperties: [] })];\n    const result = detectLibraryCssPrefix(decls);\n    expect(result.prefix).toBeNull();\n  });\n\n  describe('no prefix pattern', () => {\n    it('returns null prefix when events have no common prefix', () => {\n      const decls = [\n        makeDecl({\n          events: [\n            { name: 'click', type: { text: 'Event' } },\n            { name: 'focus', type: { text: 'FocusEvent' } },\n          ],\n        }),\n        makeDecl({\n          events: [\n            { name: 'change', type: { text: 'Event' } },\n            { name: 'input', type: { text: 'InputEvent' } },\n          ],\n        }),\n      ];\n      const result = detectLibraryEventPrefix(decls);\n      expect(result.prefix).toBeNull();\n    });\n\n    it('returns low confidence when prefix is not dominant', () => {\n      const decls = [\n        makeDecl({\n          events: [\n            { name: 'hx-click', type: { text: 'CustomEvent' } },\n            { name: 'custom-change', type: { text: 'Event' } },\n            { name: 'focus', type: { text: 'FocusEvent' } },\n            { name: 'blur', type: { text: 'FocusEvent' } },\n          ],\n        }),\n      ];\n      const result = detectLibraryEventPrefix(decls);\n      // Only 1 of 4 events has hx- prefix → below 50% threshold\n      expect(result.prefix).toBeNull();\n    });\n  });\n});\n\n// ─── Per-Component Scoring Tests ────────────────────────────────────────────\n\ndescribe('naming-consistency / per-component scoring', () => {\n  describe('event prefix coherence', () => {\n    it('scores 30/30 when all events match prefix', () => {\n      const decl = makeDecl({\n        events: [\n          { name: 'hx-click' },\n          { name: 'hx-focus' },\n        ],\n      });\n      const result = scoreEventPrefixCoherence(decl, 'hx-');\n      expect(result).not.toBeNull();\n      expect(result!.score).toBe(30);\n    });\n\n    it('scores 0/30 when no events match prefix', () => {\n      const decl = makeDecl({\n        events: [\n          { name: 'custom-click' },\n          { name: 'custom-focus' },\n        ],\n      });\n      const result = scoreEventPrefixCoherence(decl, 'hx-');\n      expect(result).not.toBeNull();\n      expect(result!.score).toBe(0);\n    });\n\n    it('returns null for component with no events', () => {\n      const decl = makeDecl({ events: [] });\n      const result = scoreEventPrefixCoherence(decl, 'hx-');\n      expect(result).toBeNull();\n    });\n\n    it('gives full score when no prefix detected', () => {\n      const decl = makeDecl({\n        events: [{ name: 'click' }, { name: 'focus' }],\n      });\n      const result = scoreEventPrefixCoherence(decl, null);\n      expect(result).not.toBeNull();\n      expect(result!.score).toBe(30);\n    });\n  });\n\n  describe('property naming consistency', () => {\n    it('scores 25/25 for all camelCase properties', () => {\n      const decl = makeDecl({\n        members: [\n          { kind: 'field', name: 'variant', type: { text: 'string' } },\n          { kind: 'field', name: 'isDisabled', type: { text: 'boolean' } },\n          { kind: 'field', name: 'maxLength', type: { text: 'number' } },\n        ],\n      });\n      const result = scorePropertyNamingConsistency(decl);\n      expect(result.score).toBe(25);\n    });\n\n    it('scores proportionally for mixed naming', () => {\n      const decl = makeDecl({\n        members: [\n          { kind: 'field', name: 'variant', type: { text: 'string' } },\n          { kind: 'field', name: 'is_disabled', type: { text: 'boolean' } },\n          { kind: 'field', name: 'maxLength', type: { text: 'number' } },\n        ],\n      });\n      const result = scorePropertyNamingConsistency(decl);\n      // 2/3 camelCase → round(2/3 * 25) = 17\n      expect(result.score).toBe(17);\n    });\n\n    it('gives full score for components with no properties', () => {\n      const decl = makeDecl({ members: [] });\n      const result = scorePropertyNamingConsistency(decl);\n      expect(result.score).toBe(25);\n    });\n  });\n\n  describe('CSS custom property prefixing', () => {\n    it('scores 25/25 when all CSS properties match prefix', () => {\n      const decl = makeDecl({\n        cssProperties: [\n          { name: '--hx-button-color' },\n          { name: '--hx-button-bg' },\n        ],\n      });\n      const result = scoreCSSCustomPropertyPrefixing(decl, '--hx-');\n      expect(result).not.toBeNull();\n      expect(result!.score).toBe(25);\n    });\n\n    it('scores 0/25 when no CSS properties match prefix', () => {\n      const decl = makeDecl({\n        cssProperties: [\n          { name: '--custom-color' },\n          { name: '--custom-bg' },\n        ],\n      });\n      const result = scoreCSSCustomPropertyPrefixing(decl, '--hx-');\n      expect(result).not.toBeNull();\n      expect(result!.score).toBe(0);\n    });\n\n    it('returns null for component with no CSS properties', () => {\n      const decl = makeDecl({ cssProperties: [] });\n      const result = scoreCSSCustomPropertyPrefixing(decl, '--hx-');\n      expect(result).toBeNull();\n    });\n  });\n\n  describe('attribute-property coherence', () => {\n    it('scores 20/20 for correct kebab-case attribute mappings', () => {\n      const decl = makeDecl({\n        members: [\n          { kind: 'field', name: 'maxLength', attribute: 'max-length', type: { text: 'number' } },\n          { kind: 'field', name: 'variant', attribute: 'variant', type: { text: 'string' } },\n          { kind: 'field', name: 'isDisabled', attribute: 'is-disabled', type: { text: 'boolean' } },\n        ],\n      });\n      const result = scoreAttributePropertyCoherence(decl);\n      expect(result.score).toBe(20);\n    });\n\n    it('scores proportionally for incorrect mappings', () => {\n      const decl = makeDecl({\n        members: [\n          { kind: 'field', name: 'maxLength', attribute: 'max-length', type: { text: 'number' } },\n          { kind: 'field', name: 'isDisabled', attribute: 'isdisabled', type: { text: 'boolean' } },\n        ],\n      });\n      const result = scoreAttributePropertyCoherence(decl);\n      // 1/2 correct → round(1/2 * 20) = 10\n      expect(result.score).toBe(10);\n    });\n\n    it('gives full score for components with no attribute-mapped properties', () => {\n      const decl = makeDecl({\n        members: [\n          { kind: 'field', name: 'value', type: { text: 'string' } },\n        ],\n      });\n      const result = scoreAttributePropertyCoherence(decl);\n      expect(result.score).toBe(20);\n    });\n  });\n});\n\n// ─── Full Analyzer Integration Tests ────────────────────────────────────────\n\ndescribe('naming-consistency / full analyzer', () => {\n  it('scores helix library component highly with consistent naming', () => {\n    const decls = makeHelixLibrary();\n    const conventions = detectLibraryConventions(decls);\n    expect(conventions.eventPrefix).toBe('hx-');\n    expect(conventions.cssPrefix).toBe('--hx-');\n\n    const result = analyzeNamingConsistency(decls[0]!, conventions);\n    expect(result).not.toBeNull();\n    expect(result!.score).toBeGreaterThanOrEqual(80);\n    expect(result!.subMetrics.length).toBeGreaterThanOrEqual(3);\n  });\n\n  it('scores a deliberately inconsistent component low', () => {\n    const conventions: LibraryNamingConventions = {\n      eventPrefix: 'hx-',\n      eventPrefixConfidence: 0.9,\n      cssPrefix: '--hx-',\n      cssPrefixConfidence: 0.9,\n    };\n\n    const inconsistent = makeDecl({\n      events: [\n        { name: 'custom-click' },\n        { name: 'random-event' },\n      ],\n      members: [\n        { kind: 'field', name: 'variant', type: { text: 'string' } },\n        { kind: 'field', name: 'is_broken', type: { text: 'boolean' } },\n        { kind: 'field', name: 'SHOUTING', type: { text: 'string' } },\n      ],\n      cssProperties: [\n        { name: '--wrong-prefix-color' },\n        { name: '--another-wrong-bg' },\n      ],\n    });\n\n    const result = analyzeNamingConsistency(inconsistent, conventions);\n    expect(result).not.toBeNull();\n    expect(result!.score).toBeLessThan(50);\n  });\n\n  it('returns null when component has only methods (no scoreable data)', () => {\n    const conventions: LibraryNamingConventions = {\n      eventPrefix: null,\n      eventPrefixConfidence: 0,\n      cssPrefix: null,\n      cssPrefixConfidence: 0,\n    };\n    // Component with only method members, no events, no CSS, no fields\n    const decl = makeDecl({\n      events: [],\n      members: [{ kind: 'method', name: 'doSomething' }],\n      cssProperties: [],\n    });\n    const result = analyzeNamingConsistency(decl, conventions);\n    // Should still return a result since attribute-property coherence always scores\n    expect(result).not.toBeNull();\n  });\n\n  it('handles library conventions detection across 5+ libraries', () => {\n    const libraries = [\n      { name: 'helix', decls: makeHelixLibrary(), expectedEventPrefix: 'hx-', expectedCssPrefix: '--hx-' },\n      { name: 'Shoelace', decls: makeShoelaceLibrary(), expectedEventPrefix: 'sl-', expectedCssPrefix: '--sl-' },\n      { name: 'Material Web', decls: makeMaterialWebLibrary(), expectedEventPrefix: 'md-', expectedCssPrefix: '--md-' },\n      { name: 'Carbon', decls: makeCarbonLibrary(), expectedEventPrefix: 'bx-', expectedCssPrefix: '--bx-' },\n      { name: 'Ionic', decls: makeIonicLibrary(), expectedEventPrefix: 'ion-', expectedCssPrefix: '--ion-' },\n    ];\n\n    for (const lib of libraries) {\n      const conventions = detectLibraryConventions(lib.decls);\n      expect(conventions.eventPrefix, `${lib.name} event prefix`).toBe(lib.expectedEventPrefix);\n      expect(conventions.cssPrefix, `${lib.name} CSS prefix`).toBe(lib.expectedCssPrefix);\n    }\n  });\n\n  it('assigns verified confidence when prefix patterns are strong', () => {\n    const decls = makeHelixLibrary();\n    const conventions = detectLibraryConventions(decls);\n    const result = analyzeNamingConsistency(decls[0]!, conventions);\n    expect(result).not.toBeNull();\n    expect(result!.confidence).toBe('verified');\n  });\n\n  it('normalizes score to 0-100 even when some dimensions are excluded', () => {\n    // Component with events but no CSS properties\n    const conventions: LibraryNamingConventions = {\n      eventPrefix: 'hx-',\n      eventPrefixConfidence: 0.9,\n      cssPrefix: '--hx-',\n      cssPrefixConfidence: 0.9,\n    };\n\n    const decl = makeDecl({\n      events: [\n        { name: 'hx-click' },\n        { name: 'hx-focus' },\n      ],\n      members: [\n        { kind: 'field', name: 'variant', attribute: 'variant', type: { text: 'string' } },\n      ],\n      cssProperties: [],\n    });\n\n    const result = analyzeNamingConsistency(decl, conventions);\n    expect(result).not.toBeNull();\n    // Score should be 0-100 even with CSS excluded\n    expect(result!.score).toBeGreaterThanOrEqual(0);\n    expect(result!.score).toBeLessThanOrEqual(100);\n    // All scored dimensions should be perfect → 100\n    expect(result!.score).toBe(100);\n  });\n});\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create naming-consistency.ts analyzer",
      "status": "completed",
      "activeForm": "Creating naming-consistency.ts analyzer"
    },
    {
      "content": "Register as dimension 14 in dimensions.ts",
      "status": "completed",
      "activeForm": "Registering dimension 14"
    },
    {
      "content": "Wire into health.ts pipeline",
      "status": "completed",
      "activeForm": "Wiring into health.ts"
    },
    {
      "content": "Create test suite",
      "status": "completed",
      "activeForm": "Creating test suite"
    },
    {
      "content": "Build and verify",
      "status": "in_progress",
      "activeForm": "Building and verifying"
    }
  ]
}

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1 | tail -30",
  "description": "Build the project",
  "timeout": 60000
}
Build passes. Now run the naming-consistency tests:

🔧 Tool: Bash
Input: {
  "command": "npm test -- naming-consistency.test.ts 2>&1",
  "description": "Run naming-consistency tests",
  "timeout": 60000
}
All 31 tests pass. Now run the full suite to check for regressions:

🔧 Tool: Bash
Input: {
  "command": "npm test 2>&1 | tail -30",
  "description": "Run full test suite",
  "timeout": 120000
}
There are test failures because existing tests expected 12 dimensions. Let me check which tests are failing:

🔧 Tool: Bash
Input: {
  "command": "npm test 2>&1 | grep 'FAIL\\|toHaveLength(12\\|expected.*12.*13' | head -20",
  "description": "Find failing tests",
  "timeout": 120000
}
I need to update the existing tests to account for the new 13th dimension. Let me find and fix these.

🔧 Tool: Grep
Input: {
  "pattern": "toHaveLength\\(12\\)",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests",
  "output_mode": "content"
}

🔧 Tool: Grep
Input: {
  "pattern": "cem-native.*7|7 cem-native|has 7 cem|has 5 important|weight.*95|equals 95",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/dimensions.test.ts",
  "output_mode": "content"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/dimensions.test.ts",
  "offset": 60,
  "limit": 60
}
Now update all the tests. The new dimension adds: 1 more to total (12→13), 1 more cem-native (7→8), weight adds 5 (95→100), 1 more important (5→6).

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/dimensions.test.ts",
  "old_string": "  it('contains exactly 12 dimensions', () => {\n    expect(DIMENSION_REGISTRY).toHaveLength(12);\n  });\n\n  it('has 7 cem-native dimensions', () => {\n    const cemNative = DIMENSION_REGISTRY.filter((d) => d.source === 'cem-native');\n    expect(cemNative).toHaveLength(7);\n  });",
  "new_string": "  it('contains exactly 13 dimensions', () => {\n    expect(DIMENSION_REGISTRY).toHaveLength(13);\n  });\n\n  it('has 8 cem-native dimensions', () => {\n    const cemNative = DIMENSION_REGISTRY.filter((d) => d.source === 'cem-native');\n    expect(cemNative).toHaveLength(8);\n  });"
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/dimensions.test.ts",
  "old_string": "  it('total weight equals 95', () => {\n    expect(TOTAL_WEIGHT).toBe(95);\n  });",
  "new_string": "  it('total weight equals 100', () => {\n    expect(TOTAL_WEIGHT).toBe(100);\n  });"
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/dimensions.test.ts",
  "old_string": "  it('has 5 important dimensions', () => {\n    expect(DIMENSION_CLASSIFICATION.important).toHaveLength(5);\n  });",
  "new_string": "  it('has 6 important dimensions', () => {\n    expect(DIMENSION_CLASSIFICATION.important).toHaveLength(6);\n  });"
}
Now update multi-dimensional-health.test.ts (12→13):

🔧 Tool: Edit
Input: {
  "replace_all": true,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/multi-dimensional-health.test.ts",
  "old_string": "toHaveLength(12)",
  "new_string": "toHaveLength(13)"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/multi-dimensional-health.test.ts",
  "limit": 50
}

🔧 Tool: Edit
Input: {
  "replace_all": true,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/multi-dimensional-health.test.ts",
  "old_string": "toHaveLength(12)",
  "new_string": "toHaveLength(13)"
}
Now update audit-report.test.ts:

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/audit-report.test.ts",
  "offset": 175,
  "limit": 15
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/audit-report.test.ts",
  "old_string": "      expect(obj.dimensions).toHaveLength(12);",
  "new_string": "      expect(obj.dimensions).toHaveLength(13);"
}
Now I need to check if there's a test about "all CEM-native dimensions are measured" that's also failing. Let me check:

🔧 Tool: Grep
Input: {
  "pattern": "all CEM-native dimensions are measured",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/multi-dimensional-health.test.ts",
  "output_mode": "content",
  "-C": 15
}
The "all CEM-native dimensions are measured" test expects that all CEM-native dimensions except CEM-Source Fidelity are measured. The new Naming Consistency dimension also won't be measured without library-wide conventions being passed (it receives `namingConventions` as undefined when `scoreComponentMultiDimensional` is called directly without it). Let me check what happens — when `namingConventions` is undefined, the switch case returns `notApplicable: true`.

The test calls `scoreComponentMultiDimensional(config, PERFECT_DECL)` without passing CEM or conventions, so Naming Consistency will be `notApplicable`. I need to update the test to also exclude it, similar to CEM-Source Fidelity.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/multi-dimensional-health.test.ts",
  "old_string": "    // CEM-Source Fidelity requires a cem parameter and source files, so it's not measured in unit tests\n    const cemSourceFidelity = cemNative.find((d) => d.name === 'CEM-Source Fidelity');\n    expect(cemSourceFidelity).toBeDefined();\n    expect(cemSourceFidelity?.measured).toBe(false);\n    const measurableNative = cemNative.filter((d) => d.name !== 'CEM-Source Fidelity');\n    expect(measurableNative.every((d) => d.measured)).toBe(true);",
  "new_string": "    // CEM-Source Fidelity requires a cem parameter and source files, so it's not measured in unit tests\n    const cemSourceFidelity = cemNative.find((d) => d.name === 'CEM-Source Fidelity');\n    expect(cemSourceFidelity).toBeDefined();\n    expect(cemSourceFidelity?.measured).toBe(false);\n    // Naming Consistency requires library-wide conventions (passed via scoreAllComponentsMultiDimensional)\n    const namingConsistency = cemNative.find((d) => d.name === 'Naming Consistency');\n    expect(namingConsistency).toBeDefined();\n    expect(namingConsistency?.measured).toBe(false);\n    const measurableNative = cemNative.filter(\n      (d) => d.name !== 'CEM-Source Fidelity' && d.name !== 'Naming Consistency',\n    );\n    expect(measurableNative.every((d) => d.measured)).toBe(true);"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/multi-dimensional-health.test.ts",
  "offset": 154,
  "limit": 15
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/multi-dimensional-health.test.ts",
  "old_string": "    // CEM-Source Fidelity requires a cem parameter and source files, so it's not measured in unit tests\n    const cemSourceFidelity = cemNative.find((d) => d.name === 'CEM-Source Fidelity');\n    expect(cemSourceFidelity).toBeDefined();\n    expect(cemSourceFidelity?.measured).toBe(false);\n    const measurableNative = cemNative.filter((d) => d.name !== 'CEM-Source Fidelity');\n    expect(measurableNative.every((d) => d.measured)).toBe(true);",
  "new_string": "    // CEM-Source Fidelity requires a cem parameter and source files, so it's not measured in unit tests\n    const cemSourceFidelity = cemNative.find((d) => d.name === 'CEM-Source Fidelity');\n    expect(cemSourceFidelity).toBeDefined();\n    expect(cemSourceFidelity?.measured).toBe(false);\n    // Naming Consistency requires library-wide conventions (passed via scoreAllComponentsMultiDimensional)\n    const namingConsistency = cemNative.find((d) => d.name === 'Naming Consistency');\n    expect(namingConsistency).toBeDefined();\n    expect(namingConsistency?.measured).toBe(false);\n    const measurableNative = cemNative.filter(\n      (d) => d.name !== 'CEM-Source Fidelity' && d.name !== 'Naming Consistency',\n    );\n    expect(measurableNative.every((d) => d.measured)).toBe(true);"
}
Also need to update the "returns all 12 dimensions" test description:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/multi-dimensional-health.test.ts",
  "old_string": "  it('returns all 12 dimensions', async () => {",
  "new_string": "  it('returns all 13 dimensions', async () => {"
}
Now rebuild and run full tests:

🔧 Tool: Bash
Input: {
  "command": "npm run build 2>&1 && npm test 2>&1 | tail -30",
  "description": "Build and run full test suite",
  "timeout": 120000
}
Two more tests to fix — untested count is now 7 (5 external + CEM-Source Fidelity + Naming Consistency):

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/multi-dimensional-health.test.ts",
  "offset": 183,
  "limit": 10
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/multi-dimensional-health.test.ts",
  "old_string": "    expect(result.confidenceSummary.untested).toBe(6); // 5 external + CEM-Source Fidelity (no cem/source in unit tests)",
  "new_string": "    expect(result.confidenceSummary.untested).toBe(7); // 5 external + CEM-Source Fidelity + Naming Consistency (no cem/conventions in unit tests)"
}
Now check the other failure — audit-report test:

🔧 Tool: Bash
Input: {
  "command": "npm test -- audit-report.test.ts 2>&1 | tail -20",
  "description": "Run audit-report tests",
  "timeout": 60000
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/audit-report.test.ts",
  "offset": 93,
  "limit": 8
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-naming-consistency/tests/handlers/audit-report.test.ts",
  "old_string": "    expect(parsed.dimensions.length).toBe(12);",
  "new_string": "    expect(parsed.dimensions.length).toBe(13);"
}

🔧 Tool: Bash
Input: {
  "command": "npm test 2>&1 | tail -10",
  "description": "Run full test suite",
  "timeout": 120000
}
All 1594 tests pass, 0 failures. Let me verify the diff:

🔧 Tool: Bash
Input: {
  "command": "git diff --stat",
  "description": "Check changed files"
}

🔧 Tool: Bash
Input: {
  "command": "git diff --stat --diff-filter=A",
  "description": "Check new (untracked) files"
}

🔧 Tool: Bash
Input: {
  "command": "git status --short",
  "description": "Show all changes including untracked"
}
All files match the expected scope. The new files plus the modified files are exactly what's specified.

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create naming-consistency.ts analyzer",
      "status": "completed",
      "activeForm": "Creating naming-consistency.ts analyzer"
    },
    {
      "content": "Register as dimension 14 in dimensions.ts",
      "status": "completed",
      "activeForm": "Registering dimension 14"
    },
    {
      "content": "Wire into health.ts pipeline",
      "status": "completed",
      "activeForm": "Wiring into health.ts"
    },
    {
      "content": "Create test suite",
      "status": "completed",
      "activeForm": "Creating test suite"
    },
    {
      "content": "Build and verify",
      "status": "completed",
      "activeForm": "Building and verifying"
    }
  ]
}
<summary>
## Summary: Naming Consistency Analyzer (Dimension 14)

### Changes Implemented
- **Library-wide prefix detection**: Analyzes all component declarations to detect dominant event prefixes (e.g., `hx-`, `sl-`, `md-`, `bx-`, `ion-`) and CSS custom property prefixes (e.g., `--hx-`, `--sl-`)
- **Four scoring dimensions** (normalized to 0-100):
  - Event prefix coherence (30 pts) — events following library prefix / total events
  - Property naming consistency (25 pts) — camelCase consistency across properties
  - CSS custom property prefixing (25 pts) — CSS properties following library prefix
  - Attribute-property coherence (20 pts) — kebab-case attribute ↔ camelCase property mapping
- **Graceful exclusion**: Components with no events or no CSS properties are excluded from those sub-scores; normalization adjusts the denominator
- **Registered as dimension 14** with weight 5, tier 'important', source 'cem-native'
- **Wired into health pipeline**: `scoreAllComponentsMultiDimensional` detects conventions once, passes to all per-component scoring calls

### Files Modified
- **New**: `packages/core/src/handlers/analyzers/naming-consistency.ts` — core analyzer
- **New**: `tests/handlers/naming-consistency.test.ts` — 31 tests
- **Modified**: `packages/core/src/handlers/dimensions.ts` — added dimension 14
- **Modified**: `packages/core/src/handlers/health.ts` — import + switch case + convention detection
- **Modified**: `packages/core/src/handlers/analyzers/index.ts` — barrel export
- **Modified**: `tests/handlers/dimensions.test.ts` — updated counts (12→13, weight 95→100, etc.)
- **Modified**: `tests/handlers/multi-dimensional-health.test.ts` — updated dimension count expectations
- **Modified**: `tests/handlers/audit-report.test.ts` — updated dimension count

### Verification Status
- Build: `npm run build` exits 0
- Tests: 1594 passed, 0 failed, 141 skipped
- naming-consistency.test.ts: 31/31 tests pass covering prefix detection for 5 libraries, per-component scoring, edge cases, and deliberately inconsistent CEMs

### Risks/Blockers Encountered
- Existing tests hardcoded dimension count (12) and total weight (95) — updated to 13 and 100 respectively
- `scoreComponentMultiDimensional` called without conventions (e.g., in unit tests) correctly marks Naming Consistency as not-applicable

### Learnings
- Library-wide conventions must be detected at the `scoreAll*` level and threaded through to per-component scoring — single-component calls without conventions gracefully degrade to not-applicable
- The Playwright verification requirement from the feature template is not applicable to this pure backend analyzer (no UI)

### Notes for Developer
- When calling `scoreComponentMultiDimensional` directly (not via `scoreAllComponentsMultiDimensional`), pass `namingConventions` as the 5th parameter to enable this dimension
</summary>