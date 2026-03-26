/**
 * Tests for the create_theme and apply_theme_tokens tool dispatchers.
 * Covers isThemeTool, handleThemeCall, argument validation,
 * and response formatting with CEM-based inputs.
 */
import { describe, it, expect, vi } from 'vitest';
import { isThemeTool, handleThemeCall } from '../../packages/core/src/tools/theme.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/theme.js', () => ({
  createTheme: vi.fn((_cem: unknown, opts?: { themeName?: string; prefix?: string }) => ({
    themeName: opts?.themeName ?? 'theme',
    prefix: opts?.prefix ?? '--hx-',
    tokenCount: 12,
    categoryCounts: { color: 4, spacing: 3, font: 2, border: 2, elevation: 1 },
    fullThemeCSS: `.${opts?.themeName ?? 'theme'}-light { --hx-color-primary: #0066cc; }`,
  })),
  applyThemeTokens: vi.fn(
    (_cem: unknown, themeTokens: Record<string, string>, _tagNames?: string[]) => ({
      globalBlock: `:root {\n${Object.entries(themeTokens)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n')}\n}`,
      componentBlocks: [
        { tagName: 'hx-button', css: 'hx-button { --hx-color-primary: #0066cc; }' },
      ],
      matchedTokenCount: Object.keys(themeTokens).length,
    }),
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

const RICH_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/hx-button.ts',
      declarations: [
        {
          kind: 'class',
          name: 'HxButton',
          tagName: 'hx-button',
          members: [],
          cssProperties: [
            { name: '--hx-color-primary', description: 'Primary color' },
            { name: '--hx-spacing-md', description: 'Medium spacing' },
          ],
        },
      ],
    },
  ],
};

// ─── isThemeTool ──────────────────────────────────────────────────────────────

describe('isThemeTool', () => {
  it('returns true for create_theme', () => {
    expect(isThemeTool('create_theme')).toBe(true);
  });

  it('returns true for apply_theme_tokens', () => {
    expect(isThemeTool('apply_theme_tokens')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isThemeTool('scaffold_component')).toBe(false);
    expect(isThemeTool('get_design_tokens')).toBe(false);
    expect(isThemeTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isThemeTool('theme')).toBe(false);
    expect(isThemeTool('create_themes')).toBe(false);
  });
});

// ─── handleThemeCall — create_theme ───────────────────────────────────────────

describe('handleThemeCall — create_theme', () => {
  it('returns a success result with empty args', async () => {
    const result = await handleThemeCall('create_theme', {}, FAKE_CEM);
    expect(result.isError).toBeFalsy();
  });

  it('returns JSON-parseable content', async () => {
    const result = await handleThemeCall('create_theme', {}, FAKE_CEM);
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('accepts optional themeName', async () => {
    const result = await handleThemeCall('create_theme', { themeName: 'brand' }, FAKE_CEM);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.themeName).toBe('brand');
  });

  it('accepts optional prefix override', async () => {
    const result = await handleThemeCall('create_theme', { prefix: '--my-' }, FAKE_CEM);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.prefix).toBe('--my-');
  });

  it('uses "theme" as default themeName when omitted', async () => {
    const result = await handleThemeCall('create_theme', {}, FAKE_CEM);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.themeName).toBe('theme');
  });

  it('works with a rich CEM containing CSS properties', async () => {
    const result = await handleThemeCall('create_theme', { themeName: 'enterprise' }, RICH_CEM);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.themeName).toBe('enterprise');
  });

  it('rejects unexpected extra properties (Zod strict validation)', async () => {
    const result = await handleThemeCall(
      'create_theme',
      { themeName: 'brand', unknownProp: 'bad' },
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
  });
});

// ─── handleThemeCall — apply_theme_tokens ─────────────────────────────────────

describe('handleThemeCall — apply_theme_tokens', () => {
  it('returns a success result with required themeTokens', async () => {
    const result = await handleThemeCall(
      'apply_theme_tokens',
      { themeTokens: { '--hx-color-primary': '#0066cc' } },
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('returns JSON-parseable content', async () => {
    const result = await handleThemeCall(
      'apply_theme_tokens',
      { themeTokens: { '--hx-color-primary': '#0066cc' } },
      FAKE_CEM,
    );
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('passes multiple tokens correctly', async () => {
    const tokens = {
      '--hx-color-primary': '#0066cc',
      '--hx-spacing-md': '1rem',
      '--hx-font-family': 'sans-serif',
    };
    const result = await handleThemeCall('apply_theme_tokens', { themeTokens: tokens }, RICH_CEM);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.matchedTokenCount).toBe(3);
  });

  it('accepts optional tagNames filter', async () => {
    const result = await handleThemeCall(
      'apply_theme_tokens',
      {
        themeTokens: { '--hx-color-primary': '#0066cc' },
        tagNames: ['hx-button'],
      },
      RICH_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('returns error when themeTokens is missing', async () => {
    const result = await handleThemeCall('apply_theme_tokens', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });

  it('returns error when themeTokens contains non-string values', async () => {
    const result = await handleThemeCall(
      'apply_theme_tokens',
      { themeTokens: { '--hx-color-primary': 42 } },
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
  });
});

// ─── handleThemeCall — error cases ────────────────────────────────────────────

describe('handleThemeCall — error cases', () => {
  it('returns error for unknown tool name', async () => {
    const result = await handleThemeCall('nonexistent_tool', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown theme tool');
  });

  it('returns error for empty tool name', async () => {
    const result = await handleThemeCall('', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown theme tool');
  });
});

// ─── handleThemeCall — handler error propagation ──────────────────────────────

describe('handleThemeCall — handler error propagation', () => {
  it('returns error when createTheme handler throws', async () => {
    const { createTheme } = await import('../../packages/core/src/handlers/theme.js');
    vi.mocked(createTheme).mockImplementationOnce(() => {
      throw new Error('CEM has no CSS custom properties');
    });

    const result = await handleThemeCall('create_theme', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('CEM has no CSS custom properties');
  });

  it('returns error when applyThemeTokens handler throws', async () => {
    const { applyThemeTokens } = await import('../../packages/core/src/handlers/theme.js');
    vi.mocked(applyThemeTokens).mockImplementationOnce(() => {
      throw new Error('No matching components found');
    });

    const result = await handleThemeCall(
      'apply_theme_tokens',
      { themeTokens: { '--hx-color-primary': '#0066cc' } },
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No matching components found');
  });
});
