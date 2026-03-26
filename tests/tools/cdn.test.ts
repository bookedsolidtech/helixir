/**
 * Tests for the resolve_cdn_cem tool dispatcher.
 * Covers isCdnTool, handleCdnCall, argument validation,
 * and response formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isCdnTool, handleCdnCall, CDN_TOOL_DEFINITIONS } from '../../packages/core/src/tools/cdn.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/cdn.js', () => ({
  resolveCdnCem: vi.fn(async (pkg: string, version: string, registry: string) => ({
    cachePath: `/tmp/cdn-cache/${pkg}@${version}.json`,
    componentCount: 5,
    formatted: `Resolved ${pkg}@${version} from ${registry}: 5 component(s). Library ID: "shoelace". Cached to .mcp-wc/cdn-cache/shoelace@${version}.json.`,
    registered: false,
    libraryId: 'shoelace',
  })),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_CONFIG: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: '/fake/project',
  componentPrefix: '',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: null,
  cdnBase: null,
  watch: false,
};

// ─── CDN_TOOL_DEFINITIONS ─────────────────────────────────────────────────────

describe('CDN_TOOL_DEFINITIONS', () => {
  it('exports exactly 1 tool definition', () => {
    expect(CDN_TOOL_DEFINITIONS).toHaveLength(1);
  });

  it('defines resolve_cdn_cem', () => {
    const names = CDN_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('resolve_cdn_cem');
  });

  it('resolve_cdn_cem schema requires package', () => {
    const def = CDN_TOOL_DEFINITIONS.find((t) => t.name === 'resolve_cdn_cem')!;
    expect(def.inputSchema.required).toContain('package');
  });
});

// ─── isCdnTool ────────────────────────────────────────────────────────────────

describe('isCdnTool', () => {
  it('returns true for resolve_cdn_cem', () => {
    expect(isCdnTool('resolve_cdn_cem')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isCdnTool('get_component')).toBe(false);
    expect(isCdnTool('scaffold_component')).toBe(false);
    expect(isCdnTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isCdnTool('resolve_cdn')).toBe(false);
    expect(isCdnTool('cdn_cem')).toBe(false);
  });
});

// ─── handleCdnCall — valid inputs ─────────────────────────────────────────────

describe('handleCdnCall — valid inputs', () => {
  it('returns a success result for resolve_cdn_cem with only package', async () => {
    const result = await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('result content includes formatted output string', async () => {
    const result = await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace' },
      FAKE_CONFIG,
    );
    expect(result.content[0].text).toContain('Resolved');
  });

  it('accepts optional version', async () => {
    const result = await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace', version: '2.15.0' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts optional registry: unpkg', async () => {
    const result = await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace', registry: 'unpkg' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts optional register: true', async () => {
    const result = await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace', register: true },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts optional cemPath', async () => {
    const result = await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace', cemPath: 'dist/custom-elements.json' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('defaults version to latest when omitted', async () => {
    const { resolveCdnCem } = await import('../../packages/core/src/handlers/cdn.js');
    vi.mocked(resolveCdnCem).mockClear();
    await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace' },
      FAKE_CONFIG,
    );
    expect(vi.mocked(resolveCdnCem)).toHaveBeenCalledWith(
      '@shoelace-style/shoelace',
      'latest',
      'jsdelivr',
      FAKE_CONFIG,
      false,
      undefined,
    );
  });

  it('defaults registry to jsdelivr when omitted', async () => {
    const { resolveCdnCem } = await import('../../packages/core/src/handlers/cdn.js');
    vi.mocked(resolveCdnCem).mockClear();
    await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace' },
      FAKE_CONFIG,
    );
    const [, , registry] = vi.mocked(resolveCdnCem).mock.calls[0];
    expect(registry).toBe('jsdelivr');
  });
});

// ─── handleCdnCall — error cases ──────────────────────────────────────────────

describe('handleCdnCall — error cases', () => {
  it('returns error for unknown tool name', async () => {
    const result = await handleCdnCall('nonexistent_tool', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown CDN tool');
  });

  it('returns error for empty tool name', async () => {
    const result = await handleCdnCall('', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown CDN tool');
  });

  it('returns error when package is missing', async () => {
    const result = await handleCdnCall('resolve_cdn_cem', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
  });

  it('returns error for invalid registry value', async () => {
    const result = await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace', registry: 'invalid-cdn' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBe(true);
  });
});

// ─── handleCdnCall — handler error propagation ────────────────────────────────

describe('handleCdnCall — handler error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when resolveCdnCem handler throws a network error', async () => {
    const { resolveCdnCem } = await import('../../packages/core/src/handlers/cdn.js');
    vi.mocked(resolveCdnCem).mockImplementationOnce(async () => {
      throw new Error('CDN fetch failed: no CEM found for @shoelace-style/shoelace@latest');
    });

    const result = await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('CDN fetch failed');
  });

  it('returns error when resolveCdnCem handler throws a generic error', async () => {
    const { resolveCdnCem } = await import('../../packages/core/src/handlers/cdn.js');
    vi.mocked(resolveCdnCem).mockImplementationOnce(async () => {
      throw new Error('Unexpected error');
    });

    const result = await handleCdnCall(
      'resolve_cdn_cem',
      { package: '@shoelace-style/shoelace' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unexpected error');
  });
});
