# Changelog

## 0.6.0

### Minor Changes

- 0467d4a: feat: add check_token_fallbacks and check_composition MCP tools for var() chain validation and cross-component pattern validation
- 93283a5: Add create_theme and apply_theme_tokens MCP tools for enterprise theming workflow
- 9b96f43: Add `resolve_css_api` MCP tool — resolves every `::part()`, CSS custom property, and slot reference against actual component CEM data. Catches hallucinated part names, invalid token names, and unknown slot names with fuzzy match suggestions.
- ca024a9: Add check_dark_mode_patterns tool — detects dark mode styling anti-patterns specific to Shadow DOM: theme-scoped selectors setting standard CSS properties on web component hosts (won't reach internals), @media prefers-color-scheme blocks with shadow DOM piercing, and descendant selectors inside theme scopes. Integrated into validate_component_code, styling_preflight, and validate_css_file.
- 9c73a62: Decompose Accessibility dimension into evidence-backed sub-dimensions.
  - Split the single weight-10 Accessibility dim into 5 new dims: WCAG
    Conformance, APG Keyboard Contract, Focus Indicator, Form Association,
    Accessible Label Pattern.
  - Add 3 orthogonal dims: Forced Colors Mode, Form Validity Reporting,
    AAA Audit Self-Certification (informational, weight 0).
  - New shared evidence detector reads helixMeta blocks from CEM,
    aaa-verdicts.json snapshots, AAA-AUDIT.md sidecars, and source-level
    signals (static formAssociated, attachInternals(), :focus-visible
    rules) when available.
  - New MCP tool: detect_helix_evidence. score_component,
    score_all_components, and analyze_accessibility accept an optional
    libraryRoot argument.
  - Deprecates the scoring.weights.accessibility config key; applies the
    multiplier across the 5 split dims for one minor-version window.
    Removed in 0.8.0.
  - 5 new defect-corpus classes (15-19) with fixtures + falsifiability
    cases in bst-cto-kb.
  - 3426 vitest tests passing.

  Backward compatibility: analyze_accessibility tool output preserved,
  new helixEvidence block appended when libraryRoot is provided.

  Closes M6 task #19 (telemetry surfacing — readiness pipeline exercises
  the new tool surface).

- 5470972: Enhanced theme checker with dark mode detection: mixed token/hardcoded color pair warnings and low-opacity shadow visibility alerts. Fixed integration test tool count for resolve_css_api.
- 729b8e9: Add extend_component MCP tool for subclassing existing components with proper inheritance
- 99c65ca: feat: make suggest_fix token suggestions library-agnostic with optional tokenPrefix parameter
- c5f03e1: Add :root scope token detection to shadow DOM checker and suggest-fix pipeline

  Detects component CSS custom properties set on :root (which have no effect through Shadow DOM)
  and suggests moving them to the host element. Wired into both styling_preflight and
  css-file-validator inline fix generation.

- 685eee2: Add `styling_preflight` MCP tool — single-call styling validation that combines component API discovery, CSS reference resolution, Shadow DOM anti-pattern detection, theme compatibility checking, and a pass/fail verdict. Eliminates the "forgot to check the API first" failure mode.
- 7c3bb34: feat: add 24 anti-hallucination MCP tools for web component validation. Includes Shadow DOM diagnostics, HTML/CSS/event validators, slot/attribute/a11y checkers, token fallback validation, composition patterns, method call verification, theme compatibility, CSS specificity checker, layout pattern checker, fix suggestion generator, code type recommender, and an all-in-one aggregator running 14 sub-validators. Added attribute field to ComponentMetadata members.
- 6119be2: Add validate_css_file MCP tool — validates entire CSS files targeting multiple web components in one call with auto-detection
- 36abde2: feat: add auto-fix suggestions to validation summary — agents get corrected code alongside each issue

### Patch Changes

- 02cee44: Add antiPatterns and inline fix suggestions to validate_css_file output — each component now includes component-specific "don't do this" examples and issues include corrected code when a fix can be auto-generated
- 026f673: Add dark mode CSS example to buildCssSnippet — agents see correct theme-scoped custom property pattern with explicit WRONG example showing that standard properties on host can't reach shadow DOM.
- 87a1c86: fix: quick-ref CSS snippet uses meaningful values instead of misleading 'initial', adds slot styling guidance
- afca135: fix(cem-source-fidelity): handle TypeScript generic types in dispatchEvent regex
- bd07aff: fix: buildCssSnippet self-referential var() bug, add slot styling guidance and font inheritance warnings
- 60efbf1: docs: make styling cookbook library-agnostic and add validation workflow references
- ce9ed84: Add component-specific "common mistakes" section to narrative output with valid part names, no-CSS-API warnings, React event guidance, and styling_preflight reminder
- c81adf2: Add antiPatterns array to styling_preflight output — agents get component-specific "don't do this" examples alongside validation results in a single call
- 6a57098: Enhance styling_preflight to run all 7 CSS validators in a single call — adds token fallback, scope, shorthand, color contrast, and specificity checks alongside existing shadow DOM and theme compatibility checks
- c80ea33: Add inline fix suggestions to styling_preflight issues — each issue now includes a `fix` object with corrected code and explanation when a fix can be auto-generated, eliminating the need for a separate suggest_fix call
- 82dc600: Add antiPatterns array to get_component_quick_ref output — returns component-specific "don't do this" examples (shadow DOM piercing, ::part() chaining, :root scope, hardcoded colors, invalid slots) using the component's actual tag name, part names, and token names
- 9cb536a: Add styling_preflight and check_dark_mode_patterns to recommend_checks output. CSS code now gets styling_preflight recommended first, and dark mode checker is recommended when theme/dark/light patterns are detected.
- 2b3c382: Regenerate custom-elements.json from source to fix stale CEM data causing cem-validate CI failures
- 1655209: Add dark-mode fix category to suggest_fix — generates concrete CSS custom property replacements for theme-scoped standard properties and shadow DOM piercing issues detected by check_dark_mode_patterns.
- 0de21b1: Update tool descriptions for styling_preflight, validate_css_file, and get_component_quick_ref to mention antiPatterns and inline fix capabilities — agents now know these tools return negative examples and corrected code without needing separate suggest_fix calls

## 0.5.1

### Patch Changes

- 78e8748: fix: exempt promotion and bot PRs from Changeset Required CI check via skip-changeset label

## 0.5.0

### Minor Changes

- 7f0b963: feat: add CEM-Source Fidelity analyzer to cross-reference CEM declarations against actual source code
- 6b7c4fc: feat: add automated CEM sync CI gate to prevent stale published manifests
- fc6c2b6: feat: add cross-library benchmark suite to validate scorer against 11 real WC libraries and generate helix report
- a64cb50: feat: add Naming Consistency analyzer to measure library-wide naming convention adherence
- 174b5e5: feat: add Slot Architecture analyzer to score slot documentation, type constraints, and slot-property coherence

### Patch Changes

- f037aa8: fix: correct CEM carousel event name from hx-slide-change to hx-slide
- b2cbed9: fix: correct HxSkeletonAttributes and HxSpinnerAttributes property drift in helix.d.ts
- 96f3e68: fix: correct HxTabsAttributes properties drift from CEM
- b2cbed9: fix: correct HxSkeletonAttributes and HxSpinnerAttributes property drift from CEM

## 0.4.1

### Patch Changes

- 36bea60: Security and correctness fixes from deep antagonistic audit
  - Add path containment validation to CEM-derived file reads preventing directory traversal
  - Harden false-positive test assertions to eliminate misleading test results
  - 13 security, correctness, and staleness fixes across the codebase
  - Mark internal packages (@helixir/core, @helixir/github-action) as private to fix publish pipeline

## 0.4.0

### Minor Changes

- 5cb679b: Add multi-dimensional health scoring engine with source-level accessibility analysis
  - 6 CEM-native dimensions: CEM Completeness, Accessibility, Type Coverage, API Surface Quality, CSS Architecture, Event Architecture
  - Enterprise grade algorithm with critical dimension gates preventing score gaming
  - Source-level accessibility scanner reading component source files for ARIA bindings, keyboard handling, focus management, form internals, live regions, and screen reader support
  - Deep mixin-aware scanner following CEM superclass/mixin declarations and a11y-relevant imports through full inheritance chains
  - Honest scoring: empty CEM data returns null (excluded from weighted average) instead of inflating to 100/100
  - CEM accessibility analyzer reweighted for CEM-realistic scoring
  - New MCP tools: score_component_multi_dimensional, score_all_multi_dimensional, audit_library
  - JSONL audit report generation
  - Validated against 14 real-world component libraries across Lit, FAST, Stencil, and vanilla architectures

## 0.3.0

### Minor Changes

- f5bbbe7: Add `/update-helixir` slash command skill that allows users to self-update the helixir MCP server from npm in one step, with version detection, update, verification, and restart instructions.

## [0.2.0] - 2026-03-13

### Minor Changes

- 2308edf: - Migrate release pipeline from semantic-release to @changesets/cli for explicit per-PR version control
  - Add Zod schema validation for design token files against the W3C DTCG spec
  - Remove @semantic-release/\* dependencies; add @changesets/cli

### Patch Changes

- 03dabcf: Add root package to pnpm-workspace.yaml so changesets can resolve the helixir package during version and publish.

All notable changes to `helixir` (formerly `wc-tools`) will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-03-01

### Added

**MCP server**

- MCP server for web component Custom Elements Manifest (CEM) analysis — gives AI agents full situational awareness of any web component library.
- Multi-library support: Shoelace, Lit, Stencil, FAST, Spectrum, Material, Vaadin, Carbon, Ionic, Lion, Fluent UI, and PatternFly.
- CDN CEM resolution via `resolve_cdn_cem` — fetch and cache CEM files from unpkg/jsDelivr without a local install.
- Watch mode (`--watch`) — automatically reloads the CEM when the source file changes.
- `helixir init` CLI command — interactive setup wizard to generate a `mcpwc.config.json`.

**Discovery tools**

- `list_components` — list all custom elements registered in the Custom Elements Manifest.
- `find_component` — semantic search for components by name, description, or member names using token-overlap scoring.
- `get_library_summary` — library overview: component count, average health score, and grade distribution.
- `list_events` — list all events exposed across all components.
- `list_slots` — list all named slots across all components.
- `list_css_parts` — list all CSS shadow parts across all components.
- `list_components_by_category` — filter components by category tag.

**Component tools**

- `get_component` — retrieve full metadata for a component including members, events, slots, CSS parts, and CSS custom properties.
- `validate_cem` — validate CEM documentation completeness for a component; returns a 0–100 score and a list of issues.
- `suggest_usage` — generate an HTML usage snippet showing key attributes with default values.
- `generate_import` — generate side-effect and named import statements from CEM exports and `package.json`.
- `get_component_narrative` — plain-language description of a component's purpose and API.
- `get_prop_constraints` — list property constraints (allowed values, types, defaults) for a component.
- `find_components_by_token` — find components that reference a specific design token.
- `get_component_dependencies` — list components that a given component depends on.
- `find_components_using_token` — reverse lookup: find all components that use a given CSS custom property.

**Health tools**

- `score_component` — health score for a single component: grade, dimension breakdown, and issues.
- `score_all_components` — health scores for every component in the library in one call.
- `get_health_trend` — component health trend over the last N days with trend direction and change percentage.
- `get_health_diff` — before/after health comparison between the current branch and a base branch.
- `analyze_accessibility` — accessibility analysis for a component: ARIA roles, keyboard support, and WCAG coverage.

**Safety tools**

- `diff_cem` — per-component CEM diff between branches; classifies breaking changes (removals, type changes) vs. non-breaking additions.
- `check_breaking_changes` — breaking-change scan across all components vs. a base branch with per-component emoji status summary.

**TypeScript tools**

- `get_file_diagnostics` — TypeScript diagnostics for a single source file.
- `get_project_diagnostics` — full TypeScript diagnostic pass across the entire project.

**Token tools**

- `get_design_tokens` — list all design tokens from the configured tokens file, optionally filtered by category.
- `find_token` — search for a design token by name or value.

**Framework & validation tools**

- `detect_framework` — detect the web component authoring framework (Lit, Stencil, FAST, etc.) used in the project.
- `validate_usage` — validate a component usage snippet against the CEM (attribute names, types, required props).

**Composition & story tools**

- `get_composition_example` — generate a multi-component composition example showing components used together.
- `generate_story` — generate a Storybook story (CSF format) for a component.

**Bundle & benchmark tools**

- `estimate_bundle_size` — estimate the tree-shaken bundle size contribution of one or more components.
- Benchmark handler — compare component health metrics across branches or snapshots.
- Compare handler — side-by-side library comparison for evaluating component coverage and quality.
