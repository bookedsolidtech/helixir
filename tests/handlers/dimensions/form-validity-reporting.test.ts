import { describe, it, expect } from 'vitest';
import { scoreFormValidityReporting } from '../../../packages/core/src/handlers/dimensions/form-validity-reporting.js';
import {
  bareDecl,
  buildEvidence,
  loadDefectFixture,
  readSourceChecksForFixture,
} from './_fixture-helpers.js';

const checks = (
  over: Partial<{
    hasStaticFormAssociated: boolean;
    hasSetValidityCall: boolean;
    hasAttachInternals: boolean;
  }> = {},
) => ({
  hasStaticFormAssociated: false,
  hasAttachInternals: false,
  hasSetValidityCall: false,
  hasFocusVisibleRule: false,
  has2pxOutlineRule: false,
  hasForcedColorsBlock: false,
  ...over,
});

describe('scoreFormValidityReporting', () => {
  it('returns 100/verified when helixMeta declares formAssociated:false (N/A)', () => {
    const decl = bareDecl('x-na');
    const ev = buildEvidence(decl);
    ev.helixMeta = { formAssociated: false };
    const result = scoreFormValidityReporting(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
    expect(result.notes).toContain('form-validity-not-applicable');
  });

  it('returns 0/unknown when no helixMeta and no sourceChecks', () => {
    const decl = bareDecl('x-quiet');
    const ev = buildEvidence(decl);
    const result = scoreFormValidityReporting(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('unknown');
    expect(result.measured).toBe(false);
  });

  it('returns 100/verified when setValidity is called', () => {
    const decl = bareDecl('x-validity');
    const ev = buildEvidence(decl, { sourceChecks: checks({ hasSetValidityCall: true }) });
    const result = scoreFormValidityReporting(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
  });

  it('returns 0/verified with set-validity-not-called when form-associated but no setValidity', () => {
    const decl = bareDecl('x-half');
    const ev = buildEvidence(decl, { sourceChecks: checks({ hasStaticFormAssociated: true }) });
    ev.helixMeta = { formAssociated: true };
    const result = scoreFormValidityReporting(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('verified');
    expect(result.notes).toContain('set-validity-not-called');
    expect(result.notes).toContain('form-associated-without-validity-reporting');
  });

  it('returns 100/verified N/A when helixMeta present + sourceChecks confirm no FACE signals', () => {
    // Push-gate round-2 tightening: N/A requires BOTH no FACE signals AND
    // a helixMeta block. Without helixMeta, an inherited FACE subclass
    // might have its FACE contract on a parent we don't walk — so we
    // can't claim N/A confidently.
    const decl = { ...bareDecl('x-silent-helix'), helixMeta: { ariaPattern: 'banner' } };
    const ev = buildEvidence(decl, { sourceChecks: checks() });
    const result = scoreFormValidityReporting(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
    expect(result.notes).toContain('form-validity-not-applicable');
  });

  it('returns 0/unknown when sourceChecks confirm no FACE signals but no helixMeta', () => {
    // Push-gate round-2: without helixMeta the form-association status
    // is genuinely unknown (potential inherited FACE subclass), so
    // Form Validity Reporting must stay unknown rather than claim N/A.
    const decl = bareDecl('x-silent');
    const ev = buildEvidence(decl, { sourceChecks: checks() });
    const result = scoreFormValidityReporting(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('unknown');
    expect(result.measured).toBe(false);
  });

  it('uses sourceChecks.hasStaticFormAssociated as a form-associated trigger', () => {
    const decl = bareDecl('x-static-flag');
    const ev = buildEvidence(decl, { sourceChecks: checks({ hasStaticFormAssociated: true }) });
    const result = scoreFormValidityReporting(decl, ev);
    // No helixMeta but static flag detected → form-associated path
    expect(result.score).toBe(0);
    expect(result.notes).toContain('form-associated-without-validity-reporting');
  });

  it('the setValidity branch takes precedence over the form-associated check', () => {
    const decl = bareDecl('x-both');
    const ev = buildEvidence(decl, {
      sourceChecks: checks({ hasStaticFormAssociated: true, hasSetValidityCall: true }),
    });
    ev.helixMeta = { formAssociated: true };
    const result = scoreFormValidityReporting(decl, ev);
    expect(result.score).toBe(100);
  });

  it('preserves sub-metric on the set-validity path', () => {
    const decl = bareDecl('x-sub');
    const ev = buildEvidence(decl, { sourceChecks: checks({ hasSetValidityCall: true }) });
    const result = scoreFormValidityReporting(decl, ev);
    expect(result.subMetrics?.[0]?.name).toBe('set-validity-call');
    expect(result.subMetrics?.[0]?.score).toBe(1);
  });

  it('defect-corpus class 18 — half-implemented form association exposes Form Validity gap', () => {
    const { expected, subclassDecl, subclassSourcePath } = loadDefectFixture(
      '18-form-association-half-implemented',
    );
    const sourceChecks = readSourceChecksForFixture(subclassSourcePath);
    const ev = buildEvidence(subclassDecl, { sourceChecks });
    const result = scoreFormValidityReporting(subclassDecl, ev);
    const contract = expected.dimensions['Form Validity'];
    expect(contract).toBeDefined();
    if (contract?.scoreMax !== undefined) {
      expect(result.score).toBeLessThanOrEqual(contract.scoreMax);
    }
    expect(result.notes?.some((n) => n.includes('set-validity-not-called'))).toBe(true);
  });
});
