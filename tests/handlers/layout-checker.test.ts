import { describe, it, expect } from 'vitest';
import { checkLayoutPatterns } from '../../packages/core/src/handlers/layout-checker.js';

// ─── Clean patterns ─────────────────────────────────────────────────────────

describe('checkLayoutPatterns — clean patterns', () => {
  it('passes for custom property-based sizing', () => {
    const result = checkLayoutPatterns('sl-button { --sl-button-width: 100%; }');
    expect(result.issues).toHaveLength(0);
  });

  it('passes for display on generic elements', () => {
    const result = checkLayoutPatterns('.container { display: flex; }');
    expect(result.issues).toHaveLength(0);
  });

  it('passes for ::part() layout properties', () => {
    const result = checkLayoutPatterns('sl-card::part(body) { display: flex; gap: 1rem; }');
    expect(result.issues).toHaveLength(0);
  });
});

// ─── Host display override ──────────────────────────────────────────────────

describe('checkLayoutPatterns — host display override', () => {
  it('flags display override on web component host', () => {
    const result = checkLayoutPatterns('sl-card { display: flex; }');
    expect(result.issues.some((i) => i.type === 'host-display-override')).toBe(true);
  });

  it('allows display: none and display: contents on host', () => {
    const result = checkLayoutPatterns(
      'sl-card { display: none; } sl-button { display: contents; }',
    );
    expect(result.issues.filter((i) => i.type === 'host-display-override')).toHaveLength(0);
  });
});

// ─── Fixed dimensions on host ───────────────────────────────────────────────

describe('checkLayoutPatterns — fixed dimensions', () => {
  it('flags fixed pixel width on web component', () => {
    const result = checkLayoutPatterns('sl-card { width: 400px; }');
    expect(result.issues.some((i) => i.type === 'fixed-dimension')).toBe(true);
  });

  it('allows percentage and relative widths', () => {
    const result = checkLayoutPatterns('sl-card { width: 100%; max-width: 40rem; }');
    expect(result.issues.filter((i) => i.type === 'fixed-dimension')).toHaveLength(0);
  });

  it('allows var() for dimensions', () => {
    const result = checkLayoutPatterns('sl-card { width: var(--card-width, 100%); }');
    expect(result.issues.filter((i) => i.type === 'fixed-dimension')).toHaveLength(0);
  });
});

// ─── Position override ──────────────────────────────────────────────────────

describe('checkLayoutPatterns — position override', () => {
  it('flags position: absolute/fixed on web component', () => {
    const result = checkLayoutPatterns('sl-dialog { position: fixed; }');
    expect(result.issues.some((i) => i.type === 'position-override')).toBe(true);
  });

  it('allows position: relative on host', () => {
    const result = checkLayoutPatterns('sl-card { position: relative; }');
    expect(result.issues.filter((i) => i.type === 'position-override')).toHaveLength(0);
  });
});

// ─── Overflow on host ───────────────────────────────────────────────────────

describe('checkLayoutPatterns — overflow', () => {
  it('flags overflow: hidden on web component (may clip shadow DOM)', () => {
    const result = checkLayoutPatterns('sl-card { overflow: hidden; }');
    expect(result.issues.some((i) => i.type === 'overflow-clip')).toBe(true);
  });
});

// ─── Result structure ───────────────────────────────────────────────────────

describe('checkLayoutPatterns — result structure', () => {
  it('returns issues array and summary', () => {
    const result = checkLayoutPatterns('sl-button { color: red; }');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});
