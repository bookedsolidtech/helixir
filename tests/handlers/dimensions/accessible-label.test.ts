import { describe, it, expect } from 'vitest';
import { scoreAccessibleLabel } from '../../../packages/core/src/handlers/dimensions/accessible-label.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';
import { bareDecl, buildEvidence } from './_fixture-helpers.js';

describe('scoreAccessibleLabel', () => {
  it('returns 100/verified when helixMeta.ariaPattern is a known APG pattern', () => {
    const decl = bareDecl('hx-button');
    const ev = buildEvidence(decl);
    ev.helixMeta = { ariaPattern: 'button' };
    const result = scoreAccessibleLabel(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
    expect(result.subMetrics?.[0]?.name).toBe('apg-pattern-recognized');
  });

  it('falls through to heuristic when ariaPattern is not in the catalogue', () => {
    const decl = bareDecl('x-custom');
    const ev = buildEvidence(decl);
    ev.helixMeta = { ariaPattern: 'totally-made-up' };
    const result = scoreAccessibleLabel(decl, ev);
    expect(result.confidence).not.toBe('verified');
  });

  it('returns 50/heuristic when CEM has a label slot', () => {
    const decl: CemDeclaration = {
      ...bareDecl('x-slot'),
      slots: [{ name: 'label', description: '' }],
    } as CemDeclaration;
    const ev = buildEvidence(decl);
    const result = scoreAccessibleLabel(decl, ev);
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('heuristic');
  });

  it('returns 50/heuristic when CEM has a member named accessibleLabel', () => {
    const decl: CemDeclaration = {
      ...bareDecl('x-member'),
      members: [{ kind: 'field', name: 'accessibleLabel', type: { text: 'string' } }],
    } as CemDeclaration;
    const ev = buildEvidence(decl);
    const result = scoreAccessibleLabel(decl, ev);
    expect(result.score).toBe(50);
  });

  it('returns 50/heuristic when CEM has aria-label member', () => {
    const decl: CemDeclaration = {
      ...bareDecl('x-aria-label-member'),
      members: [{ kind: 'field', name: 'aria-label', type: { text: 'string' } }],
    } as CemDeclaration;
    const ev = buildEvidence(decl);
    const result = scoreAccessibleLabel(decl, ev);
    expect(result.score).toBe(50);
  });

  it('returns 50/heuristic when an attributes[] entry covers aria-labelledby', () => {
    const baseDecl = bareDecl('x-aria-labelledby');
    const decl = {
      ...baseDecl,
      attributes: [{ name: 'aria-labelledby', type: { text: 'string' } }],
    } as CemDeclaration & { attributes: Array<{ name: string }> };
    const ev = buildEvidence(decl);
    const result = scoreAccessibleLabel(decl, ev);
    expect(result.score).toBe(50);
  });

  it('returns 0/unknown when no APG pattern and no CEM label surface', () => {
    const decl = bareDecl('x-blank');
    const ev = buildEvidence(decl);
    const result = scoreAccessibleLabel(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('unknown');
    expect(result.measured).toBe(false);
  });

  it('ariaPattern absent + CEM-only fallback still wins over pure unknown', () => {
    const decl: CemDeclaration = {
      ...bareDecl('x-only-slot'),
      slots: [{ name: 'label', description: '' }],
    } as CemDeclaration;
    const ev = buildEvidence(decl);
    const result = scoreAccessibleLabel(decl, ev);
    expect(result.measured).toBe(true);
    expect(result.score).toBe(50);
  });

  it('does not throw on missing slots/members arrays', () => {
    const decl: CemDeclaration = {
      kind: 'class',
      name: 'XEmpty',
      tagName: 'x-empty',
    } as CemDeclaration;
    const ev = buildEvidence(decl);
    const result = scoreAccessibleLabel(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('unknown');
  });

  it('recognises several APG patterns from the catalogue', () => {
    for (const pat of ['link', 'menu', 'dialog', 'tab', 'combobox']) {
      const decl = bareDecl(`x-${pat}`);
      const ev = buildEvidence(decl);
      ev.helixMeta = { ariaPattern: pat };
      const result = scoreAccessibleLabel(decl, ev);
      expect(result.score).toBe(100);
      expect(result.confidence).toBe('verified');
    }
  });
});
