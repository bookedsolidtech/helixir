/**
 * Theme Scaffolding — generates complete enterprise theme definitions and
 * per-component token application maps from CEM analysis.
 *
 * Provides:
 * 1. createTheme — scaffolds a complete CSS theme file (light + dark mode)
 *    using token patterns detected by detect_theme_support
 * 2. applyThemeTokens — maps a theme token definition to specific components,
 *    generating per-component CSS override blocks
 */

import type { Cem } from './cem.js';
import { detectThemeSupport, categorizeTokens } from './theme-detection.js';
import type { ThemeSupportResult } from './theme-detection.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateThemeOptions {
  /** Display name for the theme (used in CSS class names). Defaults to "theme". */
  themeName?: string;
  /** Override the detected token prefix. When omitted, uses the CEM-detected prefix. */
  prefix?: string;
}

export interface CreateThemeResult {
  /** The theme name used in class selectors (e.g. "brand" → ".brand-light", ".brand-dark"). */
  themeName: string;
  /** The CSS custom property prefix detected or provided (e.g. "--hx-"). */
  prefix: string;
  /** Total number of tokens included in the scaffold. */
  tokenCount: number;
  /** Count of tokens per category. */
  categories: Record<string, number>;
  /** CSS block for light mode variables only (`:root, .theme-light { ... }`). */
  lightModeCSS: string;
  /** CSS block for dark mode variables only (`@media` + `.theme-dark { ... }`). */
  darkModeCSS: string;
  /** Complete CSS file content with header comment, light, and dark mode blocks. */
  fullThemeCSS: string;
  /** Raw detect_theme_support analysis used to build the scaffold. */
  detectionAnalysis: ThemeSupportResult;
}

export interface ComponentTokenApplication {
  /** Component tag name (e.g. "hx-button"). */
  tagName: string;
  /** Number of CSS properties on this component matched by the theme token map. */
  matchedTokens: number;
  /** Total CSS custom properties this component exposes. */
  totalCssProperties: number;
  /**
   * Ready-to-paste CSS block applying matched tokens to this component.
   * Empty string when matchedTokens === 0.
   */
  cssBlock: string;
}

export interface ApplyThemeTokensResult {
  /** Total components processed (after optional tagNames filter). */
  totalComponents: number;
  /** Total matched token applications across all components. */
  totalMatches: number;
  /** `:root` block applying all theme tokens globally. */
  globalCSS: string;
  /** Per-component CSS application details. */
  components: ComponentTokenApplication[];
}

// ─── Light-mode placeholder values ──────────────────────────────────────────

function lightPlaceholder(tokenName: string, category: string): string {
  const lower = tokenName.toLowerCase();

  switch (category) {
    case 'color':
      if (/background|surface|bg\b/.test(lower)) return '#ffffff';
      if (/\btext\b|foreground|fg\b/.test(lower)) return '#1a1a1a';
      if (/border/.test(lower)) return '#e2e8f0';
      if (/primary/.test(lower)) return '#0066cc';
      if (/secondary/.test(lower)) return '#6b7280';
      if (/danger|error/.test(lower)) return '#dc2626';
      if (/success/.test(lower)) return '#16a34a';
      if (/warning/.test(lower)) return '#d97706';
      if (/info/.test(lower)) return '#0891b2';
      if (/neutral|muted/.test(lower)) return '#94a3b8';
      return '#000000';

    case 'spacing':
      if (/xs/.test(lower)) return '0.25rem';
      if (/sm\b/.test(lower)) return '0.5rem';
      if (/\bmd\b/.test(lower)) return '1rem';
      if (/lg\b/.test(lower)) return '1.5rem';
      if (/xl/.test(lower)) return '2rem';
      return '1rem';

    case 'typography':
      if (/family/.test(lower)) return 'system-ui, sans-serif';
      if (/weight/.test(lower)) {
        if (/bold/.test(lower)) return '700';
        if (/light/.test(lower)) return '300';
        return '400';
      }
      if (/size/.test(lower)) {
        if (/xs/.test(lower)) return '0.75rem';
        if (/sm\b/.test(lower)) return '0.875rem';
        if (/lg\b/.test(lower)) return '1.125rem';
        if (/xl/.test(lower)) return '1.25rem';
        return '1rem';
      }
      if (/line-height/.test(lower)) return '1.5';
      if (/letter-spacing/.test(lower)) return '0em';
      return '1rem';

    case 'borderRadius':
      if (/none/.test(lower)) return '0';
      if (/xs/.test(lower)) return '0.125rem';
      if (/sm\b/.test(lower)) return '0.25rem';
      if (/\bmd\b/.test(lower)) return '0.375rem';
      if (/lg\b/.test(lower)) return '0.5rem';
      if (/xl/.test(lower)) return '0.75rem';
      if (/full|pill/.test(lower)) return '9999px';
      return '0.25rem';

    case 'elevation':
      if (/none/.test(lower)) return 'none';
      if (/sm\b/.test(lower)) return '0 1px 2px rgba(0, 0, 0, 0.05)';
      if (/\bmd\b/.test(lower)) return '0 4px 6px rgba(0, 0, 0, 0.1)';
      if (/lg\b/.test(lower)) return '0 10px 15px rgba(0, 0, 0, 0.1)';
      return '0 1px 3px rgba(0, 0, 0, 0.1)';

    case 'zIndex':
      if (/modal|dialog/.test(lower)) return '1000';
      if (/tooltip|popover/.test(lower)) return '900';
      if (/dropdown|menu/.test(lower)) return '800';
      if (/sticky|fixed/.test(lower)) return '100';
      return '1';

    case 'animation':
      if (/duration/.test(lower)) {
        if (/fast/.test(lower)) return '100ms';
        if (/slow/.test(lower)) return '500ms';
        return '200ms';
      }
      if (/easing|timing/.test(lower)) return 'ease-in-out';
      return '200ms';

    default:
      return '/* TODO: set value */';
  }
}

// ─── Dark-mode placeholder values ────────────────────────────────────────────

function darkPlaceholder(tokenName: string, category: string, lightValue: string): string {
  if (category !== 'color') return lightValue;

  const lower = tokenName.toLowerCase();

  if (/background|surface|bg\b/.test(lower)) return '#1a1a1a';
  if (/\btext\b|foreground|fg\b/.test(lower)) return '#f1f5f9';
  if (/border/.test(lower)) return '#334155';
  if (/primary/.test(lower)) return '#3b82f6';
  if (/secondary/.test(lower)) return '#9ca3af';
  if (/danger|error/.test(lower)) return '#f87171';
  if (/success/.test(lower)) return '#4ade80';
  if (/warning/.test(lower)) return '#fbbf24';
  if (/info/.test(lower)) return '#38bdf8';
  if (/neutral|muted/.test(lower)) return '#64748b';

  return lightValue;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a complete enterprise theme scaffold from a CEM analysis.
 *
 * Uses detect_theme_support patterns to discover the token prefix and
 * categories, then produces a ready-to-customize CSS file with:
 * - Light mode token values under `:root` and `.{themeName}-light`
 * - Dark mode overrides via `@media (prefers-color-scheme: dark)` and `.{themeName}-dark`
 * - `color-scheme` declarations for proper browser dark mode integration
 */
export function createTheme(cem: Cem, options: CreateThemeOptions = {}): CreateThemeResult {
  const analysis = detectThemeSupport(cem);
  const cats = categorizeTokens(cem);

  const prefix = options.prefix ?? analysis.tokenPrefix;
  const themeName = options.themeName ?? 'theme';

  // Collect all tokens with their categories (excluding empty categories)
  type TokenEntry = { name: string; category: string };
  const allTokens: TokenEntry[] = [];
  for (const [category, tokens] of Object.entries(cats)) {
    for (const name of tokens) {
      allTokens.push({ name, category });
    }
  }

  // Compute light/dark placeholder values per token
  const lightValues: Map<string, string> = new Map();
  const darkValues: Map<string, string> = new Map();

  for (const { name, category } of allTokens) {
    const light = lightPlaceholder(name, category);
    lightValues.set(name, light);
    const dark = darkPlaceholder(name, category, light);
    if (dark !== light) darkValues.set(name, dark);
  }

  const tokenCount = allTokens.length;

  // Per-category counts for result metadata
  const categories: Record<string, number> = {};
  for (const [cat, tokens] of Object.entries(cats)) {
    if (tokens.length > 0) categories[cat] = tokens.length;
  }

  // ─── Light mode CSS ────────────────────────────────────────────────────────

  const lightLines = allTokens.map(({ name }) => `  ${name}: ${lightValues.get(name)};`).join('\n');
  const lightModeCSS = `:root,\n.${themeName}-light {\n  color-scheme: light;\n${lightLines}\n}`;

  // ─── Dark mode CSS ─────────────────────────────────────────────────────────

  let darkModeCSS = '';
  if (darkValues.size > 0) {
    const darkLines = allTokens
      .filter(({ name }) => darkValues.has(name))
      .map(({ name }) => `  ${name}: ${darkValues.get(name)};`)
      .join('\n');

    const darkLinesIndented = darkLines
      .split('\n')
      .map((l) => '  ' + l)
      .join('\n');

    darkModeCSS =
      `@media (prefers-color-scheme: dark) {\n  :root {\n    color-scheme: dark;\n${darkLinesIndented}\n  }\n}\n\n` +
      `.${themeName}-dark {\n  color-scheme: dark;\n${darkLines}\n}`;
  }

  // ─── Full theme CSS file ───────────────────────────────────────────────────

  const categoryOrder = [
    'color',
    'spacing',
    'typography',
    'borderRadius',
    'elevation',
    'zIndex',
    'animation',
    'other',
  ] as const;

  const lightCategoryBlocks = categoryOrder
    .filter((cat) => (cats[cat]?.length ?? 0) > 0)
    .map((cat) => {
      const label = cat === 'borderRadius' ? 'Border Radius' : cat.charAt(0).toUpperCase() + cat.slice(1);
      const tokenLines = (cats[cat] ?? [])
        .map((name) => `  ${name}: ${lightValues.get(name)};`)
        .join('\n');
      return `  /* ── ${label} ──────────────────────────── */\n${tokenLines}`;
    })
    .join('\n\n');

  let fullThemeCSS =
    `/**\n` +
    ` * ${themeName} Theme\n` +
    ` * Generated by helixir create_theme\n` +
    ` *\n` +
    ` * Usage:\n` +
    ` *   Light mode: add class "${themeName}-light" to <html> (or use the :root default)\n` +
    ` *   Dark mode:  add class "${themeName}-dark" to <html> for manual control,\n` +
    ` *               or let prefers-color-scheme apply it automatically\n` +
    ` */\n\n`;

  fullThemeCSS +=
    `:root,\n.${themeName}-light {\n  color-scheme: light;\n\n${lightCategoryBlocks}\n}\n\n`;

  if (darkValues.size > 0) {
    const darkCategoryBlocks = categoryOrder
      .filter((cat) => (cats[cat] ?? []).some((name) => darkValues.has(name)))
      .map((cat) => {
        const label = cat === 'borderRadius' ? 'Border Radius' : cat.charAt(0).toUpperCase() + cat.slice(1);
        const tokenLines = (cats[cat] ?? [])
          .filter((name) => darkValues.has(name))
          .map((name) => `  ${name}: ${darkValues.get(name)};`)
          .join('\n');
        return `  /* ── ${label} ──────────────────────────── */\n${tokenLines}`;
      })
      .join('\n\n');

    const darkCategoryBlocksIndented = darkCategoryBlocks
      .split('\n')
      .map((l) => '  ' + l)
      .join('\n');

    fullThemeCSS +=
      `@media (prefers-color-scheme: dark) {\n  :root {\n    color-scheme: dark;\n\n${darkCategoryBlocksIndented}\n  }\n}\n\n` +
      `.${themeName}-dark {\n  color-scheme: dark;\n\n${darkCategoryBlocks}\n}\n`;
  }

  return {
    themeName,
    prefix,
    tokenCount,
    categories,
    lightModeCSS,
    darkModeCSS,
    fullThemeCSS,
    detectionAnalysis: analysis,
  };
}

/**
 * Maps a theme token definition to specific components, generating per-component
 * CSS override blocks that apply the theme correctly.
 *
 * @param cem - Parsed Custom Elements Manifest
 * @param themeTokens - Map of CSS custom property name → value to apply
 * @param tagNames - Optional list of component tag names to filter results;
 *                   when omitted all components with CSS properties are included
 */
export function applyThemeTokens(
  cem: Cem,
  themeTokens: Record<string, string>,
  tagNames?: string[],
): ApplyThemeTokensResult {
  const themeTokenSet = new Set(Object.keys(themeTokens));
  const components: ComponentTokenApplication[] = [];
  let totalMatches = 0;

  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      if (tagNames && tagNames.length > 0 && !tagNames.includes(decl.tagName)) continue;

      const cssProps = decl.cssProperties ?? [];
      const totalCssProperties = cssProps.length;

      // Skip components with no CSS properties at all
      if (totalCssProperties === 0) continue;

      const matchedProps = cssProps.filter((p) => themeTokenSet.has(p.name));
      const matchedTokens = matchedProps.length;
      totalMatches += matchedTokens;

      let cssBlock = '';
      if (matchedTokens > 0) {
        const propLines = matchedProps
          .map((p) => `  ${p.name}: ${themeTokens[p.name]};`)
          .join('\n');
        cssBlock = `${decl.tagName} {\n${propLines}\n}`;
      }

      components.push({
        tagName: decl.tagName,
        matchedTokens,
        totalCssProperties,
        cssBlock,
      });
    }
  }

  // Global :root block applying all theme tokens
  const globalLines = Object.entries(themeTokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  const globalCSS = globalLines ? `:root {\n${globalLines}\n}` : '';

  return {
    totalComponents: components.length,
    totalMatches,
    globalCSS,
    components,
  };
}
