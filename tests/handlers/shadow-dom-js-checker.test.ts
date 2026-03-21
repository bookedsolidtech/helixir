import { describe, it, expect } from 'vitest';
import { checkShadowDomJs } from '../../packages/core/src/handlers/shadow-dom-js-checker.js';

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('checkShadowDomJs', () => {
  describe('shadowRoot access', () => {
    it('detects .shadowRoot.querySelector() access', () => {
      const code = `const inner = element.shadowRoot.querySelector('.label');`;
      const result = checkShadowDomJs(code);
      expect(result.issues.some((i) => i.rule === 'no-shadow-root-access')).toBe(true);
    });

    it('detects .shadowRoot.querySelectorAll() access', () => {
      const code = `const items = el.shadowRoot.querySelectorAll('div');`;
      const result = checkShadowDomJs(code);
      expect(result.issues.some((i) => i.rule === 'no-shadow-root-access')).toBe(true);
    });

    it('detects .shadowRoot.getElementById()', () => {
      const code = `const inner = myEl.shadowRoot.getElementById('main');`;
      const result = checkShadowDomJs(code);
      expect(result.issues.some((i) => i.rule === 'no-shadow-root-access')).toBe(true);
    });

    it('detects .shadowRoot.innerHTML assignment', () => {
      const code = `element.shadowRoot.innerHTML = '<div>hacked</div>';`;
      const result = checkShadowDomJs(code);
      expect(result.issues.some((i) => i.rule === 'no-shadow-root-access')).toBe(true);
    });

    it('does not flag shadowRoot in component internal code comments', () => {
      // Just property access without DOM traversal is less dangerous
      const code = `const hasShadow = !!element.shadowRoot;`;
      const result = checkShadowDomJs(code);
      const accessIssues = result.issues.filter((i) => i.rule === 'no-shadow-root-access');
      expect(accessIssues).toHaveLength(0);
    });
  });

  describe('attachShadow misuse', () => {
    it('detects attachShadow on existing components', () => {
      const code = `const button = document.querySelector('sl-button');\nbutton.attachShadow({ mode: 'open' });`;
      const result = checkShadowDomJs(code);
      expect(result.issues.some((i) => i.rule === 'no-attach-shadow')).toBe(true);
    });
  });

  describe('innerHTML on component', () => {
    it('detects innerHTML assignment to web component', () => {
      const code = `document.querySelector('sl-button').innerHTML = '<span>Click</span>';`;
      const result = checkShadowDomJs(code);
      expect(result.issues.some((i) => i.rule === 'no-inner-html-component')).toBe(true);
    });

    it('does not flag innerHTML on regular elements', () => {
      const code = `document.querySelector('.container').innerHTML = '<div>Content</div>';`;
      const result = checkShadowDomJs(code);
      const htmlIssues = result.issues.filter((i) => i.rule === 'no-inner-html-component');
      expect(htmlIssues).toHaveLength(0);
    });
  });

  describe('style.cssText on component', () => {
    it('detects direct style manipulation on web component host', () => {
      const code = `const el = document.querySelector('sl-card');\nel.style.cssText = 'background: red; color: white;';`;
      const result = checkShadowDomJs(code, 'sl-card');
      expect(result.issues.some((i) => i.rule === 'prefer-css-properties')).toBe(true);
    });
  });

  describe('clean code', () => {
    it('reports clean for valid component usage', () => {
      const code = `
const button = document.querySelector('sl-button');
button.variant = 'primary';
button.addEventListener('sl-click', handler);
`;
      const result = checkShadowDomJs(code);
      expect(result.clean).toBe(true);
    });

    it('reports clean for empty code', () => {
      const result = checkShadowDomJs('');
      expect(result.clean).toBe(true);
    });
  });

  describe('result structure', () => {
    it('returns correct shape', () => {
      const result = checkShadowDomJs('const x = 1;');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('clean');
      expect(Array.isArray(result.issues)).toBe(true);
    });
  });
});
