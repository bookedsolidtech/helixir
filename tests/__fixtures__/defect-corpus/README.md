# Defect-Class Fixtures

Each directory mirrors a class in `bst-cto-kb/Projects/HELiXiR/Audits/defect-corpus/{N}-{slug}.md`.

The corpus doc is the contract; this directory is the executable fixture set
M2 / M3 / M4 / M5 acceptance suites consume.

## Structure (per class)

```
NN-slug/
  README.md           — points back at the corpus doc; documents what's seeded
  parent-cem.json     — CEM excerpt for the parent component
  subclass.ts         — extending component that reproduces the defect
  expected-finding.json — the finding helixir's detector must produce
  tokens.json         — minimal token map (M4 classes only)
  tokens.deprecated.json — alias map (M4 classes only)
```

Not every class needs every file. Class 12 (CEM-completeness gap) needs an
incomplete CEM and no subclass source. Class 13 (bundle-budget regression)
needs a measured-bytes input rather than a parser.

## Authoring rule

Fixtures are derived from real helix evidence — the cited commits in each
corpus doc. Do not invent token names, slot names, or component IDs that
don't appear in the helix codebase. The point of this corpus is anti-
gaslighting: hand-rolled examples reintroduce the same gap they're meant
to catch.

## Status

All 14 directories are scaffolded but unpopulated. Population happens at
the start of M2/M3/M4/M5 — each milestone owns the fixtures it needs and
references back to the corpus doc for canonical scope.
