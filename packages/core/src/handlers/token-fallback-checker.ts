/**
 * Token Fallback Checker — validates consumer CSS for proper var() fallback
 * chains and detects hardcoded colors that break theme switching.
 *
 * Detects:
 * 1. var() calls without fallback values (fragile if token undefined)
 * 2. Hardcoded colors on color properties (breaks dark mode)
 * 3. Named CSS colors on component color tokens (theme-hostile)
 */

import { parseCem } from './cem.js';
import type { Cem } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TokenFallbackIssue {
  rule: 'missing-fallback' | 'hardcoded-color';
  property: string;
  value: string;
  line: number;
  message: string;
}

export interface TokenFallbackResult {
  issues: TokenFallbackIssue[];
  totalVarCalls: number;
  clean: boolean;
}

// ─── Color detection ────────────────────────────────────────────────────────

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}){1,2}$/i;
const RGB_COLOR = /^rgba?\s*\(/i;
const HSL_COLOR = /^hsla?\s*\(/i;

/** CSS named colors that are theme-hostile when used as token values. */
const NAMED_COLORS = new Set([
  'black',
  'white',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'gray',
  'grey',
  'cyan',
  'magenta',
  'brown',
  'navy',
  'teal',
  'aqua',
  'silver',
  'maroon',
  'olive',
  'lime',
  'fuchsia',
  'coral',
  'salmon',
  'tomato',
  'gold',
  'wheat',
  'ivory',
  'beige',
  'khaki',
  'plum',
  'orchid',
  'violet',
  'indigo',
  'crimson',
  'sienna',
  'peru',
  'tan',
  'linen',
  'snow',
  'azure',
  'lavender',
  'thistle',
  'turquoise',
]);

/** Keywords indicating a color-related CSS custom property. */
const COLOR_PROPERTY_PATTERNS = [
  /color/i,
  /\bbg\b/i,
  /background/i,
  /foreground/i,
  /fill/i,
  /stroke/i,
  /border-color/i,
  /surface/i,
  /shadow/i,
];

function isColorProperty(propName: string): boolean {
  return COLOR_PROPERTY_PATTERNS.some((p) => p.test(propName));
}

function isHardcodedColor(value: string): boolean {
  const trimmed = value.trim();
  if (HEX_COLOR.test(trimmed)) return true;
  if (RGB_COLOR.test(trimmed)) return true;
  if (HSL_COLOR.test(trimmed)) return true;
  if (NAMED_COLORS.has(trimmed.toLowerCase())) return true;
  return false;
}

// ─── var() parsing ──────────────────────────────────────────────────────────

interface VarCall {
  tokenName: string;
  hasFallback: boolean;
  line: number;
}

/**
 * Extract all var() calls from a CSS value string.
 * Handles nested var() like var(--a, var(--b, #fff)).
 */
function extractVarCalls(value: string, line: number): VarCall[] {
  const calls: VarCall[] = [];
  // Simple regex approach: find var( then extract the token name
  const varPattern = /var\(\s*(--[a-z][a-z0-9-]*)\s*(?:,\s*([^)]*))?\)/gi;

  let match: RegExpExecArray | null;
  while ((match = varPattern.exec(value)) !== null) {
    const tokenName = match[1] ?? '';
    const fallbackPart = match[2];
    calls.push({
      tokenName,
      hasFallback: fallbackPart !== undefined && fallbackPart.trim().length > 0,
      line,
    });
  }

  return calls;
}

// ─── CSS line parsing ───────────────────────────────────────────────────────

interface CssPropertyDecl {
  property: string;
  value: string;
  line: number;
}

function parseCssDeclarations(css: string): CssPropertyDecl[] {
  const results: CssPropertyDecl[] = [];

  // Match CSS custom property declarations anywhere in CSS (single-line or multi-line)
  const declPattern = /(?:^|[{;])\s*(--[a-z][a-z0-9-]*)\s*:\s*([^;{}]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = declPattern.exec(css)) !== null) {
    const prop = (match[1] ?? '').trim();
    const val = (match[2] ?? '').replace(/\s*!important\s*/, '').trim();
    if (!prop || !val) continue;

    // Line number from position of the property name in source
    const propStart = match.index + match[0].indexOf(prop);
    const preceding = css.slice(0, propStart);
    const line = (preceding.match(/\n/g) ?? []).length + 1;

    results.push({ property: prop, value: val, line });
  }

  return results;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Core implementation accepting a pre-built set of known tokens.
 * Used by both the CEM-based entry point and the preflight (which already has metadata).
 */
export function checkTokenFallbacksFromMeta(
  cssText: string,
  knownTokens: Set<string>,
): TokenFallbackResult {
  const declarations = parseCssDeclarations(cssText);
  const issues: TokenFallbackIssue[] = [];
  let totalVarCalls = 0;

  for (const decl of declarations) {
    const varCalls = extractVarCalls(decl.value, decl.line);
    totalVarCalls += varCalls.length;

    // Check for missing fallbacks
    for (const vc of varCalls) {
      // Known component tokens don't need fallbacks — they're defined by the component
      if (knownTokens.has(vc.tokenName)) continue;

      if (!vc.hasFallback) {
        issues.push({
          rule: 'missing-fallback',
          property: vc.tokenName,
          value: decl.value,
          line: decl.line,
          message:
            `var(${vc.tokenName}) has no fallback value. ` +
            `If the token is undefined, this property will be ignored. ` +
            `Use var(${vc.tokenName}, <fallback>) for resilience.`,
        });
      }
    }

    // Check for hardcoded colors on color properties (only if NO var() is used)
    if (varCalls.length === 0 && isColorProperty(decl.property)) {
      if (isHardcodedColor(decl.value)) {
        issues.push({
          rule: 'hardcoded-color',
          property: decl.property,
          value: decl.value,
          line: decl.line,
          message:
            `Hardcoded color "${decl.value}" on "${decl.property}" will not adapt to theme changes. ` +
            `Use a design token with fallback: var(--your-token, ${decl.value}).`,
        });
      }
    }
  }

  return {
    issues,
    totalVarCalls,
    clean: issues.length === 0,
  };
}

/**
 * CEM-based entry point — parses the CEM to extract known tokens,
 * then delegates to the core implementation.
 */
export function checkTokenFallbacks(
  cssText: string,
  tagName: string,
  cem: Cem,
): TokenFallbackResult {
  const meta = parseCem(tagName, cem);
  const knownTokens = new Set(meta.cssProperties.map((p) => p.name));
  return checkTokenFallbacksFromMeta(cssText, knownTokens);
}
