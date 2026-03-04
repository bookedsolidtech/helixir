import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  parseTokens,
  getDesignTokens,
  findToken,
} from '../../packages/core/src/handlers/tokens.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_TOKENS_PATH = resolve(__dirname, '../__fixtures__/tokens.json');
const NONEXISTENT_PATH = resolve(__dirname, '../__fixtures__/does-not-exist.json');

function makeConfig(tokensPath: string): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/',
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath,
    cdnBase: null,
    watch: false,
  };
}

describe('parseTokens', () => {
  it('parses the fixture tokens.json into a flat array', async () => {
    const tokens = await parseTokens(FIXTURE_TOKENS_PATH);
    expect(Array.isArray(tokens)).toBe(true);
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('every token has required fields', async () => {
    const tokens = await parseTokens(FIXTURE_TOKENS_PATH);
    for (const token of tokens) {
      expect(typeof token.name).toBe('string');
      expect(token.name.length).toBeGreaterThan(0);
      expect(token.value).not.toBeUndefined();
      expect(typeof token.category).toBe('string');
      expect(typeof token.description).toBe('string');
    }
  });

  it('uses dot-notation names derived from the nesting path', async () => {
    const tokens = await parseTokens(FIXTURE_TOKENS_PATH);
    const names = tokens.map((t) => t.name);
    expect(names).toContain('color.primary.400');
    expect(names).toContain('spacing.4');
    expect(names).toContain('typography.fontSize.md');
    expect(names).toContain('typography.fontFamily.sans');
  });

  it('assigns correct categories from top-level keys', async () => {
    const tokens = await parseTokens(FIXTURE_TOKENS_PATH);
    const colorTokens = tokens.filter((t) => t.category === 'color');
    const spacingTokens = tokens.filter((t) => t.category === 'spacing');
    const typographyTokens = tokens.filter((t) => t.category === 'typography');
    expect(colorTokens.length).toBeGreaterThan(0);
    expect(spacingTokens.length).toBeGreaterThan(0);
    expect(typographyTokens.length).toBeGreaterThan(0);
  });

  it('parses correct values from the fixture', async () => {
    const tokens = await parseTokens(FIXTURE_TOKENS_PATH);
    const primary400 = tokens.find((t) => t.name === 'color.primary.400');
    expect(primary400?.value).toBe('#3366ff');
    expect(primary400?.description).toBe('Core primary brand color.');

    const spacing4 = tokens.find((t) => t.name === 'spacing.4');
    expect(spacing4?.value).toBe('16px');
  });

  it('handles tokens without $description gracefully', async () => {
    const tokens = await parseTokens(FIXTURE_TOKENS_PATH);
    // spacing.16 and spacing.24 have no $description in the fixture
    const spacing16 = tokens.find((t) => t.name === 'spacing.16');
    expect(spacing16).toBeDefined();
    expect(spacing16?.description).toBe('');
  });

  it('handles array values (fontFamily tokens)', async () => {
    const tokens = await parseTokens(FIXTURE_TOKENS_PATH);
    const fontSans = tokens.find((t) => t.name === 'typography.fontFamily.sans');
    expect(Array.isArray(fontSans?.value)).toBe(true);
    expect(fontSans?.value).toContain('Inter');
  });

  it('throws an error when the file does not exist', async () => {
    await expect(parseTokens(NONEXISTENT_PATH)).rejects.toThrow(/not found/i);
  });
});

describe('getDesignTokens', () => {
  it('returns all tokens when no category filter is provided', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const tokens = await getDesignTokens(config);
    expect(tokens.length).toBeGreaterThan(0);
    const categories = new Set(tokens.map((t) => t.category));
    expect(categories.size).toBeGreaterThan(1);
  });

  it('filters tokens by category (color)', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const tokens = await getDesignTokens(config, 'color');
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(token.category).toBe('color');
    }
  });

  it('filters tokens by category (spacing)', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const tokens = await getDesignTokens(config, 'spacing');
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(token.category).toBe('spacing');
    }
  });

  it('filters tokens by category (typography)', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const tokens = await getDesignTokens(config, 'typography');
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(token.category).toBe('typography');
    }
  });

  it('returns empty array for unknown category', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const tokens = await getDesignTokens(config, 'nonexistent-category');
    expect(tokens).toEqual([]);
  });

  it('category filter is case-insensitive', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const lower = await getDesignTokens(config, 'color');
    const upper = await getDesignTokens(config, 'COLOR');
    const mixed = await getDesignTokens(config, 'Color');
    expect(lower.length).toBe(upper.length);
    expect(lower.length).toBe(mixed.length);
  });

  it('throws an error when tokensPath file does not exist', async () => {
    const config = makeConfig(NONEXISTENT_PATH);
    await expect(getDesignTokens(config)).rejects.toThrow(/not found/i);
  });
});

describe('findToken', () => {
  it('finds tokens by name pattern (case-insensitive substring)', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const results = await findToken(config, 'primary');
    expect(results.length).toBeGreaterThan(0);
    for (const token of results) {
      expect(token.name.toLowerCase()).toContain('primary');
    }
  });

  it('finds tokens by name pattern with uppercase query', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const lower = await findToken(config, 'primary');
    const upper = await findToken(config, 'PRIMARY');
    expect(lower.length).toBe(upper.length);
  });

  it('finds tokens by value substring', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    // Search for "#3366ff" — exact value
    const results = await findToken(config, '#3366ff');
    expect(results.length).toBeGreaterThan(0);
    const primary400 = results.find((t) => t.name === 'color.primary.400');
    expect(primary400).toBeDefined();
  });

  it('finds tokens by partial value (e.g. "16px")', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const results = await findToken(config, '16px');
    expect(results.length).toBeGreaterThan(0);
    // Should include spacing.4 (value "16px") and typography.fontSize.md (value "16px")
    const names = results.map((t) => t.name);
    expect(names).toContain('spacing.4');
    expect(names).toContain('typography.fontSize.md');
  });

  it('finds tokens by name pattern for nested paths', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const results = await findToken(config, 'fontfamily');
    expect(results.length).toBeGreaterThan(0);
    for (const token of results) {
      expect(token.name.toLowerCase()).toContain('fontfamily');
    }
  });

  it('returns empty array when no tokens match the query', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const results = await findToken(config, 'zzz-no-match-zzz');
    expect(results).toEqual([]);
  });

  it('throws an error when tokensPath file does not exist', async () => {
    const config = makeConfig(NONEXISTENT_PATH);
    await expect(findToken(config, 'primary')).rejects.toThrow(/not found/i);
  });
});
