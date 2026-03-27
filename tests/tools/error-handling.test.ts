import { describe, it, expect, vi } from 'vitest';
import {
  MCPError,
  ErrorCategory,
  handleToolError,
  sanitizeErrorMessage,
} from '../../packages/core/src/shared/error-handling.js';

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

// ─── sanitizeErrorMessage ─────────────────────────────────────────────────────

describe('sanitizeErrorMessage', () => {
  describe('filesystem path sanitization', () => {
    it('replaces absolute path under projectRoot with relative path', () => {
      const result = sanitizeErrorMessage(
        "ENOENT: no such file or directory, open '/home/jake/project/custom-elements.json'",
        '/home/jake/project',
      );
      expect(result).toContain('custom-elements.json');
      expect(result).not.toContain('/home/jake/project');
    });

    it('replaces absolute paths not under projectRoot with [path redacted]', () => {
      const result = sanitizeErrorMessage(
        "ENOENT: no such file or directory, open '/etc/passwd'",
        '/home/jake/project',
      );
      expect(result).toContain('[path redacted]');
      expect(result).not.toContain('/etc/passwd');
    });

    it('replaces all absolute paths when projectRoot is empty string', () => {
      const result = sanitizeErrorMessage(
        "Cannot read /Users/alice/myapp/tokens.json",
        '',
      );
      expect(result).toContain('[path redacted]');
      expect(result).not.toContain('/Users/alice');
    });

    it('leaves messages without absolute paths unchanged', () => {
      const result = sanitizeErrorMessage('Token not found: --sl-color-primary', '/home/jake/project');
      expect(result).toBe('Token not found: --sl-color-primary');
    });
  });

  describe('VALIDATION / Zod pattern sanitization', () => {
    it('strips regex pattern details from validation messages', () => {
      const result = sanitizeErrorMessage(
        "String must match pattern /^[a-z]+$/",
        '/home/jake/project',
      );
      expect(result).not.toContain('/^[a-z]+$/');
      expect(result).toContain('[pattern redacted]');
    });

    it('strips "Invalid regex:" detail from messages', () => {
      const result = sanitizeErrorMessage(
        "Invalid regex: /(?<=foo)bar/ is not valid in this engine",
        '/home/jake/project',
      );
      expect(result).not.toContain('/(?<=foo)bar/');
      expect(result).toContain('[pattern redacted]');
    });

    it('preserves field name context while removing regex detail', () => {
      const result = sanitizeErrorMessage(
        "Field 'tagName': String must match /^[a-z][a-z0-9-]*$/",
        '/home/jake/project',
      );
      expect(result).toContain("Field 'tagName'");
      expect(result).not.toContain('/^[a-z][a-z0-9-]*$/');
    });
  });

  describe('handleToolError with projectRoot', () => {
    it('sanitizes absolute path in FILESYSTEM errors when projectRoot is provided', () => {
      const err = Object.assign(
        new Error("ENOENT: no such file or directory, open '/Users/jake/project/custom-elements.json'"),
        { code: 'ENOENT' },
      );
      const result = handleToolError(err, '/Users/jake/project');
      expect(result.category).toBe(ErrorCategory.FILESYSTEM);
      expect(result.message).not.toContain('/Users/jake/project');
      expect(result.message).toContain('custom-elements.json');
    });

    it('sanitizes absolute paths in VALIDATION errors when projectRoot is provided', () => {
      const err = new SyntaxError("Unexpected token at /Users/jake/project/src/index.ts:10");
      const result = handleToolError(err, '/Users/jake/project');
      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.message).not.toContain('/Users/jake/project');
    });

    it('redacts non-project absolute paths with [path redacted]', () => {
      const err = Object.assign(
        new Error("ENOENT: no such file or directory, open '/tmp/scratch.txt'"),
        { code: 'ENOENT' },
      );
      const result = handleToolError(err, '/Users/jake/project');
      expect(result.category).toBe(ErrorCategory.FILESYSTEM);
      expect(result.message).toContain('[path redacted]');
      expect(result.message).not.toContain('/tmp/scratch.txt');
    });

    it('does not sanitize messages from already-constructed MCPError', () => {
      // MCPError is passed through directly without re-sanitizing
      const err = new MCPError('/some/absolute/path leaked', ErrorCategory.FILESYSTEM);
      const result = handleToolError(err, '/Users/jake/project');
      expect(result.message).toBe('/some/absolute/path leaked');
    });

    it('does not include stack traces in the returned error message', () => {
      const err = Object.assign(
        new Error("ENOENT: no such file or directory, open '/Users/jake/project/file.json'"),
        { code: 'ENOENT' },
      );
      const result = handleToolError(err, '/Users/jake/project');
      expect(result.message).not.toContain('at ');
      expect(result.message).not.toContain('.test.ts');
    });
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
