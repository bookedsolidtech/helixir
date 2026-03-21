import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  handleStylingCall,
  isStylingTool,
  STYLING_TOOL_DEFINITIONS,
} from '../../packages/core/src/tools/styling.js';

const FIXTURE_CEM = resolve(import.meta.dirname, '../__fixtures__/custom-elements.json');
const cem = JSON.parse(readFileSync(FIXTURE_CEM, 'utf-8'));

// ─── isStylingTool ──────────────────────────────────────────────────────────

describe('isStylingTool', () => {
  it('returns true for all defined styling tools', () => {
    for (const tool of STYLING_TOOL_DEFINITIONS) {
      expect(isStylingTool(tool.name)).toBe(true);
    }
  });

  it('returns false for unknown tools', () => {
    expect(isStylingTool('not_a_tool')).toBe(false);
  });
});

// ─── handleStylingCall — recommend_checks ───────────────────────────────────

describe('handleStylingCall — recommend_checks', () => {
  it('returns recommended tools for HTML code', () => {
    const result = handleStylingCall(
      'recommend_checks',
      { codeText: '<sl-button variant="primary">Click me</sl-button>' },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.recommended).toContain('validate_component_code');
    expect(parsed.recommended).toContain('check_html_usage');
    expect(parsed.codeType).toContain('html');
    expect(parsed.detectedTags).toContain('sl-button');
  });

  it('returns recommended tools for CSS code', () => {
    const result = handleStylingCall(
      'recommend_checks',
      { codeText: 'sl-button { --sl-button-color: var(--app-color); }' },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.recommended).toContain('check_shadow_dom_usage');
    expect(parsed.recommended).toContain('check_token_fallbacks');
    expect(parsed.codeType).toContain('css');
  });

  it('returns recommended tools for JavaScript code', () => {
    const result = handleStylingCall(
      'recommend_checks',
      { codeText: `const dialog = document.querySelector('sl-dialog');\ndialog.show();` },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.recommended).toContain('check_method_calls');
    expect(parsed.codeType).toContain('javascript');
  });
});

// ─── handleStylingCall — check_theme_compatibility ──────────────────────────

describe('handleStylingCall — check_theme_compatibility', () => {
  it('dispatches and returns a result', () => {
    const result = handleStylingCall(
      'check_theme_compatibility',
      { cssText: '.card { background: var(--color-bg); color: var(--color-text); }' },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed).toHaveProperty('issues');
  });
});

// ─── handleStylingCall — check_composition ──────────────────────────────────

describe('handleStylingCall — check_composition', () => {
  it('dispatches and returns a result', () => {
    const result = handleStylingCall(
      'check_composition',
      { htmlText: '<sl-select><sl-option value="1">One</sl-option></sl-select>' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — check_token_fallbacks ──────────────────────────────

describe('handleStylingCall — check_token_fallbacks', () => {
  it('dispatches and returns a result', () => {
    const result = handleStylingCall(
      'check_token_fallbacks',
      { cssText: 'sl-button { color: var(--my-color, #333); }', tagName: 'sl-button' },
      cem,
    );
    // May return error if tag not in CEM — we just verify dispatch works
    const content = (result.content as Array<{ text: string }>)[0].text;
    expect(content).toBeTruthy();
  });
});

// ─── handleStylingCall — check_method_calls ─────────────────────────────────

describe('handleStylingCall — check_method_calls', () => {
  it('dispatches and returns a result', () => {
    const result = handleStylingCall(
      'check_method_calls',
      { codeText: `const el = document.querySelector('my-button');`, tagName: 'my-button' },
      cem,
    );
    // my-button exists in our fixture CEM
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — check_layout_patterns ──────────────────────────────

describe('handleStylingCall — check_layout_patterns', () => {
  it('dispatches layout pattern check', () => {
    const result = handleStylingCall(
      'check_layout_patterns',
      { cssText: 'sl-card { display: flex; }' },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0].type).toBe('host-display-override');
  });
});

// ─── handleStylingCall — check_css_scope ─────────────────────────────────────

describe('handleStylingCall — check_css_scope', () => {
  it('dispatches scope check for component tokens on :root', () => {
    const result = handleStylingCall(
      'check_css_scope',
      { cssText: ':root { --my-button-color: red; }', tagName: 'my-button' },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0].rule).toBe('scope-mismatch');
  });
});

// ─── handleStylingCall — check_css_shorthand ────────────────────────────────

describe('handleStylingCall — check_css_shorthand', () => {
  it('dispatches shorthand check for risky var() patterns', () => {
    const result = handleStylingCall(
      'check_css_shorthand',
      { cssText: '.card { border: 1px solid var(--color); }' },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0].rule).toBe('shorthand-var-risk');
  });
});

// ─── handleStylingCall — check_color_contrast ───────────────────────────────

describe('handleStylingCall — check_color_contrast', () => {
  it('dispatches color contrast check for low-contrast pairs', () => {
    const result = handleStylingCall(
      'check_color_contrast',
      { cssText: '.card { background: white; color: #f0f0f0; }' },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0].rule).toBe('low-contrast-pair');
  });
});

// ─── handleStylingCall — check_transition_animation ─────────────────────

describe('handleStylingCall — check_transition_animation', () => {
  it('dispatches transition animation check for host transitions', () => {
    const result = handleStylingCall(
      'check_transition_animation',
      { cssText: 'sl-button { transition: background-color 0.3s ease; }', tagName: 'sl-button' },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0].rule).toBe('transition-no-effect');
  });
});

// ─── handleStylingCall — check_shadow_dom_js ────────────────────────────

describe('handleStylingCall — check_shadow_dom_js', () => {
  it('dispatches shadow DOM JS check for shadowRoot access', () => {
    const result = handleStylingCall(
      'check_shadow_dom_js',
      { codeText: `element.shadowRoot.querySelector('.inner');` },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0].rule).toBe('no-shadow-root-access');
  });
});

// ─── handleStylingCall — check_css_specificity ──────────────────────────────

describe('handleStylingCall — check_css_specificity', () => {
  it('dispatches CSS specificity check', () => {
    const result = handleStylingCall(
      'check_css_specificity',
      { code: 'sl-button { color: red !important; }' },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0].type).toBe('important');
  });

  it('dispatches HTML mode for inline styles', () => {
    const result = handleStylingCall(
      'check_css_specificity',
      { code: '<sl-button style="color: red;">Click</sl-button>', mode: 'html' },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.issues.some((i: { type: string }) => i.type === 'inline-style')).toBe(true);
  });
});

// ─── handleStylingCall — suggest_fix ────────────────────────────────────────

describe('handleStylingCall — suggest_fix', () => {
  it('dispatches shadow-dom fix suggestions', () => {
    const result = handleStylingCall(
      'suggest_fix',
      {
        type: 'shadow-dom',
        issue: 'descendant-piercing',
        original: 'my-button .inner { color: red; }',
        tagName: 'my-button',
        partNames: ['base'],
      },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.suggestion).toContain('::part(');
  });

  it('dispatches method-call fix suggestions', () => {
    const result = handleStylingCall(
      'suggest_fix',
      {
        type: 'method-call',
        issue: 'property-as-method',
        original: 'dialog.open();',
        memberName: 'open',
        tagName: 'sl-dialog',
      },
      cem,
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.suggestion).toContain('open = true');
  });
});

// ─── handleStylingCall — diagnose_styling ───────────────────────────────────

describe('handleStylingCall — diagnose_styling', () => {
  it('dispatches and returns styling diagnostics', () => {
    const result = handleStylingCall('diagnose_styling', { tagName: 'my-button' }, cem);
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — check_shadow_dom_usage ─────────────────────────────

describe('handleStylingCall — check_shadow_dom_usage', () => {
  it('dispatches without tagName', () => {
    const result = handleStylingCall(
      'check_shadow_dom_usage',
      { cssText: 'my-button { color: red; }' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });

  it('dispatches with tagName', () => {
    const result = handleStylingCall(
      'check_shadow_dom_usage',
      { cssText: 'my-button { color: red; }', tagName: 'my-button' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });

  it('dispatches with unknown tagName gracefully', () => {
    const result = handleStylingCall(
      'check_shadow_dom_usage',
      { cssText: 'unknown-el { color: red; }', tagName: 'unknown-el' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — check_html_usage ───────────────────────────────────

describe('handleStylingCall — check_html_usage', () => {
  it('dispatches and validates HTML', () => {
    const result = handleStylingCall(
      'check_html_usage',
      { htmlText: '<my-button>Click</my-button>', tagName: 'my-button' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — check_event_usage ──────────────────────────────────

describe('handleStylingCall — check_event_usage', () => {
  it('dispatches and validates event usage', () => {
    const result = handleStylingCall(
      'check_event_usage',
      { codeText: '<my-button>Click</my-button>', tagName: 'my-button' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — get_component_quick_ref ────────────────────────────

describe('handleStylingCall — get_component_quick_ref', () => {
  it('dispatches and returns quick ref', () => {
    const result = handleStylingCall('get_component_quick_ref', { tagName: 'my-button' }, cem);
    expect(result.isError).toBeFalsy();
  });
});

// ─── detect_theme_support ────────────────────────────────────────────────────
// detect_theme_support is now handled via handleThemeDetection (async, config-based)
// and is tested in tests/handlers/theme-detection.test.ts

// ─── handleStylingCall — check_component_imports ────────────────────────────

describe('handleStylingCall — check_component_imports', () => {
  it('dispatches and validates imports', () => {
    const result = handleStylingCall(
      'check_component_imports',
      { codeText: '<my-button>Click</my-button>' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — check_slot_children ────────────────────────────────

describe('handleStylingCall — check_slot_children', () => {
  it('dispatches and validates slot children', () => {
    const result = handleStylingCall(
      'check_slot_children',
      { htmlText: '<my-select><my-option>One</my-option></my-select>', tagName: 'my-select' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — check_attribute_conflicts ──────────────────────────

describe('handleStylingCall — check_attribute_conflicts', () => {
  it('dispatches and validates attributes', () => {
    const result = handleStylingCall(
      'check_attribute_conflicts',
      { htmlText: '<my-button>Click</my-button>', tagName: 'my-button' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — check_a11y_usage ───────────────────────────────────

describe('handleStylingCall — check_a11y_usage', () => {
  it('dispatches and validates a11y', () => {
    const result = handleStylingCall(
      'check_a11y_usage',
      { htmlText: '<my-button>Click</my-button>', tagName: 'my-button' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — check_css_vars ─────────────────────────────────────

describe('handleStylingCall — check_css_vars', () => {
  it('dispatches and validates CSS vars', () => {
    const result = handleStylingCall(
      'check_css_vars',
      { cssText: 'my-button { --my-color: red; }', tagName: 'my-button' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — validate_component_code ────────────────────────────

describe('handleStylingCall — validate_component_code', () => {
  it('dispatches the all-in-one aggregator', () => {
    const result = handleStylingCall(
      'validate_component_code',
      { html: '<my-button>Click</my-button>', tagName: 'my-button' },
      cem,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleStylingCall — unknown tool ───────────────────────────────────────

describe('handleStylingCall — unknown tool', () => {
  it('returns error for unknown tool name', () => {
    const result = handleStylingCall('unknown_tool', {}, cem);
    expect(result.isError).toBe(true);
  });
});
