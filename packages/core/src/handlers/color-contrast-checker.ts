/**
 * Color Contrast Checker — detects color combinations likely to cause
 * readability issues, especially across theme changes.
 *
 * Catches:
 * 1. Low-contrast hardcoded color pairs (light-on-light, dark-on-dark)
 * 2. Mixed color sources (token bg + hardcoded text or vice versa)
 * 3. Low opacity on text elements that may reduce contrast
 *
 * This is a heuristic checker — it analyzes CSS statically and flags
 * patterns that are LIKELY to cause contrast issues. It does not
 * compute actual WCAG contrast ratios (that requires runtime values).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ColorContrastIssue {
  rule: 'low-contrast-pair' | 'mixed-color-source' | 'low-opacity-text';
  selector: string;
  message: string;
  line: number;
}

export interface ColorContrastResult {
  issues: ColorContrastIssue[];
  clean: boolean;
}

// ─── Color classification ────────────────────────────────────────────────────

type ColorBrightness = 'light' | 'dark' | 'mid' | 'unknown';

const NAMED_COLORS: Record<string, ColorBrightness> = {
  white: 'light',
  '#fff': 'light',
  '#ffffff': 'light',
  '#fefefe': 'light',
  '#f8f8f8': 'light',
  '#f5f5f5': 'light',
  '#f0f0f0': 'light',
  '#eee': 'light',
  '#eeeeee': 'light',
  '#e0e0e0': 'light',
  '#ddd': 'light',
  '#dddddd': 'light',
  '#ccc': 'light',
  '#cccccc': 'light',
  snow: 'light',
  ivory: 'light',
  ghostwhite: 'light',
  whitesmoke: 'light',
  floralwhite: 'light',
  linen: 'light',
  aliceblue: 'light',
  lavender: 'light',
  beige: 'light',
  seashell: 'light',

  black: 'dark',
  '#000': 'dark',
  '#000000': 'dark',
  '#111': 'dark',
  '#111111': 'dark',
  '#222': 'dark',
  '#222222': 'dark',
  '#333': 'dark',
  '#333333': 'dark',
  '#1a1a1a': 'dark',
  '#2d2d2d': 'dark',
  '#0a0a0a': 'dark',
  darkslategray: 'dark',
};

function classifyHexColor(hex: string): ColorBrightness {
  // Normalize
  let h = hex.toLowerCase().trim();
  if (!h.startsWith('#')) return 'unknown';

  // Expand shorthand: #abc → #aabbcc
  if (h.length === 4) {
    h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }

  if (h.length !== 7) return 'unknown';

  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return 'unknown';

  // Relative luminance approximation (simplified sRGB)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (luminance > 0.7) return 'light';
  if (luminance < 0.3) return 'dark';
  return 'mid';
}

function classifyColor(value: string): ColorBrightness {
  const lower = value.toLowerCase().trim();

  // Check named colors
  const named = NAMED_COLORS[lower];
  if (named) return named;

  // Check hex
  if (lower.startsWith('#')) return classifyHexColor(lower);

  // rgb/rgba
  const rgbMatch = lower.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1] ?? '0', 10);
    const g = parseInt(rgbMatch[2] ?? '0', 10);
    const b = parseInt(rgbMatch[3] ?? '0', 10);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luminance > 0.7) return 'light';
    if (luminance < 0.3) return 'dark';
    return 'mid';
  }

  return 'unknown';
}

function hasVarCall(value: string): boolean {
  return /var\s*\(/.test(value);
}

function isBgProperty(prop: string): boolean {
  return /^(?:background(?:-color)?)$/i.test(prop);
}

function isTextColorProperty(prop: string): boolean {
  return prop.toLowerCase() === 'color';
}

// ─── CSS block parsing ───────────────────────────────────────────────────────

interface CssBlock {
  selector: string;
  declarations: Array<{ property: string; value: string }>;
  line: number;
}

function parseCssBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  const blockPattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(css)) !== null) {
    const selector = (match[1] ?? '').trim();
    const body = match[2] ?? '';

    const preceding = css.slice(0, match.index);
    const line = (preceding.match(/\n/g) ?? []).length + 1;

    const declarations: Array<{ property: string; value: string }> = [];
    const declPattern = /([a-z-]+)\s*:\s*([^;]+)/gi;
    let declMatch: RegExpExecArray | null;

    while ((declMatch = declPattern.exec(body)) !== null) {
      declarations.push({
        property: (declMatch[1] ?? '').trim(),
        value: (declMatch[2] ?? '').trim(),
      });
    }

    blocks.push({ selector, declarations, line });
  }

  return blocks;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function checkColorContrast(css: string): ColorContrastResult {
  const issues: ColorContrastIssue[] = [];
  const blocks = parseCssBlocks(css);

  for (const block of blocks) {
    let bgValue: string | null = null;
    let textValue: string | null = null;
    let bgIsToken = false;
    let textIsToken = false;
    let opacityValue: number | null = null;
    let hasTextColor = false;

    for (const decl of block.declarations) {
      if (isBgProperty(decl.property)) {
        bgValue = decl.value;
        bgIsToken = hasVarCall(decl.value);
      }
      if (isTextColorProperty(decl.property)) {
        textValue = decl.value;
        textIsToken = hasVarCall(decl.value);
        hasTextColor = true;
      }
      if (decl.property === 'opacity') {
        const num = parseFloat(decl.value);
        if (!isNaN(num)) opacityValue = num;
      }
    }

    // Check 1: Low contrast hardcoded pairs
    if (bgValue && textValue && !bgIsToken && !textIsToken) {
      const bgBrightness = classifyColor(bgValue);
      const textBrightness = classifyColor(textValue);

      if (
        bgBrightness !== 'unknown' &&
        textBrightness !== 'unknown' &&
        bgBrightness === textBrightness &&
        bgBrightness !== 'mid'
      ) {
        issues.push({
          rule: 'low-contrast-pair',
          selector: block.selector,
          message:
            `Both background (${bgValue}) and text color (${textValue}) appear to be ${bgBrightness}. ` +
            `This likely creates unreadable text. Use a design token pair that maintains contrast across themes.`,
          line: block.line,
        });
      }
    }

    // Check 2: Mixed color sources (one token, one hardcoded)
    if (bgValue && textValue) {
      const bgHardcoded = !bgIsToken && isColorValue(bgValue);
      const textHardcoded = !textIsToken && isColorValue(textValue);

      if ((bgIsToken && textHardcoded) || (textIsToken && bgHardcoded)) {
        issues.push({
          rule: 'mixed-color-source',
          selector: block.selector,
          message:
            `Background and text color use different sources (one token, one hardcoded). ` +
            `When the theme changes, the token value will update but the hardcoded value won't, ` +
            `potentially creating unreadable text. Use tokens for both or hardcode both.`,
          line: block.line,
        });
      }
    }

    // Check 3: Low opacity on text elements
    if (hasTextColor && opacityValue !== null && opacityValue < 0.5) {
      issues.push({
        rule: 'low-opacity-text',
        selector: block.selector,
        message:
          `opacity: ${opacityValue} on an element with text color may reduce contrast below readable levels. ` +
          `Consider using a lighter/darker color value instead of low opacity.`,
        line: block.line,
      });
    }
  }

  return {
    issues,
    clean: issues.length === 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isColorValue(value: string): boolean {
  const v = value.toLowerCase().trim();
  // Check if it looks like an actual color value
  return (
    v.startsWith('#') ||
    v.startsWith('rgb') ||
    v.startsWith('hsl') ||
    v in NAMED_COLORS ||
    /^[a-z]+$/.test(v) // named color like "red", "blue"
  );
}
