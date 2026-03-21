/**
 * Dark Mode Checker — detects dark mode styling anti-patterns specific to
 * web components with Shadow DOM.
 *
 * Catches:
 * 1. Theme-scoped selectors (.dark, [data-theme]) setting standard CSS
 *    properties on web component hosts (won't reach shadow DOM internals)
 * 2. @media (prefers-color-scheme) blocks with shadow DOM piercing attempts
 * 3. Theme selectors using descendant combinators into shadow DOM
 *
 * Suggests: Use CSS custom properties to communicate theme changes through
 * shadow boundaries.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DarkModeIssue {
  rule: 'theme-scope-standard-property' | 'theme-scope-shadow-piercing';
  selector: string;
  property?: string;
  line: number;
  message: string;
  suggestion: string;
}

export interface DarkModeCheckResult {
  issues: DarkModeIssue[];
  clean: boolean;
}

// ─── Patterns ────────────────────────────────────────────────────────────────

/** Matches custom element tags (must contain a hyphen) */
const CUSTOM_ELEMENT_TAG = /\b([a-z][a-z0-9]*-[a-z0-9-]*)\b/;

/** Theme scope prefixes: .dark, .light, [data-theme], [data-mode] */
const THEME_SCOPE_PATTERN =
  /(?:\.(?:dark|light|theme-dark|theme-light)|:host-context\(\.(?:dark|light)\)|\[data-(?:theme|mode|color-scheme)[^\]]*\])/i;

/** @media (prefers-color-scheme: dark/light) blocks */
const PREFERS_COLOR_SCHEME = /@media\s*\([^)]*prefers-color-scheme\s*:\s*(?:dark|light)[^)]*\)/i;

/** Standard CSS properties that can't reach shadow DOM internals */
const STANDARD_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'border',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'text-shadow',
  'outline',
  'outline-color',
  'fill',
  'stroke',
  'font-size',
  'font-family',
  'font-weight',
  'opacity',
]);

// ─── CSS Block Parsing ──────────────────────────────────────────────────────

interface CssBlock {
  selector: string;
  declarations: Array<{ property: string; value: string }>;
  line: number;
  inMediaDarkMode: boolean;
}

/**
 * Parses CSS into blocks with selectors and declarations.
 * Handles @media nesting one level deep.
 */
function parseCssBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  parseBlocksRecursive(css, 0, false, blocks);
  return blocks;
}

function parseBlocksRecursive(
  css: string,
  baseOffset: number,
  inDarkMedia: boolean,
  blocks: CssBlock[],
): void {
  let pos = 0;

  while (pos < css.length) {
    // Skip whitespace
    while (pos < css.length && /\s/.test(css[pos] ?? '')) pos++;
    if (pos >= css.length) break;

    // Find the next opening brace
    const braceIdx = css.indexOf('{', pos);
    if (braceIdx === -1) break;

    const selector = css.slice(pos, braceIdx).trim();
    const closeBrace = findMatchingBrace(css, braceIdx);
    if (closeBrace === -1) break;

    const innerContent = css.slice(braceIdx + 1, closeBrace);

    if (selector.startsWith('@media') || selector.startsWith('@supports')) {
      // Check if this is a prefers-color-scheme media block
      const isDarkMedia = PREFERS_COLOR_SCHEME.test(selector);
      // Recursively parse the inner content
      parseBlocksRecursive(innerContent, baseOffset + braceIdx + 1, isDarkMedia, blocks);
    } else if (selector && !selector.startsWith('@')) {
      const lineNum = (css.slice(0, pos).match(/\n/g) ?? []).length + 1;

      // Parse declarations
      const declarations: Array<{ property: string; value: string }> = [];
      const declRegex = /([a-z-]+)\s*:\s*([^;]+)/gi;
      let declMatch: RegExpExecArray | null;
      while ((declMatch = declRegex.exec(innerContent)) !== null) {
        const prop = (declMatch[1] ?? '').trim();
        const val = (declMatch[2] ?? '').trim();
        if (prop && val) {
          declarations.push({ property: prop, value: val });
        }
      }

      blocks.push({
        selector,
        declarations,
        line: lineNum,
        inMediaDarkMode: inDarkMedia,
      });
    }

    pos = closeBrace + 1;
  }
}

/**
 * Finds the matching closing brace for an opening brace at the given position.
 */
function findMatchingBrace(css: string, openPos: number): number {
  let depth = 1;
  for (let i = openPos + 1; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ─── Selector Analysis ──────────────────────────────────────────────────────

/**
 * Checks if a selector targets a web component host within a theme scope
 * and uses descendant selectors that would pierce shadow DOM.
 */
function hasShadowPiercing(selector: string): {
  piercing: boolean;
  tagName: string | null;
} {
  // Find custom element in selector
  const tagMatch = selector.match(CUSTOM_ELEMENT_TAG);
  if (!tagMatch) return { piercing: false, tagName: null };

  const tagName = tagMatch[1] ?? '';
  const tagIdx = selector.indexOf(tagName);
  const afterTag = selector.slice(tagIdx + tagName.length);

  // After the tag: if there's whitespace followed by more selectors (not ::part),
  // it's a descendant selector piercing shadow DOM.
  // Valid: my-button::part(base), my-button[attr], my-button, my-button { ... }
  // Invalid: my-button .inner, my-button div, my-button > span
  const trimmedAfter = afterTag.trim();
  if (
    trimmedAfter.length > 0 &&
    !trimmedAfter.startsWith('::part') &&
    !trimmedAfter.startsWith('{') &&
    !trimmedAfter.startsWith('[') &&
    !trimmedAfter.startsWith(':') &&
    /\s/.test(afterTag.charAt(0))
  ) {
    return { piercing: true, tagName };
  }

  return { piercing: false, tagName };
}

/**
 * Checks if selector uses ::part() (standard properties are valid on parts)
 */
function usesPart(selector: string): boolean {
  return /::part\(/.test(selector);
}

/**
 * Checks if selector is theme-scoped (has a theme class/attr or is inside prefers-color-scheme)
 */
function isThemeScoped(selector: string, inMediaDarkMode: boolean): boolean {
  return inMediaDarkMode || THEME_SCOPE_PATTERN.test(selector);
}

/**
 * Checks if selector targets a custom element host
 */
function getTargetedComponent(selector: string): string | null {
  const match = selector.match(CUSTOM_ELEMENT_TAG);
  return match ? (match[1] ?? null) : null;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkDarkModePatterns(css: string): DarkModeCheckResult {
  const issues: DarkModeIssue[] = [];
  const blocks = parseCssBlocks(css);

  for (const block of blocks) {
    const themeScoped = isThemeScoped(block.selector, block.inMediaDarkMode);
    if (!themeScoped) continue;

    const tagName = getTargetedComponent(block.selector);
    if (!tagName) continue;

    // Check 1: Theme-scoped shadow DOM piercing
    const { piercing } = hasShadowPiercing(block.selector);
    if (piercing) {
      issues.push({
        rule: 'theme-scope-shadow-piercing',
        selector: block.selector,
        line: block.line,
        message:
          `Theme selector "${block.selector}" uses descendant combinators to reach inside <${tagName}>'s shadow DOM. ` +
          `Standard CSS selectors cannot cross shadow boundaries, even inside theme/dark mode scopes.`,
        suggestion:
          `Use \`${tagName}::part(name)\` to style exposed parts, or set CSS custom properties on the host: ` +
          `\`${block.selector.replace(/\s+\S+$/, '')} { --${tagName}-* tokens here }\``,
      });
      continue; // Don't double-flag
    }

    // Check 2: Standard properties on WC host in theme scope
    // Skip if selector uses ::part() — standard properties ARE valid on parts
    if (usesPart(block.selector)) continue;

    const standardProps = block.declarations.filter(
      (d) => STANDARD_PROPERTIES.has(d.property) && !d.property.startsWith('--'),
    );

    if (standardProps.length > 0) {
      for (const prop of standardProps) {
        issues.push({
          rule: 'theme-scope-standard-property',
          selector: block.selector,
          property: prop.property,
          line: block.line,
          message:
            `Setting "${prop.property}" on <${tagName}> host in a theme scope won't reach shadow DOM internals. ` +
            `The shadow root's internal styles control element appearance. Use CSS custom properties instead.`,
          suggestion: `Replace with component tokens: \`${block.selector} { --${tagName}-${prop.property === 'background-color' ? 'bg' : prop.property}: ${prop.value}; }\``,
        });
      }
    }
  }

  return {
    issues,
    clean: issues.length === 0,
  };
}
