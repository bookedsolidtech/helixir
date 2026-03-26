import { describe, it, expect } from 'vitest';
import { recommendChecks } from '../../packages/core/src/handlers/recommend-checks.js';

// ─── HTML-only code ─────────────────────────────────────────────────────────

describe('recommendChecks — HTML code', () => {
  it('recommends HTML validators for HTML with web components', () => {
    const code = `<sl-button variant="primary">Click me</sl-button>`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('check_html_usage');
    expect(result.recommended).toContain('check_component_imports');
    expect(result.recommended).toContain('check_a11y_usage');
  });

  it('recommends composition checks for compound components', () => {
    const code = `<sl-tab-group>
  <sl-tab slot="nav" panel="one">Tab 1</sl-tab>
  <sl-tab-panel name="one">Content</sl-tab-panel>
</sl-tab-group>`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('check_composition');
  });

  it('recommends slot children checks for nested components', () => {
    const code = `<sl-select>
  <sl-option value="1">One</sl-option>
</sl-select>`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('check_slot_children');
  });
});

// ─── CSS code ───────────────────────────────────────────────────────────────

describe('recommendChecks — CSS code', () => {
  it('recommends CSS validators for CSS targeting components', () => {
    const code = `sl-button {
  --sl-button-color: red;
}`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('check_shadow_dom_usage');
    expect(result.recommended).toContain('check_css_vars');
    expect(result.recommended).toContain('check_theme_compatibility');
  });

  it('recommends token fallback check when var() is used', () => {
    const code = `sl-button {
  --sl-button-color: var(--app-color);
}`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('check_token_fallbacks');
  });

  it('recommends styling_preflight as first CSS-specific check', () => {
    const code = `sl-button { --sl-button-color: red; }`;
    const result = recommendChecks(code);
    const cssIdx = result.recommended.indexOf('styling_preflight');
    const shadowIdx = result.recommended.indexOf('check_shadow_dom_usage');
    expect(cssIdx).toBeGreaterThan(-1);
    expect(cssIdx).toBeLessThan(shadowIdx);
  });

  it('recommends check_dark_mode_patterns for dark mode CSS', () => {
    const code = `.dark sl-button { --sl-button-color: red; }`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('check_dark_mode_patterns');
  });

  it('recommends check_dark_mode_patterns for prefers-color-scheme CSS', () => {
    const code = `@media (prefers-color-scheme: dark) {
  sl-button { --sl-button-color: red; }
}`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('check_dark_mode_patterns');
  });

  it('does not recommend check_dark_mode_patterns for non-theme CSS', () => {
    const code = `sl-button { --sl-button-color: red; }`;
    const result = recommendChecks(code);
    expect(result.recommended).not.toContain('check_dark_mode_patterns');
  });
});

// ─── JavaScript code ────────────────────────────────────────────────────────

describe('recommendChecks — JavaScript code', () => {
  it('recommends method checks for JS with component API calls', () => {
    const code = `const dialog = document.querySelector('sl-dialog');
dialog.show();`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('check_method_calls');
  });

  it('recommends event checks for event listener code', () => {
    const code = `button.addEventListener('sl-click', handler);`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('check_event_usage');
  });
});

// ─── JSX/React code ─────────────────────────────────────────────────────────

describe('recommendChecks — JSX code', () => {
  it('recommends event checks for React JSX with event handlers', () => {
    const code = `<sl-button onSlClick={handler}>Click</sl-button>`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('check_event_usage');
    expect(result.recommended).toContain('check_html_usage');
  });
});

// ─── Always recommends aggregator ───────────────────────────────────────────

describe('recommendChecks — aggregator', () => {
  it('always recommends validate_component_code as the first option', () => {
    const code = `<sl-button>Click</sl-button>`;
    const result = recommendChecks(code);
    expect(result.recommended[0]).toBe('validate_component_code');
  });

  it('always recommends get_component_quick_ref', () => {
    const code = `<sl-button>Click</sl-button>`;
    const result = recommendChecks(code);
    expect(result.recommended).toContain('get_component_quick_ref');
  });
});

// ─── Result structure ───────────────────────────────────────────────────────

describe('recommendChecks — result structure', () => {
  it('includes detected code type', () => {
    const code = `<sl-button>Click</sl-button>`;
    const result = recommendChecks(code);
    expect(result.codeType).toContain('html');
  });

  it('includes detected component tags', () => {
    const code = `<sl-button>Click</sl-button><sl-icon name="gear"></sl-icon>`;
    const result = recommendChecks(code);
    expect(result.detectedTags).toContain('sl-button');
    expect(result.detectedTags).toContain('sl-icon');
  });
});
