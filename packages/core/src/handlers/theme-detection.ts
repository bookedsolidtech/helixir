/**
 * Theme Detection — analyzes a CEM for theming capabilities.
 *
 * Detects:
 * 1. Token prefix and naming conventions
 * 2. Token categories (color, spacing, typography, etc.)
 * 3. Semantic vs raw naming patterns
 * 4. Dark mode readiness signals
 * 5. Coverage score across theming dimensions
 */

import type { Cem } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TokenCategories {
  color: string[];
  spacing: string[];
  typography: string[];
  borderRadius: string[];
  elevation: string[];
  zIndex: string[];
  animation: string[];
  other: string[];
}

export interface ThemeSupportResult {
  tokenPrefix: string;
  totalTokens: number;
  categories: Record<keyof TokenCategories, number>;
  semanticNaming: boolean;
  darkModeReady: boolean;
  coverageScore: number;
  recommendations: string[];
}

// ─── Category detection keywords ────────────────────────────────────────────

const CATEGORY_PATTERNS: Record<keyof TokenCategories, RegExp[]> = {
  color: [
    /color/,
    /bg/,
    /background/,
    /foreground/,
    /text/,
    /border-color/,
    /fill/,
    /stroke/,
    /surface/,
  ],
  spacing: [/spacing/, /gap/, /margin/, /padding/, /space/],
  typography: [/font/, /text-size/, /line-height/, /letter-spacing/, /font-size/, /font-weight/],
  borderRadius: [/border-radius/, /radius/, /rounded/],
  elevation: [/elevation/, /shadow/, /box-shadow/, /drop-shadow/],
  zIndex: [/z-index/, /z-layer/, /zindex/],
  animation: [/animation/, /transition/, /duration/, /easing/, /timing/],
  other: [],
};

// Semantic naming signals — tokens named for purpose rather than appearance
const SEMANTIC_SIGNALS = [
  /primary/,
  /secondary/,
  /success/,
  /warning/,
  /danger/,
  /error/,
  /info/,
  /neutral/,
  /surface/,
  /background/,
  /foreground/,
  /text/,
  /heading/,
  /body/,
  /muted/,
  /accent/,
  /base/,
  /inverse/,
];

// Dark mode readiness signals — tokens that suggest the library supports theme switching
const DARK_MODE_SIGNALS = [/background/, /-bg\b/, /surface/, /-text\b/, /foreground/];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAllCssProperties(cem: Cem): string[] {
  return cem.modules
    .flatMap((m) => m.declarations ?? [])
    .flatMap((d) => d.cssProperties ?? [])
    .map((p) => p.name);
}

function detectPrefix(tokens: string[]): string {
  if (tokens.length === 0) return '';
  // All tokens start with '--', find the common prefix after that
  const withoutDashes = tokens.map((t) => t.replace(/^--/, ''));
  const segments = withoutDashes.map((t) => t.split('-'));
  if (segments.length === 0) return '';

  const firstSegments = segments[0] ?? [];
  let commonLength = 0;

  for (let i = 0; i < firstSegments.length; i++) {
    const seg = firstSegments[i];
    if (segments.every((s) => s[i] === seg)) {
      commonLength = i + 1;
    } else {
      break;
    }
  }

  if (commonLength === 0) return '';
  const prefix = (firstSegments.slice(0, commonLength) ?? []).join('-');
  return `--${prefix}-`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function categorizeTokens(cem: Cem): TokenCategories {
  const tokens = getAllCssProperties(cem);
  const result: TokenCategories = {
    color: [],
    spacing: [],
    typography: [],
    borderRadius: [],
    elevation: [],
    zIndex: [],
    animation: [],
    other: [],
  };

  for (const token of tokens) {
    const lower = token.toLowerCase();
    let matched = false;

    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      if (category === 'other') continue;
      for (const pattern of patterns) {
        if (pattern.test(lower)) {
          (result[category as keyof TokenCategories] as string[]).push(token);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      result.other.push(token);
    }
  }

  return result;
}

export function detectThemeSupport(cem: Cem): ThemeSupportResult {
  const tokens = getAllCssProperties(cem);
  const totalTokens = tokens.length;
  const tokenPrefix = detectPrefix(tokens);
  const cats = categorizeTokens(cem);

  const categories: Record<keyof TokenCategories, number> = {
    color: cats.color.length,
    spacing: cats.spacing.length,
    typography: cats.typography.length,
    borderRadius: cats.borderRadius.length,
    elevation: cats.elevation.length,
    zIndex: cats.zIndex.length,
    animation: cats.animation.length,
    other: cats.other.length,
  };

  // Semantic naming: check if enough tokens use semantic names
  const semanticCount = tokens.filter((t) => {
    const lower = t.toLowerCase();
    return SEMANTIC_SIGNALS.some((s) => s.test(lower));
  }).length;
  const semanticNaming = totalTokens > 0 && semanticCount / totalTokens >= 0.3;

  // Dark mode readiness: need semantic color tokens (bg, text, surface)
  const darkModeSignalCount = tokens.filter((t) => {
    const lower = t.toLowerCase();
    return DARK_MODE_SIGNALS.some((s) => s.test(lower));
  }).length;
  const darkModeReady = darkModeSignalCount >= 3;

  // Coverage score: based on how many categories are populated
  const categoryKeys: (keyof TokenCategories)[] = [
    'color',
    'spacing',
    'typography',
    'borderRadius',
    'elevation',
  ];
  const populatedCategories = categoryKeys.filter((k) => cats[k].length > 0).length;
  const coverageScore =
    totalTokens === 0 ? 0 : Math.round((populatedCategories / categoryKeys.length) * 100);

  // Build recommendations
  const recommendations: string[] = [];
  if (totalTokens === 0) {
    recommendations.push(
      'No CSS custom properties found. Consider exposing design tokens for theming.',
    );
  } else {
    if (cats.color.length === 0) {
      recommendations.push('No color tokens detected. Add color custom properties for theming.');
    }
    if (cats.spacing.length === 0) {
      recommendations.push('No spacing tokens detected. Spacing tokens enable consistent layouts.');
    }
    if (cats.typography.length === 0) {
      recommendations.push(
        'No typography tokens detected. Font tokens enable brand customization.',
      );
    }
    if (!semanticNaming) {
      recommendations.push(
        'Token names appear non-semantic (e.g. --my-red vs --my-color-danger). Semantic names enable theme switching.',
      );
    }
    if (!darkModeReady) {
      recommendations.push(
        'Dark mode signals missing. Add background/surface/text tokens for dark mode support.',
      );
    }
  }

  return {
    tokenPrefix,
    totalTokens,
    categories,
    semanticNaming,
    darkModeReady,
    coverageScore,
    recommendations,
  };
}
