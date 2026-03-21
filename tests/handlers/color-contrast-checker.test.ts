import { describe, it, expect } from 'vitest';
import { checkColorContrast } from '../../packages/core/src/handlers/color-contrast-checker.js';

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('checkColorContrast', () => {
  describe('hardcoded background + text color pairs', () => {
    it('flags white text on white background', () => {
      const css = `.card { background: white; color: #fefefe; }`;
      const result = checkColorContrast(css);
      expect(result.clean).toBe(false);
      expect(result.issues.some((i) => i.rule === 'low-contrast-pair')).toBe(true);
    });

    it('flags dark text on dark background', () => {
      const css = `.card { background-color: #111; color: #222; }`;
      const result = checkColorContrast(css);
      expect(result.clean).toBe(false);
      expect(result.issues.some((i) => i.rule === 'low-contrast-pair')).toBe(true);
    });

    it('allows high contrast pairs', () => {
      const css = `.card { background: white; color: #333; }`;
      const result = checkColorContrast(css);
      const contrastIssues = result.issues.filter((i) => i.rule === 'low-contrast-pair');
      expect(contrastIssues).toHaveLength(0);
    });
  });

  describe('mixed token + hardcoded pairs', () => {
    it('flags hardcoded background with token text color', () => {
      const css = `.card { background: #ffffff; color: var(--text-color); }`;
      const result = checkColorContrast(css);
      expect(result.issues.some((i) => i.rule === 'mixed-color-source')).toBe(true);
    });

    it('flags token background with hardcoded text color', () => {
      const css = `.card { background: var(--bg-color); color: #333; }`;
      const result = checkColorContrast(css);
      expect(result.issues.some((i) => i.rule === 'mixed-color-source')).toBe(true);
    });

    it('allows all-token color pairs', () => {
      const css = `.card { background: var(--bg); color: var(--text); }`;
      const result = checkColorContrast(css);
      const mixedIssues = result.issues.filter((i) => i.rule === 'mixed-color-source');
      expect(mixedIssues).toHaveLength(0);
    });

    it('allows all-hardcoded color pairs (caught by theme-checker instead)', () => {
      const css = `.card { background: white; color: black; }`;
      const result = checkColorContrast(css);
      const mixedIssues = result.issues.filter((i) => i.rule === 'mixed-color-source');
      expect(mixedIssues).toHaveLength(0);
    });
  });

  describe('opacity on colored elements', () => {
    it('flags low opacity on text over background', () => {
      const css = `.text { color: var(--text-color); opacity: 0.3; }`;
      const result = checkColorContrast(css);
      expect(result.issues.some((i) => i.rule === 'low-opacity-text')).toBe(true);
    });

    it('allows normal opacity', () => {
      const css = `.text { color: var(--text-color); opacity: 0.8; }`;
      const result = checkColorContrast(css);
      const opacityIssues = result.issues.filter((i) => i.rule === 'low-opacity-text');
      expect(opacityIssues).toHaveLength(0);
    });
  });

  describe('single-line CSS handling', () => {
    it('handles single-line CSS with multiple declarations', () => {
      const css = `.card { background: white; color: #f0f0f0; }`;
      const result = checkColorContrast(css);
      expect(result.issues.some((i) => i.rule === 'low-contrast-pair')).toBe(true);
    });
  });

  describe('result structure', () => {
    it('returns correct shape', () => {
      const result = checkColorContrast('.x { color: red; }');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('clean');
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it('issues have required fields', () => {
      const css = `.card { background: white; color: white; }`;
      const result = checkColorContrast(css);
      expect(result.issues.length).toBeGreaterThan(0);
      const issue = result.issues[0]!;
      expect(issue).toHaveProperty('rule');
      expect(issue).toHaveProperty('message');
      expect(issue).toHaveProperty('line');
      expect(issue).toHaveProperty('selector');
    });
  });

  describe('clean CSS', () => {
    it('reports clean for CSS without color issues', () => {
      const css = `.card { padding: 1rem; margin: 0; }`;
      const result = checkColorContrast(css);
      expect(result.clean).toBe(true);
    });

    it('reports clean for empty CSS', () => {
      const result = checkColorContrast('');
      expect(result.clean).toBe(true);
    });
  });
});
