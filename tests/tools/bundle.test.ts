/**
 * Tests for the estimate_bundle_size tool dispatcher.
 * Covers isBundleTool, handleBundleCall, argument validation,
 * and response formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBundleTool, handleBundleCall } from '../../packages/core/src/tools/bundle.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/bundle.js', () => ({
  estimateBundleSize: vi.fn(
    async (tagName: string, _config: unknown, _pkg?: string, version = 'latest') => ({
      component: tagName,
      package: _pkg ?? '@shoelace-style/shoelace',
      version,
      estimates: {
        component_only: null,
        full_package: { minified: 48000, gzipped: 14000 },
        shared_dependencies:
          'Actual component size depends on tree-shaking and bundler configuration.',
      },
      source: 'bundlephobia',
      cached: false,
      note: 'Sizes are estimates. Actual bundle size depends on your bundler and tree-shaking config.',
    }),
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_CONFIG: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: '/fake/project',
  componentPrefix: 'sl',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: null,
  cdnBase: null,
  watch: false,
};

const CONFIG_NO_PREFIX: McpWcConfig = {
  ...FAKE_CONFIG,
  componentPrefix: '',
};

// ─── isBundleTool ─────────────────────────────────────────────────────────────

describe('isBundleTool', () => {
  it('returns true for estimate_bundle_size', () => {
    expect(isBundleTool('estimate_bundle_size')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isBundleTool('scaffold_component')).toBe(false);
    expect(isBundleTool('get_component')).toBe(false);
    expect(isBundleTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isBundleTool('estimate_bundle')).toBe(false);
    expect(isBundleTool('estimate_bundle_sizes')).toBe(false);
    expect(isBundleTool('bundle_size')).toBe(false);
  });
});

// ─── handleBundleCall — valid inputs ──────────────────────────────────────────

describe('handleBundleCall — valid inputs', () => {
  it('returns a success result for estimate_bundle_size with only tagName', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('returns JSON-parseable content', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button' },
      FAKE_CONFIG,
    );
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('output includes the component tag name', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button' },
      FAKE_CONFIG,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.component).toBe('sl-button');
  });

  it('output includes package field', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button' },
      FAKE_CONFIG,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.package).toBeDefined();
  });

  it('output includes estimates field with full_package', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button' },
      FAKE_CONFIG,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.estimates).toBeDefined();
    expect(parsed.estimates.full_package).not.toBeNull();
    expect(parsed.estimates.full_package.minified).toBeDefined();
    expect(parsed.estimates.full_package.gzipped).toBeDefined();
  });

  it('accepts optional explicit package name', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button', package: '@shoelace-style/shoelace' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts optional version string', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button', version: '2.0.0' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.version).toBe('2.0.0');
  });

  it('accepts "latest" as version', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button', version: 'latest' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts include_full_package: false and suppresses full_package', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button', include_full_package: false },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.estimates.full_package).toBeNull();
  });

  it('include_full_package: true keeps full_package data', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button', include_full_package: true },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.estimates.full_package).not.toBeNull();
  });

  it('accepts scoped package name', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'fluent-button', package: '@fluentui/web-components' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('output includes source field', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button' },
      FAKE_CONFIG,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.source).toBeDefined();
  });

  it('output includes note field', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button' },
      FAKE_CONFIG,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.note).toBeDefined();
  });
});

// ─── handleBundleCall — error cases ───────────────────────────────────────────

describe('handleBundleCall — error cases', () => {
  it('returns error for unknown tool name', async () => {
    const result = await handleBundleCall('nonexistent_tool', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown bundle tool');
  });

  it('returns error for empty tool name', async () => {
    const result = await handleBundleCall('', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown bundle tool');
  });

  it('returns error when tagName is missing', async () => {
    const result = await handleBundleCall('estimate_bundle_size', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
  });

  it('returns error for invalid version string', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button', version: 'not-a-version!!' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error for invalid npm package name', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button', package: 'INVALID PACKAGE NAME' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBe(true);
  });

  it('strips unknown extra properties and succeeds (Zod default behavior)', async () => {
    // Zod strips unknown properties by default (no .strict() on the schema)
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button', unknownProp: 'ignored' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleBundleCall — handler error propagation ─────────────────────────────

describe('handleBundleCall — handler error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when estimateBundleSize handler throws (cannot determine package)', async () => {
    const { estimateBundleSize } = await import('../../packages/core/src/handlers/bundle.js');
    vi.mocked(estimateBundleSize).mockImplementationOnce(async () => {
      throw new Error(
        'Cannot determine npm package name for tag <my-button>. Set componentPrefix in mcpwc.config.json or provide the package explicitly.',
      );
    });

    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'my-button' },
      CONFIG_NO_PREFIX,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Cannot determine npm package name');
  });

  it('returns error when estimateBundleSize handler throws a generic error', async () => {
    const { estimateBundleSize } = await import('../../packages/core/src/handlers/bundle.js');
    vi.mocked(estimateBundleSize).mockImplementationOnce(async () => {
      throw new Error('Network request failed');
    });

    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network request failed');
  });
});
