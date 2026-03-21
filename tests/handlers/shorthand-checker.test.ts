import { describe, it, expect } from 'vitest';
import { checkCssShorthand } from '../../packages/core/src/handlers/shorthand-checker.js';

// ─── Clean patterns ─────────────────────────────────────────────────────────

describe('checkCssShorthand — clean patterns', () => {
  it('returns clean for longhand properties with var()', () => {
    const css = `.card {
  border-width: 1px;
  border-style: solid;
  border-color: var(--border-color, #ccc);
}`;
    const result = checkCssShorthand(css);
    expect(result.clean).toBe(true);
  });

  it('returns clean for shorthand without var()', () => {
    const css = `.card {
  border: 1px solid #ccc;
  margin: 8px 16px;
}`;
    const result = checkCssShorthand(css);
    expect(result.clean).toBe(true);
  });

  it('returns clean for simple var() shorthand (single value)', () => {
    const css = `.card {
  background: var(--surface-color, #fff);
}`;
    const result = checkCssShorthand(css);
    expect(result.clean).toBe(true);
  });
});

// ─── Risky shorthand + var() patterns ───────────────────────────────────────

describe('checkCssShorthand — risky patterns', () => {
  it('catches border shorthand with var() mixed with literals', () => {
    const css = `.card {
  border: 1px solid var(--border-color);
}`;
    const result = checkCssShorthand(css);
    expect(result.clean).toBe(false);
    expect(result.issues[0]?.rule).toBe('shorthand-var-risk');
    expect(result.issues[0]?.property).toBe('border');
  });

  it('catches background shorthand with var() mixed with literals', () => {
    const css = `.card {
  background: var(--bg-image) no-repeat center;
}`;
    const result = checkCssShorthand(css);
    expect(result.clean).toBe(false);
    expect(result.issues[0]?.property).toBe('background');
  });

  it('catches font shorthand with var()', () => {
    const css = `.card {
  font: var(--font-weight) var(--font-size) / var(--line-height) var(--font-family);
}`;
    const result = checkCssShorthand(css);
    expect(result.clean).toBe(false);
  });

  it('catches margin/padding shorthand with mixed var() and literals', () => {
    const css = `.card {
  margin: var(--space-sm) 16px var(--space-lg) 16px;
}`;
    const result = checkCssShorthand(css);
    expect(result.clean).toBe(false);
  });

  it('handles single-line CSS', () => {
    const css = '.card { border: 1px solid var(--color); }';
    const result = checkCssShorthand(css);
    expect(result.clean).toBe(false);
  });
});

// ─── Result structure ───────────────────────────────────────────────────────

describe('checkCssShorthand — result structure', () => {
  it('returns expected fields', () => {
    const css = '.card { border: 1px solid var(--color); }';
    const result = checkCssShorthand(css);
    expect(result).toHaveProperty('clean');
    expect(result).toHaveProperty('issues');
    expect(result.issues[0]).toHaveProperty('rule');
    expect(result.issues[0]).toHaveProperty('property');
    expect(result.issues[0]).toHaveProperty('message');
    expect(result.issues[0]).toHaveProperty('suggestion');
  });
});
