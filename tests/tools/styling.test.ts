/**
 * Test suite for packages/core/src/tools/styling.ts
 *
 * Tests the handleStylingCall dispatcher and isStylingTool guard.
 * All handler imports are mocked so no real CEM file reads or heavy
 * computation happens during unit tests.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleStylingCall, isStylingTool } from '../../packages/core/src/tools/styling.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import { MCPError, ErrorCategory } from '../../packages/core/src/shared/error-handling.js';

// ---------------------------------------------------------------------------
// Mock every handler that handleStylingCall delegates to
// ---------------------------------------------------------------------------

vi.mock('../../packages/core/src/handlers/cem.js', () => ({
  parseCem: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/styling-diagnostics.js', () => ({
  diagnoseStyling: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/shadow-dom-checker.js', () => ({
  checkShadowDomUsage: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/html-usage-checker.js', () => ({
  checkHtmlUsage: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/event-usage-checker.js', () => ({
  checkEventUsage: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/quick-ref.js', () => ({
  getComponentQuickRef: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/theme-detection.js', () => ({
  detectThemeSupport: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/import-checker.js', () => ({
  checkComponentImports: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/slot-children-checker.js', () => ({
  checkSlotChildren: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/attribute-conflict-checker.js', () => ({
  checkAttributeConflicts: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/a11y-usage-checker.js', () => ({
  checkA11yUsage: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/css-var-checker.js', () => ({
  checkCssVars: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/code-validator.js', () => ({
  validateComponentCode: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/token-fallback-checker.js', () => ({
  checkTokenFallbacks: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/composition-checker.js', () => ({
  checkComposition: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/method-checker.js', () => ({
  checkMethodCalls: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/theme-checker.js', () => ({
  checkThemeCompatibility: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/recommend-checks.js', () => ({
  recommendChecks: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/suggest-fix.js', () => ({
  suggestFix: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/specificity-checker.js', () => ({
  checkCssSpecificity: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/layout-checker.js', () => ({
  checkLayoutPatterns: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/scope-checker.js', () => ({
  checkCssScope: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/shorthand-checker.js', () => ({
  checkCssShorthand: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/color-contrast-checker.js', () => ({
  checkColorContrast: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/transition-checker.js', () => ({
  checkTransitionAnimation: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/shadow-dom-js-checker.js', () => ({
  checkShadowDomJs: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/css-api-resolver.js', () => ({
  resolveCssApi: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/styling-preflight.js', () => ({
  runStylingPreflight: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/css-file-validator.js', () => ({
  validateCssFile: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/dark-mode-checker.js', () => ({
  checkDarkModePatterns: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import mocked handlers for assertion
// ---------------------------------------------------------------------------

import { parseCem } from '../../packages/core/src/handlers/cem.js';
import { diagnoseStyling } from '../../packages/core/src/handlers/styling-diagnostics.js';
import { checkShadowDomUsage } from '../../packages/core/src/handlers/shadow-dom-checker.js';
import { checkHtmlUsage } from '../../packages/core/src/handlers/html-usage-checker.js';
import { checkEventUsage } from '../../packages/core/src/handlers/event-usage-checker.js';
import { getComponentQuickRef } from '../../packages/core/src/handlers/quick-ref.js';
import { detectThemeSupport } from '../../packages/core/src/handlers/theme-detection.js';
import { checkComponentImports } from '../../packages/core/src/handlers/import-checker.js';
import { checkSlotChildren } from '../../packages/core/src/handlers/slot-children-checker.js';
import { checkAttributeConflicts } from '../../packages/core/src/handlers/attribute-conflict-checker.js';
import { checkA11yUsage } from '../../packages/core/src/handlers/a11y-usage-checker.js';
import { checkCssVars } from '../../packages/core/src/handlers/css-var-checker.js';
import { validateComponentCode } from '../../packages/core/src/handlers/code-validator.js';
import { checkTokenFallbacks } from '../../packages/core/src/handlers/token-fallback-checker.js';
import { checkComposition } from '../../packages/core/src/handlers/composition-checker.js';
import { checkMethodCalls } from '../../packages/core/src/handlers/method-checker.js';
import { checkThemeCompatibility } from '../../packages/core/src/handlers/theme-checker.js';
import { recommendChecks } from '../../packages/core/src/handlers/recommend-checks.js';
import { suggestFix } from '../../packages/core/src/handlers/suggest-fix.js';
import { checkCssSpecificity } from '../../packages/core/src/handlers/specificity-checker.js';
import { checkLayoutPatterns } from '../../packages/core/src/handlers/layout-checker.js';
import { checkCssScope } from '../../packages/core/src/handlers/scope-checker.js';
import { checkCssShorthand } from '../../packages/core/src/handlers/shorthand-checker.js';
import { checkColorContrast } from '../../packages/core/src/handlers/color-contrast-checker.js';
import { checkTransitionAnimation } from '../../packages/core/src/handlers/transition-checker.js';
import { checkShadowDomJs } from '../../packages/core/src/handlers/shadow-dom-js-checker.js';
import { resolveCssApi } from '../../packages/core/src/handlers/css-api-resolver.js';
import { runStylingPreflight } from '../../packages/core/src/handlers/styling-preflight.js';
import { validateCssFile } from '../../packages/core/src/handlers/css-file-validator.js';
import { checkDarkModePatterns } from '../../packages/core/src/handlers/dark-mode-checker.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal CEM stub — enough for parseCem's type expectations */
const FAKE_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [],
};

/** Minimal component metadata returned by parseCem mocks */
const FAKE_META = {
  tagName: 'my-button',
  name: 'MyButton',
  description: 'A button component.',
  members: [],
  events: [],
  slots: [],
  cssProperties: [],
  cssParts: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// isStylingTool
// ---------------------------------------------------------------------------

describe('isStylingTool', () => {
  it('returns true for every defined styling tool name', () => {
    const toolNames = [
      'diagnose_styling',
      'check_shadow_dom_usage',
      'check_html_usage',
      'check_event_usage',
      'get_component_quick_ref',
      'detect_theme_support',
      'check_component_imports',
      'check_slot_children',
      'check_attribute_conflicts',
      'check_a11y_usage',
      'check_css_vars',
      'validate_component_code',
      'check_token_fallbacks',
      'check_composition',
      'check_method_calls',
      'check_theme_compatibility',
      'recommend_checks',
      'suggest_fix',
      'check_css_specificity',
      'check_layout_patterns',
      'check_css_scope',
      'check_css_shorthand',
      'check_color_contrast',
      'check_transition_animation',
      'check_shadow_dom_js',
      'resolve_css_api',
      'styling_preflight',
      'validate_css_file',
      'check_dark_mode_patterns',
    ];
    for (const name of toolNames) {
      expect(isStylingTool(name), `expected ${name} to be a styling tool`).toBe(true);
    }
  });

  it('returns false for non-styling tool names', () => {
    expect(isStylingTool('get_component')).toBe(false);
    expect(isStylingTool('get_design_tokens')).toBe(false);
    expect(isStylingTool('unknown_tool')).toBe(false);
    expect(isStylingTool('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — unknown tool
// ---------------------------------------------------------------------------

describe('handleStylingCall — unknown tool', () => {
  it('returns an error for an unrecognised tool name', () => {
    const result = handleStylingCall('nonexistent_tool', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown styling tool');
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — diagnose_styling
// ---------------------------------------------------------------------------

describe('handleStylingCall — diagnose_styling', () => {
  it('calls parseCem and diagnoseStyling and returns their result', () => {
    vi.mocked(parseCem).mockReturnValue(FAKE_META);
    vi.mocked(diagnoseStyling).mockReturnValue({ tokenPrefix: '--my-', approach: 'tokens' });

    const result = handleStylingCall('diagnose_styling', { tagName: 'my-button' }, FAKE_CEM);

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(parseCem)).toHaveBeenCalledWith('my-button', FAKE_CEM);
    expect(vi.mocked(diagnoseStyling)).toHaveBeenCalledWith(FAKE_META);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tokenPrefix).toBe('--my-');
  });

  it('returns error when tagName is missing', () => {
    const result = handleStylingCall('diagnose_styling', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });

  it('propagates errors from parseCem as error responses', () => {
    vi.mocked(parseCem).mockImplementation(() => {
      throw new Error('Component not found in CEM');
    });
    const result = handleStylingCall('diagnose_styling', { tagName: 'unknown-tag' }, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_shadow_dom_usage
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_shadow_dom_usage', () => {
  it('calls checkShadowDomUsage and returns the result', () => {
    vi.mocked(checkShadowDomUsage).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_shadow_dom_usage',
      { cssText: 'my-button .inner { color: red; }' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkShadowDomUsage)).toHaveBeenCalledWith(
      'my-button .inner { color: red; }',
      undefined,
      undefined,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.issues).toEqual([]);
  });

  it('passes tagName to checkShadowDomUsage and attempts parseCem', () => {
    vi.mocked(parseCem).mockReturnValue(FAKE_META);
    vi.mocked(checkShadowDomUsage).mockReturnValue({ issues: [] });

    handleStylingCall(
      'check_shadow_dom_usage',
      { cssText: 'my-button::part(base) { color: red; }', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(vi.mocked(parseCem)).toHaveBeenCalledWith('my-button', FAKE_CEM);
    expect(vi.mocked(checkShadowDomUsage)).toHaveBeenCalledWith(
      'my-button::part(base) { color: red; }',
      'my-button',
      FAKE_META,
    );
  });

  it('still runs when tagName is provided but not in CEM (parseCem throws)', () => {
    vi.mocked(parseCem).mockImplementation(() => {
      throw new Error('not found');
    });
    vi.mocked(checkShadowDomUsage).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_shadow_dom_usage',
      { cssText: 'x-button .foo {}', tagName: 'x-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    // meta should be undefined when parseCem throws
    expect(vi.mocked(checkShadowDomUsage)).toHaveBeenCalledWith(
      'x-button .foo {}',
      'x-button',
      undefined,
    );
  });

  it('returns error when cssText is missing', () => {
    const result = handleStylingCall('check_shadow_dom_usage', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_html_usage
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_html_usage', () => {
  it('calls checkHtmlUsage and returns the result', () => {
    vi.mocked(parseCem).mockReturnValue(FAKE_META);
    vi.mocked(checkHtmlUsage).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_html_usage',
      { htmlText: '<my-button variant="primary"></my-button>', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkHtmlUsage)).toHaveBeenCalledWith(
      '<my-button variant="primary"></my-button>',
      FAKE_META,
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('check_html_usage', { htmlText: '<div></div>' }, FAKE_CEM);
    expect(result.isError).toBe(true);
  });

  it('returns error when both args are missing', () => {
    const result = handleStylingCall('check_html_usage', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_event_usage
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_event_usage', () => {
  it('calls checkEventUsage with parsed args and returns result', () => {
    vi.mocked(parseCem).mockReturnValue(FAKE_META);
    vi.mocked(checkEventUsage).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_event_usage',
      { codeText: 'el.addEventListener("my-click", fn)', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkEventUsage)).toHaveBeenCalledWith(
      'el.addEventListener("my-click", fn)',
      FAKE_META,
      undefined,
    );
  });

  it('passes the framework hint through to checkEventUsage', () => {
    vi.mocked(parseCem).mockReturnValue(FAKE_META);
    vi.mocked(checkEventUsage).mockReturnValue({ issues: [] });

    handleStylingCall(
      'check_event_usage',
      { codeText: '<MyButton onClick={fn} />', tagName: 'my-button', framework: 'react' },
      FAKE_CEM,
    );

    expect(vi.mocked(checkEventUsage)).toHaveBeenCalledWith(expect.any(String), FAKE_META, 'react');
  });

  it('returns error for invalid framework enum value', () => {
    const result = handleStylingCall(
      'check_event_usage',
      { codeText: 'code', tagName: 'my-button', framework: 'svelte' },
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('check_event_usage', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — get_component_quick_ref
// ---------------------------------------------------------------------------

describe('handleStylingCall — get_component_quick_ref', () => {
  it('calls getComponentQuickRef and returns the result', () => {
    vi.mocked(parseCem).mockReturnValue(FAKE_META);
    vi.mocked(getComponentQuickRef).mockReturnValue({ attributes: [], parts: [] });

    const result = handleStylingCall('get_component_quick_ref', { tagName: 'my-button' }, FAKE_CEM);

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(getComponentQuickRef)).toHaveBeenCalledWith(FAKE_META);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.attributes).toEqual([]);
  });

  it('returns error when tagName is missing', () => {
    const result = handleStylingCall('get_component_quick_ref', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — detect_theme_support
// ---------------------------------------------------------------------------

describe('handleStylingCall — detect_theme_support', () => {
  it('calls detectThemeSupport with the CEM and returns result', () => {
    vi.mocked(detectThemeSupport).mockReturnValue({ score: 80, categories: ['color', 'spacing'] });

    const result = handleStylingCall('detect_theme_support', {}, FAKE_CEM);

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(detectThemeSupport)).toHaveBeenCalledWith(FAKE_CEM);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.score).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_component_imports
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_component_imports', () => {
  it('calls checkComponentImports and returns the result', () => {
    vi.mocked(checkComponentImports).mockReturnValue({ unknown: [], valid: ['my-button'] });

    const result = handleStylingCall(
      'check_component_imports',
      { codeText: '<my-button></my-button>' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkComponentImports)).toHaveBeenCalledWith(
      '<my-button></my-button>',
      FAKE_CEM,
    );
  });

  it('returns error when codeText is missing', () => {
    const result = handleStylingCall('check_component_imports', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_slot_children
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_slot_children', () => {
  it('calls checkSlotChildren and returns the result', () => {
    vi.mocked(checkSlotChildren).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_slot_children',
      { htmlText: '<my-button><span>label</span></my-button>', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkSlotChildren)).toHaveBeenCalledWith(
      '<my-button><span>label</span></my-button>',
      'my-button',
      FAKE_CEM,
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('check_slot_children', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_attribute_conflicts
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_attribute_conflicts', () => {
  it('calls checkAttributeConflicts and returns the result', () => {
    vi.mocked(checkAttributeConflicts).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_attribute_conflicts',
      { htmlText: '<my-button target="_blank">Go</my-button>', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkAttributeConflicts)).toHaveBeenCalledWith(
      '<my-button target="_blank">Go</my-button>',
      'my-button',
      FAKE_CEM,
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('check_attribute_conflicts', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_a11y_usage
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_a11y_usage', () => {
  it('calls checkA11yUsage and returns the result', () => {
    vi.mocked(checkA11yUsage).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_a11y_usage',
      { htmlText: '<my-button></my-button>', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkA11yUsage)).toHaveBeenCalledWith(
      '<my-button></my-button>',
      'my-button',
      FAKE_CEM,
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('check_a11y_usage', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_css_vars
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_css_vars', () => {
  it('calls checkCssVars and returns the result', () => {
    vi.mocked(checkCssVars).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_css_vars',
      { cssText: 'my-button { --my-color: red; }', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkCssVars)).toHaveBeenCalledWith(
      'my-button { --my-color: red; }',
      'my-button',
      FAKE_CEM,
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('check_css_vars', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_theme_compatibility
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_theme_compatibility', () => {
  it('calls checkThemeCompatibility and returns the result', () => {
    vi.mocked(checkThemeCompatibility).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_theme_compatibility',
      { cssText: 'my-button { color: #000; }' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkThemeCompatibility)).toHaveBeenCalledWith('my-button { color: #000; }');
  });

  it('returns error when cssText is missing', () => {
    const result = handleStylingCall('check_theme_compatibility', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_method_calls
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_method_calls', () => {
  it('calls checkMethodCalls and returns the result', () => {
    vi.mocked(checkMethodCalls).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_method_calls',
      { codeText: 'el.show()', tagName: 'my-dialog' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkMethodCalls)).toHaveBeenCalledWith('el.show()', 'my-dialog', FAKE_CEM);
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('check_method_calls', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_composition
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_composition', () => {
  it('calls checkComposition and returns the result', () => {
    vi.mocked(checkComposition).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_composition',
      { htmlText: '<my-tab-group><my-tab>Tab 1</my-tab></my-tab-group>' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkComposition)).toHaveBeenCalledWith(
      '<my-tab-group><my-tab>Tab 1</my-tab></my-tab-group>',
      FAKE_CEM,
    );
  });

  it('returns error when htmlText is missing', () => {
    const result = handleStylingCall('check_composition', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — recommend_checks
// ---------------------------------------------------------------------------

describe('handleStylingCall — recommend_checks', () => {
  it('calls recommendChecks and returns the result', () => {
    vi.mocked(recommendChecks).mockReturnValue({
      tools: ['check_shadow_dom_usage', 'check_html_usage'],
    });

    const result = handleStylingCall(
      'recommend_checks',
      { codeText: '<my-button></my-button>' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(recommendChecks)).toHaveBeenCalledWith('<my-button></my-button>');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tools).toContain('check_shadow_dom_usage');
  });

  it('returns error when codeText is missing', () => {
    const result = handleStylingCall('recommend_checks', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — suggest_fix
// ---------------------------------------------------------------------------

describe('handleStylingCall — suggest_fix', () => {
  it('calls suggestFix and returns the result', () => {
    vi.mocked(suggestFix).mockReturnValue({ fix: 'Use ::part(base) instead.' });

    const result = handleStylingCall(
      'suggest_fix',
      { type: 'shadow-dom', issue: 'descendant-piercing', original: 'my-button .inner {}' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(suggestFix)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'shadow-dom', issue: 'descendant-piercing' }),
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.fix).toContain('::part(base)');
  });

  it('passes all optional fields to suggestFix', () => {
    vi.mocked(suggestFix).mockReturnValue({ fix: 'ok' });

    handleStylingCall(
      'suggest_fix',
      {
        type: 'method-call',
        issue: 'property-as-method',
        original: 'el.open()',
        tagName: 'my-dialog',
        memberName: 'open',
        suggestedName: 'show',
      },
      FAKE_CEM,
    );

    expect(vi.mocked(suggestFix)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'method-call',
        tagName: 'my-dialog',
        memberName: 'open',
        suggestedName: 'show',
      }),
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('suggest_fix', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });

  it('returns error for invalid type enum value', () => {
    const result = handleStylingCall(
      'suggest_fix',
      { type: 'not-a-type', issue: 'foo', original: 'bar' },
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_css_specificity
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_css_specificity', () => {
  it('calls checkCssSpecificity without mode when mode is omitted', () => {
    vi.mocked(checkCssSpecificity).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_css_specificity',
      { code: '#app my-button { color: red !important; }' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkCssSpecificity)).toHaveBeenCalledWith(
      '#app my-button { color: red !important; }',
      undefined,
    );
  });

  it('passes mode option to checkCssSpecificity', () => {
    vi.mocked(checkCssSpecificity).mockReturnValue({ issues: [] });

    handleStylingCall(
      'check_css_specificity',
      { code: '<my-button style="color:red"></my-button>', mode: 'html' },
      FAKE_CEM,
    );

    expect(vi.mocked(checkCssSpecificity)).toHaveBeenCalledWith(expect.any(String), {
      mode: 'html',
    });
  });

  it('returns error when code is missing', () => {
    const result = handleStylingCall('check_css_specificity', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_layout_patterns
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_layout_patterns', () => {
  it('calls checkLayoutPatterns and returns the result', () => {
    vi.mocked(checkLayoutPatterns).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_layout_patterns',
      { cssText: 'my-button { display: flex; }' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkLayoutPatterns)).toHaveBeenCalledWith('my-button { display: flex; }');
  });

  it('returns error when cssText is missing', () => {
    const result = handleStylingCall('check_layout_patterns', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_css_scope
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_css_scope', () => {
  it('calls checkCssScope and returns the result', () => {
    vi.mocked(checkCssScope).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_css_scope',
      { cssText: ':root { --my-button-color: red; }', tagName: 'my-button', cem: FAKE_CEM },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkCssScope)).toHaveBeenCalledWith(
      ':root { --my-button-color: red; }',
      'my-button',
      FAKE_CEM,
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('check_css_scope', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_css_shorthand
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_css_shorthand', () => {
  it('calls checkCssShorthand and returns the result', () => {
    vi.mocked(checkCssShorthand).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_css_shorthand',
      { cssText: 'my-button { border: 1px solid var(--my-color); }' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkCssShorthand)).toHaveBeenCalledWith(
      'my-button { border: 1px solid var(--my-color); }',
    );
  });

  it('returns error when cssText is missing', () => {
    const result = handleStylingCall('check_css_shorthand', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_color_contrast
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_color_contrast', () => {
  it('calls checkColorContrast and returns the result', () => {
    vi.mocked(checkColorContrast).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_color_contrast',
      { cssText: 'my-button { color: #fff; background: #f0f0f0; }' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkColorContrast)).toHaveBeenCalledWith(
      'my-button { color: #fff; background: #f0f0f0; }',
    );
  });

  it('returns error when cssText is missing', () => {
    const result = handleStylingCall('check_color_contrast', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_transition_animation
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_transition_animation', () => {
  it('calls checkTransitionAnimation and returns the result', () => {
    vi.mocked(checkTransitionAnimation).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_transition_animation',
      { cssText: 'my-button { transition: color 0.3s; }', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkTransitionAnimation)).toHaveBeenCalledWith(
      'my-button { transition: color 0.3s; }',
      'my-button',
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('check_transition_animation', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_shadow_dom_js
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_shadow_dom_js', () => {
  it('calls checkShadowDomJs and returns the result', () => {
    vi.mocked(checkShadowDomJs).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_shadow_dom_js',
      { codeText: 'el.shadowRoot.querySelector(".foo")' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkShadowDomJs)).toHaveBeenCalledWith(
      'el.shadowRoot.querySelector(".foo")',
      undefined,
    );
  });

  it('passes optional tagName to checkShadowDomJs', () => {
    vi.mocked(checkShadowDomJs).mockReturnValue({ issues: [] });

    handleStylingCall(
      'check_shadow_dom_js',
      { codeText: 'el.shadowRoot.querySelector(".foo")', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(vi.mocked(checkShadowDomJs)).toHaveBeenCalledWith(expect.any(String), 'my-button');
  });

  it('returns error when codeText is missing', () => {
    const result = handleStylingCall('check_shadow_dom_js', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_token_fallbacks
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_token_fallbacks', () => {
  it('calls checkTokenFallbacks and returns the result', () => {
    vi.mocked(checkTokenFallbacks).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_token_fallbacks',
      { cssText: 'my-button { color: var(--my-color); }', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkTokenFallbacks)).toHaveBeenCalledWith(
      'my-button { color: var(--my-color); }',
      'my-button',
      FAKE_CEM,
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('check_token_fallbacks', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — validate_component_code
// ---------------------------------------------------------------------------

describe('handleStylingCall — validate_component_code', () => {
  it('calls validateComponentCode and returns the result', () => {
    vi.mocked(validateComponentCode).mockReturnValue({ issues: [], passed: true });

    const result = handleStylingCall(
      'validate_component_code',
      { html: '<my-button></my-button>', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(validateComponentCode)).toHaveBeenCalledWith(
      expect.objectContaining({
        html: '<my-button></my-button>',
        tagName: 'my-button',
        cem: FAKE_CEM,
      }),
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.passed).toBe(true);
  });

  it('passes optional css, code, and framework args', () => {
    vi.mocked(validateComponentCode).mockReturnValue({ issues: [] });

    handleStylingCall(
      'validate_component_code',
      {
        html: '<my-button></my-button>',
        tagName: 'my-button',
        css: 'my-button { --color: red; }',
        code: 'el.addEventListener("my-click", fn)',
        framework: 'vue',
      },
      FAKE_CEM,
    );

    expect(vi.mocked(validateComponentCode)).toHaveBeenCalledWith(
      expect.objectContaining({ css: 'my-button { --color: red; }', framework: 'vue' }),
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('validate_component_code', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — resolve_css_api
// ---------------------------------------------------------------------------

describe('handleStylingCall — resolve_css_api', () => {
  it('calls resolveCssApi and returns the result', () => {
    vi.mocked(parseCem).mockReturnValue(FAKE_META);
    vi.mocked(resolveCssApi).mockReturnValue({ valid: [], invalid: [] });

    const result = handleStylingCall(
      'resolve_css_api',
      { cssText: 'my-button::part(base) {}', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(resolveCssApi)).toHaveBeenCalledWith(
      'my-button::part(base) {}',
      FAKE_META,
      undefined,
    );
  });

  it('passes optional htmlText to resolveCssApi', () => {
    vi.mocked(parseCem).mockReturnValue(FAKE_META);
    vi.mocked(resolveCssApi).mockReturnValue({ valid: [], invalid: [] });

    handleStylingCall(
      'resolve_css_api',
      {
        cssText: 'my-button::part(base) {}',
        tagName: 'my-button',
        htmlText: '<my-button slot="icon"></my-button>',
      },
      FAKE_CEM,
    );

    expect(vi.mocked(resolveCssApi)).toHaveBeenCalledWith(
      expect.any(String),
      FAKE_META,
      '<my-button slot="icon"></my-button>',
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('resolve_css_api', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — styling_preflight
// ---------------------------------------------------------------------------

describe('handleStylingCall — styling_preflight', () => {
  it('calls runStylingPreflight and returns the result', () => {
    vi.mocked(parseCem).mockReturnValue(FAKE_META);
    vi.mocked(runStylingPreflight).mockReturnValue({ passed: true, issues: [] });

    const result = handleStylingCall(
      'styling_preflight',
      { cssText: 'my-button::part(base) { color: red; }', tagName: 'my-button' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(runStylingPreflight)).toHaveBeenCalledWith({
      css: 'my-button::part(base) { color: red; }',
      html: undefined,
      meta: FAKE_META,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.passed).toBe(true);
  });

  it('passes optional htmlText to runStylingPreflight', () => {
    vi.mocked(parseCem).mockReturnValue(FAKE_META);
    vi.mocked(runStylingPreflight).mockReturnValue({ passed: true, issues: [] });

    handleStylingCall(
      'styling_preflight',
      {
        cssText: 'my-button::part(base) {}',
        tagName: 'my-button',
        htmlText: '<my-button></my-button>',
      },
      FAKE_CEM,
    );

    expect(vi.mocked(runStylingPreflight)).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<my-button></my-button>' }),
    );
  });

  it('returns error when required args are missing', () => {
    const result = handleStylingCall('styling_preflight', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — validate_css_file
// ---------------------------------------------------------------------------

describe('handleStylingCall — validate_css_file', () => {
  it('calls validateCssFile and returns the result', () => {
    vi.mocked(validateCssFile).mockReturnValue({ components: [], globalIssues: [] });

    const result = handleStylingCall(
      'validate_css_file',
      { cssText: 'my-button { --color: red; }\nmy-card::part(base) {}' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(validateCssFile)).toHaveBeenCalledWith(
      'my-button { --color: red; }\nmy-card::part(base) {}',
      FAKE_CEM,
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.globalIssues).toEqual([]);
  });

  it('returns error when cssText is missing', () => {
    const result = handleStylingCall('validate_css_file', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — check_dark_mode_patterns
// ---------------------------------------------------------------------------

describe('handleStylingCall — check_dark_mode_patterns', () => {
  it('calls checkDarkModePatterns and returns the result', () => {
    vi.mocked(checkDarkModePatterns).mockReturnValue({ issues: [] });

    const result = handleStylingCall(
      'check_dark_mode_patterns',
      { cssText: '.dark my-button { color: white; }' },
      FAKE_CEM,
    );

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(checkDarkModePatterns)).toHaveBeenCalledWith(
      '.dark my-button { color: white; }',
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.issues).toEqual([]);
  });

  it('returns error when cssText is missing', () => {
    const result = handleStylingCall('check_dark_mode_patterns', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleStylingCall — error propagation via handleToolError
// ---------------------------------------------------------------------------

describe('handleStylingCall — error propagation', () => {
  it('wraps MCPError category into the error message', () => {
    vi.mocked(parseCem).mockImplementation(() => {
      throw new MCPError('Component "bad-tag" not found in CEM.', ErrorCategory.NOT_FOUND);
    });

    const result = handleStylingCall('diagnose_styling', { tagName: 'bad-tag' }, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('NOT_FOUND');
    expect(result.content[0].text).toContain('bad-tag');
  });

  it('wraps generic Error thrown by a handler', () => {
    vi.mocked(checkShadowDomUsage).mockImplementation(() => {
      throw new Error('unexpected handler failure');
    });

    const result = handleStylingCall(
      'check_shadow_dom_usage',
      { cssText: 'some-css {}' },
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unexpected handler failure');
  });
});
