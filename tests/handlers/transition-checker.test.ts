import { describe, it, expect } from 'vitest';
import { checkTransitionAnimation } from '../../packages/core/src/handlers/transition-checker.js';

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('checkTransitionAnimation', () => {
  describe('transition on non-custom-property', () => {
    it('flags transition targeting standard properties on component host', () => {
      const css = `sl-button { transition: background-color 0.3s ease; }`;
      const result = checkTransitionAnimation(css, 'sl-button');
      expect(result.issues.some((i) => i.rule === 'transition-no-effect')).toBe(true);
    });

    it('allows transition on custom properties', () => {
      const css = `sl-button { transition: --sl-button-bg 0.3s ease; }`;
      const result = checkTransitionAnimation(css, 'sl-button');
      const transitionIssues = result.issues.filter((i) => i.rule === 'transition-no-effect');
      expect(transitionIssues).toHaveLength(0);
    });

    it('allows transition:all on component host (may affect custom properties)', () => {
      const css = `sl-button { transition: all 0.3s ease; }`;
      const result = checkTransitionAnimation(css, 'sl-button');
      const transitionIssues = result.issues.filter((i) => i.rule === 'transition-no-effect');
      expect(transitionIssues).toHaveLength(0);
    });
  });

  describe('animation targeting shadow internals', () => {
    it('flags @keyframes animating standard properties on component', () => {
      const css = `sl-button { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`;
      const result = checkTransitionAnimation(css, 'sl-button');
      expect(result.issues.some((i) => i.rule === 'animation-host-only')).toBe(true);
    });

    it('does not flag animations on non-component elements', () => {
      const css = `.wrapper { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`;
      const result = checkTransitionAnimation(css, 'sl-button');
      const animIssues = result.issues.filter((i) => i.rule === 'animation-host-only');
      expect(animIssues).toHaveLength(0);
    });
  });

  describe('transition shorthand with multiple properties', () => {
    it('flags when any non-custom property is transitioned on host', () => {
      const css = `sl-button { transition: color 0.2s, padding 0.3s; }`;
      const result = checkTransitionAnimation(css, 'sl-button');
      expect(result.issues.some((i) => i.rule === 'transition-no-effect')).toBe(true);
    });
  });

  describe('single-line CSS handling', () => {
    it('handles single-line CSS blocks', () => {
      const css = `sl-button { transition: background-color 0.3s ease; color: red; }`;
      const result = checkTransitionAnimation(css, 'sl-button');
      expect(result.issues.some((i) => i.rule === 'transition-no-effect')).toBe(true);
    });
  });

  describe('result structure', () => {
    it('returns correct shape', () => {
      const result = checkTransitionAnimation('.x { color: red; }', 'sl-button');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('clean');
      expect(Array.isArray(result.issues)).toBe(true);
    });
  });

  describe('clean CSS', () => {
    it('reports clean for CSS without transition issues', () => {
      const css = `.wrapper { transition: opacity 0.3s; }`;
      const result = checkTransitionAnimation(css, 'sl-button');
      expect(result.clean).toBe(true);
    });

    it('reports clean for empty CSS', () => {
      const result = checkTransitionAnimation('', 'sl-button');
      expect(result.clean).toBe(true);
    });
  });
});
