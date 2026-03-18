import { describe, it, expect, vi, afterEach } from 'vitest';
import type { McpWcConfig } from '../../packages/core/src/config.js';
import { generateAuditReport } from '../../packages/core/src/handlers/audit-report.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import type { MultiDimensionalHealth } from '../../packages/core/src/handlers/health.js';

// Mock fs to prevent actual writes in outputPath tests
vi.mock('node:fs/promises', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...orig,
    writeFile: vi.fn(),
    readdir: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/fake/project',
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

const BUTTON_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyButton',
  tagName: 'my-button',
  description: 'A button component.',
  members: [
    { kind: 'field', name: 'variant', type: { text: 'string' }, description: 'Variant.' },
    { kind: 'field', name: 'disabled', type: { text: 'boolean' }, description: 'Disabled state.' },
  ],
  events: [{ name: 'my-click', type: { text: 'CustomEvent<MouseEvent>' }, description: 'Click.' }],
  slots: [{ name: '', description: 'Default slot.' }],
  cssParts: [{ name: 'base', description: 'Root.' }],
};

const CARD_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyCard',
  tagName: 'my-card',
  description: 'A card component.',
  members: [],
  events: [],
};

const NO_TAG_DECL: CemDeclaration = {
  kind: 'class',
  name: 'Mixin',
  // no tagName
};

// ─── generateAuditReport ─────────────────────────────────────────────────────

describe('generateAuditReport', () => {
  it('returns one line per component with tagName', async () => {
    const config = makeConfig();
    const { lines } = await generateAuditReport(config, [BUTTON_DECL, CARD_DECL]);
    expect(lines).toHaveLength(2);
  });

  it('skips declarations without tagName', async () => {
    const config = makeConfig();
    const { lines } = await generateAuditReport(config, [BUTTON_DECL, NO_TAG_DECL]);
    expect(lines).toHaveLength(1);
  });

  it('each line is valid JSON', async () => {
    const config = makeConfig();
    const { lines } = await generateAuditReport(config, [BUTTON_DECL, CARD_DECL]);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('each JSON line has required fields', async () => {
    const config = makeConfig();
    const { lines } = await generateAuditReport(config, [BUTTON_DECL]);
    const parsed = JSON.parse(lines[0]!) as MultiDimensionalHealth;
    expect(parsed.tagName).toBe('my-button');
    expect(typeof parsed.score).toBe('number');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(parsed.grade);
    expect(Array.isArray(parsed.dimensions)).toBe(true);
    expect(parsed.dimensions.length).toBe(14);
    expect(parsed.confidenceSummary).toBeDefined();
    expect(Array.isArray(parsed.gradingNotes)).toBe(true);
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('returns summary with correct totalComponents', async () => {
    const config = makeConfig();
    const { summary } = await generateAuditReport(config, [BUTTON_DECL, CARD_DECL]);
    expect(summary.totalComponents).toBe(2);
  });

  it('returns summary with averageScore', async () => {
    const config = makeConfig();
    const { summary } = await generateAuditReport(config, [BUTTON_DECL]);
    expect(typeof summary.averageScore).toBe('number');
    expect(summary.averageScore).toBeGreaterThanOrEqual(0);
    expect(summary.averageScore).toBeLessThanOrEqual(100);
  });

  it('returns summary with gradeDistribution', async () => {
    const config = makeConfig();
    const { summary } = await generateAuditReport(config, [BUTTON_DECL, CARD_DECL]);
    expect(summary.gradeDistribution).toBeDefined();
    const total = Object.values(summary.gradeDistribution).reduce((s, n) => s + n, 0);
    expect(total).toBe(2);
  });

  it('returns summary with dimensionAverages', async () => {
    const config = makeConfig();
    const { summary } = await generateAuditReport(config, [BUTTON_DECL, CARD_DECL]);
    expect(summary.dimensionAverages).toBeDefined();
    expect(typeof summary.dimensionAverages['CEM Completeness']).toBe('number');
  });

  it('returns summary with confidenceSummary', async () => {
    const config = makeConfig();
    const { summary } = await generateAuditReport(config, [BUTTON_DECL]);
    expect(summary.confidenceSummary).toBeDefined();
    expect(typeof summary.confidenceSummary.verified).toBe('number');
    expect(typeof summary.confidenceSummary.heuristic).toBe('number');
    expect(typeof summary.confidenceSummary.untested).toBe('number');
  });

  it('returns summary with timestamp', async () => {
    const config = makeConfig();
    const { summary } = await generateAuditReport(config, [BUTTON_DECL]);
    expect(typeof summary.timestamp).toBe('string');
    expect(summary.timestamp.length).toBeGreaterThan(0);
  });

  it('handles empty declarations array', async () => {
    const config = makeConfig();
    const { lines, summary } = await generateAuditReport(config, []);
    expect(lines).toHaveLength(0);
    expect(summary.totalComponents).toBe(0);
    expect(summary.averageScore).toBe(0);
  });

  it('calls writeFile when outputPath is provided', async () => {
    const { writeFile } = await import('node:fs/promises');
    const config = makeConfig();
    await generateAuditReport(config, [BUTTON_DECL], { outputPath: 'audit/health.jsonl' });
    expect(writeFile).toHaveBeenCalledWith(
      '/fake/project/audit/health.jsonl',
      expect.any(String),
      'utf-8',
    );
  });

  it('does not call writeFile when outputPath is not provided', async () => {
    const { writeFile } = await import('node:fs/promises');
    const config = makeConfig();
    await generateAuditReport(config, [BUTTON_DECL]);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('lines are independently parseable (JSONL compliance)', async () => {
    const config = makeConfig();
    const { lines } = await generateAuditReport(config, [BUTTON_DECL, CARD_DECL]);
    // Simulate JSONL parsing — each line independently
    for (const line of lines) {
      const obj = JSON.parse(line) as MultiDimensionalHealth;
      expect(obj.tagName).toBeTruthy();
      expect(obj.dimensions).toHaveLength(14);
    }
  });
});
