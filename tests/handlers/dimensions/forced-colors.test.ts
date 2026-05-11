import { describe, it, expect } from 'vitest';
import { scoreForcedColors } from '../../../packages/core/src/handlers/dimensions/forced-colors.js';
import {
  bareDecl,
  buildEvidence,
  loadDefectFixture,
  readSourceChecksForFixture,
} from './_fixture-helpers.js';

const checks = (
  overrides: Partial<{
    hasForcedColorsBlock: boolean;
    hasFocusVisibleRule: boolean;
    has2pxOutlineRule: boolean;
  }> = {},
) => ({
  hasStaticFormAssociated: false,
  hasAttachInternals: false,
  hasSetValidityCall: false,
  hasFocusVisibleRule: false,
  has2pxOutlineRule: false,
  hasForcedColorsBlock: false,
  ...overrides,
});

describe('scoreForcedColors', () => {
  it('returns 0/unknown when sourceChecks are absent', () => {
    const decl = bareDecl('x-unknown');
    const ev = buildEvidence(decl);
    const result = scoreForcedColors(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('unknown');
    expect(result.measured).toBe(false);
  });

  it('returns 100/verified for explicit opt-out (forcedColorsSupported false)', () => {
    const decl = bareDecl('x-optout');
    const ev = buildEvidence(decl, { sourceChecks: checks() });
    ev.helixMeta = { forcedColorsSupported: false };
    const result = scoreForcedColors(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
    expect(result.notes).toContain('forced-colors-not-supported-by-design');
  });

  it('returns 100/verified when claim true AND block present', () => {
    const decl = bareDecl('x-good');
    const ev = buildEvidence(decl, { sourceChecks: checks({ hasForcedColorsBlock: true }) });
    ev.helixMeta = { forcedColorsSupported: true };
    const result = scoreForcedColors(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
  });

  it('returns 0/verified with claim-vs-evidence-mismatch when claim true but no block', () => {
    const decl = bareDecl('x-overclaim');
    const ev = buildEvidence(decl, { sourceChecks: checks() });
    ev.helixMeta = { forcedColorsSupported: true };
    const result = scoreForcedColors(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('verified');
    expect(result.notes).toContain('claim-vs-evidence-mismatch');
    expect(result.notes).toContain('forced-colors-media-block-missing');
  });

  it('returns 100/heuristic when block present without explicit claim', () => {
    const decl = bareDecl('x-inferred');
    const ev = buildEvidence(decl, { sourceChecks: checks({ hasForcedColorsBlock: true }) });
    const result = scoreForcedColors(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('heuristic');
  });

  it('returns 0/heuristic when no claim and no block', () => {
    const decl = bareDecl('x-nothing');
    const ev = buildEvidence(decl, { sourceChecks: checks() });
    const result = scoreForcedColors(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('heuristic');
    expect(result.notes).toContain('no-forced-colors-block-and-no-claim');
  });

  it('exposes the forced-colors-media-block sub-metric in all measured branches', () => {
    const cases = [
      {
        meta: { forcedColorsSupported: true },
        src: checks({ hasForcedColorsBlock: true }),
        expect: 1,
      },
      { meta: { forcedColorsSupported: true }, src: checks(), expect: 0 },
      { meta: undefined, src: checks({ hasForcedColorsBlock: true }), expect: 1 },
      { meta: undefined, src: checks(), expect: 0 },
    ];
    for (const c of cases) {
      const decl = bareDecl();
      const ev = buildEvidence(decl, { sourceChecks: c.src });
      if (c.meta) ev.helixMeta = c.meta;
      const r = scoreForcedColors(decl, ev);
      const m = r.subMetrics?.find((s) => s.name === 'forced-colors-media-block');
      expect(m).toBeDefined();
      expect(m?.score).toBe(c.expect);
    }
  });

  it('defect-corpus class 19 — claim-vs-evidence mismatch detected from subclass styles only', () => {
    const { expected, subclassDecl, subclassSourcePath } = loadDefectFixture(
      '19-forced-colors-claim-without-css',
    );
    const sourceChecks = readSourceChecksForFixture(subclassSourcePath);
    const ev = buildEvidence(subclassDecl, { sourceChecks });
    const result = scoreForcedColors(subclassDecl, ev);
    const contract = expected.dimensions['Forced Colors'];
    expect(contract).toBeDefined();
    if (contract?.scoreMax !== undefined) {
      expect(result.score).toBeLessThanOrEqual(contract.scoreMax);
    }
    expect(result.notes?.some((n) => n.includes('claim-vs-evidence-mismatch'))).toBe(true);
  });
});
