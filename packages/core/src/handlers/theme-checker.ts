/**
 * Theme Compatibility Checker — validates consumer CSS for theme-hostile
 * patterns that break dark mode or theme switching.
 *
 * Detects:
 * 1. Hardcoded colors on theme-sensitive properties (background, color, border)
 * 2. Hardcoded shadow colors instead of token-based shadows
 * 3. Potential contrast issues (light-on-light or dark-on-dark pairings)
 *
 * Does NOT require a CEM — operates purely on CSS analysis.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThemeIssue {
  rule: 'hardcoded-theme-color' | 'hardcoded-shadow' | 'potential-contrast-issue';
  property: string;
  value: string;
  line: number;
  message: string;
}

export interface ThemeCheckResult {
  issues: ThemeIssue[];
  clean: boolean;
}

// ─── Color detection ────────────────────────────────────────────────────────

const HEX_COLOR = /#(?:[0-9a-f]{3,4}){1,2}\b/i;
const RGB_COLOR = /rgba?\s*\([^)]+\)/i;
const HSL_COLOR = /hsla?\s*\([^)]+\)/i;
const NAMED_COLOR =
  /\b(?:black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|cyan|magenta|brown|navy|teal|silver|maroon|olive|lime|coral|salmon|tomato|gold|ivory|beige|khaki|plum|orchid|violet|indigo|crimson|snow|azure|lavender|turquoise)\b/i;

/** Values that are theme-safe and should not be flagged */
const SAFE_VALUES = /\b(?:inherit|currentColor|transparent|initial|unset|revert)\b/i;

/** Properties where hardcoded colors break theming */
const THEME_SENSITIVE_PROPERTIES = [
  'color',
  'background',
  'background-color',
  'border-color',
  'border',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'fill',
  'stroke',
  'caret-color',
  'column-rule-color',
  'text-decoration-color',
];

function containsHardcodedColor(value: string): boolean {
  if (SAFE_VALUES.test(value)) return false;
  if (/var\s*\(/.test(value)) return false;
  return (
    HEX_COLOR.test(value) ||
    RGB_COLOR.test(value) ||
    HSL_COLOR.test(value) ||
    NAMED_COLOR.test(value)
  );
}

// ─── Light/dark classification ──────────────────────────────────────────────

type Lightness = 'light' | 'dark' | 'unknown';

function classifyColor(value: string): Lightness {
  const trimmed = value.trim().toLowerCase();

  // Named colors
  if (
    /^(?:white|snow|ivory|beige|azure|lavender|linen|wheat|khaki|#f[0-9a-f]{2,5}|#fff)$/i.test(
      trimmed,
    )
  ) {
    return 'light';
  }
  if (/^(?:black|navy|maroon|#0[0-3][0-9a-f]{1,4}|#000)$/i.test(trimmed)) {
    return 'dark';
  }

  // Hex: check if light (high values) or dark (low values)
  const hexMatch = /^#([0-9a-f]{3,8})$/i.exec(trimmed);
  if (hexMatch) {
    const hex = hexMatch[1] ?? '';
    let r = 0,
      g = 0,
      b = 0;
    if (hex.length === 3 || hex.length === 4) {
      r = parseInt((hex[0] ?? '0') + (hex[0] ?? '0'), 16);
      g = parseInt((hex[1] ?? '0') + (hex[1] ?? '0'), 16);
      b = parseInt((hex[2] ?? '0') + (hex[2] ?? '0'), 16);
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.7 ? 'light' : luminance < 0.3 ? 'dark' : 'unknown';
  }

  return 'unknown';
}

// ─── CSS parsing ────────────────────────────────────────────────────────────

interface CssDecl {
  property: string;
  value: string;
  line: number;
}

function parseCssDeclarations(css: string): CssDecl[] {
  const results: CssDecl[] = [];
  const lines = css.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = /^\s*([a-z-]+)\s*:\s*(.+?)\s*;?\s*$/i.exec(line);
    if (match) {
      results.push({
        property: match[1] ?? '',
        value: (match[2] ?? '').trim(),
        line: i + 1,
      });
    }
  }

  return results;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkThemeCompatibility(css: string): ThemeCheckResult {
  const declarations = parseCssDeclarations(css);
  const issues: ThemeIssue[] = [];

  // Track color and background per selector block for contrast checks
  let blockTextColor: { value: string; line: number; lightness: Lightness } | null = null;
  let blockBgColor: { value: string; line: number; lightness: Lightness } | null = null;

  for (const decl of declarations) {
    const propLower = decl.property.toLowerCase();

    // Check for hardcoded colors on theme-sensitive properties
    if (THEME_SENSITIVE_PROPERTIES.includes(propLower)) {
      if (containsHardcodedColor(decl.value)) {
        issues.push({
          rule: 'hardcoded-theme-color',
          property: decl.property,
          value: decl.value,
          line: decl.line,
          message:
            `Hardcoded color "${decl.value}" on "${decl.property}" will not adapt to dark mode. ` +
            `Use a CSS custom property: var(--your-token, ${decl.value}).`,
        });
      }
    }

    // Check for hardcoded shadow colors
    if (propLower === 'box-shadow' || propLower === 'text-shadow') {
      if (containsHardcodedColor(decl.value)) {
        issues.push({
          rule: 'hardcoded-shadow',
          property: decl.property,
          value: decl.value,
          line: decl.line,
          message:
            `Shadow "${decl.property}" uses hardcoded color values. ` +
            `In dark mode, these shadows may be invisible or too harsh. ` +
            `Use a design token: var(--shadow-token).`,
        });
      }
    }

    // Track text/background for contrast check
    if (propLower === 'color') {
      blockTextColor = {
        value: decl.value,
        line: decl.line,
        lightness: classifyColor(decl.value),
      };
    }
    if (propLower === 'background-color' || propLower === 'background') {
      blockBgColor = {
        value: decl.value,
        line: decl.line,
        lightness: classifyColor(decl.value),
      };
    }

    // Check for contrast issues when we have both color and background
    if (blockTextColor && blockBgColor) {
      const textLight = blockTextColor.lightness;
      const bgLight = blockBgColor.lightness;

      if (
        (textLight === 'light' && bgLight === 'light') ||
        (textLight === 'dark' && bgLight === 'dark')
      ) {
        issues.push({
          rule: 'potential-contrast-issue',
          property: 'color + background',
          value: `color: ${blockTextColor.value}, background: ${blockBgColor.value}`,
          line: blockTextColor.line,
          message:
            `Both text (${blockTextColor.value}) and background (${blockBgColor.value}) ` +
            `appear to be ${textLight}. This may cause contrast issues. ` +
            `Use semantic tokens that pair correctly across themes.`,
        });
      }

      // Reset after checking
      blockTextColor = null;
      blockBgColor = null;
    }
  }

  return {
    issues,
    clean: issues.length === 0,
  };
}
