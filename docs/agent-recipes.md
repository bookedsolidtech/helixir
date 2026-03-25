# HELiXiR Agent Recipes

Copy-paste prompt templates for the most common HELiXiR workflows. Each recipe is designed to be used directly in Claude Code or any MCP-connected AI assistant.

---

## Contents

1. [Audit My Component Library](#recipe-1-audit-my-component-library)
2. [Scaffold a Data-Grid Component](#recipe-2-scaffold-a-data-grid-component)
3. [Check a PR for Breaking Changes](#recipe-3-check-a-pr-for-breaking-changes)
4. [Generate TypeScript Declaration Files](#recipe-4-generate-typescript-declaration-files)
5. [Create an Enterprise Theme](#recipe-5-create-an-enterprise-theme)
6. [Run an Accessibility Audit](#recipe-6-run-an-accessibility-audit)
7. [Quick Reference: All HELiXiR Tools](#quick-reference-all-helixir-tools)

---

## Recipe 1: Audit My Component Library

Get a full health picture of your library — every component scored across all 11 quality dimensions with an aggregate summary and attention list.

### When to use

- Before a major release to establish a quality baseline
- After a refactor to check for regressions
- During enterprise onboarding to assess library readiness

### Prompt

```
Audit all components in this library using helixir.
Run audit_library to generate the full JSONL report at "audit/health.jsonl",
then run get_health_summary to show me:
- Total components scored
- Grade distribution (A/B/C/D/F)
- Average score and per-dimension averages
- Components scoring below 70 that need immediate attention
```

### Tools invoked

| Tool                 | Purpose                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `audit_library`      | Generates a JSONL file with every component scored across 11 dimensions                  |
| `get_health_summary` | Returns aggregate stats: average, grade distribution, dimension averages, attention list |

### Example output

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
  "componentsNeedingAttention": ["hx-data-grid", "hx-tree", "hx-rich-text"],
  "timestamp": "2026-03-25T10:00:00.000Z"
}
```

### Notes

- The JSONL file at `audit/health.jsonl` contains one JSON object per line — pipe it into `jq` for custom analysis.
- Add `multiDimensional: true` to `score_all_components` if you want per-component dimension breakdowns instead of the aggregate.
- Run `get_health_trend` on specific components to track improvement over time.

---

## Recipe 2: Scaffold a Data-Grid Component

Generate a new component that follows your library's established Lit patterns — source file, Vitest test stub, and Storybook story, all in one call.

### When to use

- Starting a new component from scratch
- Prototyping a component spec before implementation
- Ensuring new components match existing library conventions

### Prompt

```
Scaffold a new data-grid component for this library using helixir.
Call scaffold_component with:
- tagName: "hx-data-grid"
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

### Tools invoked

| Tool                      | Purpose                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `scaffold_component`      | Generates Lit source with decorators, CEM annotations, Vitest stub, and Storybook CSF3 story |
| `get_project_diagnostics` | Verifies no TypeScript errors were introduced                                                |

### Example output

```
Generated 3 files:
  src/components/hx-data-grid/hx-data-grid.ts         (Lit component)
  src/components/hx-data-grid/hx-data-grid.test.ts    (Vitest stub)
  src/components/hx-data-grid/hx-data-grid.stories.ts (Storybook CSF3)

TypeScript diagnostics: 0 errors, 0 warnings
```

The generated source file includes:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * A performant, paginated data grid with sortable columns and row selection.
 *
 * @slot empty - Content shown when there are no rows
 * @csspart table - The inner table element
 * @csspart header-cell - Each column header cell
 * @csspart row - Each data row
 * @csspart cell - Each data cell
 * @fires hx-row-select - Fired when a row is selected
 * @fires hx-sort - Fired when a column header is clicked
 */
@customElement('hx-data-grid')
export class HxDataGrid extends LitElement {
  @property({ type: Array }) columns: ColumnDef[] = [];
  @property({ type: Array }) rows: unknown[] = [];
  @property({ type: Number, attribute: 'page-size' }) pageSize = 25;
  @property({ type: Boolean }) selectable = false;
  // ...
}
```

### Notes

- The `baseClass` parameter is auto-detected from your CEM if omitted — it defaults to your library's established base class.
- After scaffolding, regenerate your CEM (`npm run analyze:cem`) so `get_component` picks up the new component.
- Customize the scaffold output by providing detailed `description` fields — they appear in JSDoc and CEM documentation.

---

## Recipe 3: Check a PR for Breaking Changes

Scan every component in your library for breaking API changes before merging a pull request.

### When to use

- Pre-merge review on any PR touching component source files
- Release branch preparation for major/minor versions
- Automated CI gate on pull requests targeting `main`

### Prompt

```
Check this branch for breaking changes against main using helixir.
Run check_breaking_changes with baseBranch: "main".
List every component that has breaking changes — removed properties,
renamed events, or type changes — and explain what consumers will need to update.
```

### Tools invoked

| Tool                     | Purpose                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| `check_breaking_changes` | Scans all components against base branch CEM, returns per-component emoji status |
| `diff_cem`               | (Follow-up) Detailed migration guide for a specific component                    |

### Example output

```
Breaking change scan — comparing HEAD → main

✅ hx-button          No changes
✅ hx-input           No changes
✅ hx-icon            No changes
⚠️  hx-select         Non-breaking: added property 'searchable'
⚠️  hx-badge          Non-breaking: added CSS part 'label'
❌ hx-dialog          BREAKING: event renamed 'close' → 'hx-close'
❌ hx-checkbox        BREAKING: property 'checked' type changed (boolean → boolean | 'mixed')

2 breaking changes found across 42 components.
```

### Follow-up: Get a migration guide for a specific component

```
Run diff_cem for hx-dialog with baseBranch: "main"
to generate a full migration guide for consumers.
```

Migration guide output:

````markdown
## hx-dialog — Migration Guide

### Renamed event: `close` → `hx-close`

The `close` event has been renamed to `hx-close` to match the library's
event naming convention.

**Before:**

```js
dialog.addEventListener('close', handler);
```
````

**After:**

```js
dialog.addEventListener('hx-close', handler);
```

````

### CI integration

Add to your GitHub Actions workflow:

```yaml
- name: Check for breaking changes
  run: |
    # Run HELiXiR MCP server and check for breaking changes
    npx helixir check_breaking_changes --baseBranch main
  env:
    MCP_WC_PROJECT_ROOT: ${{ github.workspace }}/packages/web-components
````

---

## Recipe 4: Generate TypeScript Declaration Files

Generate accurate `.d.ts` type declarations for your entire component library so consumers get full IDE autocompletion.

### When to use

- Publishing a new release to npm
- Setting up TypeScript support for framework consumers (React, Vue, Angular)
- Validating that your CEM accurately reflects your TypeScript source

### Prompt

```
Generate TypeScript type declarations for all components in this library using helixir.
Run generate_types and show me the output.
The types should cover every component's attributes, properties, events, and slots.
Save the result as helix.d.ts in the project root.
After saving, run get_file_diagnostics on helix.d.ts to confirm no syntax errors.
```

### Tools invoked

| Tool                   | Purpose                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `generate_types`       | Generates `.d.ts` content from CEM, using the `attribute` field for attribute interface names |
| `get_file_diagnostics` | Runs TypeScript diagnostics on the saved declaration file                                     |

### Example output

```typescript
// 42 component(s) generated

declare namespace JSX {
  interface IntrinsicElements {
    'hx-button': HxButtonAttributes;
    'hx-input': HxInputAttributes;
    'hx-dialog': HxDialogAttributes;
    // ... 39 more
  }
}

interface HxButtonAttributes {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  href?: string;
}

interface HxButtonEventMap {
  'hx-click': CustomEvent<void>;
  'hx-focus': CustomEvent<void>;
  'hx-blur': CustomEvent<void>;
}

// ... (all 42 components)
```

### Notes

- Attribute interface property names come from the CEM `attribute` field (the HTML attribute name, e.g. `page-size`), not the JavaScript property name (`pageSize`). This ensures the output matches actual HTML usage.
- Run `get_project_diagnostics` after saving to check for type conflicts with your existing TypeScript source.
- To verify specific components have correct types, use `get_component` to inspect CEM member types before generating.

---

## Recipe 5: Create an Enterprise Theme

Discover your library's design token structure and generate the CSS needed to brand it for a specific customer or product line.

### When to use

- Onboarding an enterprise customer with custom branding
- Creating a dark/light variant of your library's default theme
- Auditing which components are affected by a token change

### Prompt

```
Help me create a "brand-dark" enterprise theme for this component library using helixir.
First, run get_design_tokens with category "color" to see all available color tokens.
Then run find_token with query "primary" to identify the key brand tokens.
Show me which components use the primary color tokens by calling
find_components_using_token with tokenName: "--hx-color-primary-500".
Finally, generate the CSS theme file for these brand colors:
  Primary: #1a56db
  Surface: #0f172a
  Text: #f1f5f9
  Border: #334155
```

### Tools invoked

| Tool                          | Purpose                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| `get_design_tokens`           | Lists all design tokens by category (color, spacing, typography, etc.) |
| `find_token`                  | Finds tokens by name pattern or value substring                        |
| `find_components_using_token` | Shows which components consume a given token — impact analysis         |

### Example output

**Token discovery:**

```
Color tokens: 128 tokens

Key primary tokens:
  --hx-color-primary-400  #60a5fa  (light variant)
  --hx-color-primary-500  #3b82f6  (main background)
  --hx-color-primary-600  #2563eb  (hover state)
  --hx-color-primary-700  #1d4ed8  (active/pressed)
  --hx-color-primary-foreground  #ffffff  (text on primary)
```

**Components affected by --hx-color-primary-500:**

```
14 components use --hx-color-primary-500:
  hx-button, hx-badge, hx-progress, hx-spinner,
  hx-checkbox, hx-radio, hx-switch, hx-slider,
  hx-link, hx-tag, hx-alert, hx-tooltip,
  hx-tabs, hx-pagination
```

**Generated theme CSS:**

```css
.theme-brand-dark {
  color-scheme: dark;

  /* Primary brand palette */
  --hx-color-primary-400: #3d72f5;
  --hx-color-primary-500: #1a56db;
  --hx-color-primary-600: #1648c4;
  --hx-color-primary-700: #123bab;
  --hx-color-primary-foreground: #f1f5f9;

  /* Surfaces */
  --hx-color-surface: #0f172a;
  --hx-color-surface-elevated: #1e293b;
  --hx-color-surface-overlay: rgba(15, 23, 42, 0.8);

  /* Text */
  --hx-color-text-primary: #f1f5f9;
  --hx-color-text-secondary: #94a3b8;
  --hx-color-text-muted: #64748b;

  /* Borders */
  --hx-color-border: #334155;
  --hx-color-border-strong: #475569;
}
```

**To apply the theme:**

```html
<body class="theme-brand-dark">
  <!-- All hx-* components inherit the theme tokens -->
</body>
```

### Notes

- CSS custom properties cascade through Shadow DOM — setting tokens on a parent element affects all descendant components.
- Use `find_component` to check if any newly scaffolded components need to be updated to consume the new tokens.
- For design token format, HELiXiR reads W3C DTCG format, Theo, and Style Dictionary compatible JSON when `tokensPath` is configured.

---

## Recipe 6: Run an Accessibility Audit

Get a complete picture of accessibility compliance across your entire component library.

### When to use

- Preparing VPAT or HECVAT documentation for enterprise customers
- Identifying gaps before an ADA/Section 508 compliance review
- Prioritizing accessibility remediation work by component severity

### Prompt

```
Run a full accessibility audit of this component library using helixir.
Run analyze_accessibility without a tagName to analyze all components.
Report:
1. Components with zero accessibility support (score 0)
2. Components missing keyboard event handling
3. Components missing label support
4. Form-associated components missing disabled state
5. Overall accessibility score distribution

Then run score_component with multiDimensional: true for the 3 lowest-scoring
components to get detailed sub-metric breakdowns and remediation guidance.
```

### Tools invoked

| Tool                                 | Purpose                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `analyze_accessibility`              | Checks all components for ARIA roles, keyboard events, focus management, form association, label support, and disabled state |
| `score_component` (multiDimensional) | Returns the full Accessibility Compliance dimension with sub-metrics and confidence level                                    |

### Example output

**Library-wide accessibility report:**

```json
{
  "summary": {
    "total": 42,
    "withARIARole": 31,
    "withKeyboardEvents": 28,
    "withLabelSupport": 19,
    "formAssociated": 8,
    "averageScore": 61.8
  },
  "critical": [
    {
      "tagName": "hx-data-grid",
      "score": 12,
      "issues": [
        "No ARIA role defined",
        "No keyboard event handlers",
        "No label support",
        "No disabled state"
      ]
    },
    {
      "tagName": "hx-tree",
      "score": 24,
      "issues": ["Missing aria-expanded state", "No keyboard navigation (ArrowUp/Down/Left/Right)"]
    }
  ],
  "noKeyboard": ["hx-data-grid", "hx-tree", "hx-rich-text", "hx-color-picker"],
  "noLabelSupport": ["hx-data-grid", "hx-tree", "hx-rich-text", "hx-timeline", "hx-carousel"]
}
```

**Detailed score for hx-data-grid:**

```json
{
  "tagName": "hx-data-grid",
  "score": 12,
  "grade": "F",
  "confidence": "heuristic",
  "dimensions": {
    "Accessibility Compliance": {
      "score": 12,
      "tier": "Critical",
      "subMetrics": [
        { "name": "ARIA Role", "score": 0, "max": 15 },
        { "name": "Keyboard Events", "score": 0, "max": 20 },
        { "name": "Label Support", "score": 0, "max": 20 },
        { "name": "Focus Management", "score": 8, "max": 20 },
        { "name": "Disabled State", "score": 4, "max": 25 }
      ],
      "recommendation": "Add role='grid', aria-label support, and keyboard navigation (ArrowUp/Down/Left/Right, Home, End, Enter) before production use."
    }
  }
}
```

### Notes

- `analyze_accessibility` uses a two-layer analysis: CEM-level heuristic signals (8 signals) + source-level regex patterns (7 markers), blended 30/70 when source files are available.
- Components scoring below 30 on Accessibility Compliance will fail the Critical tier gate in multi-dimensional scoring, capping the overall grade at C regardless of other dimension scores.
- For the most accurate results, ensure your CEM is regenerated from source before running the audit.
- After remediating issues, run `get_health_diff` to confirm your accessibility scores improved vs. the previous state.

---

## Quick Reference: All HELiXiR Tools

### Discovery

| Tool                         | Input        | Returns                                                      |
| ---------------------------- | ------------ | ------------------------------------------------------------ |
| `list_components`            | `libraryId?` | All components in the CEM                                    |
| `find_component`             | `query`      | Top 3 semantic matches                                       |
| `get_component`              | `tagName`    | Full API metadata (members, events, slots, parts, CSS props) |
| `get_component_narrative`    | `tagName`    | Prose description with usage examples                        |
| `get_component_quick_ref`    | `tagName`    | Compact API surface                                          |
| `get_component_dependencies` | `tagName`    | Internal dependency tree                                     |

### Health Scoring

| Tool                    | Input                          | Returns                                             |
| ----------------------- | ------------------------------ | --------------------------------------------------- |
| `score_component`       | `tagName`, `multiDimensional?` | Grade, score, dimension breakdown                   |
| `score_all_components`  | `multiDimensional?`            | Scores for every component                          |
| `get_health_summary`    | `libraryId?`                   | Aggregate stats, grade distribution, attention list |
| `get_health_trend`      | `tagName`, `days?`             | Score history and trend direction                   |
| `get_health_diff`       | `tagName`, `baseBranch?`       | Before/after comparison                             |
| `audit_library`         | `outputPath?`                  | JSONL audit report for all components               |
| `analyze_accessibility` | `tagName?`                     | Accessibility profile (one or all)                  |

### Safety & Validation

| Tool                      | Input                            | Returns                                           |
| ------------------------- | -------------------------------- | ------------------------------------------------- |
| `check_breaking_changes`  | `baseBranch`                     | Per-component emoji status for all components     |
| `diff_cem`                | `tagName`, `baseBranch`          | Detailed diff + migration guide for one component |
| `validate_usage`          | `tagName`, `html`                | Pass/fail with attribute and slot issues          |
| `validate_component_code` | `html`, `css`, `code`, `tagName` | 20-validator full check                           |

### Scaffolding

| Tool                 | Input                                                      | Returns                                    |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `scaffold_component` | `tagName`, `properties?`, `events?`, `slots?`, `cssParts?` | Lit source + Vitest stub + Storybook story |

### TypeScript

| Tool                      | Input        | Returns                                 |
| ------------------------- | ------------ | --------------------------------------- |
| `generate_types`          | `libraryId?` | `.d.ts` declarations for all components |
| `get_file_diagnostics`    | `filePath`   | Type errors for a single file           |
| `get_project_diagnostics` | —            | Full project TypeScript diagnostic pass |

### Design Tokens

| Tool                          | Input       | Returns                                     |
| ----------------------------- | ----------- | ------------------------------------------- |
| `get_design_tokens`           | `category?` | All tokens, optionally filtered by category |
| `find_token`                  | `query`     | Tokens matching name or value substring     |
| `find_components_using_token` | `tokenName` | Components that consume the token           |
| `find_components_by_token`    | `tokenName` | CEM-level token usage                       |

### Styling Validation

| Tool                | Input                       | Returns                                                 |
| ------------------- | --------------------------- | ------------------------------------------------------- |
| `styling_preflight` | `cssText`, `tagName`        | API discovery + full CSS validation + corrected snippet |
| `suggest_fix`       | `type`, `issue`, `original` | Copy-pasteable corrected code                           |
| `resolve_css_api`   | `cssText`, `tagName`        | Validates `::part()`, token, and slot references        |

### Multi-Library

| Tool             | Input                               | Returns                                    |
| ---------------- | ----------------------------------- | ------------------------------------------ |
| `load_library`   | `libraryId`, `cemPath\|packageName` | Loads an additional CEM into memory        |
| `list_libraries` | —                                   | All loaded libraries with component counts |
| `unload_library` | `libraryId`                         | Removes a loaded library from memory       |
