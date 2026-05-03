/**
 * M2 Anti-Gaslighting Acceptance Tests
 *
 * These tests reproduce defect-corpus class 12 (CEM-completeness gap →
 * silent green check) and assert that M2's `unknown` verdict + cemHas()
 * helper turn the gaslighting pattern into a visible confidence signal.
 *
 * Each test names the pre-M2 behavior it would have produced, so the
 * regression intent is searchable.
 *
 * Corpus reference:
 *   bst-cto-kb/Projects/HELiXiR/Audits/defect-corpus/12-cem-completeness-gap.md
 */

import { describe, it, expect } from 'vitest';
import { scoreComponentMultiDimensional } from '../../packages/core/src/handlers/health.js';
import { cemHas } from '../../packages/core/src/handlers/cem.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// Minimal config — paths are unused because we don't pass a CEM to the
// scoring call (which is the point: we want to exercise the no-CEM path
// that pre-M2 silently dropped CEM-Source Fidelity from grading).
const STUB_CONFIG: McpWcConfig = {
  projectRoot: '/tmp/m2-anti-gaslight',
  cemPath: 'cem.json',
  componentPrefix: 'hx',
};

// A "perfect" CEM declaration — well-described, typed members, ARIA
// attributes, slots, events, css props all PRESENT. Pre-M2, this would
// score A even when CEM-Source Fidelity / Naming Consistency couldn't
// run (no CEM/conventions passed). Post-M2, those dimensions surface as
// `unknown` and pull the grade down.
const FULLY_DOCUMENTED_DECL: CemDeclaration = {
  kind: 'class',
  name: 'PerfectButton',
  tagName: 'perfect-button',
  description: 'A button with full CEM documentation across every key.',
  summary: 'Perfect button',
  attributes: [
    { name: 'variant', type: { text: '"primary" | "secondary"' }, description: 'Visual variant' },
    { name: 'disabled', type: { text: 'boolean' }, description: 'Disabled state' },
  ],
  members: [
    {
      kind: 'field',
      name: 'variant',
      type: { text: '"primary" | "secondary"' },
      description: 'Visual variant property',
    },
  ],
  events: [{ name: 'click', type: { text: 'MouseEvent' }, description: 'Fired on user click' }],
  slots: [
    { name: '', description: 'Default slot for button label' },
    { name: 'icon', description: 'Leading icon slot' },
  ],
  cssProperties: [
    { name: '--perfect-button-bg', description: 'Background color' },
    { name: '--perfect-button-fg', description: 'Foreground color' },
  ],
  cssParts: [{ name: 'base', description: 'The button base element' }],
} as CemDeclaration;

// A "CEM-incomplete" declaration mirroring the figgy-button gap from the
// field report: top-level kind/name/tagName/description present, but every
// structured key (members, events, slots, cssProperties, cssParts,
// attributes) absent. This is what a stale CEM regen produces. Pre-M2,
// this scored well because absent keys silently flowed through `?? []`
// and analyzers returned `notApplicable: true` which dropped them from
// the weighted score.
const CEM_INCOMPLETE_DECL: CemDeclaration = {
  kind: 'class',
  name: 'GapComponent',
  tagName: 'gap-component',
  description: 'A component whose CEM is missing every structured key.',
} as CemDeclaration;

describe('M2 anti-gaslighting — defect-corpus class 12', () => {
  it('cemHas distinguishes "key absent" from "key present, empty"', () => {
    expect(cemHas(CEM_INCOMPLETE_DECL, 'slots')).toBe('absent');
    expect(cemHas(CEM_INCOMPLETE_DECL, 'events')).toBe('absent');
    expect(cemHas(CEM_INCOMPLETE_DECL, 'cssProperties')).toBe('absent');

    expect(cemHas(FULLY_DOCUMENTED_DECL, 'slots')).toBe('present');
    expect(cemHas(FULLY_DOCUMENTED_DECL, 'events')).toBe('present');
    expect(cemHas(FULLY_DOCUMENTED_DECL, 'cssProperties')).toBe('present');
  });

  it('CEM-incomplete declaration produces unknown verdicts on key-dependent dimensions', async () => {
    const result = await scoreComponentMultiDimensional(STUB_CONFIG, CEM_INCOMPLETE_DECL);

    // Pre-M2: CSS Architecture, Event Architecture, Slot Architecture all
    // returned `notApplicable: true` and dropped from the weighted score.
    // Post-M2: they return `confidence: 'unknown'` because their required
    // CEM keys are absent.
    const cssDim = result.dimensions.find((d) => d.name === 'CSS Architecture');
    const eventDim = result.dimensions.find((d) => d.name === 'Event Architecture');
    const slotDim = result.dimensions.find((d) => d.name === 'Slot Architecture');

    expect(cssDim?.confidence).toBe('unknown');
    expect(eventDim?.confidence).toBe('unknown');
    expect(slotDim?.confidence).toBe('unknown');
  });

  it('confidenceSummary surfaces the unknown count instead of hiding it', async () => {
    const result = await scoreComponentMultiDimensional(STUB_CONFIG, CEM_INCOMPLETE_DECL);

    // Pre-M2: confidenceSummary had no `unknown` key — gaslit components
    // showed { verified: N, heuristic: N, untested: N } with no trace of
    // the missing data. The number was the same shape whether the CEM was
    // perfect or empty.
    expect(result.confidenceSummary).toBeDefined();
    expect(result.confidenceSummary.unknown).toBeDefined();
    expect(result.confidenceSummary.unknown).toBeGreaterThan(0);
  });

  it('CEM-incomplete declaration cannot grade above C', async () => {
    const result = await scoreComponentMultiDimensional(STUB_CONFIG, CEM_INCOMPLETE_DECL);

    // Pre-M2 acceptance: this case scored A or B because the failing
    // dimensions silently dropped from the weighted score and the
    // remaining dims (CEM Completeness on the description, Accessibility
    // heuristic) averaged out high.
    //
    // Post-M2 acceptance: with CSS / Event / Slot / Naming / CEM-Source
    // Fidelity all `unknown`, the untested-critical bucket is full and
    // the weighted score is dragged down by 0-score unknowns. A and B
    // are unreachable.
    expect(['C', 'D', 'F']).toContain(result.grade);
  });

  it('grading notes name the untested-critical penalty for the gaslighting case', async () => {
    const result = await scoreComponentMultiDimensional(STUB_CONFIG, CEM_INCOMPLETE_DECL);

    // The grading-notes path ("untested critical dimension(s) prevent
    // grade X") only fires when the weighted score qualifies for a grade
    // but the untested-critical bucket disqualifies it. With a deeply
    // incomplete CEM the weighted score may itself fall below 60, in
    // which case the grade is F via score floor and no untested note is
    // pushed. Either path is anti-gaslighting — what's NOT acceptable
    // is grade A with no notes.
    if (result.grade === 'F') {
      expect(result.dimensions.some((d) => d.confidence === 'unknown')).toBe(true);
    } else {
      expect(result.gradingNotes.length).toBeGreaterThan(0);
    }
  });
});
