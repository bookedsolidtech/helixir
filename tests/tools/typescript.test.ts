/**
 * Tests for the get_file_diagnostics and get_project_diagnostics tool dispatchers.
 * Covers isTypeScriptTool, handleTypeScriptCall, argument validation,
 * and response formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isTypeScriptTool,
  handleTypeScriptCall,
  TYPESCRIPT_TOOL_DEFINITIONS,
} from '../../packages/core/src/tools/typescript.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/typescript.js', () => ({
  getFileDiagnostics: vi.fn((_config: unknown, filePath: string) => ({
    filePath,
    diagnostics: [],
    errorCount: 0,
    warningCount: 0,
  })),
  getProjectDiagnostics: vi.fn((_config: unknown) => ({
    errorCount: 0,
    warningCount: 2,
    files: 15,
    diagnostics: [],
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

// ─── TYPESCRIPT_TOOL_DEFINITIONS ──────────────────────────────────────────────

describe('TYPESCRIPT_TOOL_DEFINITIONS', () => {
  it('exports exactly 2 tool definitions', () => {
    expect(TYPESCRIPT_TOOL_DEFINITIONS).toHaveLength(2);
  });

  it('defines get_file_diagnostics and get_project_diagnostics', () => {
    const names = TYPESCRIPT_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('get_file_diagnostics');
    expect(names).toContain('get_project_diagnostics');
  });

  it('get_file_diagnostics schema requires filePath', () => {
    const def = TYPESCRIPT_TOOL_DEFINITIONS.find((t) => t.name === 'get_file_diagnostics')!;
    expect(def.inputSchema.required).toContain('filePath');
  });

  it('get_project_diagnostics schema has no required fields', () => {
    const def = TYPESCRIPT_TOOL_DEFINITIONS.find((t) => t.name === 'get_project_diagnostics')!;
    expect(def.inputSchema.required).toBeUndefined();
  });
});

// ─── isTypeScriptTool ─────────────────────────────────────────────────────────

describe('isTypeScriptTool', () => {
  it('returns true for get_file_diagnostics', () => {
    expect(isTypeScriptTool('get_file_diagnostics')).toBe(true);
  });

  it('returns true for get_project_diagnostics', () => {
    expect(isTypeScriptTool('get_project_diagnostics')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isTypeScriptTool('scaffold_component')).toBe(false);
    expect(isTypeScriptTool('get_component')).toBe(false);
    expect(isTypeScriptTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isTypeScriptTool('file_diagnostics')).toBe(false);
    expect(isTypeScriptTool('get_diagnostics')).toBe(false);
  });
});

// ─── handleTypeScriptCall — get_file_diagnostics ──────────────────────────────

describe('handleTypeScriptCall — get_file_diagnostics', () => {
  it('returns success result for a valid file path', () => {
    const result = handleTypeScriptCall(
      'get_file_diagnostics',
      { filePath: 'src/hx-button.ts' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('returns JSON-parseable content', () => {
    const result = handleTypeScriptCall(
      'get_file_diagnostics',
      { filePath: 'src/hx-button.ts' },
      FAKE_CONFIG,
    );
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('result includes filePath field', () => {
    const result = handleTypeScriptCall(
      'get_file_diagnostics',
      { filePath: 'src/hx-button.ts' },
      FAKE_CONFIG,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filePath).toBe('src/hx-button.ts');
  });

  it('result includes diagnostics array', () => {
    const result = handleTypeScriptCall(
      'get_file_diagnostics',
      { filePath: 'src/hx-button.ts' },
      FAKE_CONFIG,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.diagnostics).toBeDefined();
    expect(Array.isArray(parsed.diagnostics)).toBe(true);
  });

  it('result includes errorCount', () => {
    const result = handleTypeScriptCall(
      'get_file_diagnostics',
      { filePath: 'src/hx-button.ts' },
      FAKE_CONFIG,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.errorCount).toBeDefined();
  });
});

// ─── handleTypeScriptCall — get_project_diagnostics ───────────────────────────

describe('handleTypeScriptCall — get_project_diagnostics', () => {
  it('returns success result with empty args', () => {
    const result = handleTypeScriptCall('get_project_diagnostics', {}, FAKE_CONFIG);
    expect(result.isError).toBeFalsy();
  });

  it('returns JSON-parseable content', () => {
    const result = handleTypeScriptCall('get_project_diagnostics', {}, FAKE_CONFIG);
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('result includes errorCount and warningCount', () => {
    const result = handleTypeScriptCall('get_project_diagnostics', {}, FAKE_CONFIG);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.errorCount).toBeDefined();
    expect(parsed.warningCount).toBeDefined();
  });

  it('result includes files count', () => {
    const result = handleTypeScriptCall('get_project_diagnostics', {}, FAKE_CONFIG);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.files).toBeDefined();
  });
});

// ─── handleTypeScriptCall — error cases ───────────────────────────────────────

describe('handleTypeScriptCall — error cases', () => {
  it('returns error for unknown tool name', () => {
    const result = handleTypeScriptCall('nonexistent_tool', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown TypeScript tool');
  });

  it('returns error for empty tool name', () => {
    const result = handleTypeScriptCall('', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown TypeScript tool');
  });

  it('returns error when filePath is missing for get_file_diagnostics', () => {
    const result = handleTypeScriptCall('get_file_diagnostics', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
  });

  it('returns error for absolute filePath (path traversal)', () => {
    const result = handleTypeScriptCall(
      'get_file_diagnostics',
      { filePath: '/etc/passwd' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error for path traversal attempt in filePath', () => {
    const result = handleTypeScriptCall(
      'get_file_diagnostics',
      { filePath: '../../etc/passwd' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBe(true);
  });
});

// ─── handleTypeScriptCall — handler error propagation ─────────────────────────

describe('handleTypeScriptCall — handler error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when getFileDiagnostics handler throws', async () => {
    const { getFileDiagnostics } = await import('../../packages/core/src/handlers/typescript.js');
    vi.mocked(getFileDiagnostics).mockImplementationOnce(() => {
      throw new Error('tsconfig.json not found');
    });

    const result = handleTypeScriptCall(
      'get_file_diagnostics',
      { filePath: 'src/hx-button.ts' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('tsconfig.json not found');
  });

  it('returns error when getProjectDiagnostics handler throws', async () => {
    const { getProjectDiagnostics } =
      await import('../../packages/core/src/handlers/typescript.js');
    vi.mocked(getProjectDiagnostics).mockImplementationOnce(() => {
      throw new Error('Project root does not exist');
    });

    const result = handleTypeScriptCall('get_project_diagnostics', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Project root does not exist');
  });
});
