# Antagonistic Test Suite Audit — 2026-03-01

## Baseline
- **Total tests**: 565 (544 passing, 11 failing, 10 skipped)
- **Test files**: 36
- **Libraries with fixtures**: Carbon, Fluent, Ionic, Lion, Material Web, Patternfly, Vaadin (+ default, Shoelace, Stencil, FAST, Spectrum)

## Audit Table

| Tool | Current Tests | Missing Happy Paths | Missing Edge Cases | Missing Failure Modes | Priority |
|------|--------------|--------------------|--------------------|----------------------|----------|
| `list_components` | Per-library counts (Carbon 2, Fluent 2, etc), discovery dispatcher 2 | Cross-library: consistent across ALL 7 libs, no duplicates check | limit=0, limit=1, limit=MAX, over-max; empty CEM modules; CEM with declarations but no tagName | CEM with zero modules, CEM parse failure | HIGH |
| `find_component` | Discovery dispatcher 5 | Cross-library partial/exact/case-insensitive per lib | Regex-like strings (`.*`, `[a-z]`, `+`), empty query, single-char query | Not-found across all libraries | HIGH |
| `get_component` | Component dispatcher 4, per-lib metadata tests | Cross-lib: all properties present (slots/attrs/events/CSS parts) | Component with 0 attrs/events/slots, component with only methods | Empty tagName string, null tagName | HIGH |
| `score_component` | Health dispatcher 4, CEM fallback 12 | Cross-library scoring consistency | All optional fields missing, fully documented component, component with 0 attrs 0 events 0 slots | Missing tag_name arg, handler error propagation | MEDIUM |
| `detect_framework` | Framework handler 8 | React/Vue/Angular project detection | No framework detected (plain HTML), multiple frameworks in same package.json | Missing projectRoot, corrupt package.json | MEDIUM |
| `validate_usage` | Validate handler 16 | Cross-library validation with real CEM data | Self-closing tag, multiple instances same tag, nested components | Unknown tagName, empty html string | HIGH |
| `diff_cem` | CEM handler 11, safety dispatcher 5 | Identical CEMs (empty diff), completely different CEMs (full diff) | attribute optional→required change | Git failure, missing baseBranch arg | MEDIUM |
| `check_breaking_changes` | Safety dispatcher 8 | — | Empty component list (already tested) | All components breaking, handler throws | LOW |
| `get_health_trend` | Health dispatcher 5, handler 8 | — | No history exists, single data point | Missing tag_name, handler error | LOW |
| `get_health_diff` | Health dispatcher 4, handler 6 | — | Scores equal (stable) | Missing tag_name | LOW |
| `score_all_components` | Health dispatcher 3 | Cross-library scoring all at once | Empty declarations list | Handler error | LOW |
| `get_library_summary` | Discovery dispatcher 3 | Cross-library summaries | Empty library | — | LOW |
| `list_events` | Discovery dispatcher + CEM 4+4 | Cross-library event listing | Inherited (non-own) events, component with 0 events | Unknown tagName filter | LOW |
| `list_slots` | Discovery dispatcher + CEM 4+4 | Cross-library slot listing | Component with only default slot | Unknown tagName filter | LOW |
| `list_css_parts` | Discovery dispatcher + CEM 4+4 | Cross-library CSS parts | Component with 0 CSS parts | Unknown tagName filter | LOW |
| `resolve_cdn_cem` | CDN handler 7 | — | Network timeout simulation | Unknown package, bad version | MEDIUM |
| `validate_cem` | CEM completeness 11 | Cross-library completeness scores | Perfectly documented component, completely undocumented | — | LOW |
| `suggest_usage` | Suggest handler tests | Cross-library suggestions | Component with no attributes | — | LOW |
| `generate_story` | Story handler 15, component dispatcher 2 | Cross-library story generation | Component with no members | Unknown component | LOW |
| `compare_libraries` | Compare handler 11 | — | Identical libraries, one empty library | — | LOW |
| `benchmark_libraries` | Benchmark handler 5 | — | Single library, >10 libraries (validation) | — | LOW |
| `generate_import` | Suggest handler tests | — | No package.json | — | LOW |
| `get_component_narrative` | Component dispatcher 4, narrative 4 | Cross-library narratives | Minimal component | — | LOW |
| `analyze_accessibility` | Accessibility handler 28 | Cross-library accessibility profiles | Component with 0 ARIA attrs | — | LOW |

## Critical Gaps Identified

### 1. Cross-Library Coverage
The 7 library fixtures (Carbon, Fluent, Ionic, Lion, Material Web, Patternfly, Vaadin) each have their own small test file (6-10 tests), but there is NO unified cross-library test that exercises the same operations against ALL libraries. This is the #1 gap.

### 2. Adversarial Inputs
- Empty string tagName → never tested
- Regex-like strings in find_component query → never tested
- CEM with zero modules → tested in listAllComponents but not through dispatcher
- CEM with declarations but no tagName → never tested (filtered out?)
- Malformed attribute types → never tested
- Component with 0 of everything → partially tested

### 3. Error Handling Consistency
- Only 3 tests in error-handling.test.ts — tests that every tool returns `{ content, isError }` on error rather than throwing are scattered and incomplete
- No systematic test that ALL tool dispatchers return structured errors

### 4. Monorepo Scenarios
- Good coverage (10 tests) for mergeCems and resolveGlobCemPaths
- Missing: test that merged output has no duplicate tagNames programmatically
- Missing: package-level metadata preserved after merge (partially tested via packageName check)

## Recommendations (Priority Order)
1. Write comprehensive cross-library test file exercising all 7 libraries
2. Write adversarial input test file for edge cases and failure modes
3. Write error handling consistency tests for all 9 tool dispatchers
4. Extend monorepo tests with dedup and metadata checks
