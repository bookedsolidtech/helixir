/**
 * Minimal smoke tests for tool dispatcher modules that were not otherwise covered.
 * Each dispatcher exports an `isTool` guard and a `handleTool` dispatch function.
 * These tests cover the basic paths: unknown tool → error, guard returns correct boolean.
 */
import { describe, it, expect, vi } from 'vitest';
import { isCdnTool, handleCdnCall } from '../../src/tools/cdn.js';
import { isFrameworkTool, handleFrameworkCall } from '../../src/tools/framework.js';
import { isValidateTool, handleValidateCall } from '../../src/tools/validate.js';
import { isTokenTool } from '../../src/tools/tokens.js';
import { isTypeScriptTool } from '../../src/tools/typescript.js';
import type { McpWcConfig } from '../../src/config.js';
import type { Cem } from '../../src/handlers/cem.js';

const FAKE_CONFIG: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: '/fake/project',
  componentPrefix: '',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: null,
};

const FAKE_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

// ---------------------------------------------------------------------------
// CDN tool dispatcher
// ---------------------------------------------------------------------------

describe('isCdnTool', () => {
  it('returns true for resolve_cdn_cem', () => {
    expect(isCdnTool('resolve_cdn_cem')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isCdnTool('get_design_tokens')).toBe(false);
    expect(isCdnTool('')).toBe(false);
  });
});

describe('handleCdnCall — unknown tool', () => {
  it('returns error for unknown tool name', async () => {
    const result = await handleCdnCall('nonexistent_tool', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown CDN tool');
  });

  it('returns error for missing required args', async () => {
    const result = await handleCdnCall('resolve_cdn_cem', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Framework tool dispatcher
// ---------------------------------------------------------------------------

vi.mock('../../src/handlers/framework.js', () => ({
  detectFramework: vi.fn(() => ({ formatted: 'Lit v3.0.0' })),
}));

describe('isFrameworkTool', () => {
  it('returns true for detect_framework', () => {
    expect(isFrameworkTool('detect_framework')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isFrameworkTool('score_component')).toBe(false);
    expect(isFrameworkTool('')).toBe(false);
  });
});

describe('handleFrameworkCall', () => {
  it('returns success for detect_framework', () => {
    const result = handleFrameworkCall('detect_framework', {}, FAKE_CONFIG);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Lit');
  });

  it('returns error for unknown tool name', () => {
    const result = handleFrameworkCall('nonexistent', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown framework tool');
  });
});

// ---------------------------------------------------------------------------
// Validate tool dispatcher
// ---------------------------------------------------------------------------

vi.mock('../../src/handlers/validate.js', () => ({
  validateUsage: vi.fn(() => ({ formatted: 'No issues found.' })),
}));

describe('isValidateTool', () => {
  it('returns true for validate_usage', () => {
    expect(isValidateTool('validate_usage')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isValidateTool('get_component')).toBe(false);
    expect(isValidateTool('')).toBe(false);
  });
});

describe('handleValidateCall', () => {
  it('returns success for validate_usage', () => {
    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'my-button', html: '<my-button></my-button>' },
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No issues found');
  });

  it('returns error for unknown tool name', () => {
    const result = handleValidateCall('nonexistent', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown validate tool');
  });

  it('returns error for missing required args', () => {
    const result = handleValidateCall('validate_usage', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Token and TypeScript tool guards (isTokenTool / isTypeScriptTool)
// ---------------------------------------------------------------------------

describe('isTokenTool', () => {
  it('returns true for get_design_tokens', () => {
    expect(isTokenTool('get_design_tokens')).toBe(true);
  });

  it('returns true for find_token', () => {
    expect(isTokenTool('find_token')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isTokenTool('score_component')).toBe(false);
    expect(isTokenTool('')).toBe(false);
  });
});

describe('isTypeScriptTool', () => {
  it('returns true for get_file_diagnostics', () => {
    expect(isTypeScriptTool('get_file_diagnostics')).toBe(true);
  });

  it('returns true for get_project_diagnostics', () => {
    expect(isTypeScriptTool('get_project_diagnostics')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isTypeScriptTool('list_components')).toBe(false);
    expect(isTypeScriptTool('')).toBe(false);
  });
});
