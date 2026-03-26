/**
 * CSS Scope Checker — detects when component-scoped CSS custom properties
 * are set at the wrong scope (e.g., :root, html, body, *) instead of on
 * the component host element.
 *
 * This is one of the most common agent mistakes: placing component tokens
 * on :root where they have no effect because the component's Shadow DOM
 * reads them from its host element, not from the document root.
 *
 * Detects:
 * 1. Component CSS custom properties set on :root, html, body, or *
 */

import { parseCem } from './cem.js';
import type { Cem } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScopeIssue {
  rule: 'scope-mismatch';
  property: string;
  selector: string;
  line: number;
  message: string;
}

export interface ScopeCheckResult {
  issues: ScopeIssue[];
  clean: boolean;
}

// ─── Global/root scope selectors ────────────────────────────────────────────

const GLOBAL_SELECTORS = new Set([':root', 'html', 'body', '*']);

function isGlobalSelector(selector: string): boolean {
  const trimmed = selector.trim().toLowerCase();
  return GLOBAL_SELECTORS.has(trimmed);
}

// ─── CSS block parser ───────────────────────────────────────────────────────

interface CssBlock {
  selector: string;
  properties: Array<{ name: string; line: number }>;
}

function parseCssBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];

  // Match selector { declarations } blocks
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(css)) !== null) {
    const selector = (match[1] ?? '').trim();
    const body = match[2] ?? '';
    const blockStart = match.index;

    // Find line number of the block start
    const preceding = css.slice(0, blockStart);
    const blockLine = (preceding.match(/\n/g) ?? []).length + 1;

    // Extract custom property declarations from body
    const propPattern = /\s*(--[a-z][a-z0-9-]*)\s*:/gi;
    let propMatch: RegExpExecArray | null;
    const properties: Array<{ name: string; line: number }> = [];

    while ((propMatch = propPattern.exec(body)) !== null) {
      const propName = (propMatch[1] ?? '').trim();
      // Approximate line within the block
      const propPreceding = body.slice(0, propMatch.index);
      const propLineOffset = (propPreceding.match(/\n/g) ?? []).length;
      properties.push({ name: propName, line: blockLine + propLineOffset });
    }

    if (properties.length > 0) {
      blocks.push({ selector, properties });
    }
  }

  return blocks;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Core implementation accepting a pre-built set of known tokens.
 * Used by both the CEM-based entry point and the preflight (which already has metadata).
 */
export function checkCssScopeFromMeta(
  css: string,
  tagName: string,
  cssProperties: Array<{ name: string }>,
): ScopeCheckResult {
  const knownTokens = new Set(cssProperties.map((p) => p.name));

  const blocks = parseCssBlocks(css);
  const issues: ScopeIssue[] = [];

  for (const block of blocks) {
    if (!isGlobalSelector(block.selector)) continue;

    for (const prop of block.properties) {
      if (knownTokens.has(prop.name)) {
        issues.push({
          rule: 'scope-mismatch',
          property: prop.name,
          selector: block.selector,
          line: prop.line,
          message:
            `"${prop.name}" is a CSS custom property of <${tagName}> but is set on "${block.selector}". ` +
            `Component tokens must be set on the host element: ${tagName} { ${prop.name}: ...; }`,
        });
      }
    }
  }

  return {
    issues,
    clean: issues.length === 0,
  };
}

/**
 * CEM-based entry point — parses the CEM to extract known tokens,
 * then delegates to the core implementation.
 */
export function checkCssScope(css: string, tagName: string, cem: Cem): ScopeCheckResult {
  const meta = parseCem(tagName, cem);
  return checkCssScopeFromMeta(css, tagName, meta.cssProperties);
}
