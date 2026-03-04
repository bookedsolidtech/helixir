import { describe, it, expect, vi } from 'vitest';
import { MCPError, ErrorCategory, handleToolError } from '../../packages/core/src/shared/error-handling.js';

// Mock the handler modules before importing the tool dispatch functions
vi.mock('../../packages/core/src/handlers/tokens.js', () => ({
  getDesignTokens: vi.fn(),
  findToken: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/typescript.js', () => ({
  getFileDiagnostics: vi.fn(),
  getProjectDiagnostics: vi.fn(),
}));

import { handleTokenCall } from '../../packages/core/src/tools/tokens.js';
import { handleTypeScriptCall } from '../../packages/core/src/tools/typescript.js';
import { getDesignTokens } from '../../packages/core/src/handlers/tokens.js';
import { getFileDiagnostics } from '../../packages/core/src/handlers/typescript.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

const baseConfig: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: '/',
  componentPrefix: '',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: 'tokens.json',
  cdnBase: null,
  watch: false,
};

// ─── handleToolError category inference (Finding #16) ────────────────────────

describe('handleToolError', () => {
  it('preserves MCPError category when error is already an MCPError', () => {
    const err = new MCPError('filesystem issue', ErrorCategory.FILESYSTEM);
    const result = handleToolError(err);
    expect(result.category).toBe(ErrorCategory.FILESYSTEM);
    expect(result.message).toBe('filesystem issue');
  });

  it('maps SyntaxError to VALIDATION', () => {
    const err = new SyntaxError('unexpected token');
    const result = handleToolError(err);
    expect(result.category).toBe(ErrorCategory.VALIDATION);
  });

  it('maps TypeError to VALIDATION', () => {
    const err = new TypeError('cannot read property');
    const result = handleToolError(err);
    expect(result.category).toBe(ErrorCategory.VALIDATION);
  });

  it('maps ENOENT error to FILESYSTEM', () => {
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const result = handleToolError(err);
    expect(result.category).toBe(ErrorCategory.FILESYSTEM);
  });

  it('maps EACCES error to FILESYSTEM', () => {
    const err = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const result = handleToolError(err);
    expect(result.category).toBe(ErrorCategory.FILESYSTEM);
  });

  it('falls back to UNKNOWN for unrecognised Error', () => {
    const err = new Error('some unknown problem');
    const result = handleToolError(err);
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
  });
});

// ─── tool dispatch ────────────────────────────────────────────────────────────

describe('tool dispatch error handling', () => {
  describe('handleTokenCall', () => {
    it('includes error category prefix in response for NOT_FOUND errors', async () => {
      vi.mocked(getDesignTokens).mockImplementation(() => {
        throw new MCPError('tokens.json not found', ErrorCategory.NOT_FOUND);
      });

      const result = await handleTokenCall('get_design_tokens', {}, baseConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('[NOT_FOUND] tokens.json not found');
    });

    it('includes UNKNOWN category prefix for generic errors', async () => {
      vi.mocked(getDesignTokens).mockImplementation(() => {
        throw new Error('some unexpected error');
      });

      const result = await handleTokenCall('get_design_tokens', {}, baseConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('[UNKNOWN] some unexpected error');
    });
  });

  describe('handleTypeScriptCall', () => {
    it('includes error category prefix in response for NOT_FOUND errors', () => {
      vi.mocked(getFileDiagnostics).mockImplementation(() => {
        throw new MCPError('tsconfig.json not found', ErrorCategory.NOT_FOUND);
      });

      const result = handleTypeScriptCall(
        'get_file_diagnostics',
        { filePath: 'src/index.ts' },
        baseConfig,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('[NOT_FOUND] tsconfig.json not found');
    });
  });
});
