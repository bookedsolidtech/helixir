---
'helixir': minor
---

Decompose Accessibility dimension into evidence-backed sub-dimensions.

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
