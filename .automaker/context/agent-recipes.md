# Agent Delegation Recipes — HELiXiR

This file provides copy-paste prompt templates for the most common HELiXiR workflows. Each recipe is designed to be used as a prompt directly in Claude Code or any MCP-connected AI agent.

Recipes are organized by task. Each includes the prompt template, the specific MCP tools invoked, and example output so you know what to expect.

---

## Recipe 1: Audit My Component Library

**Use when:** You want a full health picture of your library — every component scored across all 11 quality dimensions.

**Prompt:**
```
Audit all components in this library using helixir.
Run audit_library to generate the full JSONL report at "audit/health.jsonl",
then run get_health_summary to show me:
- Total components scored
- Grade distribution (A/B/C/D/F)
- Average score and per-dimension averages
- Components scoring below 70 that need immediate attention
```

**Tools used:**
- `audit_library` — generates per-component JSONL scored across all 11 dimensions
- `get_health_summary` — returns aggregate stats, grade distribution, and attention list

**Example output:**
```json
{
  "totalComponents": 42,
  "averageScore": 71.3,
  "gradeDistribution": { "A": 8, "B": 14, "C": 12, "D": 6, "F": 2 },
  "dimensionAverages": {
    "CEM Completeness": 84.2,
    "Accessibility Compliance": 61.8,
    "Type Coverage": 77.4,
    "Test Coverage": 55.1,
    "CEM-Source Fidelity": 79.6
  },
  "componentsNeedingAttention": ["hx-data-grid", "hx-tree", "hx-rich-text"]
}
```

---

## Recipe 2: Scaffold a Data-Grid Component

**Use when:** You need to create a new component that follows the library's established patterns.

**Prompt:**
```
Scaffold a new data-grid component for this library using helixir.
Call scaffold_component with:
- tagName: "hx-data-grid"
- description: "A performant, paginated data grid with sortable columns and row selection"
- properties:
    - name: "columns", type: "ColumnDef[]", description: "Column definitions"
    - name: "rows", type: "unknown[]", description: "Row data"
    - name: "pageSize", type: "number", attribute: "page-size", default: "25"
    - name: "selectable", type: "boolean", default: "false"
- events:
    - name: "hx-row-select", type: "CustomEvent<{ row: unknown }>"
    - name: "hx-sort", type: "CustomEvent<{ column: string; direction: 'asc' | 'desc' }>"
- slots:
    - name: "empty", description: "Content shown when there are no rows"
- cssParts:
    - name: "table", description: "The inner table element"
    - name: "header-cell", description: "Each column header cell"
    - name: "row", description: "Each data row"
    - name: "cell", description: "Each data cell"

After scaffolding, run get_project_diagnostics to confirm there are no type errors.
```

**Tools used:**
- `scaffold_component` — generates Lit source, Vitest test stub, and Storybook CSF3 story
- `get_project_diagnostics` — verifies no TypeScript errors introduced

**Example output:**
```
Generated 3 files:
  src/components/hx-data-grid/hx-data-grid.ts      (Lit component)
  src/components/hx-data-grid/hx-data-grid.test.ts (Vitest stub)
  src/components/hx-data-grid/hx-data-grid.stories.ts (Storybook CSF3)

TypeScript diagnostics: 0 errors, 0 warnings
```

---

## Recipe 3: Check a PR for Breaking Changes

**Use when:** Before merging a PR, you want to scan every component for breaking API changes against the base branch.

**Prompt:**
```
Check this branch for breaking changes against main using helixir.
Run check_breaking_changes with baseBranch: "main".
List every component that has breaking changes — removed properties, renamed events,
or type changes — and explain what consumers will need to update.
```

**Tools used:**
- `check_breaking_changes` — scans all components against base branch CEM, returns per-component status
- `diff_cem` — (optional follow-up) detailed diff for a specific component

**Example output:**
```
Breaking change scan — comparing HEAD → main

✅ hx-button          No changes
✅ hx-input           No changes
⚠️  hx-select         Non-breaking: added property 'searchable'
❌ hx-dialog          BREAKING: event renamed 'close' → 'hx-close'
❌ hx-checkbox        BREAKING: property 'checked' type changed (boolean → boolean | 'mixed')

2 breaking changes found. Consumers must update before upgrading.
```

**Follow-up for details:**
```
Run diff_cem for hx-dialog with baseBranch: "main" to see the full migration guide.
```

---

## Recipe 4: Generate TypeScript Declaration Files

**Use when:** You want to ship accurate `.d.ts` types for your component library so consumers get full IDE autocompletion.

**Prompt:**
```
Generate TypeScript type declarations for all components in this library using helixir.
Run generate_types and show me the output.
The types should cover every component's attributes, properties, events, and slots.
Save the result as helix.d.ts in the project root.
```

**Tools used:**
- `generate_types` — generates `.d.ts` content from the CEM, sourcing attribute names from the CEM `attribute` field

**Example output:**
```typescript
// 42 component(s) generated

declare namespace JSX {
  interface IntrinsicElements {
    'hx-button': HxButtonAttributes;
    'hx-input': HxInputAttributes;
    // ... 40 more
  }
}

interface HxButtonAttributes {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
}

// Event maps
interface HxButtonEventMap {
  'hx-click': CustomEvent<void>;
  'hx-focus': CustomEvent<void>;
  'hx-blur': CustomEvent<void>;
}
```

**After generation:**
```
Write the output to helix.d.ts, then run get_file_diagnostics on helix.d.ts
to verify it has no syntax errors.
```

---

## Recipe 5: Create an Enterprise Theme

**Use when:** You need to create a branded theme for a customer or product line using your library's design token system.

**Prompt:**
```
Help me create a "brand-dark" enterprise theme for this component library using helixir.
First, run get_design_tokens with category "color" to see all available color tokens.
Then run find_token with query "primary" to identify the key brand tokens.
Finally, show me what CSS I need to write to override the primary palette to these brand colors:
  Primary: #1a56db
  Surface: #0f172a
  Text: #f1f5f9
  Border: #334155
```

**Tools used:**
- `get_design_tokens` — lists all tokens by category (color, spacing, typography, etc.)
- `find_token` — finds tokens by name pattern or value substring
- `find_components_using_token` — (optional) identifies which components use a specific token

**Example output:**
```
Color tokens found: 128 tokens

Key primary tokens:
  --hx-color-primary-500  #3b82f6  (background)
  --hx-color-primary-600  #2563eb  (hover)
  --hx-color-primary-700  #1d4ed8  (active)
  --hx-color-primary-foreground  #ffffff  (text on primary)

Recommended CSS for brand-dark theme:
```

```css
.theme-brand-dark {
  color-scheme: dark;

  /* Primary palette */
  --hx-color-primary-500: #1a56db;
  --hx-color-primary-600: #1648c4;
  --hx-color-primary-700: #123bab;
  --hx-color-primary-foreground: #f1f5f9;

  /* Surface */
  --hx-color-surface: #0f172a;
  --hx-color-surface-elevated: #1e293b;

  /* Text */
  --hx-color-text-primary: #f1f5f9;
  --hx-color-text-secondary: #94a3b8;

  /* Border */
  --hx-color-border: #334155;
}
```

**To find which components are affected:**
```
Run find_components_using_token with tokenName: "--hx-color-primary-500"
to see every component this theme change touches.
```

---

## Recipe 6: Run an Accessibility Audit

**Use when:** You want a complete picture of accessibility compliance across your component library.

**Prompt:**
```
Run a full accessibility audit of this component library using helixir.
Run analyze_accessibility without a tagName to analyze all components.
Report:
1. Components with zero accessibility support (score 0)
2. Components missing keyboard event handling
3. Components missing label support
4. Form-associated components missing disabled state
5. Overall accessibility score distribution
```

**Tools used:**
- `analyze_accessibility` — checks ARIA roles, aria-* attributes, keyboard events, focus management, disabled state, label support, form association
- `score_component` with `multiDimensional: true` — (follow-up) detailed Accessibility Compliance dimension score for a specific component

**Example output:**
```json
{
  "summary": {
    "total": 42,
    "withARIA": 31,
    "withKeyboardEvents": 28,
    "withLabelSupport": 19,
    "formAssociated": 8,
    "averageScore": 61.8
  },
  "attention": [
    {
      "tagName": "hx-data-grid",
      "score": 12,
      "issues": [
        "No ARIA role defined",
        "No keyboard event handlers",
        "No label support"
      ]
    },
    {
      "tagName": "hx-tree",
      "score": 24,
      "issues": [
        "No aria-expanded handling",
        "Missing keyboard navigation (ArrowUp/Down)"
      ]
    }
  ]
}
```

**For detailed remediation on a specific component:**
```
Run score_component with tagName: "hx-data-grid" and multiDimensional: true
to see the full Accessibility Compliance dimension breakdown with sub-metrics.
```

---

## Quick Reference: All Helixir MCP Tools

| Category | Tool | Purpose |
|----------|------|---------|
| **Discovery** | `list_components` | List all components in the CEM |
| | `find_component` | Search components by name/description |
| | `get_component` | Full API metadata for one component |
| | `get_component_narrative` | Prose description with usage examples |
| | `get_component_quick_ref` | Compact API surface (attributes, events, slots, parts) |
| **Health** | `score_component` | Health score for one component |
| | `score_all_components` | Scores for every component |
| | `get_health_summary` | Aggregate stats and attention list |
| | `get_health_trend` | Score history over N days |
| | `get_health_diff` | Before/after comparison vs. base branch |
| | `audit_library` | Full JSONL audit report |
| | `analyze_accessibility` | Accessibility profile for one or all components |
| **Safety** | `check_breaking_changes` | Scan all components for breaking API changes |
| | `diff_cem` | Detailed diff for one component vs. base branch |
| | `validate_usage` | Validate HTML usage against CEM spec |
| **Scaffold** | `scaffold_component` | Generate Lit component + test + story |
| **Types** | `generate_types` | Generate `.d.ts` declarations from CEM |
| | `get_file_diagnostics` | TypeScript errors for a single file |
| | `get_project_diagnostics` | Full project TypeScript diagnostic pass |
| **Tokens** | `get_design_tokens` | List all design tokens by category |
| | `find_token` | Find tokens by name or value |
| | `find_components_using_token` | Which components use a given token |
| **Styling** | `styling_preflight` | Validate CSS against actual component API |
| | `validate_component_code` | Full HTML + CSS + JS validation |
| | `suggest_fix` | Get corrected code for a specific issue |
| **Libraries** | `load_library` | Load an additional component library |
| | `list_libraries` | List all loaded libraries |
