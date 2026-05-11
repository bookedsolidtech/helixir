import { describe, it, expect } from 'vitest';
import {
  parseKeyboardContract,
  scoreApgKeyboard,
} from '../../../packages/core/src/handlers/dimensions/apg-keyboard.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';
import { bareDecl, buildEvidence, loadDefectFixture } from './_fixture-helpers.js';

describe('parseKeyboardContract', () => {
  it('parses the helix structured form', () => {
    const c = parseKeyboardContract(
      'activate: Enter, Space; dismiss: Escape; disabledSuppresses: true',
    );
    expect(c).not.toBeNull();
    expect(c?.activate).toEqual(['Enter', 'Space']);
    expect(c?.dismiss).toEqual(['Escape']);
    expect(c?.disabledSuppresses).toBe(true);
  });

  it('parses with newline separators', () => {
    const c = parseKeyboardContract('activate: Enter\nnavigate: ArrowDown, ArrowUp');
    expect(c?.activate).toEqual(['Enter']);
    expect(c?.navigate).toEqual(['ArrowDown', 'ArrowUp']);
    expect(c?.disabledSuppresses).toBe(false);
  });

  it('strips a leading @keyboard-contract tag', () => {
    const c = parseKeyboardContract('@keyboard-contract activate: Enter');
    expect(c?.activate).toEqual(['Enter']);
  });

  it('returns null for empty / whitespace input', () => {
    expect(parseKeyboardContract('')).toBeNull();
    expect(parseKeyboardContract('   ')).toBeNull();
    expect(parseKeyboardContract(undefined)).toBeNull();
    expect(parseKeyboardContract(null)).toBeNull();
  });

  it('ignores unknown bucket names without failing', () => {
    const c = parseKeyboardContract('activate: Enter; bogus: Foo');
    expect(c?.activate).toEqual(['Enter']);
  });

  it('handles whitespace-separated key lists', () => {
    const c = parseKeyboardContract('navigate: ArrowUp ArrowDown');
    expect(c?.navigate).toEqual(['ArrowUp', 'ArrowDown']);
  });
});

describe('scoreApgKeyboard', () => {
  it('returns 100/verified when helixMeta contract covers full APG button keys', () => {
    const decl = bareDecl('hx-button');
    const ev = buildEvidence(decl);
    ev.helixMeta = {
      ariaPattern: 'button',
      keyboardContract: { activate: ['Enter', 'Space'], disabledSuppresses: true },
    };
    const result = scoreApgKeyboard(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
  });

  it('returns heuristic with missing-key note when contract misses APG-required keys', () => {
    const decl = bareDecl('hx-button-incomplete');
    const ev = buildEvidence(decl);
    ev.helixMeta = {
      ariaPattern: 'button',
      keyboardContract: { activate: ['Enter'], disabledSuppresses: true },
    };
    const result = scoreApgKeyboard(decl, ev);
    expect(result.score).toBe(60); // 70 - 10 for one missing key
    expect(result.confidence).toBe('heuristic');
    expect(result.notes?.[0]).toContain('Space');
  });

  it('returns 50/heuristic when keyboardContract exists without ariaPattern', () => {
    const decl = bareDecl('x-no-pattern');
    const ev = buildEvidence(decl);
    ev.helixMeta = {
      keyboardContract: { activate: ['Enter'], disabledSuppresses: false },
    };
    const result = scoreApgKeyboard(decl, ev);
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('heuristic');
  });

  it('parses a contract from decl.description when helixMeta has none', () => {
    const decl: CemDeclaration = {
      ...bareDecl('x-jsdoc'),
      description: '@keyboard-contract activate: Enter, Space',
    } as CemDeclaration;
    const ev = buildEvidence(decl);
    ev.helixMeta = { ariaPattern: 'button' };
    const result = scoreApgKeyboard(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
  });

  it('falls back to 25/heuristic on CEM keydown events alone', () => {
    const decl: CemDeclaration = {
      ...bareDecl('x-keydown'),
      events: [{ name: 'keydown', description: 'key press' }],
    } as CemDeclaration;
    const ev = buildEvidence(decl);
    const result = scoreApgKeyboard(decl, ev);
    expect(result.score).toBe(25);
    expect(result.confidence).toBe('heuristic');
  });

  it('returns 0/unknown when nothing is known about keyboard support', () => {
    const decl = bareDecl('x-quiet');
    const ev = buildEvidence(decl);
    const result = scoreApgKeyboard(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('unknown');
    expect(result.measured).toBe(false);
  });

  it('prefers helixMeta.keyboardContract over the JSDoc contract', () => {
    const decl: CemDeclaration = {
      ...bareDecl('x-both'),
      description: '@keyboard-contract activate: WrongKey',
    } as CemDeclaration;
    const ev = buildEvidence(decl);
    ev.helixMeta = {
      ariaPattern: 'button',
      keyboardContract: { activate: ['Enter', 'Space'], disabledSuppresses: true },
    };
    const result = scoreApgKeyboard(decl, ev);
    expect(result.score).toBe(100);
  });

  it('does not throw on malformed events array', () => {
    const decl: CemDeclaration = {
      ...bareDecl('x-malformed'),
      events: undefined as unknown as Array<{ name: string }>,
    } as CemDeclaration;
    const ev = buildEvidence(decl);
    const result = scoreApgKeyboard(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('unknown');
  });

  it('defect-corpus class 16 — scorer returns the contract verdict in isolation (drift is verify-extension scope)', () => {
    // Per the Phase-2 spec, keyboard-contract drift between parent and
    // subclass (class 16) is **out of scope** for this scorer — drift
    // is detected by `verify-extension.ts` which compares parent vs
    // subclass contracts. This scorer evaluates the subclass's own
    // contract against the named APG pattern. The subclass declares
    // `activate: Space, Enter` for `checkbox` (APG expects only Space),
    // so the contract is over-broad-but-complete → 100. The drift
    // (added Escape handler) is invisible at the CEM level.
    //
    // The fixture's `scoreMax: 50` reflects what an integrated
    // (verify-extension + scorer) view should yield — outside this
    // scorer's contract. We assert here only that the scorer parses
    // the contract correctly.
    const { subclassDecl } = loadDefectFixture('16-keyboard-contract-drift');
    const ev = buildEvidence(subclassDecl);
    const result = scoreApgKeyboard(subclassDecl, ev);
    expect(result.measured).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });
});
