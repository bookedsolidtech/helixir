import { describe, it, expect } from 'vitest';
import {
  getShadowDomWarnings,
  createSuccessResponse,
  createErrorResponse,
} from '../../packages/core/src/shared/mcp-helpers.js';

describe('createSuccessResponse', () => {
  it('wraps text in MCP content array', () => {
    const result = createSuccessResponse('hello');
    expect(result).toEqual({
      content: [{ type: 'text', text: 'hello' }],
    });
  });

  it('does not set isError', () => {
    const result = createSuccessResponse('ok');
    expect(result.isError).toBeUndefined();
  });
});

describe('createErrorResponse', () => {
  it('wraps text in MCP content array with isError', () => {
    const result = createErrorResponse('fail');
    expect(result).toEqual({
      content: [{ type: 'text', text: 'fail' }],
      isError: true,
    });
  });
});

describe('getShadowDomWarnings', () => {
  const warnings = getShadowDomWarnings('my-button');

  it('returns a non-empty array of strings', () => {
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(typeof w).toBe('string');
    }
  });

  it('interpolates the tagName into relevant warnings', () => {
    const joined = warnings.join(' ');
    expect(joined).toContain('my-button');
  });

  it('warns about descendant selectors not piercing Shadow DOM', () => {
    expect(warnings.some((w) => w.includes('cannot pierce Shadow DOM'))).toBe(true);
  });

  it('warns about ::part() chaining', () => {
    expect(warnings.some((w) => w.includes('::part()::part()'))).toBe(true);
  });

  it('warns about ::part() with .class or [attr]', () => {
    expect(warnings.some((w) => w.includes('::part(base).active'))).toBe(true);
  });

  it('warns about ::slotted() constraints', () => {
    expect(warnings.some((w) => w.includes('::slotted()'))).toBe(true);
  });

  it('warns about :host only working inside shadow root', () => {
    expect(warnings.some((w) => w.includes(':host'))).toBe(true);
  });

  it('warns about display: contents destroying shadow root', () => {
    expect(warnings.some((w) => w.includes('display: contents'))).toBe(true);
  });

  it('warns about var() fallback values', () => {
    expect(warnings.some((w) => w.includes('fallback'))).toBe(true);
  });

  it('warns about var() in CSS shorthands', () => {
    expect(warnings.some((w) => w.includes('shorthand'))).toBe(true);
  });

  it('warns about token placement on :root', () => {
    expect(warnings.some((w) => w.includes(':root'))).toBe(true);
  });

  it('warns about .shadowRoot access from consumer code', () => {
    expect(warnings.some((w) => w.includes('.shadowRoot'))).toBe(true);
  });

  it('warns about deprecated /deep/ and >>> selectors', () => {
    expect(warnings.some((w) => w.includes('/deep/'))).toBe(true);
  });

  it('warns about transitions only affecting the host box', () => {
    expect(warnings.some((w) => w.includes('host box'))).toBe(true);
  });

  it('uses a different tagName correctly', () => {
    const customWarnings = getShadowDomWarnings('sl-dialog');
    const joined = customWarnings.join(' ');
    expect(joined).toContain('sl-dialog');
    expect(joined).not.toContain('my-button');
  });
});
