---
'helixir': minor
---

Add multi-dimensional health scoring engine with source-level accessibility analysis

- 6 CEM-native dimensions: CEM Completeness, Accessibility, Type Coverage, API Surface Quality, CSS Architecture, Event Architecture
- Enterprise grade algorithm with critical dimension gates preventing score gaming
- Source-level accessibility scanner reading component source files for ARIA bindings, keyboard handling, focus management, form internals, live regions, and screen reader support
- Deep mixin-aware scanner following CEM superclass/mixin declarations and a11y-relevant imports through full inheritance chains
- Honest scoring: empty CEM data returns null (excluded from weighted average) instead of inflating to 100/100
- CEM accessibility analyzer reweighted for CEM-realistic scoring
- New MCP tools: score_component_multi_dimensional, score_all_multi_dimensional, audit_library
- JSONL audit report generation
- Validated against 14 real-world component libraries across Lit, FAST, Stencil, and vanilla architectures
