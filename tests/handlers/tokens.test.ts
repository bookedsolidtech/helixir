import { describe, it, expect, afterAll } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync } from 'node:fs';
import {
  parseTokens,
  getDesignTokens,
  findToken,
  findComponentsUsingToken,
} from '../../packages/core/src/handlers/tokens.js';
import { MCPError, ErrorCategory } from '../../packages/core/src/shared/error-handling.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_TOKENS_PATH = resolve(__dirname, '../__fixtures__/tokens.json');
const NONEXISTENT_PATH = resolve(__dirname, '../__fixtures__/does-not-exist.json');

// Temporary malformed fixture files for validation tests
const MALFORMED_ARRAY_PATH = resolve(__dirname, '../__fixtures__/tokens-malformed-array.json');
const MALFORMED_PRIMITIVE_PATH = resolve(__dirname, '../__fixtures__/tokens-malformed-primitive.json');
const MALFORMED_INVALID_JSON_PATH = resolve(__dirname, '../__fixtures__/tokens-malformed-invalid.json');

// Create temporary malformed fixtures
writeFileSync(MALFORMED_ARRAY_PATH, '[1, 2, 3]');
writeFileSync(MALFORMED_PRIMITIVE_PATH, '"just a string"');
writeFileSync(MALFORMED_INVALID_JSON_PATH, '{not valid json!!!');

afterAll(() => {
  try { unlinkSync(MALFORMED_ARRAY_PATH); } catch { /* ignore */ }
  try { unlinkSync(MALFORMED_PRIMITIVE_PATH); } catch { /* ignore */ }
  try { unlinkSync(MALFORMED_INVALID_JSON_PATH); } catch { /* ignore */ }
});

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
    expect(tokens.length).toBe(52);
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
    expect(colorTokens.length).toBe(19);
    expect(spacingTokens.length).toBe(12);
    expect(typographyTokens.length).toBe(21);
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

  it('throws INVALID_INPUT error for a JSON array token file', async () => {
    try {
      await parseTokens(MALFORMED_ARRAY_PATH);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MCPError);
      const mcpErr = err as MCPError;
      expect(mcpErr.category).toBe(ErrorCategory.INVALID_INPUT);
      expect(mcpErr.message).toContain('[INVALID_INPUT]');
      expect(mcpErr.message).toContain('invalid structure');
    }
  });

  it('throws INVALID_INPUT error for a JSON primitive token file', async () => {
    try {
      await parseTokens(MALFORMED_PRIMITIVE_PATH);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MCPError);
      const mcpErr = err as MCPError;
      expect(mcpErr.category).toBe(ErrorCategory.INVALID_INPUT);
      expect(mcpErr.message).toContain('[INVALID_INPUT]');
    }
  });

  it('throws VALIDATION error for invalid JSON syntax', async () => {
    try {
      await parseTokens(MALFORMED_INVALID_JSON_PATH);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MCPError);
      const mcpErr = err as MCPError;
      expect(mcpErr.category).toBe(ErrorCategory.VALIDATION);
      expect(mcpErr.message).toContain('not valid JSON');
    }
  });
});

describe('getDesignTokens', () => {
  it('returns all tokens when no category filter is provided', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const tokens = await getDesignTokens(config);
    expect(tokens.length).toBe(52);
    const categories = new Set(tokens.map((t) => t.category));
    expect(categories.size).toBe(3);
  });

  it('filters tokens by category (color)', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const tokens = await getDesignTokens(config, 'color');
    expect(tokens.length).toBe(19);
    for (const token of tokens) {
      expect(token.category).toBe('color');
    }
  });

  it('filters tokens by category (spacing)', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const tokens = await getDesignTokens(config, 'spacing');
    expect(tokens.length).toBe(12);
    for (const token of tokens) {
      expect(token.category).toBe('spacing');
    }
  });

  it('filters tokens by category (typography)', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const tokens = await getDesignTokens(config, 'typography');
    expect(tokens.length).toBe(21);
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
    expect(results.length).toBe(6);
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
    expect(results.length).toBe(1);
    const primary400 = results.find((t) => t.name === 'color.primary.400');
    expect(primary400).toBeDefined();
  });

  it('finds tokens by partial value (e.g. "16px")', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const results = await findToken(config, '16px');
    expect(results.length).toBe(2);
    // Should include spacing.4 (value "16px") and typography.fontSize.md (value "16px")
    const names = results.map((t) => t.name);
    expect(names).toContain('spacing.4');
    expect(names).toContain('typography.fontSize.md');
  });

  it('finds tokens by name pattern for nested paths', async () => {
    const config = makeConfig(FIXTURE_TOKENS_PATH);
    const results = await findToken(config, 'fontfamily');
    expect(results.length).toBe(3);
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

describe('findComponentsUsingToken', () => {
  const testCem: Cem = {
    schemaVersion: '1.0.0',
    modules: [
      {
        kind: 'javascript-module',
        path: 'src/components/my-button.js',
        declarations: [
          {
            kind: 'class',
            name: 'MyButton',
            tagName: 'my-button',
            description: 'A button component.',
            cssProperties: [
              { name: '--primary-color', description: 'Primary brand color' },
              { name: '--button-size', description: 'Button size' },
              { name: '--button-padding', description: 'Button padding' },
            ],
          },
        ],
      },
      {
        kind: 'javascript-module',
        path: 'src/components/my-input.js',
        declarations: [
          {
            kind: 'class',
            name: 'MyInput',
            tagName: 'my-input',
            description: 'An input component.',
            cssProperties: [
              { name: '--input-border-color', description: 'Border color' },
              { name: '--primary-color', description: 'Primary brand color' },
            ],
          },
        ],
      },
      {
        kind: 'javascript-module',
        path: 'src/components/my-card.js',
        declarations: [
          {
            kind: 'class',
            name: 'MyCard',
            tagName: 'my-card',
            description: 'A card component without CSS properties.',
            // No cssProperties — should not match anything
          },
        ],
      },
      {
        kind: 'javascript-module',
        path: 'src/components/my-badge.js',
        declarations: [
          {
            kind: 'class',
            name: 'MyBadge',
            tagName: 'my-badge',
            description: 'A badge component.',
            cssProperties: [],
          },
        ],
      },
    ],
  };

  it('finds exact match when fuzzy=false', () => {
    const result = findComponentsUsingToken(testCem, '--primary-color', { fuzzy: false });
    expect(result.token).toBe('--primary-color');
    expect(result.total).toBe(2);
    expect(result.components.length).toBe(2);
    const tagNames = result.components.map((c) => c.tagName);
    expect(tagNames).toContain('my-button');
    expect(tagNames).toContain('my-input');
  });

  it('returns empty when no exact match found with fuzzy=false', () => {
    const result = findComponentsUsingToken(testCem, '--nonexistent-token', { fuzzy: false });
    expect(result.token).toBe('--nonexistent-token');
    expect(result.total).toBe(0);
    expect(result.components).toEqual([]);
  });

  it('supports wildcard matching with prefix when fuzzy=true', () => {
    const result = findComponentsUsingToken(testCem, '--button-*', { fuzzy: true });
    expect(result.token).toBe('--button-*');
    expect(result.total).toBe(2);
    const usedIn = result.components.map((c) => c.usedIn);
    expect(usedIn).toContain('--button-size');
    expect(usedIn).toContain('--button-padding');
    // Should only match properties starting with --button-
    expect(usedIn).not.toContain('--primary-color');
  });

  it('supports substring matching when fuzzy=true without wildcard', () => {
    const result = findComponentsUsingToken(testCem, 'primary', { fuzzy: true });
    expect(result.token).toBe('primary');
    expect(result.total).toBe(2);
    const usedIn = result.components.map((c) => c.usedIn);
    expect(usedIn.every((name) => name.includes('primary'))).toBe(true);
  });

  it('finds components that have no cssProperties (should return empty)', () => {
    const result = findComponentsUsingToken(testCem, '--primary-color');
    // my-card has no cssProperties, so it won't be found
    // only my-button and my-input should be found
    expect(result.total).toBe(2);
  });

  it('finds components with empty cssProperties array', () => {
    const result = findComponentsUsingToken(testCem, '--any-token', { fuzzy: true });
    // my-badge has empty cssProperties, so no match
    expect(result.components.length).toBe(0);
  });

  it('returns correct structure with token, total, and components', () => {
    const result = findComponentsUsingToken(testCem, '--button-size', { fuzzy: false });
    expect(typeof result.token).toBe('string');
    expect(typeof result.total).toBe('number');
    expect(Array.isArray(result.components)).toBe(true);
    for (const component of result.components) {
      expect(typeof component.tagName).toBe('string');
      expect(typeof component.usedIn).toBe('string');
      expect(typeof component.description).toBe('string');
    }
  });

  it('defaults to fuzzy=false when options.fuzzy is not specified', () => {
    const resultWithoutOption = findComponentsUsingToken(testCem, '--primary-color');
    const resultWithFalse = findComponentsUsingToken(testCem, '--primary-color', { fuzzy: false });
    expect(resultWithoutOption.total).toBe(resultWithFalse.total);
    expect(resultWithoutOption.components.length).toBe(resultWithFalse.components.length);
  });

  it('supports case-sensitive token matching', () => {
    const result1 = findComponentsUsingToken(testCem, '--primary-color');
    const result2 = findComponentsUsingToken(testCem, '--PRIMARY-COLOR');
    // Case-sensitive: should not match
    expect(result1.total).toBe(2);
    expect(result2.total).toBe(0);
  });

  it('preserves component description in results', () => {
    const result = findComponentsUsingToken(testCem, '--primary-color');
    const buttonComponent = result.components.find((c) => c.tagName === 'my-button');
    expect(buttonComponent).toBeDefined();
    expect(buttonComponent?.description).toBe('Primary brand color');
  });

  it('returns empty when CEM has no modules', () => {
    const emptyCem: Cem = { schemaVersion: '1.0.0', modules: [] };
    const result = findComponentsUsingToken(emptyCem, '--any-token');
    expect(result.total).toBe(0);
    expect(result.components).toEqual([]);
  });

  it('handles modules with no declarations', () => {
    const cemWithEmptyModules: Cem = {
      schemaVersion: '1.0.0',
      modules: [{ kind: 'javascript-module', path: 'src/empty.js' }],
    };
    const result = findComponentsUsingToken(cemWithEmptyModules, '--any-token');
    expect(result.total).toBe(0);
  });

  it('skips declarations without tagName', () => {
    const cemWithMissingTag: Cem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/helper.js',
          declarations: [
            {
              kind: 'class',
              name: 'HelperClass',
              // No tagName — should be skipped
              cssProperties: [{ name: '--helper-color' }],
            },
          ],
        },
      ],
    };
    const result = findComponentsUsingToken(cemWithMissingTag, '--helper-color');
    expect(result.total).toBe(0);
  });
});
