import { describe, it, expect } from 'vitest';
import {
  detectTokenPrefix,
  detectThemingApproach,
  detectDarkModeSupport,
  buildAntiPatterns,
  buildCssSnippet,
  diagnoseStyling,
} from '../../packages/core/src/handlers/styling-diagnostics.js';
import type { ComponentMetadata } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const buttonMeta: ComponentMetadata = {
  tagName: 'my-button',
  name: 'MyButton',
  description: 'A button component',
  members: [
    {
      name: 'variant',
      kind: 'field',
      type: "'primary' | 'secondary'",
      description: 'Button variant',
    },
    { name: 'disabled', kind: 'field', type: 'boolean', description: '' },
  ],
  events: [{ name: 'my-click', type: 'CustomEvent', description: 'Click event' }],
  slots: [
    { name: '', description: 'Default slot' },
    { name: 'prefix', description: 'Prefix icon' },
  ],
  cssProperties: [
    { name: '--my-button-bg', description: 'Background color' },
    { name: '--my-button-color', description: 'Text color' },
    { name: '--my-button-border-radius', description: 'Border radius' },
    { name: '--my-button-padding', description: '' },
  ],
  cssParts: [
    { name: 'base', description: 'The button element' },
    { name: 'label', description: 'Label container' },
    { name: 'spinner', description: 'Loading spinner' },
  ],
};

const bareComponent: ComponentMetadata = {
  tagName: 'my-divider',
  name: 'MyDivider',
  description: 'A divider',
  members: [],
  events: [],
  slots: [],
  cssProperties: [],
  cssParts: [],
};

const propsOnlyComponent: ComponentMetadata = {
  tagName: 'my-badge',
  name: 'MyBadge',
  description: 'A badge',
  members: [],
  events: [],
  slots: [],
  cssProperties: [
    { name: '--my-badge-bg', description: 'Background' },
    { name: '--my-badge-color', description: 'Text color' },
  ],
  cssParts: [],
};

const partsOnlyComponent: ComponentMetadata = {
  tagName: 'my-tooltip',
  name: 'MyTooltip',
  description: 'A tooltip',
  members: [],
  events: [],
  slots: [{ name: '', description: 'Trigger content' }],
  cssProperties: [],
  cssParts: [
    { name: 'base', description: 'Wrapper' },
    { name: 'body', description: 'Tooltip body' },
  ],
};

const darkModeComponent: ComponentMetadata = {
  tagName: 'my-theme-toggle',
  name: 'MyThemeToggle',
  description: 'Theme toggle',
  members: [
    { name: 'dark', kind: 'field', type: 'boolean', description: 'Dark mode' },
    { name: 'colorScheme', kind: 'field', type: 'string', description: '' },
  ],
  events: [],
  slots: [],
  cssProperties: [
    { name: '--my-theme-dark-bg', description: 'Dark background' },
    { name: '--my-theme-light-bg', description: 'Light background' },
  ],
  cssParts: [],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('detectTokenPrefix', () => {
  it('detects common prefix from CSS properties', () => {
    expect(detectTokenPrefix(buttonMeta.cssProperties)).toBe('--my-button-');
  });

  it('returns null for empty properties', () => {
    expect(detectTokenPrefix([])).toBeNull();
  });

  it('detects single-segment prefix like --sl-', () => {
    const props = [
      { name: '--sl-color-primary', description: '' },
      { name: '--sl-font-size', description: '' },
      { name: '--sl-spacing-md', description: '' },
    ];
    expect(detectTokenPrefix(props)).toBe('--sl-');
  });

  it('detects multi-segment prefix', () => {
    const props = [
      { name: '--my-card-bg', description: '' },
      { name: '--my-card-border', description: '' },
    ];
    expect(detectTokenPrefix(props)).toBe('--my-card-');
  });

  it('handles single property', () => {
    const props = [{ name: '--hx-button-bg', description: '' }];
    // Single property — entire name becomes the "prefix" (all segments match)
    expect(detectTokenPrefix(props)).toBe('--hx-button-bg-');
  });
});

describe('detectThemingApproach', () => {
  it('returns "mixed" when both tokens and parts exist', () => {
    expect(detectThemingApproach(buttonMeta)).toBe('mixed');
  });

  it('returns "token-based" when only tokens exist', () => {
    expect(detectThemingApproach(propsOnlyComponent)).toBe('token-based');
  });

  it('returns "parts-based" when only parts exist', () => {
    expect(detectThemingApproach(partsOnlyComponent)).toBe('parts-based');
  });

  it('returns "none" when neither exist', () => {
    expect(detectThemingApproach(bareComponent)).toBe('none');
  });
});

describe('detectDarkModeSupport', () => {
  it('detects dark mode indicators from property names', () => {
    const result = detectDarkModeSupport(darkModeComponent);
    expect(result.detected).toBe(true);
    expect(result.approach).toBe('property-names');
    expect(result.indicators.length).toBeGreaterThan(0);
  });

  it('detects dark mode from member names', () => {
    const result = detectDarkModeSupport(darkModeComponent);
    expect(result.indicators.some((i) => i.includes('dark'))).toBe(true);
  });

  it('returns no detection for components without dark mode hints', () => {
    const result = detectDarkModeSupport(bareComponent);
    expect(result.detected).toBe(false);
    expect(result.approach).toBe('none');
    expect(result.indicators).toEqual([]);
  });

  it('detects from descriptions mentioning theming', () => {
    const meta: ComponentMetadata = {
      ...bareComponent,
      cssProperties: [{ name: '--my-bg', description: 'Adapts to dark mode automatically' }],
    };
    const result = detectDarkModeSupport(meta);
    expect(result.detected).toBe(true);
  });
});

describe('buildAntiPatterns', () => {
  it('generates shadow pierce warning', () => {
    const warnings = buildAntiPatterns(buttonMeta);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.pattern).toContain('my-button');
    expect(warnings[0]!.explanation).toContain('Shadow DOM');
  });

  it('generates ::slotted() warning when slots exist', () => {
    const warnings = buildAntiPatterns(buttonMeta);
    const slottedWarning = warnings.find((w) => w.pattern.includes('::slotted'));
    expect(slottedWarning).toBeDefined();
  });

  it('generates ::part() descendant warning when parts exist', () => {
    const warnings = buildAntiPatterns(buttonMeta);
    const partWarning = warnings.find((w) => w.pattern.includes('::part'));
    expect(partWarning).toBeDefined();
    expect(partWarning!.explanation).toContain('descendant');
  });

  it('skips slot warning when no slots', () => {
    const warnings = buildAntiPatterns(bareComponent);
    const slottedWarning = warnings.find((w) => w.pattern.includes('::slotted'));
    expect(slottedWarning).toBeUndefined();
  });

  it('skips part warning when no parts', () => {
    const warnings = buildAntiPatterns(propsOnlyComponent);
    const partWarning = warnings.find(
      (w) => w.pattern.includes('::part') && w.explanation.includes('descendant'),
    );
    expect(partWarning).toBeUndefined();
  });

  it('includes font inheritance warning when slots exist', () => {
    const warnings = buildAntiPatterns(buttonMeta);
    const inheritWarning = warnings.find((w) => w.explanation.includes('inherit'));
    expect(inheritWarning).toBeDefined();
    expect(inheritWarning!.explanation).toContain('font');
  });

  it('skips font inheritance warning when no slots', () => {
    const warnings = buildAntiPatterns(bareComponent);
    const inheritWarning = warnings.find((w) => w.explanation.includes('inherit'));
    expect(inheritWarning).toBeUndefined();
  });
});

describe('buildCssSnippet', () => {
  it('includes token customization for components with CSS properties', () => {
    const snippet = buildCssSnippet(buttonMeta);
    expect(snippet).toContain('Token customization');
    expect(snippet).toContain('--my-button-bg');
  });

  it('does NOT generate self-referential var() in token customization', () => {
    const snippet = buildCssSnippet(buttonMeta);
    // Should NOT contain --my-button-bg: var(--my-button-bg) — that's circular
    expect(snippet).not.toMatch(/--my-button-bg:\s*var\(--my-button-bg\)/);
    // Should contain a direct value assignment
    expect(snippet).toMatch(/--my-button-bg:\s*[^v]/);
  });

  it('uses CEM default value when available', () => {
    const metaWithDefaults: ComponentMetadata = {
      ...bareComponent,
      cssProperties: [
        { name: '--my-card-bg', description: 'Background', default: '#ffffff' },
        { name: '--my-card-radius', description: 'Radius', default: '4px' },
      ],
    };
    const snippet = buildCssSnippet(metaWithDefaults);
    expect(snippet).toContain('#ffffff');
    expect(snippet).toContain('4px');
  });

  it('includes part customization for components with CSS parts', () => {
    const snippet = buildCssSnippet(buttonMeta);
    expect(snippet).toContain('Part-based customization');
    expect(snippet).toContain('::part(base)');
  });

  it('includes slot styling section when component has slots', () => {
    const snippet = buildCssSnippet(buttonMeta);
    expect(snippet).toContain('Slot styling');
    expect(snippet).toContain('light DOM');
  });

  it('includes named slot selector example', () => {
    const snippet = buildCssSnippet(buttonMeta);
    expect(snippet).toContain('[slot="prefix"]');
  });

  it('includes default slot child selector example', () => {
    const snippet = buildCssSnippet(buttonMeta);
    // Default slot: style children of the host
    expect(snippet).toContain('my-button >');
  });

  it('skips slot section for components without slots', () => {
    const snippet = buildCssSnippet(bareComponent);
    expect(snippet).not.toContain('Slot styling');
  });

  it('generates fallback message for bare components', () => {
    const snippet = buildCssSnippet(bareComponent);
    expect(snippet).toContain('no CSS customization');
  });

  it('limits to 5 properties and 3 parts', () => {
    const manyProps: ComponentMetadata = {
      ...bareComponent,
      cssProperties: Array.from({ length: 10 }, (_, i) => ({
        name: `--prop-${i}`,
        description: `Property ${i}`,
      })),
      cssParts: Array.from({ length: 6 }, (_, i) => ({
        name: `part-${i}`,
        description: `Part ${i}`,
      })),
    };
    const snippet = buildCssSnippet(manyProps);
    // Should not contain --prop-5 through --prop-9
    expect(snippet).not.toContain('--prop-5');
    // Should have at most 3 parts listed
    const partMatches = snippet.match(/::part\(/g);
    expect(partMatches!.length).toBeLessThanOrEqual(3);
  });
});

describe('diagnoseStyling (integration)', () => {
  it('returns full diagnostics for a component with tokens and parts', () => {
    const result = diagnoseStyling(buttonMeta);
    expect(result.tagName).toBe('my-button');
    expect(result.tokenPrefix).toBe('--my-button-');
    expect(result.themingApproach).toBe('mixed');
    expect(result.darkModeSupport.detected).toBe(false);
    expect(result.antiPatterns.length).toBeGreaterThan(0);
    expect(result.cssSnippet).toContain('my-button');
    expect(result.customizationSummary).toEqual({
      cssPropertyCount: 4,
      cssPartCount: 3,
      slotCount: 2,
      hasTokens: true,
      hasParts: true,
      hasSlots: true,
    });
  });

  it('handles bare component gracefully', () => {
    const result = diagnoseStyling(bareComponent);
    expect(result.tagName).toBe('my-divider');
    expect(result.tokenPrefix).toBeNull();
    expect(result.themingApproach).toBe('none');
    expect(result.customizationSummary.hasTokens).toBe(false);
    expect(result.customizationSummary.hasParts).toBe(false);
  });

  it('detects dark mode in themed component', () => {
    const result = diagnoseStyling(darkModeComponent);
    expect(result.darkModeSupport.detected).toBe(true);
  });
});
