import { describe, it, expect } from 'vitest';
import { scoreFormAssociation } from '../../../packages/core/src/handlers/dimensions/form-association.js';
import {
  bareDecl,
  buildEvidence,
  loadDefectFixture,
  readSourceChecksForFixture,
} from './_fixture-helpers.js';

const allTrue = {
  hasStaticFormAssociated: true,
  hasAttachInternals: true,
  hasSetValidityCall: true,
  hasFocusVisibleRule: false,
  has2pxOutlineRule: false,
  hasForcedColorsBlock: false,
};

const allFalse = {
  hasStaticFormAssociated: false,
  hasAttachInternals: false,
  hasSetValidityCall: false,
  hasFocusVisibleRule: false,
  has2pxOutlineRule: false,
  hasForcedColorsBlock: false,
};

describe('scoreFormAssociation', () => {
  it('returns 100/verified when explicit N/A claim is confirmed by source absence', () => {
    const decl = bareDecl('x-na');
    const ev = buildEvidence(decl, { sourceChecks: allFalse });
    ev.helixMeta = { formAssociated: false };
    const result = scoreFormAssociation(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
    expect(result.notes).toContain('not-form-associated-correctly-declared');
  });

  it('returns 100/verified when N/A claimed without sourceChecks', () => {
    const decl = bareDecl('x-na2');
    const ev = buildEvidence(decl);
    ev.helixMeta = { formAssociated: false };
    const result = scoreFormAssociation(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
    expect(result.notes).toContain('not-form-associated');
  });

  it('flags claim/source mismatch when N/A claimed but static flag is found', () => {
    const decl = bareDecl('x-mismatch');
    const ev = buildEvidence(decl, {
      sourceChecks: { ...allFalse, hasStaticFormAssociated: true },
    });
    ev.helixMeta = { formAssociated: false };
    const result = scoreFormAssociation(decl, ev);
    expect(result.score).toBe(50);
    expect(result.notes).toContain('form-association-claim-source-mismatch');
  });

  it('returns 100/verified with all 3 source signals present and claim true', () => {
    const decl = bareDecl('x-full');
    const ev = buildEvidence(decl, { sourceChecks: allTrue });
    ev.helixMeta = { formAssociated: true };
    const result = scoreFormAssociation(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
  });

  it('returns partial heuristic score with missing signal notes', () => {
    const decl = bareDecl('x-partial');
    const ev = buildEvidence(decl, {
      sourceChecks: { ...allTrue, hasAttachInternals: false, hasSetValidityCall: false },
    });
    ev.helixMeta = { formAssociated: true };
    const result = scoreFormAssociation(decl, ev);
    // Weighted 1/2/2: only the static flag (weight 1 of 5) → 20.
    expect(result.score).toBe(20);
    expect(result.confidence).toBe('heuristic');
    expect(result.notes).toContain('attach-internals-missing');
    expect(result.notes).toContain('set-validity-not-called');
  });

  it('returns 33/heuristic when claim is true but sourceChecks absent', () => {
    const decl = bareDecl('x-claim-only');
    const ev = buildEvidence(decl);
    ev.helixMeta = { formAssociated: true };
    const result = scoreFormAssociation(decl, ev);
    expect(result.score).toBe(33);
    expect(result.confidence).toBe('heuristic');
    expect(result.notes).toContain('form-associated-claim-without-source-evidence');
  });

  it('returns 0/unknown when helixMeta is absent entirely', () => {
    const decl = bareDecl('x-quiet');
    const ev = buildEvidence(decl);
    const result = scoreFormAssociation(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('unknown');
    expect(result.measured).toBe(false);
  });

  it('returns 100/heuristic when helixMeta is silent and sourceChecks show no form-association', () => {
    const decl = bareDecl('x-silent-confirmed');
    const ev = buildEvidence(decl, { sourceChecks: allFalse });
    ev.helixMeta = { ariaPattern: 'button' };
    const result = scoreFormAssociation(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('heuristic');
    expect(result.notes).toContain('form-association-not-applicable-by-omission');
  });

  it('subMetrics enumerate the three CE-form-association signals', () => {
    const decl = bareDecl('x-sub');
    const ev = buildEvidence(decl, { sourceChecks: allTrue });
    ev.helixMeta = { formAssociated: true };
    const result = scoreFormAssociation(decl, ev);
    const names = result.subMetrics?.map((s) => s.name) ?? [];
    expect(names).toEqual(
      expect.arrayContaining(['static-form-associated', 'attach-internals', 'set-validity-call']),
    );
  });

  it('defect-corpus class 18 — half-implemented form association is detected', () => {
    const { expected, subclassDecl, subclassSourcePath } = loadDefectFixture(
      '18-form-association-half-implemented',
    );
    const sourceChecks = readSourceChecksForFixture(subclassSourcePath);
    const ev = buildEvidence(subclassDecl, { sourceChecks });
    const result = scoreFormAssociation(subclassDecl, ev);
    const contract = expected.dimensions['Form Association'];
    expect(contract).toBeDefined();
    if (contract?.scoreMax !== undefined) {
      expect(result.score).toBeLessThanOrEqual(contract.scoreMax);
    }
    expect(result.notes?.some((n) => n.includes('attach-internals-missing'))).toBe(true);
  });
});
