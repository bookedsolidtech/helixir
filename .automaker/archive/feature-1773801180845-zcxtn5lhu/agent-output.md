I'll start by reading the key files I need to understand and modify.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/dimensions.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/health.ts"
}

🔧 Tool: Glob
Input: {
  "pattern": "packages/core/src/handlers/analyzers/*.ts",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/analyzers/event-architecture.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/analyzers/index.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/cem.ts",
  "limit": 80
}
Now let me see an existing test file for pattern reference and check the CEM types for slots.

🔧 Tool: Glob
Input: {
  "pattern": "tests/handlers/*.test.ts",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture"
}

🔧 Tool: Grep
Input: {
  "pattern": "slots.*CemDeclaration|interface.*Slot|CemSlot",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/cem.ts",
  "output_mode": "content"
}
Let me check the CemDeclaration type for slot-related fields and look at an existing test for patterns.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/cem.ts",
  "offset": 80,
  "limit": 40
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/analyzers.test.ts",
  "limit": 100
}
I have enough context. Now let me implement the slot architecture analyzer, register it, wire it into health.ts, and create the test file. Let me work in parallel.

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/analyzers/slot-architecture.ts",
  "content": "/**\n * Slot Architecture Analyzer — measures slot documentation quality,\n * default slot presence, type constraints, and slot-property coherence.\n *\n * Scoring model (100 points):\n *   - Default slot documentation: 25 points (15 presence + 10 description)\n *   - Named slot documentation:   30 points (proportional to documented/total)\n *   - Slot type constraints:      20 points (slots with type info / total slots)\n *   - Slot-property coherence:    25 points (coherent pairs / total pairs)\n *\n * Returns null for components with no slots (presentational/leaf components).\n */\n\nimport type { CemDeclaration } from '../cem.js';\nimport type { ConfidenceLevel, SubMetric } from '../dimensions.js';\n\nexport interface SlotAnalysis {\n  name: string;\n  isDefault: boolean;\n  hasDescription: boolean;\n  hasTypeConstraint: boolean;\n  matchingProperty: string | null;\n}\n\nexport interface CoherencePair {\n  slotName: string;\n  propertyName: string;\n  slotDocumented: boolean;\n  propertyDocumented: boolean;\n  coherent: boolean;\n}\n\nexport interface SlotArchitectureResult {\n  score: number;\n  confidence: ConfidenceLevel;\n  subMetrics: SubMetric[];\n  slots: SlotAnalysis[];\n  coherencePairs: CoherencePair[];\n}\n\n/**\n * Common slot names that often have matching properties.\n * Used for coherence pair detection.\n */\nconst COHERENCE_SLOT_PATTERNS = [\n  'label',\n  'icon',\n  'header',\n  'footer',\n  'prefix',\n  'suffix',\n  'action',\n  'actions',\n  'trigger',\n  'content',\n  'description',\n  'title',\n  'subtitle',\n  'headline',\n  'leading',\n  'trailing',\n  'start',\n  'end',\n  'media',\n  'avatar',\n  'badge',\n  'caption',\n  'helper-text',\n  'error-text',\n  'supporting-text',\n];\n\n/**\n * Reserved/lifecycle property names to skip for coherence pairing.\n * These don't represent content composition patterns.\n */\nconst RESERVED_NAMES = new Set(['class', 'ref', 'style', 'id', 'slot', 'is']);\n\n/**\n * Detects whether a slot has type constraint information.\n * Checks slot description and component-level JSDoc @slot annotations for element type mentions.\n */\nfunction hasTypeConstraint(slotName: string, slotDescription: string, decl: CemDeclaration): boolean {\n  // Check slot description for element type mentions\n  if (slotDescription) {\n    // Patterns like \"<sp-icon>\", \"HTMLElement\", \"button element\", \"img elements\"\n    if (/<[a-z][\\w-]*>/i.test(slotDescription)) return true;\n    if (/\\b(HTML\\w*Element|Element)\\b/.test(slotDescription)) return true;\n    if (/\\b(element|elements|tag|tags|component|components)\\b/i.test(slotDescription)) return true;\n  }\n\n  // Check JSDoc @slot annotations in component description (fallback per deviation rule)\n  const description = decl.description ?? '';\n  const slotAnnotationRegex = new RegExp(\n    `@slot\\\\s+${slotName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\\\b[^\\\\n]*`,\n    'i',\n  );\n  const match = description.match(slotAnnotationRegex);\n  if (match) {\n    const annotation = match[0];\n    if (/<[a-z][\\w-]*>/i.test(annotation)) return true;\n    if (/\\b(HTML\\w*Element|Element)\\b/.test(annotation)) return true;\n    if (/\\b(element|elements|tag|tags|component|components)\\b/i.test(annotation)) return true;\n  }\n\n  // Check jsdocTags for @slot annotations\n  const jsdocTags = decl.jsdocTags ?? [];\n  for (const tag of jsdocTags) {\n    if (tag.name !== 'slot') continue;\n    const tagDesc = tag.description ?? '';\n    // Match tag that references this slot name\n    if (tagDesc.includes(slotName) || (slotName === '' && tagDesc.includes('default'))) {\n      if (/<[a-z][\\w-]*>/i.test(tagDesc)) return true;\n      if (/\\b(HTML\\w*Element|Element)\\b/.test(tagDesc)) return true;\n      if (/\\b(element|elements|tag|tags|component|components)\\b/i.test(tagDesc)) return true;\n    }\n  }\n\n  return false;\n}\n\nexport function analyzeSlotArchitecture(decl: CemDeclaration): SlotArchitectureResult | null {\n  const slots = decl.slots ?? [];\n\n  // Return null for slot-less components — honest scoring, not zero\n  if (slots.length === 0) {\n    return null;\n  }\n\n  const subMetrics: SubMetric[] = [];\n  const slotAnalyses: SlotAnalysis[] = [];\n  const coherencePairs: CoherencePair[] = [];\n\n  // Build property map for coherence detection\n  const fields = (decl.members ?? []).filter((m) => m.kind === 'field');\n  const propertyNames = new Map<string, boolean>();\n  for (const field of fields) {\n    const hasDesc =\n      typeof field.description === 'string' && field.description.trim().length > 0;\n    propertyNames.set(field.name, hasDesc);\n  }\n\n  // Analyze each slot\n  const defaultSlot = slots.find((s) => s.name === '' || s.name === 'default');\n  const namedSlots = slots.filter((s) => s.name !== '' && s.name !== 'default');\n\n  for (const slot of slots) {\n    const isDefault = slot.name === '' || slot.name === 'default';\n    const desc = slot.description ?? '';\n    const hasDesc = desc.trim().length > 0;\n    const hasType = hasTypeConstraint(slot.name, desc, decl);\n\n    // Coherence: find matching property (skip reserved names)\n    const slotLookupName = isDefault ? '' : slot.name;\n    // Normalize kebab-case to camelCase for property lookup\n    const camelName = slot.name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());\n    let matchingProp: string | null = null;\n    if (!isDefault && !RESERVED_NAMES.has(slot.name)) {\n      if (propertyNames.has(slot.name)) {\n        matchingProp = slot.name;\n      } else if (camelName !== slot.name && propertyNames.has(camelName)) {\n        matchingProp = camelName;\n      }\n    }\n\n    slotAnalyses.push({\n      name: slotLookupName,\n      isDefault,\n      hasDescription: hasDesc,\n      hasTypeConstraint: hasType,\n      matchingProperty: matchingProp,\n    });\n  }\n\n  // ─── 1. Default slot documentation (25 points) ───────────────────────\n  let defaultSlotScore = 0;\n  if (defaultSlot) {\n    defaultSlotScore += 15; // presence\n    const defaultDesc = defaultSlot.description ?? '';\n    if (defaultDesc.trim().length > 0) {\n      defaultSlotScore += 10; // description\n    }\n  }\n  subMetrics.push({\n    name: 'Default slot documentation',\n    score: defaultSlotScore,\n    maxScore: 25,\n    note: defaultSlot\n      ? `declared${defaultSlot.description?.trim() ? ' with description' : ', no description'}`\n      : 'no default slot',\n  });\n\n  // ─── 2. Named slot documentation (30 points) ─────────────────────────\n  let namedSlotScore = 0;\n  if (namedSlots.length > 0) {\n    const documented = namedSlots.filter(\n      (s) => typeof s.description === 'string' && s.description.trim().length > 0,\n    );\n    namedSlotScore = Math.round((documented.length / namedSlots.length) * 30);\n  }\n  // If no named slots exist, award full points (trivially satisfied)\n  else {\n    namedSlotScore = 30;\n  }\n  subMetrics.push({\n    name: 'Named slot documentation',\n    score: namedSlotScore,\n    maxScore: 30,\n    note:\n      namedSlots.length > 0\n        ? `${namedSlots.filter((s) => s.description?.trim()).length}/${namedSlots.length} documented`\n        : 'no named slots',\n  });\n\n  // ─── 3. Slot type constraints (20 points) ─────────────────────────────\n  const allSlotAnalyses = slotAnalyses;\n  const slotsWithType = allSlotAnalyses.filter((s) => s.hasTypeConstraint);\n  const typeScore = Math.round((slotsWithType.length / allSlotAnalyses.length) * 20);\n  subMetrics.push({\n    name: 'Slot type constraints',\n    score: typeScore,\n    maxScore: 20,\n    note: `${slotsWithType.length}/${allSlotAnalyses.length} slots specify content types`,\n  });\n\n  // ─── 4. Slot-property coherence (25 points) ──────────────────────────\n  // Identify pairs where both a named slot and property share a name\n  for (const analysis of slotAnalyses) {\n    if (analysis.matchingProperty === null) continue;\n\n    const slotObj = slots.find(\n      (s) => s.name === analysis.name || (analysis.isDefault && (s.name === '' || s.name === 'default')),\n    );\n    const slotDocumented = analysis.hasDescription;\n    const propDocumented = propertyNames.get(analysis.matchingProperty) ?? false;\n\n    // Per deviation rule: if only one of pair is documented, award 50% (partial coherence)\n    const coherent = slotDocumented && propDocumented;\n\n    coherencePairs.push({\n      slotName: analysis.name,\n      propertyName: analysis.matchingProperty,\n      slotDocumented,\n      propertyDocumented: propDocumented,\n      coherent,\n    });\n  }\n\n  let coherenceScore = 0;\n  if (coherencePairs.length > 0) {\n    let pairPoints = 0;\n    const maxPerPair = 25 / coherencePairs.length;\n    for (const pair of coherencePairs) {\n      if (pair.coherent) {\n        pairPoints += maxPerPair;\n      } else if (pair.slotDocumented || pair.propertyDocumented) {\n        // Partial coherence: 50% per deviation rule\n        pairPoints += maxPerPair * 0.5;\n      }\n    }\n    coherenceScore = Math.round(pairPoints);\n  } else {\n    // No coherence pairs possible — award full points (trivially satisfied)\n    coherenceScore = 25;\n  }\n  subMetrics.push({\n    name: 'Slot-property coherence',\n    score: coherenceScore,\n    maxScore: 25,\n    note:\n      coherencePairs.length > 0\n        ? `${coherencePairs.filter((p) => p.coherent).length}/${coherencePairs.length} pairs fully coherent`\n        : 'no coherence pairs detected',\n  });\n\n  const totalScore = Math.min(\n    100,\n    defaultSlotScore + namedSlotScore + typeScore + coherenceScore,\n  );\n\n  return {\n    score: totalScore,\n    confidence: 'verified',\n    subMetrics,\n    slots: slotAnalyses,\n    coherencePairs,\n  };\n}\n"
}
Now register in the barrel export, dimensions, and health.ts.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/analyzers/index.ts",
  "old_string": "export {\n  analyzeCemSourceFidelity,",
  "new_string": "export {\n  analyzeSlotArchitecture,\n  type SlotArchitectureResult,\n  type SlotAnalysis,\n  type CoherencePair,\n} from './slot-architecture.js';\nexport {\n  analyzeCemSourceFidelity,"
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/dimensions.ts",
  "old_string": "  // Dimension 12: CEM-Source Fidelity — catches CEM vs source divergence\n  {\n    name: 'CEM-Source Fidelity',\n    weight: 10,\n    tier: 'critical',\n    source: 'cem-native',\n    phase: 'cem-analysis',\n  },\n];",
  "new_string": "  // Dimension 12: CEM-Source Fidelity — catches CEM vs source divergence\n  {\n    name: 'CEM-Source Fidelity',\n    weight: 10,\n    tier: 'critical',\n    source: 'cem-native',\n    phase: 'cem-analysis',\n  },\n  // Dimension 13: Slot Architecture — slot documentation, type constraints, coherence\n  {\n    name: 'Slot Architecture',\n    weight: 5,\n    tier: 'important',\n    source: 'cem-native',\n    phase: 'cem-analysis',\n  },\n];"
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/dimensions.ts",
  "old_string": "  important: [\n    'API Surface Quality',\n    'CSS Architecture',\n    'Event Architecture',\n    'Bundle Size',\n    'Story Coverage',\n  ],",
  "new_string": "  important: [\n    'API Surface Quality',\n    'CSS Architecture',\n    'Event Architecture',\n    'Slot Architecture',\n    'Bundle Size',\n    'Story Coverage',\n  ],"
}
Now wire into health.ts:

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/health.ts",
  "old_string": "import { analyzeCemSourceFidelity } from './analyzers/cem-source-fidelity.js';",
  "new_string": "import { analyzeCemSourceFidelity } from './analyzers/cem-source-fidelity.js';\nimport { analyzeSlotArchitecture } from './analyzers/slot-architecture.js';"
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/packages/core/src/handlers/health.ts",
  "old_string": "    case 'CEM-Source Fidelity': {\n      if (!config || !cem) {\n        return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };\n      }\n      const fidelity = await analyzeCemSourceFidelity(config, cem, decl);\n      if (!fidelity) {\n        return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };\n      }\n      return fidelity;\n    }\n\n    default:",
  "new_string": "    case 'CEM-Source Fidelity': {\n      if (!config || !cem) {\n        return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };\n      }\n      const fidelity = await analyzeCemSourceFidelity(config, cem, decl);\n      if (!fidelity) {\n        return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };\n      }\n      return fidelity;\n    }\n\n    case 'Slot Architecture': {\n      const slotResult = analyzeSlotArchitecture(decl);\n      if (!slotResult) {\n        return { score: 0, confidence: 'untested' as ConfidenceLevel, notApplicable: true };\n      }\n      return slotResult;\n    }\n\n    default:"
}
Now create the test file. Let me check what test fixtures exist for real CEM data.

🔧 Tool: Glob
Input: {
  "pattern": "tests/__fixtures__/**/*.json",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture"
}
Let me check the helix fixture for slot data and a couple others for test fixtures.

🔧 Tool: Agent
Input: {
  "description": "Find slot data in fixtures",
  "subagent_type": "Explore",
  "prompt": "Search for slot definitions in CEM fixture files. I need to find real slot data for test fixtures. Check these files for slot arrays:\n1. tests/__fixtures__/custom-elements.json - look for \"slots\" arrays\n2. tests/__fixtures__/spectrum-custom-elements.json - look for \"slots\" arrays  \n3. tests/__fixtures__/material-web-custom-elements.json - look for \"slots\" arrays\n4. tests/__fixtures__/helixui-custom-elements.json - look for \"slots\" arrays\n\nWorking directory: /Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture\n\nFor each file, find components (declarations) that have slots defined, and show the tagName, slots array, and any members that share names with the slots. I need 2-3 good examples from each library that have rich slot architecture (multiple named slots, default slots, etc.). Show the raw JSON snippets."
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/__fixtures__/custom-elements.json"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/__fixtures__/spectrum-custom-elements.json"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/__fixtures__/material-web-custom-elements.json"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/__fixtures__/helixui-custom-elements.json"
}

🔧 Tool: Bash
Input: {
  "command": "wc -l /Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/__fixtures__/*.json"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/__fixtures__/fast-custom-elements.json"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/__fixtures__/shoelace-custom-elements.json"
}
Now let me check what properties exist on the fixture components that share names with slots (for coherence testing).

🔧 Tool: Grep
Input: {
  "pattern": "\"tagName\": \"hx-card\"|\"tagName\": \"hx-dialog\"|\"tagName\": \"hx-drawer\"",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/__fixtures__/custom-elements.json",
  "output_mode": "content"
}
The helix components are in `custom-elements.json` as `my-*` prefixed. The feature description mentions `hx-card`, `hx-dialog`, `hx-drawer` but the fixtures use different names. I'll create inline test fixtures matching realistic component structures inspired by these real fixtures.

Now let me write the comprehensive test file.

🔧 Tool: Write
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/slot-architecture.test.ts",
  "content": "import { describe, it, expect } from 'vitest';\nimport { analyzeSlotArchitecture } from '../../packages/core/src/handlers/analyzers/slot-architecture.js';\nimport type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';\n\n// ─── Helix-style Fixtures ──────────────────────────────────────────────────────\n// Realistic slot architectures modeled after hx-card, hx-dialog, hx-drawer\n\nconst HX_CARD_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'HxCard',\n  tagName: 'hx-card',\n  description: 'A card component with flexible content areas.',\n  members: [\n    { kind: 'field', name: 'header', type: { text: 'string' }, description: 'Card header text.' },\n    {\n      kind: 'field',\n      name: 'footer',\n      type: { text: 'string' },\n      description: 'Card footer text.',\n    },\n    { kind: 'field', name: 'variant', type: { text: 'string' }, description: 'Card variant.' },\n  ],\n  slots: [\n    { name: '', description: 'Primary content area of the card.' },\n    {\n      name: 'header',\n      description: 'Optional custom header content, overrides the heading attribute.',\n    },\n    {\n      name: 'footer',\n      description: 'Footer content such as actions or metadata.',\n    },\n    {\n      name: 'media',\n      description: 'Media content (<img> or <video> element) displayed above the card body.',\n    },\n  ],\n};\n\nconst HX_DIALOG_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'HxDialog',\n  tagName: 'hx-dialog',\n  description:\n    'A dialog component.\\n@slot heading - The dialog heading, expects <h2> elements.\\n@slot actions - Action buttons for the dialog.',\n  members: [\n    {\n      kind: 'field',\n      name: 'heading',\n      type: { text: 'string' },\n      description: 'The dialog heading text.',\n    },\n    { kind: 'field', name: 'open', type: { text: 'boolean' }, description: 'Whether dialog is open.' },\n    { kind: 'field', name: 'modal', type: { text: 'boolean' }, description: 'Modal behavior.' },\n  ],\n  slots: [\n    { name: '', description: 'The dialog body content.' },\n    { name: 'heading', description: 'A slot for the dialog heading.' },\n    { name: 'footer', description: 'Footer area for action buttons.' },\n    { name: 'hero', description: 'A decorative image at the top of the dialog.' },\n  ],\n};\n\nconst HX_DRAWER_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'HxDrawer',\n  tagName: 'hx-drawer',\n  description: 'A drawer/panel component with header and content areas.',\n  members: [\n    {\n      kind: 'field',\n      name: 'label',\n      type: { text: 'string' },\n      description: 'Drawer label for accessibility.',\n    },\n    { kind: 'field', name: 'open', type: { text: 'boolean' }, description: 'Open state.' },\n    { kind: 'field', name: 'placement', type: { text: 'string' }, description: 'Placement side.' },\n  ],\n  slots: [\n    { name: '', description: 'The drawer body content.' },\n    { name: 'label', description: 'The drawer label content.' },\n    { name: 'header', description: 'Custom header content for the drawer.' },\n    { name: 'footer', description: 'Custom footer content for the drawer.' },\n  ],\n};\n\n// ─── Spectrum-style Fixtures ───────────────────────────────────────────────────\n\nconst SP_DIALOG_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'SpDialog',\n  tagName: 'sp-dialog',\n  description: 'Spectrum dialog component.',\n  members: [\n    { kind: 'field', name: 'size', type: { text: 'string' }, description: 'Dialog size.' },\n    { kind: 'field', name: 'dismissable', type: { text: 'boolean' } },\n  ],\n  slots: [\n    { name: '', description: 'The content of the dialog.' },\n    { name: 'heading', description: 'A slot for the heading of the dialog.' },\n    { name: 'hero', description: 'A decorative image at the top of the dialog.' },\n    { name: 'footer', description: 'Content for the footer area of the dialog.' },\n    { name: 'button', description: 'Action buttons for the dialog footer.' },\n  ],\n};\n\nconst SP_TEXTFIELD_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'SpTextfield',\n  tagName: 'sp-textfield',\n  description: 'Spectrum text input component.',\n  members: [\n    { kind: 'field', name: 'value', type: { text: 'string' }, description: 'Input value.' },\n    { kind: 'field', name: 'label', type: { text: 'string' }, description: 'Visible label.' },\n  ],\n  slots: [\n    {\n      name: 'help-text',\n      description:\n        'Default or non-negative help text to associate with your form element.',\n    },\n    {\n      name: 'negative-help-text',\n      description:\n        'Negative help text to associate with your form element when it is invalid.',\n    },\n  ],\n};\n\n// ─── Material-style Fixtures ───────────────────────────────────────────────────\n\nconst MD_DIALOG_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'MdDialog',\n  tagName: 'md-dialog',\n  description: 'Material Design dialog component.',\n  members: [\n    { kind: 'field', name: 'open', type: { text: 'boolean' }, description: 'Open state.' },\n    {\n      kind: 'field',\n      name: 'headline',\n      type: { text: 'string' },\n      description: 'Dialog headline text.',\n    },\n  ],\n  slots: [\n    { name: '', description: \"The dialog's content.\" },\n    { name: 'headline', description: \"The dialog's headline.\" },\n    { name: 'actions', description: \"The dialog's action buttons.\" },\n  ],\n};\n\nconst MD_BUTTON_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'MdFilledButton',\n  tagName: 'md-filled-button',\n  description: 'Material Design filled button.',\n  members: [\n    { kind: 'field', name: 'disabled', type: { text: 'boolean' }, description: 'Disabled state.' },\n    { kind: 'field', name: 'icon', type: { text: 'string' }, description: 'Icon name to display.' },\n  ],\n  slots: [\n    { name: '', description: \"The button's label.\" },\n    { name: 'icon', description: 'An optional <md-icon> element to display in the button.' },\n  ],\n};\n\n// ─── Edge-case Fixtures ────────────────────────────────────────────────────────\n\nconst SLOT_LESS_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'MyBadge',\n  tagName: 'my-badge',\n  description: 'A simple badge with no slots.',\n  members: [\n    { kind: 'field', name: 'count', type: { text: 'number' }, description: 'Badge count.' },\n  ],\n};\n\nconst DEFAULT_ONLY_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'MyWrapper',\n  tagName: 'my-wrapper',\n  description: 'A simple wrapper.',\n  slots: [{ name: '', description: 'The wrapped content.' }],\n};\n\nconst UNDOCUMENTED_SLOTS_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'MyPoorDocs',\n  tagName: 'my-poor-docs',\n  description: 'Component with undocumented slots.',\n  members: [\n    { kind: 'field', name: 'label', type: { text: 'string' } },\n    { kind: 'field', name: 'icon', type: { text: 'string' } },\n  ],\n  slots: [\n    { name: '' },\n    { name: 'label' },\n    { name: 'icon' },\n    { name: 'footer' },\n  ],\n};\n\nconst PARTIAL_COHERENCE_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'MyPartial',\n  tagName: 'my-partial',\n  description: 'Component where only one side of coherence pair is documented.',\n  members: [\n    { kind: 'field', name: 'label', type: { text: 'string' }, description: 'The label text.' },\n    { kind: 'field', name: 'icon', type: { text: 'string' } }, // no description\n  ],\n  slots: [\n    { name: '', description: 'Default content.' },\n    { name: 'label' }, // no description, but property has description\n    { name: 'icon', description: 'Icon slot for decorative elements.' }, // description, but property has none\n  ],\n};\n\nconst RESERVED_NAME_DECL: CemDeclaration = {\n  kind: 'class',\n  name: 'MyReserved',\n  tagName: 'my-reserved',\n  description: 'Component with reserved-name properties.',\n  members: [\n    { kind: 'field', name: 'class', type: { text: 'string' }, description: 'CSS class.' },\n    { kind: 'field', name: 'label', type: { text: 'string' }, description: 'The label.' },\n  ],\n  // Slot named 'class' should not pair with the 'class' property (reserved)\n  slots: [\n    { name: '', description: 'Content.' },\n    { name: 'class', description: 'Should not pair with reserved property.' },\n    { name: 'label', description: 'Label content.' },\n  ],\n};\n\n// ─── Tests ─────────────────────────────────────────────────────────────────────\n\ndescribe('Slot Architecture Analyzer', () => {\n  describe('null return for slot-less components', () => {\n    it('returns null for presentational components with no slots', () => {\n      const result = analyzeSlotArchitecture(SLOT_LESS_DECL);\n      expect(result).toBeNull();\n    });\n\n    it('returns null when slots array is empty', () => {\n      const decl: CemDeclaration = {\n        kind: 'class',\n        name: 'Empty',\n        tagName: 'empty-thing',\n        slots: [],\n      };\n      expect(analyzeSlotArchitecture(decl)).toBeNull();\n    });\n\n    it('returns null when slots is undefined', () => {\n      const decl: CemDeclaration = {\n        kind: 'class',\n        name: 'NoSlots',\n        tagName: 'no-slots',\n      };\n      expect(analyzeSlotArchitecture(decl)).toBeNull();\n    });\n  });\n\n  describe('default slot scoring', () => {\n    it('awards 25 points for default slot with description', () => {\n      const result = analyzeSlotArchitecture(DEFAULT_ONLY_DECL);\n      expect(result).not.toBeNull();\n      const defaultMetric = result!.subMetrics.find(\n        (m) => m.name === 'Default slot documentation',\n      );\n      expect(defaultMetric).toBeDefined();\n      expect(defaultMetric!.score).toBe(25);\n      expect(defaultMetric!.maxScore).toBe(25);\n    });\n\n    it('awards 15 points for default slot without description', () => {\n      const decl: CemDeclaration = {\n        kind: 'class',\n        name: 'NoDesc',\n        tagName: 'no-desc',\n        slots: [{ name: '' }],\n      };\n      const result = analyzeSlotArchitecture(decl);\n      expect(result).not.toBeNull();\n      const defaultMetric = result!.subMetrics.find(\n        (m) => m.name === 'Default slot documentation',\n      );\n      expect(defaultMetric!.score).toBe(15);\n    });\n\n    it('awards 0 points when no default slot exists', () => {\n      const decl: CemDeclaration = {\n        kind: 'class',\n        name: 'NoDefault',\n        tagName: 'no-default',\n        slots: [\n          { name: 'header', description: 'Header.' },\n          { name: 'footer', description: 'Footer.' },\n        ],\n      };\n      const result = analyzeSlotArchitecture(decl);\n      expect(result).not.toBeNull();\n      const defaultMetric = result!.subMetrics.find(\n        (m) => m.name === 'Default slot documentation',\n      );\n      expect(defaultMetric!.score).toBe(0);\n    });\n  });\n\n  describe('named slot documentation', () => {\n    it('awards 30 points when all named slots are documented', () => {\n      const result = analyzeSlotArchitecture(HX_CARD_DECL);\n      expect(result).not.toBeNull();\n      const namedMetric = result!.subMetrics.find(\n        (m) => m.name === 'Named slot documentation',\n      );\n      expect(namedMetric!.score).toBe(30);\n    });\n\n    it('awards proportional points for partially documented named slots', () => {\n      const decl: CemDeclaration = {\n        kind: 'class',\n        name: 'PartialNamed',\n        tagName: 'partial-named',\n        slots: [\n          { name: 'header', description: 'The header.' },\n          { name: 'footer' }, // undocumented\n          { name: 'sidebar' }, // undocumented\n        ],\n      };\n      const result = analyzeSlotArchitecture(decl);\n      expect(result).not.toBeNull();\n      const namedMetric = result!.subMetrics.find(\n        (m) => m.name === 'Named slot documentation',\n      );\n      // 1 out of 3 named slots documented: round(1/3 * 30) = 10\n      expect(namedMetric!.score).toBe(10);\n    });\n\n    it('awards full points when component has no named slots (trivially satisfied)', () => {\n      const result = analyzeSlotArchitecture(DEFAULT_ONLY_DECL);\n      expect(result).not.toBeNull();\n      const namedMetric = result!.subMetrics.find(\n        (m) => m.name === 'Named slot documentation',\n      );\n      expect(namedMetric!.score).toBe(30);\n    });\n\n    it('awards 0 when no named slots are documented', () => {\n      const result = analyzeSlotArchitecture(UNDOCUMENTED_SLOTS_DECL);\n      expect(result).not.toBeNull();\n      const namedMetric = result!.subMetrics.find(\n        (m) => m.name === 'Named slot documentation',\n      );\n      expect(namedMetric!.score).toBe(0);\n    });\n  });\n\n  describe('slot type constraints', () => {\n    it('detects element type mentions in slot descriptions', () => {\n      // hx-card has 'media' slot with \"<img> or <video> element\" in description\n      const result = analyzeSlotArchitecture(HX_CARD_DECL);\n      expect(result).not.toBeNull();\n      const typeMetric = result!.subMetrics.find(\n        (m) => m.name === 'Slot type constraints',\n      );\n      expect(typeMetric!.score).toBeGreaterThan(0);\n    });\n\n    it('detects JSDoc @slot annotations with type info from component description', () => {\n      // hx-dialog description has @slot heading with \"<h2> elements\"\n      const result = analyzeSlotArchitecture(HX_DIALOG_DECL);\n      expect(result).not.toBeNull();\n      const slots = result!.slots;\n      const headingSlot = slots.find((s) => s.name === 'heading');\n      expect(headingSlot!.hasTypeConstraint).toBe(true);\n    });\n\n    it('detects element type mentions like <md-icon>', () => {\n      const result = analyzeSlotArchitecture(MD_BUTTON_DECL);\n      expect(result).not.toBeNull();\n      const iconSlot = result!.slots.find((s) => s.name === 'icon');\n      expect(iconSlot!.hasTypeConstraint).toBe(true);\n    });\n\n    it('awards 0 when no slots have type constraints', () => {\n      const decl: CemDeclaration = {\n        kind: 'class',\n        name: 'NoTypes',\n        tagName: 'no-types',\n        slots: [\n          { name: '', description: 'Main content.' },\n          { name: 'header', description: 'Header area.' },\n        ],\n      };\n      const result = analyzeSlotArchitecture(decl);\n      expect(result).not.toBeNull();\n      const typeMetric = result!.subMetrics.find(\n        (m) => m.name === 'Slot type constraints',\n      );\n      expect(typeMetric!.score).toBe(0);\n    });\n  });\n\n  describe('slot-property coherence', () => {\n    it('identifies coherence pairs for hx-card (header, footer)', () => {\n      const result = analyzeSlotArchitecture(HX_CARD_DECL);\n      expect(result).not.toBeNull();\n      expect(result!.coherencePairs.length).toBe(2);\n      const headerPair = result!.coherencePairs.find((p) => p.slotName === 'header');\n      expect(headerPair).toBeDefined();\n      expect(headerPair!.coherent).toBe(true);\n      const footerPair = result!.coherencePairs.find((p) => p.slotName === 'footer');\n      expect(footerPair).toBeDefined();\n      expect(footerPair!.coherent).toBe(true);\n    });\n\n    it('identifies coherence pairs for md-dialog (headline)', () => {\n      const result = analyzeSlotArchitecture(MD_DIALOG_DECL);\n      expect(result).not.toBeNull();\n      const headlinePair = result!.coherencePairs.find((p) => p.slotName === 'headline');\n      expect(headlinePair).toBeDefined();\n      expect(headlinePair!.coherent).toBe(true);\n    });\n\n    it('identifies coherence pairs for md-filled-button (icon)', () => {\n      const result = analyzeSlotArchitecture(MD_BUTTON_DECL);\n      expect(result).not.toBeNull();\n      const iconPair = result!.coherencePairs.find((p) => p.slotName === 'icon');\n      expect(iconPair).toBeDefined();\n      expect(iconPair!.coherent).toBe(true);\n    });\n\n    it('awards partial points (50%) when only one side is documented', () => {\n      // PARTIAL_COHERENCE_DECL: label slot undocumented but property documented,\n      // icon slot documented but property undocumented\n      const result = analyzeSlotArchitecture(PARTIAL_COHERENCE_DECL);\n      expect(result).not.toBeNull();\n      expect(result!.coherencePairs.length).toBe(2);\n\n      const labelPair = result!.coherencePairs.find((p) => p.slotName === 'label');\n      expect(labelPair!.slotDocumented).toBe(false);\n      expect(labelPair!.propertyDocumented).toBe(true);\n      expect(labelPair!.coherent).toBe(false);\n\n      const iconPair = result!.coherencePairs.find((p) => p.slotName === 'icon');\n      expect(iconPair!.slotDocumented).toBe(true);\n      expect(iconPair!.propertyDocumented).toBe(false);\n      expect(iconPair!.coherent).toBe(false);\n\n      // Each pair gets 50% of (25/2) = 6.25, total = 12.5 → rounds to 13\n      const coherenceMetric = result!.subMetrics.find(\n        (m) => m.name === 'Slot-property coherence',\n      );\n      expect(coherenceMetric!.score).toBe(13);\n    });\n\n    it('skips coherence pairing for reserved/lifecycle property names', () => {\n      const result = analyzeSlotArchitecture(RESERVED_NAME_DECL);\n      expect(result).not.toBeNull();\n      // 'class' slot should NOT pair with 'class' property (reserved)\n      const classPair = result!.coherencePairs.find((p) => p.slotName === 'class');\n      expect(classPair).toBeUndefined();\n      // 'label' should still pair\n      const labelPair = result!.coherencePairs.find((p) => p.slotName === 'label');\n      expect(labelPair).toBeDefined();\n      expect(labelPair!.coherent).toBe(true);\n    });\n\n    it('awards full coherence points when no pairs exist (trivially satisfied)', () => {\n      // SP_TEXTFIELD_DECL: help-text and negative-help-text don't match any property names\n      const result = analyzeSlotArchitecture(SP_TEXTFIELD_DECL);\n      expect(result).not.toBeNull();\n      expect(result!.coherencePairs.length).toBe(0);\n      const coherenceMetric = result!.subMetrics.find(\n        (m) => m.name === 'Slot-property coherence',\n      );\n      expect(coherenceMetric!.score).toBe(25);\n    });\n  });\n\n  describe('total score calculation', () => {\n    it('scores hx-card with rich slot architecture high', () => {\n      const result = analyzeSlotArchitecture(HX_CARD_DECL);\n      expect(result).not.toBeNull();\n      // Default: 25, Named: 30, Type constraints > 0, Coherence: high\n      expect(result!.score).toBeGreaterThanOrEqual(70);\n    });\n\n    it('scores fully documented default-only component at max', () => {\n      const result = analyzeSlotArchitecture(DEFAULT_ONLY_DECL);\n      expect(result).not.toBeNull();\n      // Default: 25 + Named: 30 (trivial) + Type: 0 + Coherence: 25 (trivial) = 80\n      expect(result!.score).toBe(80);\n    });\n\n    it('scores undocumented slots low', () => {\n      const result = analyzeSlotArchitecture(UNDOCUMENTED_SLOTS_DECL);\n      expect(result).not.toBeNull();\n      // Default: 15 (no desc), Named: 0, Type: 0, Coherence: partial\n      expect(result!.score).toBeLessThan(50);\n    });\n\n    it('caps total at 100', () => {\n      const result = analyzeSlotArchitecture(HX_CARD_DECL);\n      expect(result).not.toBeNull();\n      expect(result!.score).toBeLessThanOrEqual(100);\n    });\n  });\n\n  describe('confidence and structure', () => {\n    it('returns verified confidence (pure CEM analysis)', () => {\n      const result = analyzeSlotArchitecture(HX_CARD_DECL);\n      expect(result!.confidence).toBe('verified');\n    });\n\n    it('returns 4 sub-metrics', () => {\n      const result = analyzeSlotArchitecture(HX_CARD_DECL);\n      expect(result!.subMetrics).toHaveLength(4);\n    });\n\n    it('includes slot analyses with correct structure', () => {\n      const result = analyzeSlotArchitecture(HX_CARD_DECL);\n      expect(result!.slots.length).toBe(4);\n      for (const slot of result!.slots) {\n        expect(slot).toHaveProperty('name');\n        expect(slot).toHaveProperty('isDefault');\n        expect(slot).toHaveProperty('hasDescription');\n        expect(slot).toHaveProperty('hasTypeConstraint');\n        expect(slot).toHaveProperty('matchingProperty');\n      }\n    });\n  });\n\n  describe('Spectrum component fixtures', () => {\n    it('scores sp-dialog with 5 slots correctly', () => {\n      const result = analyzeSlotArchitecture(SP_DIALOG_DECL);\n      expect(result).not.toBeNull();\n      expect(result!.slots.length).toBe(5);\n      // All named slots documented\n      const namedMetric = result!.subMetrics.find(\n        (m) => m.name === 'Named slot documentation',\n      );\n      expect(namedMetric!.score).toBe(30);\n    });\n\n    it('scores sp-textfield with help-text slots', () => {\n      const result = analyzeSlotArchitecture(SP_TEXTFIELD_DECL);\n      expect(result).not.toBeNull();\n      expect(result!.slots.length).toBe(2);\n      // No default slot\n      const defaultMetric = result!.subMetrics.find(\n        (m) => m.name === 'Default slot documentation',\n      );\n      expect(defaultMetric!.score).toBe(0);\n      // Both named slots documented\n      const namedMetric = result!.subMetrics.find(\n        (m) => m.name === 'Named slot documentation',\n      );\n      expect(namedMetric!.score).toBe(30);\n    });\n  });\n\n  describe('Material component fixtures', () => {\n    it('scores md-dialog with headline coherence pair', () => {\n      const result = analyzeSlotArchitecture(MD_DIALOG_DECL);\n      expect(result).not.toBeNull();\n      expect(result!.slots.length).toBe(3);\n      expect(result!.coherencePairs.length).toBeGreaterThanOrEqual(1);\n    });\n\n    it('scores md-filled-button with icon coherence pair', () => {\n      const result = analyzeSlotArchitecture(MD_BUTTON_DECL);\n      expect(result).not.toBeNull();\n      expect(result!.slots.length).toBe(2);\n      const iconPair = result!.coherencePairs.find((p) => p.slotName === 'icon');\n      expect(iconPair).toBeDefined();\n    });\n  });\n\n  describe('helix component fixtures', () => {\n    it('scores hx-card with header/footer coherence pairs', () => {\n      const result = analyzeSlotArchitecture(HX_CARD_DECL);\n      expect(result).not.toBeNull();\n      expect(result!.coherencePairs.length).toBe(2);\n      expect(result!.coherencePairs.every((p) => p.coherent)).toBe(true);\n    });\n\n    it('scores hx-dialog with heading coherence pair', () => {\n      const result = analyzeSlotArchitecture(HX_DIALOG_DECL);\n      expect(result).not.toBeNull();\n      const headingPair = result!.coherencePairs.find((p) => p.slotName === 'heading');\n      expect(headingPair).toBeDefined();\n      expect(headingPair!.coherent).toBe(true);\n    });\n\n    it('scores hx-drawer with label coherence pair', () => {\n      const result = analyzeSlotArchitecture(HX_DRAWER_DECL);\n      expect(result).not.toBeNull();\n      const labelPair = result!.coherencePairs.find((p) => p.slotName === 'label');\n      expect(labelPair).toBeDefined();\n      expect(labelPair!.coherent).toBe(true);\n    });\n  });\n});\n"
}
Now let me build and run tests.

🔧 Tool: Bash
Input: {
  "command": "pnpm run build:server 2>&1",
  "description": "Build the server",
  "timeout": 60000
}

🔧 Tool: Bash
Input: {
  "command": "pnpm run build 2>&1",
  "description": "Build the project",
  "timeout": 60000
}
Build succeeds. Now run the slot-architecture tests:

🔧 Tool: Bash
Input: {
  "command": "pnpm test -- --testPathPattern='slot-architecture' 2>&1",
  "description": "Run slot-architecture tests",
  "timeout": 60000
}

🔧 Tool: Bash
Input: {
  "command": "pnpm exec vitest run tests/handlers/slot-architecture.test.ts 2>&1",
  "description": "Run slot-architecture tests with vitest directly",
  "timeout": 60000
}
All 34 tests pass. Now run the full test suite to check nothing is broken:

🔧 Tool: Bash
Input: {
  "command": "pnpm test 2>&1",
  "description": "Run full test suite",
  "timeout": 120000
}
The failures are in existing tests that hardcode `12` dimensions — I need to update them to `13`. Let me find and fix those.

🔧 Tool: Grep
Input: {
  "pattern": "\\b12\\b.*dimension|dimension.*\\b12\\b",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests",
  "output_mode": "content",
  "-i": true
}

🔧 Tool: Grep
Input: {
  "pattern": "\"returns all 12|TOTAL_WEIGHT.*100|total.*weight.*100\"",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests",
  "output_mode": "content"
}

🔧 Tool: Grep
Input: {
  "pattern": "TOTAL_WEIGHT|totalWeight.*\\b100\\b|weight.*sum.*100",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests",
  "output_mode": "content"
}
Now update all test expectations from 12→13 and total weight 95→100.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/dimensions.test.ts",
  "old_string": "it('contains exactly 12 dimensions', () => {\n    expect(DIMENSION_REGISTRY).toHaveLength(12);",
  "new_string": "it('contains exactly 13 dimensions', () => {\n    expect(DIMENSION_REGISTRY).toHaveLength(13);"
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/dimensions.test.ts",
  "old_string": "expect(TOTAL_WEIGHT).toBe(95);",
  "new_string": "expect(TOTAL_WEIGHT).toBe(100);"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/dimensions.test.ts",
  "limit": 100
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/multi-dimensional-health.test.ts",
  "limit": 50
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/audit-report.test.ts",
  "limit": 50
}
Now let me update all the dimension count expectations across the three test files.

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/dimensions.test.ts",
  "old_string": "  it('contains exactly 12 dimensions', () => {\n    expect(DIMENSION_REGISTRY).toHaveLength(12);\n  });\n\n  it('has 7 cem-native dimensions', () => {\n    const cemNative = DIMENSION_REGISTRY.filter((d) => d.source === 'cem-native');\n    expect(cemNative).toHaveLength(7);\n  });",
  "new_string": "  it('contains exactly 13 dimensions', () => {\n    expect(DIMENSION_REGISTRY).toHaveLength(13);\n  });\n\n  it('has 8 cem-native dimensions', () => {\n    const cemNative = DIMENSION_REGISTRY.filter((d) => d.source === 'cem-native');\n    expect(cemNative).toHaveLength(8);\n  });"
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/dimensions.test.ts",
  "old_string": "  it('total weight equals 95', () => {\n    expect(TOTAL_WEIGHT).toBe(95);\n  });",
  "new_string": "  it('total weight equals 100', () => {\n    expect(TOTAL_WEIGHT).toBe(100);\n  });"
}
Now update multi-dimensional-health.test.ts. Let me read the relevant lines.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/multi-dimensional-health.test.ts",
  "offset": 138,
  "limit": 20
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/multi-dimensional-health.test.ts",
  "offset": 263,
  "limit": 15
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/multi-dimensional-health.test.ts",
  "offset": 333,
  "limit": 15
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/multi-dimensional-health.test.ts",
  "offset": 355,
  "limit": 15
}

🔧 Tool: Edit
Input: {
  "replace_all": true,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/multi-dimensional-health.test.ts",
  "old_string": "toHaveLength(12)",
  "new_string": "toHaveLength(13)"
}

🔧 Tool: Edit
Input: {
  "replace_all": true,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/multi-dimensional-health.test.ts",
  "old_string": "returns all 12 dimensions",
  "new_string": "returns all 13 dimensions"
}

🔧 Tool: Edit
Input: {
  "replace_all": true,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/multi-dimensional-health.test.ts",
  "old_string": "each result has all 12 dimensions",
  "new_string": "each result has all 13 dimensions"
}
Now update audit-report.test.ts:

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/audit-report.test.ts",
  "offset": 90,
  "limit": 15
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/audit-report.test.ts",
  "offset": 175,
  "limit": 15
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/audit-report.test.ts",
  "old_string": "    expect(parsed.dimensions.length).toBe(12);",
  "new_string": "    expect(parsed.dimensions.length).toBe(13);"
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/audit-report.test.ts",
  "old_string": "      expect(obj.dimensions).toHaveLength(12);",
  "new_string": "      expect(obj.dimensions).toHaveLength(13);"
}
Now rebuild and run full tests:

🔧 Tool: Bash
Input: {
  "command": "pnpm run build 2>&1 && pnpm test 2>&1",
  "description": "Build and run full test suite",
  "timeout": 120000
}
Two remaining failures: dimensions has "5 important" (now 6), and audit-report has a writeFile mock issue. Let me fix both.

🔧 Tool: Grep
Input: {
  "pattern": "\"has 5 important|has.*important\"",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/dimensions.test.ts",
  "output_mode": "content"
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/audit-report.test.ts",
  "offset": 120,
  "limit": 50
}

🔧 Tool: Grep
Input: {
  "pattern": "5 important",
  "path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/dimensions.test.ts",
  "output_mode": "content",
  "-n": true
}

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/dimensions.test.ts",
  "offset": 113,
  "limit": 10
}

🔧 Tool: Edit
Input: {
  "replace_all": false,
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/dimensions.test.ts",
  "old_string": "  it('has 5 important dimensions', () => {\n    expect(DIMENSION_CLASSIFICATION.important).toHaveLength(5);\n  });",
  "new_string": "  it('has 6 important dimensions', () => {\n    expect(DIMENSION_CLASSIFICATION.important).toHaveLength(6);\n  });"
}
Now for the audit-report writeFile issue — it seems like the audit-report now has an `auditDir` that auto-writes. Let me check.

🔧 Tool: Read
Input: {
  "file_path": "/Volumes/Development/booked/helixir/.worktrees/feature-analyzer-slot-architecture/tests/handlers/audit-report.test.ts",
  "offset": 167,
  "limit": 20
}
The audit-report writeFile test failure says writeFile was called 1 time with `/fake/project/audit/health.jsonl`. This seems like a pre-existing issue in the test that the new dimension change exposed (the mock restoring behavior). Let me check if this test was passing before my changes by looking at the error more carefully.

The error message says writeFile was called once when no `outputPath` was provided. This is likely because mock state leaks between tests — `vi.restoreAllMocks()` runs in `afterEach` but the mock from the prior test ("calls writeFile when outputPath is provided") may be interfering. This is a pre-existing test ordering issue, not caused by my changes. Let me verify by checking git diff.

🔧 Tool: Bash
Input: {
  "command": "git diff --stat 2>&1",
  "description": "Check changed files"
}
My changes to audit-report.test.ts are only the `12→13` updates. Let me verify this test was already failing before my changes by checking if it's a known flaky test.

🔧 Tool: Bash
Input: {
  "command": "pnpm exec vitest run tests/handlers/audit-report.test.ts 2>&1",
  "description": "Run audit-report tests in isolation",
  "timeout": 30000
}
This is a pre-existing test issue — the mock isn't properly clearing between tests. The `writeFile` call from the previous test ("calls writeFile when outputPath is provided") is leaking. This is not caused by my changes. Let me verify by checking git stash to confirm:

🔧 Tool: Bash
Input: {
  "command": "git stash && pnpm exec vitest run tests/handlers/audit-report.test.ts 2>&1; git stash pop",
  "description": "Run audit test on clean state to verify pre-existing failure",
  "timeout": 30000
}
Confirmed: the audit-report writeFile test was **already failing on main** before my changes. This is a pre-existing issue, not caused by the slot architecture feature.

Now let me run the full suite excluding that pre-existing failure to confirm everything else passes:

🔧 Tool: Bash
Input: {
  "command": "pnpm exec vitest run --reporter=verbose 2>&1 | grep -E '(FAIL|failed|Tests |Test Files)' | tail -20",
  "description": "Run full suite and check for failures",
  "timeout": 120000
}
Only 1 failure — the pre-existing audit-report mock issue that was already broken before my changes. All 1596 other tests pass, including 34 new slot-architecture tests.

Let me verify the diff is clean:

🔧 Tool: Bash
Input: {
  "command": "git diff --stat 2>&1",
  "description": "Verify changed files"
}
Plus 2 new files (slot-architecture.ts and slot-architecture.test.ts). Exactly the expected file scope.

<summary>
## Summary: Slot Architecture Analyzer (Dimension 13)

### Changes Implemented
- Created `analyzeSlotArchitecture()` function with 4 scoring categories totaling 100 points:
  - **Default slot documentation** (0-25): 15 for presence, 10 for description
  - **Named slot documentation** (0-30): proportional to documented/total named slots
  - **Slot type constraints** (0-20): detects element types in descriptions and JSDoc `@slot` annotations
  - **Slot-property coherence** (0-25): identifies matching slot/property pairs, awards 50% for partial documentation per deviation rules
- Returns `null` for slot-less components (honest scoring)
- Skips reserved names (`class`, `ref`, etc.) for coherence pairing per deviation rules
- Registered as dimension 13 with weight 5, tier `important`, source `cem-native`
- Wired into `scoreComponentMultiDimensional()` dispatch in health.ts
- Updated existing test expectations from 12→13 dimensions and 95→100 total weight

### Files Modified
- **New:** `packages/core/src/handlers/analyzers/slot-architecture.ts` — analyzer implementation
- **New:** `tests/handlers/slot-architecture.test.ts` — 34 test cases
- **Modified:** `packages/core/src/handlers/analyzers/index.ts` — barrel export
- **Modified:** `packages/core/src/handlers/dimensions.ts` — dimension 13 registration + classification
- **Modified:** `packages/core/src/handlers/health.ts` — import + case dispatch
- **Modified:** `tests/handlers/audit-report.test.ts` — 12→13 dimension count
- **Modified:** `tests/handlers/dimensions.test.ts` — 12→13 dimensions, 7→8 cem-native, 5→6 important, 95→100 weight
- **Modified:** `tests/handlers/multi-dimensional-health.test.ts` — 12→13 dimension count

### Risks/Blockers Encountered
- Pre-existing test failure in `audit-report.test.ts` ("does not call writeFile when outputPath is not provided") — confirmed failing on main branch before any changes. Mock state leak between tests, not related to this feature.

### Learnings
- Trivially-satisfied scoring (full points when category is N/A) prevents false penalization of simple components
- Deviation rule for partial coherence (50% for one-sided documentation) provides better signal than binary scoring

### Verification Status
- Build: `pnpm run build` exits 0
- Tests: 34 new tests pass, 1596 total tests pass (1 pre-existing failure unrelated to this feature)
- Playwright verification not applicable — this is a pure TypeScript library with no UI components
</summary>