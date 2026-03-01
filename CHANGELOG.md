# Changelog

All notable changes to `wc-mcp` will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-03-01

### Added

**Discovery tools**

- `list_components` — list all custom elements registered in the Custom Elements Manifest.
- `find_component` — semantic search for components by name, description, or member names using token-overlap scoring.
- `get_library_summary` — library overview: component count, average health score, and grade distribution.

**Component tools**

- `get_component` — retrieve full metadata for a component including members, events, slots, CSS parts, and CSS custom properties.
- `validate_cem` — validate CEM documentation completeness for a component; returns a 0–100 score and a list of issues.
- `suggest_usage` — generate an HTML usage snippet showing key attributes with default values.
- `generate_import` — generate side-effect and named import statements from CEM exports and `package.json`.

**Health tools**

- `score_component` — health score for a single component: grade, dimension breakdown, and issues.
- `score_all_components` — health scores for every component in the library in one call.
- `get_health_trend` — component health trend over the last N days with trend direction and change percentage.
- `get_health_diff` — before/after health comparison between the current branch and a base branch.

**Safety tools**

- `diff_cem` — per-component CEM diff between branches; classifies breaking changes (removals, type changes) vs. non-breaking additions.
- `check_breaking_changes` — breaking-change scan across all components vs. a base branch with per-component emoji status summary.

**TypeScript tools**

- `get_file_diagnostics` — TypeScript diagnostics for a single source file.
- `get_project_diagnostics` — full TypeScript diagnostic pass across the entire project.

**Token tools**

- `get_design_tokens` — list all design tokens from the configured tokens file, optionally filtered by category.
- `find_token` — search for a design token by name or value.
