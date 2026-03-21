/**
 * Styling Diagnostics — generates Shadow DOM styling guidance per component.
 *
 * Analyzes CEM data to produce:
 * - Token prefix detection
 * - Theming approach classification
 * - Dark mode support heuristics
 * - Anti-pattern warnings
 * - Correct CSS usage snippets
 */

import type { ComponentMetadata } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StylingDiagnostics {
  tagName: string;
  tokenPrefix: string | null;
  themingApproach: ThemingApproach;
  darkModeSupport: DarkModeSupport;
  antiPatterns: AntiPatternWarning[];
  cssSnippet: string;
  customizationSummary: CustomizationSummary;
}

export type ThemingApproach = 'token-based' | 'parts-based' | 'mixed' | 'none';

export interface DarkModeSupport {
  detected: boolean;
  indicators: string[];
  approach: 'token-hints' | 'property-names' | 'none';
}

export interface AntiPatternWarning {
  pattern: string;
  explanation: string;
  correctApproach: string;
}

export interface CustomizationSummary {
  cssPropertyCount: number;
  cssPartCount: number;
  slotCount: number;
  hasTokens: boolean;
  hasParts: boolean;
  hasSlots: boolean;
}

// ─── Token Prefix Detection ──────────────────────────────────────────────────

/**
 * Detects a common prefix from CSS custom property names.
 * e.g., `--sl-button-bg`, `--sl-button-color` → `--sl-`
 *       `--my-card-bg`, `--my-card-border` → `--my-`
 */
export function detectTokenPrefix(
  cssProperties: Array<{ name: string; description: string }>,
): string | null {
  if (cssProperties.length === 0) return null;

  // Split each property name (without leading --) into segments by '-'
  const segmentArrays = cssProperties.map((p) => p.name.replace(/^--/, '').split('-'));

  const first = segmentArrays[0];
  if (!first || first.length === 0) return null;

  // Find the longest common prefix of segments
  let commonLen = 0;
  for (let i = 0; i < first.length; i++) {
    const segment = first[i];
    if (segmentArrays.every((segs) => segs[i] === segment)) {
      commonLen = i + 1;
    } else {
      break;
    }
  }

  if (commonLen === 0) return null;
  return '--' + first.slice(0, commonLen).join('-') + '-';
}

// ─── Theming Approach Detection ──────────────────────────────────────────────

/**
 * Classifies the component's theming approach based on available CEM data.
 */
export function detectThemingApproach(meta: ComponentMetadata): ThemingApproach {
  const hasTokens = meta.cssProperties.length > 0;
  const hasParts = meta.cssParts.length > 0;

  if (hasTokens && hasParts) return 'mixed';
  if (hasTokens) return 'token-based';
  if (hasParts) return 'parts-based';
  return 'none';
}

// ─── Dark Mode Support Detection ─────────────────────────────────────────────

/**
 * Heuristically detects dark mode support from CSS property names and descriptions.
 */
export function detectDarkModeSupport(meta: ComponentMetadata): DarkModeSupport {
  const indicators: string[] = [];
  const darkPatterns = /dark|light|theme|color-scheme|scheme/i;

  for (const prop of meta.cssProperties) {
    if (darkPatterns.test(prop.name)) {
      indicators.push(`Property "${prop.name}" suggests theme awareness`);
    }
    if (darkPatterns.test(prop.description)) {
      indicators.push(`Property "${prop.name}" description mentions theming`);
    }
  }

  // Check members for dark-mode related properties
  for (const member of meta.members) {
    if (/dark|theme|colorScheme/i.test(member.name)) {
      indicators.push(`Member "${member.name}" suggests dark mode support`);
    }
  }

  if (indicators.length === 0) {
    return { detected: false, indicators: [], approach: 'none' };
  }

  const hasPropertyNames = meta.cssProperties.some((p) => darkPatterns.test(p.name));

  return {
    detected: true,
    indicators,
    approach: hasPropertyNames ? 'property-names' : 'token-hints',
  };
}

// ─── Anti-Pattern Warnings ───────────────────────────────────────────────────

/**
 * Builds Shadow DOM anti-pattern warnings tailored to this component.
 */
export function buildAntiPatterns(meta: ComponentMetadata): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];
  const tag = meta.tagName;

  // Always warn about descendant selectors
  warnings.push({
    pattern: `${tag} .internal-class { ... }`,
    explanation:
      'CSS selectors cannot cross Shadow DOM boundaries. Descendant selectors targeting internal elements will have no effect.',
    correctApproach:
      meta.cssParts.length > 0
        ? `Use ::part() selectors: ${tag}::part(${meta.cssParts[0]?.name ?? 'base'}) { ... }`
        : `Use CSS custom properties: ${tag} { ${meta.cssProperties.length > 0 ? (meta.cssProperties[0]?.name ?? '--custom-prop') + ': value' : '--custom-prop: value'} }`,
  });

  // Warn about ::slotted() misuse
  if (meta.slots.length > 0) {
    warnings.push({
      pattern: `${tag}::slotted(div) { ... } /* in consumer CSS */`,
      explanation:
        "::slotted() selectors only work inside the Shadow DOM host's stylesheet, not in consumer CSS.",
      correctApproach:
        'Style slotted content directly in your page CSS by targeting the elements themselves before they are slotted in.',
    });
    warnings.push({
      pattern: `::slotted(div.foo) { ... } or ::slotted(div) span { ... }`,
      explanation:
        '::slotted() only accepts simple selectors (one element, class, or attribute). Compound selectors and descendant selectors after ::slotted() are invalid.',
      correctApproach:
        'Use ::slotted(div) or ::slotted(.my-class) — one simple selector only. To style children of slotted content, use light DOM CSS.',
    });
  }

  // Warn about :host misuse in consumer CSS
  warnings.push({
    pattern: `:host { ... } or :host-context(.theme) { ... } /* in consumer CSS */`,
    explanation:
      ':host and :host-context() only work inside a shadow root stylesheet. They have no effect in consumer CSS.',
    correctApproach: `Target the component by tag name instead: ${tag} { display: block; }`,
  });

  // Warn about ::part() descendant selectors
  if (meta.cssParts.length > 0) {
    warnings.push({
      pattern: `${tag}::part(${meta.cssParts[0]?.name ?? 'base'}) span { ... }`,
      explanation:
        '::part() cannot be followed by descendant selectors. You can only style the part element itself, not its children.',
      correctApproach: `${tag}::part(${meta.cssParts[0]?.name ?? 'base'}) { /* direct styles only */ }`,
    });
  }

  // Warn about font vs layout inheritance through slots
  if (meta.slots.length > 0) {
    warnings.push({
      pattern: `${tag}::slotted(div) { margin: 10px; } /* expecting layout to inherit */`,
      explanation:
        'Slotted content inherits font styles (color, font-size, line-height) from the shadow DOM, but layout properties (margin, padding, display, width) must be set in light DOM CSS — they do not inherit through the shadow boundary.',
      correctApproach: `Style layout in light DOM CSS: ${tag} > div { margin: 10px; }. Font properties like color and font-size will inherit from the component's shadow DOM automatically.`,
    });
  }

  return warnings;
}

// ─── CSS Snippet Generation ──────────────────────────────────────────────────

/**
 * Generates a correct CSS usage snippet for the component.
 */
export function buildCssSnippet(meta: ComponentMetadata): string {
  const lines: string[] = [];
  const tag = meta.tagName;

  // Token customization section — show how to OVERRIDE custom properties
  if (meta.cssProperties.length > 0) {
    lines.push(`/* Token customization — override on the component host */`);
    lines.push(`${tag} {`);
    for (const prop of meta.cssProperties.slice(0, 5)) {
      const value = prop.default ?? guessDefaultValue(prop.name);
      const comment = prop.description ? ` /* ${prop.description} */` : '';
      lines.push(`  ${prop.name}: ${value};${comment}`);
    }
    lines.push(`}`);
  }

  // Parts customization section
  if (meta.cssParts.length > 0) {
    lines.push('');
    lines.push(`/* Part-based customization */`);
    for (const part of meta.cssParts.slice(0, 3)) {
      const desc = part.description ? ` /* ${part.description} */` : '';
      lines.push(`${tag}::part(${part.name}) {${desc}`);
      lines.push(`  /* Add styles here */`);
      lines.push(`}`);
    }
  }

  // Slot styling section — show how to style slotted content in light DOM
  if (meta.slots.length > 0) {
    lines.push('');
    lines.push(`/* Slot styling — target slotted elements in light DOM CSS */`);
    const hasDefaultSlot = meta.slots.some((s) => s.name === '');
    const namedSlots = meta.slots.filter((s) => s.name !== '');

    if (hasDefaultSlot) {
      lines.push(`${tag} > * { /* styles for default slot content */ }`);
    }
    for (const slot of namedSlots.slice(0, 3)) {
      const desc = slot.description ? ` /* ${slot.description} */` : '';
      lines.push(`${tag} [slot="${slot.name}"] { ${desc.trim()} }`);
    }
    lines.push(`/* Note: slotted content inherits font styles (color, font-size)`);
    lines.push(`   from the shadow DOM, but layout (margin, padding, display)`);
    lines.push(`   must be set here in light DOM CSS. */`);
  }

  if (lines.length === 0) {
    lines.push(`/* ${tag} exposes no CSS customization points in its CEM. */`);
    lines.push(`/* Check the component documentation for styling options. */`);
  }

  return lines.join('\n');
}

/**
 * Guesses a sensible placeholder value based on CSS property name patterns.
 * Used when the CEM doesn't specify a default value.
 */
function guessDefaultValue(propName: string): string {
  const lower = propName.toLowerCase();
  if (/color|bg|background/.test(lower)) return '#value';
  if (/size|font/.test(lower)) return '1rem';
  if (/radius/.test(lower)) return '4px';
  if (/spacing|padding|margin|gap/.test(lower)) return '1rem';
  if (/shadow/.test(lower)) return '0 1px 2px rgba(0,0,0,.1)';
  if (/weight/.test(lower)) return '400';
  if (/width|height/.test(lower)) return 'auto';
  if (/opacity/.test(lower)) return '1';
  return '#value';
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Produces a full styling diagnostics report for a component.
 */
export function diagnoseStyling(meta: ComponentMetadata): StylingDiagnostics {
  const tokenPrefix = detectTokenPrefix(meta.cssProperties);
  const themingApproach = detectThemingApproach(meta);
  const darkModeSupport = detectDarkModeSupport(meta);
  const antiPatterns = buildAntiPatterns(meta);
  const cssSnippet = buildCssSnippet(meta);

  return {
    tagName: meta.tagName,
    tokenPrefix,
    themingApproach,
    darkModeSupport,
    antiPatterns,
    cssSnippet,
    customizationSummary: {
      cssPropertyCount: meta.cssProperties.length,
      cssPartCount: meta.cssParts.length,
      slotCount: meta.slots.length,
      hasTokens: meta.cssProperties.length > 0,
      hasParts: meta.cssParts.length > 0,
      hasSlots: meta.slots.length > 0,
    },
  };
}
