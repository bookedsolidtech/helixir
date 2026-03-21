/**
 * CSS Shorthand Checker — detects risky shorthand + var() combinations
 * that can fail in surprising ways.
 *
 * CSS shorthand properties (border, background, font, margin, padding, etc.)
 * have complex parsing rules. When var() is mixed with literal values in a
 * shorthand, the browser must parse the entire declaration at computed-value
 * time, and failures cascade to the entire shorthand being invalid.
 *
 * Example risk: `border: 1px solid var(--color)` — if --color is undefined,
 * the ENTIRE border declaration fails (not just the color).
 *
 * Safe alternative: Use longhand properties for the literal parts and var()
 * only for the dynamic part.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShorthandIssue {
  rule: 'shorthand-var-risk';
  property: string;
  value: string;
  line: number;
  message: string;
  suggestion: string;
}

export interface ShorthandCheckResult {
  issues: ShorthandIssue[];
  clean: boolean;
}

// ─── Shorthand properties that are risky with mixed var() + literals ────────

/** CSS shorthand properties and their longhand decompositions */
const SHORTHAND_DECOMPOSITIONS: Record<string, string[]> = {
  border: ['border-width', 'border-style', 'border-color'],
  'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
  'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
  'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
  'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],
  background: [
    'background-image',
    'background-position',
    'background-size',
    'background-repeat',
    'background-color',
  ],
  font: ['font-style', 'font-variant', 'font-weight', 'font-size', 'line-height', 'font-family'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  outline: ['outline-width', 'outline-style', 'outline-color'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
  'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],
  transition: [
    'transition-property',
    'transition-duration',
    'transition-timing-function',
    'transition-delay',
  ],
  animation: [
    'animation-name',
    'animation-duration',
    'animation-timing-function',
    'animation-delay',
    'animation-iteration-count',
    'animation-direction',
    'animation-fill-mode',
    'animation-play-state',
  ],
};

const RISKY_SHORTHANDS = new Set(Object.keys(SHORTHAND_DECOMPOSITIONS));

// ─── Detection ──────────────────────────────────────────────────────────────

function hasVarCall(value: string): boolean {
  return /var\s*\(/.test(value);
}

function hasNonVarTokens(value: string): boolean {
  // Strip var() calls and check if there are remaining non-whitespace, non-separator tokens
  const withoutVars = value.replace(/var\([^)]*\)/g, '').trim();
  // Only separators (commas, slashes, whitespace) remaining = no real tokens
  return withoutVars.length > 0 && !/^[\s,/]*$/.test(withoutVars);
}

function isSimpleVarShorthand(value: string): boolean {
  // A simple case: shorthand value is ONLY a single var() call (possibly with fallback)
  // Multiple var() calls in a shorthand are still risky
  const trimmed = value.trim();
  return /^var\s*\([^)]*\)$/.test(trimmed);
}

function hasMultipleVarCalls(value: string): boolean {
  const matches = value.match(/var\s*\(/g);
  return (matches?.length ?? 0) > 1;
}

function generateSuggestion(property: string): string {
  const longhands = SHORTHAND_DECOMPOSITIONS[property];
  if (!longhands) return `Use longhand properties instead of "${property}" shorthand.`;
  return `Decompose into longhands: ${longhands.join(', ')}. Put var() only on the dynamic parts.`;
}

// ─── CSS parsing ────────────────────────────────────────────────────────────

interface CssDecl {
  property: string;
  value: string;
  line: number;
}

function parseCssDeclarations(css: string): CssDecl[] {
  const results: CssDecl[] = [];

  const declPattern = /(?:^|[{;])\s*([a-z-]+)\s*:\s*([^;{}]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = declPattern.exec(css)) !== null) {
    const prop = (match[1] ?? '').trim();
    const val = (match[2] ?? '').trim();
    if (!prop || !val) continue;
    if (prop.startsWith('--')) continue;

    const propStart = match.index + match[0].indexOf(prop);
    const preceding = css.slice(0, propStart);
    const line = (preceding.match(/\n/g) ?? []).length + 1;

    results.push({ property: prop, value: val, line });
  }

  return results;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkCssShorthand(css: string): ShorthandCheckResult {
  const declarations = parseCssDeclarations(css);
  const issues: ShorthandIssue[] = [];

  for (const decl of declarations) {
    const propLower = decl.property.toLowerCase();

    if (!RISKY_SHORTHANDS.has(propLower)) continue;
    if (!hasVarCall(decl.value)) continue;

    // A single var() as the entire value is safe (just a token reference)
    if (isSimpleVarShorthand(decl.value)) continue;

    // Risky: var() mixed with literals, or multiple var() calls in shorthand
    if (hasNonVarTokens(decl.value) || hasMultipleVarCalls(decl.value)) {
      issues.push({
        rule: 'shorthand-var-risk',
        property: decl.property,
        value: decl.value,
        line: decl.line,
        message:
          `Shorthand "${decl.property}" mixes var() with literal values. ` +
          `If any var() is undefined, the ENTIRE "${decl.property}" declaration fails — ` +
          `not just the dynamic part. Use longhand properties for predictable behavior.`,
        suggestion: generateSuggestion(propLower),
      });
    }
  }

  return {
    issues,
    clean: issues.length === 0,
  };
}
