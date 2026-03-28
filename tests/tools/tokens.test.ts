/**
 * Tests for the get_design_tokens and find_token tool dispatchers.
 * Covers isTokenTool, handleTokenCall, argument validation,
 * and response formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isTokenTool,
  handleTokenCall,
  TOKEN_TOOL_DEFINITIONS,
} from '../../packages/core/src/tools/tokens.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/tokens.js', () => ({
  getDesignTokens: vi.fn(async (_config: unknown, category?: string) => ({
    tokens: [
      { name: '--color-primary', value: '#0066cc', category: 'color' },
      { name: '--color-secondary', value: '#666', category: 'color' },
      { name: '--spacing-md', value: '1rem', category: 'spacing' },
    ].filter((t) => !category || t.category === category),
    count: category ? 2 : 3,
    categories: ['color', 'spacing'],
  })),
  findToken: vi.fn(async (_config: unknown, query: string) => ({
    tokens: [{ name: '--color-primary', value: '#0066cc', category: 'color' }].filter(
      (t) => t.name.includes(query) || t.value.includes(query),
    ),
    count: 1,
    query,
  })),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_CONFIG: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: '/fake/project',
  componentPrefix: '',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: '/fake/project/tokens.json',
  cdnBase: null,
  watch: false,
};

const CONFIG_NO_TOKENS: McpWcConfig = {
  ...FAKE_CONFIG,
  tokensPath: null,
};

// ─── TOKEN_TOOL_DEFINITIONS ───────────────────────────────────────────────────

describe('TOKEN_TOOL_DEFINITIONS', () => {
  it('exports exactly 2 tool definitions', () => {
    expect(TOKEN_TOOL_DEFINITIONS).toHaveLength(2);
  });

  it('defines get_design_tokens and find_token', () => {
    const names = TOKEN_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('get_design_tokens');
    expect(names).toContain('find_token');
  });

  it('find_token schema requires query', () => {
    const def = TOKEN_TOOL_DEFINITIONS.find((t) => t.name === 'find_token')!;
    expect(def.inputSchema.required).toContain('query');
  });

  it('get_design_tokens schema has no required fields', () => {
    const def = TOKEN_TOOL_DEFINITIONS.find((t) => t.name === 'get_design_tokens')!;
    expect(def.inputSchema.required).toBeUndefined();
  });
});

// ─── isTokenTool ──────────────────────────────────────────────────────────────

describe('isTokenTool', () => {
  it('returns true for get_design_tokens', () => {
    expect(isTokenTool('get_design_tokens')).toBe(true);
  });

  it('returns true for find_token', () => {
    expect(isTokenTool('find_token')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isTokenTool('scaffold_component')).toBe(false);
    expect(isTokenTool('get_component')).toBe(false);
    expect(isTokenTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isTokenTool('design_tokens')).toBe(false);
    expect(isTokenTool('get_tokens')).toBe(false);
  });
});

// ─── handleTokenCall — get_design_tokens ──────────────────────────────────────

describe('handleTokenCall — get_design_tokens', () => {
  it('returns success result with no args', async () => {
    const result = await handleTokenCall('get_design_tokens', {}, FAKE_CONFIG);
    expect(result.isError).toBeFalsy();
  });

  it('returns JSON-parseable content', async () => {
    const result = await handleTokenCall('get_design_tokens', {}, FAKE_CONFIG);
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('accepts optional category filter', async () => {
    const result = await handleTokenCall('get_design_tokens', { category: 'color' }, FAKE_CONFIG);
    expect(result.isError).toBeFalsy();
  });

  it('result contains tokens array', async () => {
    const result = await handleTokenCall('get_design_tokens', {}, FAKE_CONFIG);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tokens).toBeDefined();
  });

  it('result contains categories list', async () => {
    const result = await handleTokenCall('get_design_tokens', {}, FAKE_CONFIG);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.categories).toBeDefined();
  });
});

// ─── handleTokenCall — find_token ─────────────────────────────────────────────

describe('handleTokenCall — find_token', () => {
  it('returns success result with valid query', async () => {
    const result = await handleTokenCall('find_token', { query: 'color' }, FAKE_CONFIG);
    expect(result.isError).toBeFalsy();
  });

  it('returns JSON-parseable content', async () => {
    const result = await handleTokenCall('find_token', { query: 'primary' }, FAKE_CONFIG);
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('result contains query field', async () => {
    const result = await handleTokenCall('find_token', { query: 'primary' }, FAKE_CONFIG);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.query).toBe('primary');
  });

  it('result contains tokens array', async () => {
    const result = await handleTokenCall('find_token', { query: 'color' }, FAKE_CONFIG);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tokens).toBeDefined();
  });
});

// ─── handleTokenCall — error cases ────────────────────────────────────────────

describe('handleTokenCall — error cases', () => {
  it('returns error for unknown tool name', async () => {
    const result = await handleTokenCall('nonexistent_tool', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown token tool');
  });

  it('returns error for empty tool name', async () => {
    const result = await handleTokenCall('', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown token tool');
  });

  it('returns error when find_token query is missing', async () => {
    const result = await handleTokenCall('find_token', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
  });
});

// ─── handleTokenCall — handler error propagation ──────────────────────────────

describe('handleTokenCall — handler error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when getDesignTokens handler throws (no tokensPath)', async () => {
    const { getDesignTokens } = await import('../../packages/core/src/handlers/tokens.js');
    vi.mocked(getDesignTokens).mockImplementationOnce(async () => {
      throw new Error('tokensPath is not configured');
    });

    const result = await handleTokenCall('get_design_tokens', {}, CONFIG_NO_TOKENS);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('tokensPath is not configured');
  });

  it('returns error when findToken handler throws', async () => {
    const { findToken } = await import('../../packages/core/src/handlers/tokens.js');
    vi.mocked(findToken).mockImplementationOnce(async () => {
      throw new Error('Tokens file not found');
    });

    const result = await handleTokenCall('find_token', { query: 'primary' }, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Tokens file not found');
  });
});
