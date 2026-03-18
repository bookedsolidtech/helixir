# Cross-Library Benchmark Suite

Validates the multi-dimensional web component scorer against 11 real libraries plus helix.

## Running Benchmarks

```bash
# Run the full benchmark suite
pnpm test -- tests/benchmark/cross-library-scorer.test.ts

# Run helix-specific deep dive
pnpm test -- tests/benchmark/helix-report.test.ts

# Run both
pnpm test -- tests/benchmark/
```

## Libraries Tested

| Library  | Prefix   | Source                   |
| -------- | -------- | ------------------------ |
| material | md-      | @material/web            |
| spectrum | sp-      | @spectrum-web-components |
| vaadin   | vaadin-  | @vaadin                  |
| fluentui | fluent-  | @fluentui/web-components |
| carbon   | cds-     | @carbon/web-components   |
| ui5      | ui5-     | @ui5/webcomponents       |
| calcite  | calcite- | @esri/calcite-components |
| porsche  | p-       | @porsche-design-system   |
| ionic    | ion-     | @ionic/core              |
| wired    | wired-   | wired-elements           |
| elix     | elix-    | elix                     |
| helix    | hx-      | @aspect/hx-library       |

## Understanding Dimension Scores

Each component is scored across 12 dimensions (with 2 more awaiting merger):

### CEM-Native (scored from custom-elements.json)

- **CEM Completeness** (weight: 15) — Are properties, events, slots, CSS parts documented?
- **Accessibility** (weight: 10) — ARIA attributes, keyboard support, labels
- **Type Coverage** (weight: 10) — TypeScript types on properties/events/methods
- **API Surface Quality** (weight: 10) — Property descriptions, defaults, naming
- **CSS Architecture** (weight: 5) — CSS custom properties, parts, design tokens
- **Event Architecture** (weight: 5) — Custom events with types and descriptions
- **CEM-Source Fidelity** (weight: 10) — Does the CEM match the actual source code?

### External Data (from health history files)

- **Test Coverage** (weight: 10) — Unit/integration test coverage percentage
- **Bundle Size** (weight: 5) — Minified + gzipped bundle size
- **Story Coverage** (weight: 5) — Storybook story coverage
- **Performance** (weight: 5) — Render/interaction performance metrics
- **Drupal Readiness** (weight: 5) — Drupal CMS integration readiness

## Interpreting Results

### Grades

- **A** (90-100): Excellent documentation and quality
- **B** (80-89): Good with minor gaps
- **C** (70-79): Adequate but room for improvement
- **D** (60-69): Below average, significant gaps
- **F** (0-59): Needs significant work

### Confidence Levels

- **verified**: Score based on concrete CEM data
- **heuristic**: Score inferred from patterns
- **untested**: No data available (external dimensions without history)

## Helix Report

The helix report (`helix-report.test.ts`) provides:

1. Component-by-component breakdown with scores and grades
2. CEM-Source Fidelity findings (CEM vs source discrepancies)
3. Comparison against Material Web and Carbon (gold standards)
4. Actionable issue list sorted by severity

Results are written to `tests/__fixtures__/benchmark-results/helix-report.json`.

## Output Files

Benchmark results are written to `tests/__fixtures__/benchmark-results/`:

- `latest-benchmark.json` — Full benchmark results with scorecards and comparison table
- `helix-report.json` — Helix deep-dive report with actionable issues

## Performance

The benchmark suite has a 60-second performance gate. If execution exceeds this limit, consider:

1. Checking for large CEM files that slow parsing
2. Reviewing the performance phase breakdown in test output
