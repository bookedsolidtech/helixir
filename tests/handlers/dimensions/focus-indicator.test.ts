import { describe, it, expect } from 'vitest';
import { scoreFocusIndicator } from '../../../packages/core/src/handlers/dimensions/focus-indicator.js';
import {
  bareDecl,
  buildEvidence,
  loadDefectFixture,
  readSourceChecksForFixture,
} from './_fixture-helpers.js';

describe('scoreFocusIndicator', () => {
  it('returns 100/verified when has2pxOutlineRule is true', () => {
    const decl = bareDecl('x-focus-good');
    const ev = buildEvidence(decl, {
      sourceChecks: {
        hasStaticFormAssociated: false,
        hasAttachInternals: false,
        hasSetValidityCall: false,
        hasFocusVisibleRule: true,
        has2pxOutlineRule: true,
        hasForcedColorsBlock: false,
      },
    });
    const result = scoreFocusIndicator(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
    expect(result.measured).toBe(true);
  });

  it('returns 60/heuristic when focus-visible rule exists but not the 2px contract', () => {
    const decl = bareDecl('x-focus-loose');
    const ev = buildEvidence(decl, {
      sourceChecks: {
        hasStaticFormAssociated: false,
        hasAttachInternals: false,
        hasSetValidityCall: false,
        hasFocusVisibleRule: true,
        has2pxOutlineRule: false,
        hasForcedColorsBlock: false,
      },
    });
    const result = scoreFocusIndicator(decl, ev);
    expect(result.score).toBe(60);
    expect(result.confidence).toBe('heuristic');
    expect(result.notes).toContain('focus-visible-rule-found-but-not-2px-aaa');
  });

  it('returns 0/heuristic with note when sourceChecks present but no focus rule found', () => {
    const decl = bareDecl('x-focus-bare');
    const ev = buildEvidence(decl, {
      sourceChecks: {
        hasStaticFormAssociated: false,
        hasAttachInternals: false,
        hasSetValidityCall: false,
        hasFocusVisibleRule: false,
        has2pxOutlineRule: false,
        hasForcedColorsBlock: false,
      },
    });
    const result = scoreFocusIndicator(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('heuristic');
    expect(result.measured).toBe(true);
    expect(result.notes).toContain('no-focus-visible-rule-in-styles');
  });

  it('returns 0/unknown/measured:false when sourceChecks are absent', () => {
    const decl = bareDecl('x-unknown');
    const ev = buildEvidence(decl);
    const result = scoreFocusIndicator(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('unknown');
    expect(result.measured).toBe(false);
  });

  it('subMetrics flag the 2px requirement explicitly', () => {
    const decl = bareDecl('x-meta');
    const ev = buildEvidence(decl, {
      sourceChecks: {
        hasStaticFormAssociated: false,
        hasAttachInternals: false,
        hasSetValidityCall: false,
        hasFocusVisibleRule: true,
        has2pxOutlineRule: true,
        hasForcedColorsBlock: false,
      },
    });
    const result = scoreFocusIndicator(decl, ev);
    expect(result.subMetrics?.[0]?.name).toBe('focus-visible-2px-outline');
    expect(result.subMetrics?.[0]?.score).toBe(1);
  });

  it('defect-corpus class 17 — focus-ring-degraded scores low with degraded note', () => {
    const { expected, subclassDecl, subclassSourcePath } =
      loadDefectFixture('17-focus-ring-degraded');
    const sourceChecks = readSourceChecksForFixture(subclassSourcePath);
    const ev = buildEvidence(subclassDecl, { sourceChecks });
    const result = scoreFocusIndicator(subclassDecl, ev);
    const contract = expected.dimensions['Focus Indicator'];
    expect(contract).toBeDefined();
    if (contract?.scoreMax !== undefined) {
      expect(result.score).toBeLessThanOrEqual(contract.scoreMax);
    }
    expect(
      result.notes?.some(
        (n) => n.includes('focus-visible-rule-degraded') || n.includes('focus-ring-degraded'),
      ),
    ).toBe(true);
  });

  it('defect-corpus class 15 — overclaim subclass has degraded focus ring; scorer flags it', () => {
    const { subclassDecl, subclassSourcePath } = loadDefectFixture('15-aaa-cert-overclaim');
    const sourceChecks = readSourceChecksForFixture(subclassSourcePath);
    const ev = buildEvidence(subclassDecl, { sourceChecks });
    const result = scoreFocusIndicator(subclassDecl, ev);
    // Subclass styles set `outline: 1px solid #888` → loose rule yes,
    // 2px no → 60 / heuristic.
    expect(result.score).toBe(60);
    expect(result.confidence).toBe('heuristic');
  });

  it('handles empty sourceChecks shape (all false) deterministically', () => {
    const decl = bareDecl('x-empty');
    const ev = buildEvidence(decl, {
      sourceChecks: {
        hasStaticFormAssociated: false,
        hasAttachInternals: false,
        hasSetValidityCall: false,
        hasFocusVisibleRule: false,
        has2pxOutlineRule: false,
        hasForcedColorsBlock: false,
      },
    });
    const r1 = scoreFocusIndicator(decl, ev);
    const r2 = scoreFocusIndicator(decl, ev);
    expect(r1).toEqual(r2);
  });
});
