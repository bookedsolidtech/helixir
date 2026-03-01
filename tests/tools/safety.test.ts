import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiffResult } from '../../src/handlers/cem.js';

// Mock handler modules before importing the tool dispatch
vi.mock('../../src/handlers/cem.js', () => ({
  diffCem: vi.fn(),
  listAllComponents: vi.fn(),
}));

import { handleSafetyCall, isSafetyTool, SAFETY_TOOL_DEFINITIONS } from '../../src/tools/safety.js';
import { diffCem, listAllComponents } from '../../src/handlers/cem.js';
import type { McpWcConfig } from '../../src/config.js';

const baseConfig: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: '/',
  componentPrefix: '',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: 'tokens.json',
};

describe('SAFETY_TOOL_DEFINITIONS', () => {
  it('exports diff_cem and check_breaking_changes tool definitions', () => {
    const names = SAFETY_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('diff_cem');
    expect(names).toContain('check_breaking_changes');
  });

  it('diff_cem schema requires tagName and baseBranch', () => {
    const def = SAFETY_TOOL_DEFINITIONS.find((t) => t.name === 'diff_cem')!;
    expect(def.inputSchema.required).toContain('tagName');
    expect(def.inputSchema.required).toContain('baseBranch');
    expect(def.inputSchema.additionalProperties).toBe(false);
  });

  it('check_breaking_changes schema requires baseBranch', () => {
    const def = SAFETY_TOOL_DEFINITIONS.find((t) => t.name === 'check_breaking_changes')!;
    expect(def.inputSchema.required).toContain('baseBranch');
    expect(def.inputSchema.additionalProperties).toBe(false);
  });
});

describe('isSafetyTool', () => {
  it('returns true for diff_cem', () => {
    expect(isSafetyTool('diff_cem')).toBe(true);
  });

  it('returns true for check_breaking_changes', () => {
    expect(isSafetyTool('check_breaking_changes')).toBe(true);
  });

  it('returns false for unknown tools', () => {
    expect(isSafetyTool('get_design_tokens')).toBe(false);
    expect(isSafetyTool('unknown')).toBe(false);
  });
});

describe('handleSafetyCall - diff_cem', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('formats a clean diff (no breaking, no additions)', async () => {
    vi.mocked(diffCem).mockResolvedValue({ isNew: false, breaking: [], additions: [] });

    const result = await handleSafetyCall(
      'diff_cem',
      { tagName: 'my-button', baseBranch: 'main' },
      baseConfig,
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('my-button');
    expect(text).toContain('main');
    expect(text).toMatch(/no breaking changes/i);
  });

  it('formats breaking changes clearly', async () => {
    const diff: DiffResult = {
      isNew: false,
      breaking: ['Property removed: size', 'Event removed: close'],
      additions: [],
    };
    vi.mocked(diffCem).mockResolvedValue(diff);

    const result = await handleSafetyCall(
      'diff_cem',
      { tagName: 'my-button', baseBranch: 'main' },
      baseConfig,
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('Property removed: size');
    expect(text).toContain('Event removed: close');
    expect(text).toMatch(/breaking/i);
  });

  it('formats non-breaking additions', async () => {
    const diff: DiffResult = {
      isNew: false,
      breaking: [],
      additions: ['Property added: variant', 'Event added: open'],
    };
    vi.mocked(diffCem).mockResolvedValue(diff);

    const result = await handleSafetyCall(
      'diff_cem',
      { tagName: 'my-button', baseBranch: 'main' },
      baseConfig,
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('Property added: variant');
    expect(text).toContain('Event added: open');
  });

  it('flags component as NEW when isNew=true', async () => {
    vi.mocked(diffCem).mockResolvedValue({ isNew: true, breaking: [], additions: [] });

    const result = await handleSafetyCall(
      'diff_cem',
      { tagName: 'my-new', baseBranch: 'main' },
      baseConfig,
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toMatch(/new component/i);
  });

  it('returns an error when diffCem throws', async () => {
    vi.mocked(diffCem).mockRejectedValue(new Error('CEM not found'));

    const result = await handleSafetyCall(
      'diff_cem',
      { tagName: 'my-button', baseBranch: 'main' },
      baseConfig,
    );

    expect(result.isError).toBe(true);
  });

  it('returns an error for missing required args', async () => {
    const result = await handleSafetyCall('diff_cem', {}, baseConfig);

    expect(result.isError).toBe(true);
  });
});

describe('handleSafetyCall - check_breaking_changes (aggregation)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('aggregates a mix of breaking, non-breaking, and new components', async () => {
    vi.mocked(listAllComponents).mockResolvedValue(['my-button', 'my-input', 'my-badge']);
    vi.mocked(diffCem)
      .mockResolvedValueOnce({ isNew: false, breaking: ['Property removed: size'], additions: [] }) // breaking
      .mockResolvedValueOnce({ isNew: false, breaking: [], additions: ['Property added: label'] }) // non-breaking additions
      .mockResolvedValueOnce({ isNew: true, breaking: [], additions: [] }); // new component

    const result = await handleSafetyCall(
      'check_breaking_changes',
      { baseBranch: 'main' },
      baseConfig,
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;

    // All three components should appear
    expect(text).toContain('my-button');
    expect(text).toContain('my-input');
    expect(text).toContain('my-badge');

    // breaking indicator for my-button
    expect(text).toContain('Property removed: size');

    // new component should NOT say breaking
    expect(text).toMatch(/new/i);
  });

  it('shows clean status when no components have breaking changes', async () => {
    vi.mocked(listAllComponents).mockResolvedValue(['my-button', 'my-input']);
    vi.mocked(diffCem)
      .mockResolvedValueOnce({ isNew: false, breaking: [], additions: [] })
      .mockResolvedValueOnce({ isNew: false, breaking: [], additions: [] });

    const result = await handleSafetyCall(
      'check_breaking_changes',
      { baseBranch: 'main' },
      baseConfig,
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toMatch(/no breaking changes/i);
  });

  it('shows a summary count of breaking components', async () => {
    vi.mocked(listAllComponents).mockResolvedValue(['a', 'b', 'c']);
    vi.mocked(diffCem)
      .mockResolvedValueOnce({ isNew: false, breaking: ['Property removed: x'], additions: [] })
      .mockResolvedValueOnce({ isNew: false, breaking: ['Event removed: y'], additions: [] })
      .mockResolvedValueOnce({ isNew: false, breaking: [], additions: [] });

    const result = await handleSafetyCall(
      'check_breaking_changes',
      { baseBranch: 'main' },
      baseConfig,
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    // Should mention 2 breaking somewhere in summary
    expect(text).toMatch(/2/);
  });

  it('handles empty component list gracefully', async () => {
    vi.mocked(listAllComponents).mockResolvedValue([]);

    const result = await handleSafetyCall(
      'check_breaking_changes',
      { baseBranch: 'main' },
      baseConfig,
    );

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toMatch(/no components/i);
  });

  it('returns an error when listAllComponents throws', async () => {
    vi.mocked(listAllComponents).mockRejectedValue(new Error('CEM unreadable'));

    const result = await handleSafetyCall(
      'check_breaking_changes',
      { baseBranch: 'main' },
      baseConfig,
    );

    expect(result.isError).toBe(true);
  });

  it('returns error for unknown tool name', async () => {
    const result = await handleSafetyCall('unknown_tool', {}, baseConfig);
    expect(result.isError).toBe(true);
  });
});
