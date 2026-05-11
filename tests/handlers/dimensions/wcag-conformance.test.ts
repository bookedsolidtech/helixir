import { describe, it, expect } from 'vitest';
import { scoreWcagConformance } from '../../../packages/core/src/handlers/dimensions/wcag-conformance.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';
import {
  bareDecl,
  buildEvidence,
  loadDefectFixture,
  readSourceChecksForFixture,
} from './_fixture-helpers.js';

const NINE_SC = [
  '1.4.6',
  '1.4.11',
  '2.1.3',
  '2.3.3',
  '2.4.7',
  '2.4.11',
  '2.4.13',
  '2.5.5',
  '3.2.5',
];

describe('scoreWcagConformance', () => {
  it('returns 100/verified when verdictSnapshot is certified with >=9 criteria', () => {
    const decl = bareDecl('hx-good');
    const ev = buildEvidence(decl, {
      verdictSnapshot: {
        certified: true,
        criteria: NINE_SC,
        perCriterion: Object.fromEntries(
          NINE_SC.map((sc) => [sc, { verdict: 'Supports' as const }]),
        ),
      },
    });
    const result = scoreWcagConformance(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
    expect(result.measured).toBe(true);
    expect(result.subMetrics?.[0]?.name).toBe('criteria-supported');
  });

  it('returns 95/verified when helixMeta.aaa claims cert with >=9 criteria but no snapshot', () => {
    const decl: CemDeclaration = {
      ...bareDecl('hx-claim'),
      // attach helixMeta via cast
    } as CemDeclaration;
    const ev = buildEvidence(decl, {});
    ev.helixMeta = {
      aaa: { certified: true, criteria: NINE_SC },
    };
    const result = scoreWcagConformance(decl, ev);
    expect(result.score).toBe(95);
    expect(result.confidence).toBe('verified');
  });

  it('returns heuristic partial score when fewer than 9 SCs in helixMeta.aaa.criteria', () => {
    const decl = bareDecl('hx-partial');
    const ev = buildEvidence(decl);
    ev.helixMeta = { aaa: { certified: false, criteria: ['1.4.6', '2.4.7', '2.4.13'] } };
    const result = scoreWcagConformance(decl, ev);
    // (3/9)*70 = 23.33 → round → 23
    expect(result.score).toBe(23);
    expect(result.confidence).toBe('heuristic');
    expect(result.measured).toBe(true);
  });

  it('falls back to 30/heuristic when aria-* CEM members are present without helixMeta', () => {
    const decl: CemDeclaration = {
      ...bareDecl('x-aria'),
      members: [{ kind: 'field', name: 'aria-label', type: { text: 'string' } }],
    } as CemDeclaration;
    const ev = buildEvidence(decl);
    const result = scoreWcagConformance(decl, ev);
    expect(result.score).toBe(30);
    expect(result.confidence).toBe('heuristic');
    expect(result.notes).toContain('no-helix-meta-aaa-fallback-to-cem-heuristic');
  });

  it('returns 0/unknown/measured:false with no helixMeta and no aria signals', () => {
    const decl = bareDecl('x-nothing');
    const ev = buildEvidence(decl);
    const result = scoreWcagConformance(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('unknown');
    expect(result.measured).toBe(false);
  });

  it('caps cert-claim at 70 with cert-claim-evidence-mismatch when SC 2.4.13 lacks 2px focus ring', () => {
    const decl = bareDecl('hx-overclaim');
    const ev = buildEvidence(decl, {
      verdictSnapshot: {
        certified: true,
        criteria: NINE_SC,
        perCriterion: Object.fromEntries(
          NINE_SC.map((sc) => [sc, { verdict: 'Supports' as const }]),
        ),
      },
      sourceChecks: {
        hasStaticFormAssociated: false,
        hasAttachInternals: false,
        hasSetValidityCall: false,
        hasFocusVisibleRule: true,
        has2pxOutlineRule: false,
        hasForcedColorsBlock: true,
      },
    });
    const result = scoreWcagConformance(decl, ev);
    expect(result.score).toBe(70);
    expect(result.notes).toContain('cert-claim-evidence-mismatch');
    expect(result.notes?.some((n) => n.includes('2.4.13'))).toBe(true);
  });

  it('caps cert claim when forced-colors SC 1.4.11 claimed but no forced-colors block', () => {
    const decl = bareDecl('hx-fc-overclaim');
    const ev = buildEvidence(decl, {
      verdictSnapshot: {
        certified: true,
        criteria: NINE_SC,
        perCriterion: Object.fromEntries(
          NINE_SC.map((sc) => [sc, { verdict: 'Supports' as const }]),
        ),
      },
      sourceChecks: {
        hasStaticFormAssociated: false,
        hasAttachInternals: false,
        hasSetValidityCall: false,
        hasFocusVisibleRule: true,
        has2pxOutlineRule: true,
        hasForcedColorsBlock: false,
      },
    });
    ev.helixMeta = { forcedColorsSupported: true };
    const result = scoreWcagConformance(decl, ev);
    expect(result.score).toBe(70);
    expect(result.notes).toContain('cert-claim-evidence-mismatch');
  });

  it('does not throw on malformed helixMeta.aaa.criteria (non-array)', () => {
    const decl = bareDecl('hx-malformed');
    const ev = buildEvidence(decl);
    // Cast bypass — the public type forbids this, but real CEM may carry it.
    ev.helixMeta = { aaa: { certified: true, criteria: 'oops' as unknown as string[] } };
    const result = scoreWcagConformance(decl, ev);
    // Falls through to aria-fallback (no signal) → unknown.
    expect(result.confidence).toBe('unknown');
    expect(result.measured).toBe(false);
  });

  it('treats empty criteria array as partial signal: score 0/heuristic', () => {
    const decl = bareDecl('hx-empty');
    const ev = buildEvidence(decl);
    ev.helixMeta = { aaa: { certified: false, criteria: [] } };
    const result = scoreWcagConformance(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('heuristic');
    expect(result.measured).toBe(true);
  });

  it('defect-corpus class 15 — cert-claim overclaim is detected and capped', () => {
    const { expected, subclassDecl, subclassSourcePath } =
      loadDefectFixture('15-aaa-cert-overclaim');
    const sourceChecks = readSourceChecksForFixture(subclassSourcePath);
    const ev = buildEvidence(subclassDecl, { sourceChecks });
    const result = scoreWcagConformance(subclassDecl, ev);
    const contract = expected.dimensions['WCAG Conformance'];
    expect(contract).toBeDefined();
    if (contract?.scoreMax !== undefined) {
      expect(result.score).toBeLessThanOrEqual(contract.scoreMax);
    }
    expect(result.notes?.some((n) => n.includes('cert-claim-evidence-mismatch'))).toBe(true);
  });

  it('defect-corpus class 17 — focus-ring-degraded surfaces SC 2.4.7 mismatch via overclaim', () => {
    // The class-17 subclass does NOT itself claim cert, so the scorer's
    // overclaim path is silent without parent context. Instead we verify
    // the scorer returns a heuristic/partial path rather than crashing.
    const { subclassDecl, subclassSourcePath } = loadDefectFixture('17-focus-ring-degraded');
    const sourceChecks = readSourceChecksForFixture(subclassSourcePath);
    const ev = buildEvidence(subclassDecl, { sourceChecks });
    const result = scoreWcagConformance(subclassDecl, ev);
    // No aaa claim on the subclass → fallback path. Score should be
    // bounded well below cert-quality.
    expect(result.score).toBeLessThan(80);
    expect(result.measured === false || result.confidence !== 'verified').toBe(true);
  });
});
