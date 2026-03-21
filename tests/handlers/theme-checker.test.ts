import { describe, it, expect } from 'vitest';
import { checkThemeCompatibility } from '../../packages/core/src/handlers/theme-checker.js';

// ─── Clean patterns ──────────────────────────────────────────────────────────

describe('checkThemeCompatibility — clean patterns', () => {
  it('returns clean for CSS using only custom properties', () => {
    const css = `.card {
  background: var(--surface-color, #fff);
  color: var(--text-color, #333);
  border: 1px solid var(--border-color, #ccc);
}`;
    const result = checkThemeCompatibility(css);
    expect(result.clean).toBe(true);
  });

  it('returns clean for CSS with no color values', () => {
    const css = `.card {
  padding: 16px;
  margin: 8px;
  display: flex;
}`;
    const result = checkThemeCompatibility(css);
    expect(result.clean).toBe(true);
  });
});

// ─── Hardcoded background/foreground colors ─────────────────────────────────

describe('checkThemeCompatibility — hardcoded colors', () => {
  it('catches hardcoded background-color', () => {
    const css = `.card {
  background-color: #ffffff;
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues.some((i) => i.rule === 'hardcoded-theme-color')).toBe(true);
  });

  it('catches hardcoded color property', () => {
    const css = `.card {
  color: #333333;
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues.some((i) => i.rule === 'hardcoded-theme-color')).toBe(true);
  });

  it('catches hardcoded border-color', () => {
    const css = `.card {
  border: 1px solid #e0e0e0;
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues.some((i) => i.rule === 'hardcoded-theme-color')).toBe(true);
  });

  it('catches hardcoded colors in single-line CSS', () => {
    const css = '.card { background-color: #ffffff; color: #333; }';
    const result = checkThemeCompatibility(css);
    const hardcoded = result.issues.filter((i) => i.rule === 'hardcoded-theme-color');
    expect(hardcoded.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT flag inherit/currentColor/transparent', () => {
    const css = `.card {
  color: inherit;
  background: transparent;
  border-color: currentColor;
}`;
    const result = checkThemeCompatibility(css);
    const hardcoded = result.issues.filter((i) => i.rule === 'hardcoded-theme-color');
    expect(hardcoded).toHaveLength(0);
  });
});

// ─── Fixed box-shadow / text-shadow ─────────────────────────────────────────

describe('checkThemeCompatibility — shadow colors', () => {
  it('catches hardcoded box-shadow color', () => {
    const css = `.card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues.some((i) => i.rule === 'hardcoded-shadow')).toBe(true);
  });

  it('does NOT flag box-shadow using var()', () => {
    const css = `.card {
  box-shadow: var(--shadow-md);
}`;
    const result = checkThemeCompatibility(css);
    const shadows = result.issues.filter((i) => i.rule === 'hardcoded-shadow');
    expect(shadows).toHaveLength(0);
  });
});

// ─── Contrast issues ────────────────────────────────────────────────────────

describe('checkThemeCompatibility — contrast pairing', () => {
  it('detects white text + white background (no contrast)', () => {
    const css = `.card {
  color: white;
  background-color: #fafafa;
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues.some((i) => i.rule === 'potential-contrast-issue')).toBe(true);
  });

  it('does NOT flag when colors are from variables', () => {
    const css = `.card {
  color: var(--text);
  background-color: var(--surface);
}`;
    const result = checkThemeCompatibility(css);
    const contrast = result.issues.filter((i) => i.rule === 'potential-contrast-issue');
    expect(contrast).toHaveLength(0);
  });
});

// ─── Mixed token/hardcoded pairs ────────────────────────────────────────────

describe('checkThemeCompatibility — mixed token and hardcoded', () => {
  it('detects hardcoded color with token background in same block', () => {
    const css = `.card {
  background: var(--surface-color);
  color: #333333;
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues.some((i) => i.rule === 'mixed-token-hardcoded')).toBe(true);
  });

  it('detects hardcoded background with token color in same block', () => {
    const css = `.card {
  color: var(--text-color);
  background-color: #ffffff;
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues.some((i) => i.rule === 'mixed-token-hardcoded')).toBe(true);
  });

  it('does NOT flag when both use tokens', () => {
    const css = `.card {
  color: var(--text-color);
  background: var(--surface-color);
}`;
    const result = checkThemeCompatibility(css);
    const mixed = result.issues.filter((i) => i.rule === 'mixed-token-hardcoded');
    expect(mixed).toHaveLength(0);
  });

  it('does NOT flag when both are hardcoded (caught by hardcoded-theme-color)', () => {
    const css = `.card {
  color: #333;
  background: #fff;
}`;
    const result = checkThemeCompatibility(css);
    const mixed = result.issues.filter((i) => i.rule === 'mixed-token-hardcoded');
    expect(mixed).toHaveLength(0);
  });
});

// ─── Low-opacity shadows (invisible in dark mode) ──────────────────────────

describe('checkThemeCompatibility — dark mode shadow visibility', () => {
  it('warns about very low opacity black shadows', () => {
    const css = `.card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues.some((i) => i.rule === 'dark-mode-shadow-invisible')).toBe(true);
  });

  it('does NOT flag shadows with reasonable opacity', () => {
    const css = `.card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}`;
    const result = checkThemeCompatibility(css);
    const invisible = result.issues.filter((i) => i.rule === 'dark-mode-shadow-invisible');
    expect(invisible).toHaveLength(0);
  });

  it('warns about low opacity hsla shadows', () => {
    const css = `.card {
  box-shadow: 0 1px 3px hsla(0, 0%, 0%, 0.06);
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues.some((i) => i.rule === 'dark-mode-shadow-invisible')).toBe(true);
  });
});

// ─── Result structure ───────────────────────────────────────────────────────

describe('checkThemeCompatibility — result structure', () => {
  it('includes line numbers', () => {
    const css = `/* line 1 */
.card {
  background-color: #fff;
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues[0]?.line).toBe(3);
  });

  it('includes issue count', () => {
    const css = `.card {
  color: #333;
  background: #fff;
  border-color: #ccc;
}`;
    const result = checkThemeCompatibility(css);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});
