/**
 * Tests for the detect_framework tool dispatcher.
 * Covers isFrameworkTool, handleFrameworkCall, argument validation,
 * and response formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isFrameworkTool,
  handleFrameworkCall,
  FRAMEWORK_TOOL_DEFINITIONS,
} from '../../packages/core/src/tools/framework.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/framework.js', () => ({
  detectFramework: vi.fn(async () => ({
    framework: 'lit',
    version: '3.2.0',
    cemGenerator: '@custom-elements-manifest/analyzer',
    regenerationNotes: 'Run: npx cem analyze --globs "src/**/*.ts"',
    formatted:
      '## Framework Detection\n\n**Framework:** lit\n**Version:** 3.2.0\n**CEM Generator:** @custom-elements-manifest/analyzer\n\n### Regeneration Notes\nRun: npx cem analyze --globs "src/**/*.ts"',
  })),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_CONFIG: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: '/fake/project',
  componentPrefix: 'hx-',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: null,
  cdnBase: null,
  watch: false,
};

// ─── FRAMEWORK_TOOL_DEFINITIONS ───────────────────────────────────────────────

describe('FRAMEWORK_TOOL_DEFINITIONS', () => {
  it('exports exactly 1 tool definition', () => {
    expect(FRAMEWORK_TOOL_DEFINITIONS).toHaveLength(1);
  });

  it('defines detect_framework', () => {
    const names = FRAMEWORK_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('detect_framework');
  });

  it('detect_framework schema has no required fields', () => {
    const def = FRAMEWORK_TOOL_DEFINITIONS.find((t) => t.name === 'detect_framework')!;
    expect(def.inputSchema.required).toBeUndefined();
  });
});

// ─── isFrameworkTool ──────────────────────────────────────────────────────────

describe('isFrameworkTool', () => {
  it('returns true for detect_framework', () => {
    expect(isFrameworkTool('detect_framework')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isFrameworkTool('scaffold_component')).toBe(false);
    expect(isFrameworkTool('get_component')).toBe(false);
    expect(isFrameworkTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isFrameworkTool('framework')).toBe(false);
    expect(isFrameworkTool('detect_frameworks')).toBe(false);
  });
});

// ─── handleFrameworkCall — valid inputs ───────────────────────────────────────

describe('handleFrameworkCall — valid inputs', () => {
  it('returns a success result for detect_framework with empty args', async () => {
    const result = await handleFrameworkCall('detect_framework', {}, FAKE_CONFIG);
    expect(result.isError).toBeFalsy();
  });

  it('returns text content with framework info', async () => {
    const result = await handleFrameworkCall('detect_framework', {}, FAKE_CONFIG);
    expect(result.content[0].text).toContain('Framework Detection');
  });

  it('result contains framework name', async () => {
    const result = await handleFrameworkCall('detect_framework', {}, FAKE_CONFIG);
    expect(result.content[0].text).toContain('lit');
  });

  it('result contains version info', async () => {
    const result = await handleFrameworkCall('detect_framework', {}, FAKE_CONFIG);
    expect(result.content[0].text).toContain('3.2.0');
  });

  it('result contains regeneration notes', async () => {
    const result = await handleFrameworkCall('detect_framework', {}, FAKE_CONFIG);
    expect(result.content[0].text).toContain('Regeneration Notes');
  });

  it('ignores any extra args passed in (no schema fields)', async () => {
    const result = await handleFrameworkCall(
      'detect_framework',
      { unknownProp: 'ignored' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleFrameworkCall — error cases ────────────────────────────────────────

describe('handleFrameworkCall — error cases', () => {
  it('returns error for unknown tool name', async () => {
    const result = await handleFrameworkCall('nonexistent_tool', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown framework tool');
  });

  it('returns error for empty tool name', async () => {
    const result = await handleFrameworkCall('', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown framework tool');
  });
});

// ─── handleFrameworkCall — handler error propagation ─────────────────────────

describe('handleFrameworkCall — handler error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when detectFramework handler throws', async () => {
    const { detectFramework } = await import('../../packages/core/src/handlers/framework.js');
    vi.mocked(detectFramework).mockImplementationOnce(async () => {
      throw new Error('package.json not found in project root');
    });

    const result = await handleFrameworkCall('detect_framework', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('package.json not found');
  });

  it('returns error when detectFramework handler throws generic error', async () => {
    const { detectFramework } = await import('../../packages/core/src/handlers/framework.js');
    vi.mocked(detectFramework).mockImplementationOnce(async () => {
      throw new Error('Permission denied');
    });

    const result = await handleFrameworkCall('detect_framework', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });
});
