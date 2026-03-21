import { describe, it, expect } from 'vitest';
import { checkDarkModePatterns } from '../../packages/core/src/handlers/dark-mode-checker.js';

// ─── Theme-Scoped Standard Properties ───────────────────────────────────────

describe('checkDarkModePatterns — theme-scoped standard properties', () => {
  it('flags standard CSS property on WC host inside theme selector', () => {
    const css = `.dark my-button { color: white; }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.rule).toBe('theme-scope-standard-property');
  });

  it('allows CSS custom properties on WC host inside theme selector', () => {
    const css = `.dark my-button { --my-button-color: white; }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues.filter((i) => i.rule === 'theme-scope-standard-property')).toHaveLength(0);
  });

  it('detects [data-theme="dark"] pattern', () => {
    const css = `[data-theme="dark"] my-button { background: #333; }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues.some((i) => i.rule === 'theme-scope-standard-property')).toBe(true);
  });

  it('detects :host-context(.dark) pattern', () => {
    const css = `.dark my-card { background-color: #1a1a1a; }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues.some((i) => i.rule === 'theme-scope-standard-property')).toBe(true);
  });

  it('suggests using CSS custom properties', () => {
    const css = `.dark my-button { color: white; }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues[0]?.message).toContain('custom propert');
  });
});

// ─── prefers-color-scheme Detection ─────────────────────────────────────────

describe('checkDarkModePatterns — prefers-color-scheme', () => {
  it('flags standard properties inside prefers-color-scheme targeting WC', () => {
    const css = `@media (prefers-color-scheme: dark) { my-button { color: white; } }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues.some((i) => i.rule === 'theme-scope-standard-property')).toBe(true);
  });

  it('allows custom properties inside prefers-color-scheme targeting WC', () => {
    const css = `@media (prefers-color-scheme: dark) { my-button { --my-button-color: white; } }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues.filter((i) => i.rule === 'theme-scope-standard-property')).toHaveLength(0);
  });

  it('flags descendant selectors inside prefers-color-scheme', () => {
    const css = `@media (prefers-color-scheme: dark) { my-button .inner { color: white; } }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues.some((i) => i.rule === 'theme-scope-shadow-piercing')).toBe(true);
  });
});

// ─── Shadow DOM Piercing in Theme Scope ─────────────────────────────────────

describe('checkDarkModePatterns — shadow DOM piercing in theme scope', () => {
  it('flags .dark my-button .inner pattern', () => {
    const css = `.dark my-button .inner { color: white; }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues.some((i) => i.rule === 'theme-scope-shadow-piercing')).toBe(true);
  });

  it('allows .dark my-button::part(base) pattern', () => {
    const css = `.dark my-button::part(base) { color: white; }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues.filter((i) => i.rule === 'theme-scope-shadow-piercing')).toHaveLength(0);
  });

  it('allows .dark my-button pattern without descendants', () => {
    const css = `.dark my-button { --my-button-color: white; }`;
    const result = checkDarkModePatterns(css);
    expect(result.issues.filter((i) => i.rule === 'theme-scope-shadow-piercing')).toHaveLength(0);
  });
});

// ─── Clean CSS ──────────────────────────────────────────────────────────────

describe('checkDarkModePatterns — clean patterns', () => {
  it('returns clean for proper dark mode usage', () => {
    const css = `
      @media (prefers-color-scheme: dark) {
        my-button { --my-button-color: white; --my-button-bg: #333; }
      }
      .dark my-button::part(base) { font-weight: bold; }
    `;
    const result = checkDarkModePatterns(css);
    expect(result.clean).toBe(true);
  });

  it('returns clean for non-WC selectors', () => {
    const css = `.dark .wrapper { color: white; background: #333; }`;
    const result = checkDarkModePatterns(css);
    expect(result.clean).toBe(true);
  });

  it('returns clean for empty CSS', () => {
    const result = checkDarkModePatterns('');
    expect(result.clean).toBe(true);
  });
});
