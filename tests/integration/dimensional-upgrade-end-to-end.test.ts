/**
 * Phase 4 integration tests for the dimensional upgrade.
 *
 * Each test wires together:
 *   1. A CEM declaration (synthesised inline OR loaded from a defect-corpus
 *      fixture)
 *   2. The Phase-1 helix-AAA evidence detector (`detectHelixAaaEvidence`)
 *      OR a hand-rolled evidence object (when the fixture isn't laid out
 *      as a real helix library)
 *   3. The Phase-3 health pipeline (`scoreComponentMultiDimensional`)
 *
 * The defect-corpus fixtures (15-19) are NOT laid out as
 * `packages/<pkg>/custom-elements.json` libraries — they use a flat
 * parent/subclass layout for the verify-extension test corpus. To
 * exercise the source-dependent dim scorers against them, we run the
 * same regex set the detector uses (via the shared `_fixture-helpers`
 * module) and inject the resulting `HelixAaaEvidence` into a direct
 * scorer call. This isolates the Phase-2 scorers' end-to-end behavior
 * given a real evidence shape, even when the fixture lacks the full
 * manifest layout the detector needs.
 *
 * The "full pipeline" cases (full evidence, no evidence) use a
 * synthesised decl with hand-built helixMeta + sourceChecks so the
 * dispatcher's wiring is verified end-to-end.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import type { McpWcConfig } from '../../packages/core/src/config.js';
import { scoreComponentMultiDimensional } from '../../packages/core/src/handlers/health.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import { scoreWcagConformance } from '../../packages/core/src/handlers/dimensions/wcag-conformance.js';
import { scoreFocusIndicator } from '../../packages/core/src/handlers/dimensions/focus-indicator.js';
import { scoreFormAssociation } from '../../packages/core/src/handlers/dimensions/form-association.js';
import { scoreForcedColors } from '../../packages/core/src/handlers/dimensions/forced-colors.js';
import { scoreApgKeyboard } from '../../packages/core/src/handlers/dimensions/apg-keyboard.js';
import {
  buildEvidence,
  loadDefectFixture,
  readSourceChecksForFixture,
} from '../handlers/dimensions/_fixture-helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/',
    componentPrefix: '',
    healthHistoryDir: '/nonexistent-health-history-integration-test',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

/**
 * A full-evidence helix-AAA component: helixMeta carries every flag the
 * dim scorers can read, plus a 10-criterion supported list (above the
 * 9-criterion certification threshold). The synthesised decl is the
 * `tagName` already registered in tests/__fixtures__/helix-aaa/lib-good,
 * so the real detector can pull verdictSnapshot + sourceChecks from the
 * fixture's verdicts file and source/styles files.
 */
const FULL_EVIDENCE_DECL: CemDeclaration & { helixMeta: Record<string, unknown> } = {
  kind: 'class',
  name: 'HxButton',
  tagName: 'hx-button',
  description:
    'helix button with the full AAA contract: keyboard, focus-ring, form-association, forced-colors.',
  members: [
    { kind: 'field', name: 'aria-label', type: { text: 'string' }, description: 'ARIA label.' },
    { kind: 'field', name: 'disabled', type: { text: 'boolean' }, description: 'Disabled.' },
  ],
  slots: [{ name: 'label', description: 'Label slot.' }],
  helixMeta: {
    aaa: {
      certified: true,
      certifiedDate: '2026-05-10',
      criteria: ['1.4.6', '1.4.9', '2.1.3', '2.3.3', '2.4.12', '2.4.13', '2.5.5', '3.2.5', '4.1.2'],
      auditUrl: 'https://audits.helix.dev/hx-button/aaa-2026-05',
    },
    ariaPattern: 'button',
    keyboardContract: {
      activate: ['Enter', 'Space'],
      disabledSuppresses: true,
    },
    formAssociated: true,
    forcedColorsSupported: true,
  },
};

const LIB_GOOD_ROOT = resolve(__dirname, '../__fixtures__/helix-aaa/lib-good');

// ---------------------------------------------------------------------------
// 1. Full-evidence component — every a11y dim scores at or near 100
// ---------------------------------------------------------------------------

describe('dimensional upgrade — end-to-end full-evidence pipeline', () => {
  it('full evidence + lib-good fixture path → 5 a11y dims score verified/100, grade is high', async () => {
    const config = makeConfig();
    const result = await scoreComponentMultiDimensional(
      config,
      FULL_EVIDENCE_DECL,
      undefined,
      'default',
      undefined,
      LIB_GOOD_ROOT,
    );

    // Locate the five a11y dims that benefit from full helix evidence.
    const wcag = result.dimensions.find((d) => d.name === 'WCAG Conformance')!;
    const apg = result.dimensions.find((d) => d.name === 'APG Keyboard Contract')!;
    const focus = result.dimensions.find((d) => d.name === 'Focus Indicator')!;
    const form = result.dimensions.find((d) => d.name === 'Form Association')!;
    const label = result.dimensions.find((d) => d.name === 'Accessible Label Pattern')!;

    expect(wcag.measured).toBe(true);
    expect(wcag.confidence).toBe('verified');
    expect(wcag.score).toBe(100);

    expect(apg.measured).toBe(true);
    expect(apg.confidence).toBe('verified');
    expect(apg.score).toBe(100);

    expect(focus.measured).toBe(true);
    expect(focus.confidence).toBe('verified');
    expect(focus.score).toBe(100);

    expect(form.measured).toBe(true);
    // Form Association requires all 3 source signals for verified — the
    // lib-good fixture has all three (formAssociated, attachInternals,
    // setValidity).
    expect(form.confidence).toBe('verified');
    expect(form.score).toBe(100);

    expect(label.measured).toBe(true);
    expect(label.confidence).toBe('verified');
    expect(label.score).toBe(100);

    // Grade is dominated by the full set of dims, NOT just the a11y
    // critical pair. With this synthesised decl:
    //   - Test Coverage is critical + untested (gates A)
    //   - CEM-Source Fidelity is critical + N/A (no CEM passed)
    //   - API Surface Quality scores low because the member set is
    //     intentionally minimal (the focus of this test is the a11y
    //     pipeline, not full library health)
    // The point of this test is the 5 a11y dims score verified/100 via
    // the full helix-AAA pipeline. The grade is a downstream side-effect
    // — assert it as a number, not a letter.
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThan(50);
    // Confidence summary: at least 8 verified dims (the 5 a11y plus
    // CEM Completeness + Type Coverage + Slot Architecture).
    expect(result.confidenceSummary.verified).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// 2. No-evidence component — source-dependent a11y dims drop to unknown
// ---------------------------------------------------------------------------

describe('dimensional upgrade — end-to-end bare-CEM pipeline', () => {
  it('bare CEM, no libraryRoot → source-dependent a11y dims are unknown; grade drops', async () => {
    const config = makeConfig();
    const bareDecl: CemDeclaration = {
      kind: 'class',
      name: 'BareComponent',
      tagName: 'bare-component',
      // No helixMeta, no description signals.
    };
    const result = await scoreComponentMultiDimensional(config, bareDecl);

    // The 6 source-dependent a11y dims must all be unmeasured.
    const SOURCE_DEPENDENT = [
      'APG Keyboard Contract',
      'Focus Indicator',
      'Form Association',
      'Forced Colors Mode',
      'Form Validity Reporting',
      'AAA Audit Self-Certification',
    ];
    for (const name of SOURCE_DEPENDENT) {
      const dim = result.dimensions.find((d) => d.name === name)!;
      // Post-codex-fix: source-dependent dims that lack evidence stay
      // measured:true so they pull the weighted score down at 0,
      // surfacing the gap. The exception is AAA Audit Self-Certification
      // (weight-0 informational, returns confidence:'untested' which
      // collapses out of the denominator).
      if (name === 'AAA Audit Self-Certification') {
        expect(dim.confidence, `${name} should be untested without audit md`).toBe('untested');
      } else {
        expect(dim.confidence, `${name} should be unknown without sourceChecks`).toBe('unknown');
        expect(dim.score, `${name} should be score 0 without sourceChecks`).toBe(0);
      }
    }

    // Grade A requires 0 untested critical. With APG Keyboard Contract
    // (a critical dim) unmeasured AND Test Coverage (also critical)
    // untested, A is unreachable.
    expect(result.grade).not.toBe('A');
  });
});

// ---------------------------------------------------------------------------
// 3-7. Defect-corpus fixtures — exercise the scorers via the same
// evidence shape the detector would produce.
// ---------------------------------------------------------------------------

describe('defect corpus 15: AAA cert overclaim — WCAG Conformance caps at 70', () => {
  it('subclass claims SC 2.4.13 but the focus-ring source contract is missing', () => {
    const fixture = loadDefectFixture('15-aaa-cert-overclaim');
    const sourceChecks = readSourceChecksForFixture(fixture.subclassSourcePath);
    expect(sourceChecks).toBeDefined();
    const evidence = buildEvidence(fixture.subclassDecl, { sourceChecks });

    const result = scoreWcagConformance(fixture.subclassDecl, evidence);
    // The subclass's helixMeta declares 4 criteria including SC 2.4.13.
    // 4 < 9 so this lands in Branch 3 (partial cert) rather than Branch 1
    // (full cert). Branch 3 scores (criteria / 9) * 70 = (4/9) * 70 ≈ 31,
    // and the overclaim detector still appends a `cert-claim-evidence-mismatch`
    // note because SC 2.4.13 is claimed without the 2px focus-ring contract.
    // The defect-corpus expected.json sets `scoreMax: 70` — our score is
    // well below that ceiling.
    expect(result.score).toBeLessThanOrEqual(70);
    expect(result.notes).toContain('cert-claim-evidence-mismatch');
    expect(result.confidence).toBe('heuristic');
  });
});

describe('defect corpus 17: Focus ring degraded — Focus Indicator scores 0', () => {
  it('subclass replaces parent focus-visible outline with `outline: none`', () => {
    const fixture = loadDefectFixture('17-focus-ring-degraded');
    const sourceChecks = readSourceChecksForFixture(fixture.subclassSourcePath);
    expect(sourceChecks).toBeDefined();
    const evidence = buildEvidence(fixture.subclassDecl, { sourceChecks });

    const result = scoreFocusIndicator(fixture.subclassDecl, evidence);
    // The fixture helper narrows `hasFocusVisibleRule` to false when the
    // outline is removed (matches scorer's Branch 4: no rule found →
    // 0/heuristic with `focus-ring-degraded` note).
    expect(result.score).toBe(0);
    expect(result.measured).toBe(true);
    expect(result.notes).toContain('focus-ring-degraded');
  });
});

describe('defect corpus 18: Form association half-implemented — partial signals', () => {
  it('subclass claims formAssociated but the source only has the static flag', () => {
    const fixture = loadDefectFixture('18-form-association-half-implemented');
    const sourceChecks = readSourceChecksForFixture(fixture.subclassSourcePath);
    expect(sourceChecks).toBeDefined();
    const evidence = buildEvidence(fixture.subclassDecl, { sourceChecks });

    const result = scoreFormAssociation(fixture.subclassDecl, evidence);
    // The weighted-signal algorithm in scoreFormAssociation gives:
    //   static-form-associated: 1
    //   attach-internals:        2
    //   set-validity-call:        2
    // Subclass has only the static flag (inherited static formAssociated
    // is the only signal). presentWeight / totalWeight = 1/5 = 20%.
    // The scorer must produce a measured-but-low result with notes
    // flagging attach-internals + set-validity missing.
    expect(result.measured).toBe(true);
    expect(result.confidence).toBe('heuristic');
    expect(result.score).toBeLessThan(50);
    expect(result.notes).toBeDefined();
    expect(
      result.notes!.some((n) => n.includes('attach-internals') || n.includes('set-validity')),
    ).toBe(true);
  });
});

describe('defect corpus 19: Forced colors claim without CSS — Forced Colors scores 0', () => {
  it('helixMeta claims forced-colors support but the @media block is absent', () => {
    const fixture = loadDefectFixture('19-forced-colors-claim-without-css');
    const sourceChecks = readSourceChecksForFixture(fixture.subclassSourcePath);
    expect(sourceChecks).toBeDefined();
    expect(sourceChecks!.hasForcedColorsBlock).toBe(false);
    const evidence = buildEvidence(fixture.subclassDecl, { sourceChecks });

    const result = scoreForcedColors(fixture.subclassDecl, evidence);
    // Branch 4: claim=true + block absent → 0/verified with
    // `claim-vs-evidence-mismatch` note (the defect class 19 case).
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('verified');
    expect(result.notes).toContain('claim-vs-evidence-mismatch');
  });
});

describe('defect corpus 16: Keyboard contract drift — APG Keyboard scorer is stable', () => {
  it('subclass declares keyboard contract for parent pattern; scorer returns sensible score', () => {
    // Per Phase 2 deviation #2: keyboard-contract drift (parent-vs-child
    // mismatch) is verify-extension's scope, not the dim scorer's. The
    // subclass's OWN keyboardContract + ariaPattern are coherent (both
    // 'checkbox' pattern, both activate Space/Enter), so the scorer
    // should return a measured score without crashing and without
    // hallucinating a missing-key complaint.
    const fixture = loadDefectFixture('16-keyboard-contract-drift');
    const sourceChecks = readSourceChecksForFixture(fixture.subclassSourcePath);
    const evidence = buildEvidence(fixture.subclassDecl, { sourceChecks });

    const result = scoreApgKeyboard(fixture.subclassDecl, evidence);
    // Scorer runs to completion, returns a number, declares it measured.
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.measured).toBe(true);
  });
});
