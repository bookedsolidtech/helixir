import { describe, it, expect } from 'vitest';
import { checkCssSpecificity } from '../../packages/core/src/handlers/specificity-checker.js';

// ─── Clean patterns ─────────────────────────────────────────────────────────

describe('checkCssSpecificity — clean patterns', () => {
  it('passes for simple element selector with custom properties', () => {
    const result = checkCssSpecificity('sl-button { --sl-button-font-size: 1rem; }');
    expect(result.issues).toHaveLength(0);
  });

  it('passes for ::part() selectors', () => {
    const result = checkCssSpecificity('sl-button::part(base) { color: red; }');
    expect(result.issues).toHaveLength(0);
  });

  it('passes for host context selectors', () => {
    const result = checkCssSpecificity(':host { display: block; }');
    expect(result.issues).toHaveLength(0);
  });
});

// ─── !important detection ───────────────────────────────────────────────────

describe('checkCssSpecificity — !important', () => {
  it('flags !important on component styling', () => {
    const result = checkCssSpecificity('sl-button { color: red !important; }');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].type).toBe('important');
  });

  it('flags !important on custom properties', () => {
    const result = checkCssSpecificity('sl-button { --sl-button-font-size: 1rem !important; }');
    expect(result.issues.some((i) => i.type === 'important')).toBe(true);
  });
});

// ─── Over-qualified selectors ───────────────────────────────────────────────

describe('checkCssSpecificity — over-qualified selectors', () => {
  it('flags ID selectors targeting web components', () => {
    const result = checkCssSpecificity('#my-form sl-button { color: red; }');
    expect(result.issues.some((i) => i.type === 'id-selector')).toBe(true);
  });

  it('flags deeply nested selectors (4+ levels)', () => {
    const result = checkCssSpecificity('.page .container .form .row sl-button { color: red; }');
    expect(result.issues.some((i) => i.type === 'deep-nesting')).toBe(true);
  });

  it('allows 2-3 level nesting', () => {
    const result = checkCssSpecificity('.form sl-button { color: red; }');
    expect(result.issues.filter((i) => i.type === 'deep-nesting')).toHaveLength(0);
  });
});

// ─── Inline style detection ────────────────────────────────────────────────

describe('checkCssSpecificity — inline styles in HTML', () => {
  it('flags inline style attributes on web components', () => {
    const result = checkCssSpecificity('<sl-button style="color: red;">Click</sl-button>', {
      mode: 'html',
    });
    expect(result.issues.some((i) => i.type === 'inline-style')).toBe(true);
  });
});

// ─── Multiple selector issues ───────────────────────────────────────────────

describe('checkCssSpecificity — multiple issues', () => {
  it('detects multiple issues in one stylesheet', () => {
    const css = `
#app .wrapper sl-button { color: red !important; }
.page .section .card .row sl-input { background: white; }
    `;
    const result = checkCssSpecificity(css);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Result structure ───────────────────────────────────────────────────────

describe('checkCssSpecificity — result structure', () => {
  it('returns issues array and summary', () => {
    const result = checkCssSpecificity('sl-button { color: red; }');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('includes selector and severity in issues', () => {
    const result = checkCssSpecificity('#app sl-button { color: red !important; }');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toHaveProperty('selector');
    expect(result.issues[0]).toHaveProperty('severity');
    expect(result.issues[0]).toHaveProperty('message');
  });
});
