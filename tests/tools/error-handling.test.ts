import { describe, it, expect, vi } from 'vitest';
import { MCPError, ErrorCategory } from '../../src/shared/error-handling.js';

// Mock the handler modules before importing the tool dispatch functions
vi.mock('../../src/handlers/tokens.js', () => ({
  getDesignTokens: vi.fn(),
  findToken: vi.fn(),
}));

vi.mock('../../src/handlers/typescript.js', () => ({
  getFileDiagnostics: vi.fn(),
  getProjectDiagnostics: vi.fn(),
}));

import { handleTokenCall } from '../../src/tools/tokens.js';
import { handleTypeScriptCall } from '../../src/tools/typescript.js';
import { getDesignTokens } from '../../src/handlers/tokens.js';
import { getFileDiagnostics } from '../../src/handlers/typescript.js';
import type { McpWcConfig } from '../../src/config.js';

const baseConfig: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: '/',
  componentPrefix: '',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: 'tokens.json',
};

describe('tool dispatch error handling', () => {
  describe('handleTokenCall', () => {
    it('includes error category prefix in response for NOT_FOUND errors', () => {
      vi.mocked(getDesignTokens).mockImplementation(() => {
        throw new MCPError('tokens.json not found', ErrorCategory.NOT_FOUND);
      });

      const result = handleTokenCall('get_design_tokens', {}, baseConfig);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('[NOT_FOUND] tokens.json not found');
    });

    it('includes UNKNOWN category prefix for generic errors', () => {
      vi.mocked(getDesignTokens).mockImplementation(() => {
        throw new Error('some unexpected error');
      });

      const result = handleTokenCall('get_design_tokens', {}, baseConfig);

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
