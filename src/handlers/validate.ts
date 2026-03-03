import type { Cem } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
}

export interface ValidationResult {
  tagName: string;
  valid: boolean;
  issues: ValidationIssue[];
  formatted: string;
}

// --- Parsing helpers ---

/**
 * Extracts attribute name→value pairs from the opening tag of an HTML element.
 * Handles double-quoted, single-quoted, and boolean attributes.
 */
function parseOpeningTagAttributes(html: string, tagName: string): Map<string, string | null> {
  const attrs = new Map<string, string | null>();

  // Match the opening tag for the given tagName
  const tagPattern = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'i');
  const tagMatch = tagPattern.exec(html);
  if (!tagMatch || !tagMatch[1]) return attrs;

  const attrStr = tagMatch[1];

  // Match attr="value", attr='value', or bare attr
  const attrPattern = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = attrPattern.exec(attrStr)) !== null) {
    const name = (m[1] ?? '').toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? null;
    attrs.set(name, value);
  }

  return attrs;
}

/**
 * Extracts all slot="name" values from child elements in the HTML.
 * Returns a Set of slot names used (empty string = default slot content).
 */
function parseUsedSlots(html: string): Set<string> {
  const slots = new Set<string>();

  // Collect explicit slot="name" usages
  const slotPattern = /slot\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/gi;
  let m: RegExpExecArray | null;
  while ((m = slotPattern.exec(html)) !== null) {
    slots.add(m[1] ?? m[2] ?? m[3] ?? '');
  }

  return slots;
}

/**
 * Levenshtein distance for "did you mean?" suggestions.
 */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = Array.from({ length: rows * cols }, (_, k) => {
    const i = Math.floor(k / cols);
    const j = k % cols;
    return i === 0 ? j : j === 0 ? i : 0;
  });
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const idx = i * cols + j;
      dp[idx] =
        a[i - 1] === b[j - 1]
          ? (dp[(i - 1) * cols + (j - 1)] ?? 0)
          : 1 +
            Math.min(
              dp[(i - 1) * cols + j] ?? 0,
              dp[i * cols + (j - 1)] ?? 0,
              dp[(i - 1) * cols + (j - 1)] ?? 0,
            );
    }
  }
  return dp[(rows - 1) * cols + (cols - 1)] ?? 0;
}

function suggest(name: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(name, c);
    if (d < bestDist && d <= 3) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * Extracts enum values from a union type string like `'sm' | 'md' | 'lg'`.
 */
function extractEnumValues(typeText: string): string[] | null {
  if (!typeText.includes('|')) return null;
  const parts = typeText.split('|').map((p) => p.trim().replace(/^['"]|['"]$/g, ''));
  return parts.length >= 2 ? parts : null;
}

// --- Main ---

function findDeclaration(cem: Cem, tagName: string) {
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) return decl;
    }
  }
  return undefined;
}

/**
 * Validates an HTML snippet against the Custom Elements Manifest (CEM) spec for a given component.
 *
 * @param tagName - The custom element tag name to validate against (e.g. `"my-button"`).
 * @param html - The HTML snippet string to parse and validate.
 * @param cem - The parsed Custom Elements Manifest containing component declarations.
 * @returns A `ValidationResult` containing the tag name, overall validity, a list of issues, and a formatted summary string.
 * @throws {MCPError} If `tagName` is not found in the CEM.
 */
export function validateUsage(tagName: string, html: string, cem: Cem): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. Verify tag name exists
  const decl = findDeclaration(cem, tagName);
  if (!decl) {
    throw new MCPError(`Component "${tagName}" not found in CEM.`, ErrorCategory.NOT_FOUND);
  }

  const fields = (decl.members ?? []).filter((m) => m.kind === 'field');

  // Build map of valid HTML attribute names → member info
  const validAttrs = new Map<
    string,
    { propertyName: string; type: string; description: string; hasDefault: boolean }
  >();
  for (const f of fields) {
    // Use explicit attribute name if present, otherwise use property name as attribute
    const attrName = (f.attribute ?? f.name).toLowerCase();
    validAttrs.set(attrName, {
      propertyName: f.name,
      type: f.type?.text ?? '',
      description: f.description ?? '',
      hasDefault: f.default !== undefined,
    });
  }

  // Also allow class, id, slot, style, data-* as global HTML attrs
  const GLOBAL_ATTRS = new Set([
    'class',
    'id',
    'slot',
    'style',
    'tabindex',
    'aria-label',
    'aria-hidden',
    'aria-expanded',
    'aria-controls',
    'aria-describedby',
    'role',
    'hidden',
    'title',
    'lang',
    'dir',
    'draggable',
    'spellcheck',
    'contenteditable',
  ]);

  // 2. Parse attributes from opening tag
  const usedAttrs = parseOpeningTagAttributes(html, tagName);
  const validAttrNames = Array.from(validAttrs.keys());

  for (const [attrName, attrValue] of usedAttrs) {
    if (
      GLOBAL_ATTRS.has(attrName) ||
      attrName.startsWith('data-') ||
      attrName.startsWith('aria-')
    ) {
      continue;
    }

    const info = validAttrs.get(attrName);
    if (!info) {
      const hint = suggest(attrName, validAttrNames);
      const msg = hint
        ? `Unknown attribute: "${attrName}" (did you mean "${hint}"?)`
        : `Unknown attribute: "${attrName}"`;
      issues.push({ level: 'error', message: msg });
      continue;
    }

    // 3. Deprecated check
    if (info.description.toLowerCase().includes('@deprecated')) {
      issues.push({ level: 'warning', message: `Attribute "${attrName}" is deprecated` });
    }

    // 5. Type mismatch hints for enum types
    if (attrValue !== null) {
      const enumValues = extractEnumValues(info.type);
      if (enumValues && !enumValues.includes(attrValue)) {
        issues.push({
          level: 'warning',
          message: `"${attrName}" value "${attrValue}" may be invalid. Valid values: ${enumValues.map((v) => `"${v}"`).join(' | ')}`,
        });
      }
    }
  }

  // 4. Check invalid slot names
  const validSlotNames = new Set((decl.slots ?? []).map((s) => s.name));
  const usedSlots = parseUsedSlots(html);
  for (const slotName of usedSlots) {
    if (!validSlotNames.has(slotName)) {
      const candidates = Array.from(validSlotNames);
      const hint = suggest(slotName, candidates);
      const msg = hint
        ? `Unknown slot: "${slotName}" (did you mean "${hint}"?)`
        : `Unknown slot: "${slotName}"`;
      issues.push({ level: 'error', message: msg });
    }
  }

  // Build formatted output
  const lines: string[] = [`Validation Results for <${tagName}>:`];
  if (issues.length === 0) {
    lines.push('✅ No issues found.');
  } else {
    for (const issue of issues) {
      const icon = issue.level === 'error' ? '❌' : issue.level === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`${icon} ${issue.message}`);
    }
  }

  const hasErrors = issues.some((i) => i.level === 'error');
  return {
    tagName,
    valid: !hasErrors,
    issues,
    formatted: lines.join('\n'),
  };
}
