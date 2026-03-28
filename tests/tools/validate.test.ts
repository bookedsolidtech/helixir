/**
 * Tests for the validate_usage tool dispatcher.
 * Covers isValidateTool, handleValidateCall, argument validation,
 * and response formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidateTool,
  handleValidateCall,
  VALIDATE_TOOL_DEFINITIONS,
} from '../../packages/core/src/tools/validate.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/validate.js', () => ({
  validateUsage: vi.fn((tagName: string, html: string, _cem: unknown) => ({
    tagName,
    html,
    valid: true,
    issues: [],
    issueCount: 0,
    formatted: `## Validation: ${tagName}\n\n**Result:** PASS\n\nNo issues found.`,
  })),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMPTY_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

const BUTTON_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/hx-button.ts',
      declarations: [
        {
          kind: 'class',
          name: 'HxButton',
          tagName: 'hx-button',
          members: [],
          attributes: [
            { name: 'variant', type: { text: "'primary' | 'secondary' | 'danger'" } },
            { name: 'disabled', type: { text: 'boolean' } },
          ],
          slots: [{ name: '' }],
        },
      ],
    },
  ],
};

// ─── VALIDATE_TOOL_DEFINITIONS ────────────────────────────────────────────────

describe('VALIDATE_TOOL_DEFINITIONS', () => {
  it('exports exactly 1 tool definition', () => {
    expect(VALIDATE_TOOL_DEFINITIONS).toHaveLength(1);
  });

  it('defines validate_usage', () => {
    const names = VALIDATE_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('validate_usage');
  });

  it('validate_usage schema requires tagName and html', () => {
    const def = VALIDATE_TOOL_DEFINITIONS.find((t) => t.name === 'validate_usage')!;
    expect(def.inputSchema.required).toContain('tagName');
    expect(def.inputSchema.required).toContain('html');
  });
});

// ─── isValidateTool ───────────────────────────────────────────────────────────

describe('isValidateTool', () => {
  it('returns true for validate_usage', () => {
    expect(isValidateTool('validate_usage')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isValidateTool('scaffold_component')).toBe(false);
    expect(isValidateTool('get_component')).toBe(false);
    expect(isValidateTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isValidateTool('validate')).toBe(false);
    expect(isValidateTool('usage')).toBe(false);
  });
});

// ─── handleValidateCall — valid inputs ────────────────────────────────────────

describe('handleValidateCall — valid inputs', () => {
  it('returns success result for valid HTML snippet', () => {
    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'hx-button', html: '<hx-button variant="primary">Click</hx-button>' },
      BUTTON_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('result content includes formatted output', () => {
    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'hx-button', html: '<hx-button>Click</hx-button>' },
      BUTTON_CEM,
    );
    expect(result.content[0].text).toContain('Validation');
  });

  it('result includes PASS/FAIL result', () => {
    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'hx-button', html: '<hx-button variant="primary">Click</hx-button>' },
      BUTTON_CEM,
    );
    expect(result.content[0].text).toMatch(/PASS|FAIL/);
  });

  it('works with empty CEM (no declaration to check against)', () => {
    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'hx-button', html: '<hx-button>Click</hx-button>' },
      EMPTY_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts self-closing HTML snippet', () => {
    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'hx-button', html: '<hx-button disabled />' },
      BUTTON_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts multi-attribute HTML snippet', () => {
    const result = handleValidateCall(
      'validate_usage',
      {
        tagName: 'hx-button',
        html: '<hx-button variant="primary" disabled>Submit</hx-button>',
      },
      BUTTON_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts html up to 50000 characters', () => {
    const longHtml = '<hx-button>' + 'x'.repeat(49_977) + '</hx-button>';
    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'hx-button', html: longHtml },
      BUTTON_CEM,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleValidateCall — error cases ─────────────────────────────────────────

describe('handleValidateCall — error cases', () => {
  it('returns error for unknown tool name', () => {
    const result = handleValidateCall('nonexistent_tool', {}, EMPTY_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown validate tool');
  });

  it('returns error for empty tool name', () => {
    const result = handleValidateCall('', {}, EMPTY_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown validate tool');
  });

  it('returns error when tagName is missing', () => {
    const result = handleValidateCall(
      'validate_usage',
      { html: '<hx-button>Click</hx-button>' },
      BUTTON_CEM,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error when html is missing', () => {
    const result = handleValidateCall('validate_usage', { tagName: 'hx-button' }, BUTTON_CEM);
    expect(result.isError).toBe(true);
  });

  it('returns error when html exceeds 50000 characters', () => {
    const tooLongHtml = '<hx-button>' + 'x'.repeat(50_000) + '</hx-button>';
    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'hx-button', html: tooLongHtml },
      BUTTON_CEM,
    );
    expect(result.isError).toBe(true);
  });
});

// ─── handleValidateCall — handler error propagation ───────────────────────────

describe('handleValidateCall — handler error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when validateUsage handler throws', async () => {
    const { validateUsage } = await import('../../packages/core/src/handlers/validate.js');
    vi.mocked(validateUsage).mockImplementationOnce(() => {
      throw new Error('HTML parse error: unexpected token');
    });

    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'hx-button', html: '<hx-button>Click</hx-button>' },
      BUTTON_CEM,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('HTML parse error');
  });
});
