/**
 * HTML Usage Checker — validates consumer HTML against CEM metadata.
 *
 * Scans HTML text for a specific web component and flags:
 * 1. Unknown slot names (with fuzzy match suggestions)
 * 2. Invalid enum attribute values
 * 3. Boolean attributes set to string "true"/"false"
 * 4. Unknown attributes (with fuzzy match to known members)
 */

import type { ComponentMetadata } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HtmlUsageIssue {
  line: number;
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  suggestion: string;
}

export interface HtmlUsageCheckResult {
  tagName: string;
  issues: HtmlUsageIssue[];
  clean: boolean;
}

// ─── Levenshtein distance ────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) {
    const row = dp[i];
    if (row) row[0] = i;
  }
  for (let j = 0; j <= n; j++) {
    const row = dp[0];
    if (row) row[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const prevRow = dp[i - 1];
      const currRow = dp[i];
      if (prevRow && currRow) {
        currRow[j] = Math.min(
          (prevRow[j] ?? 0) + 1,
          (currRow[j - 1] ?? 0) + 1,
          (prevRow[j - 1] ?? 0) + cost,
        );
      }
    }
  }

  const lastRow = dp[m];
  return lastRow ? (lastRow[n] ?? 0) : 0;
}

function findClosestMatch(input: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  let best: string | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(input, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return bestDist <= 3 ? best : null;
}

// ─── Standard HTML attributes to ignore ─────────────────────────────────────

const STANDARD_HTML_ATTRS = new Set([
  'class',
  'id',
  'style',
  'hidden',
  'title',
  'tabindex',
  'lang',
  'dir',
  'draggable',
  'contenteditable',
  'spellcheck',
  'autofocus',
  'role',
  'part',
  'exportparts',
  'is',
  'inputmode',
  'enterkeyhint',
  'popover',
  'popovertarget',
  'popovertargetaction',
  'accesskey',
  'translate',
  'inert',
  'nonce',
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractEnumValues(typeText: string): string[] | null {
  // Match patterns like "'primary' | 'secondary' | 'danger'"
  const matches = typeText.match(/'([^']+)'/g);
  if (!matches || matches.length < 2) return null;
  return matches.map((m) => m.replace(/'/g, ''));
}

function isAttributeIgnored(attrName: string): boolean {
  if (STANDARD_HTML_ATTRS.has(attrName)) return true;
  if (attrName.startsWith('aria-')) return true;
  if (attrName.startsWith('data-')) return true;
  if (attrName === 'slot') return true;
  // Framework-specific bindings
  if (attrName.startsWith('@') || attrName.startsWith('v-') || attrName.startsWith(':'))
    return true;
  if (attrName.startsWith('.') || attrName.startsWith('on')) return true;
  return false;
}

// ─── Checkers ───────────────────────────────────────────────────────────────

function checkSlots(lines: string[], meta: ComponentMetadata): HtmlUsageIssue[] {
  const issues: HtmlUsageIssue[] = [];
  const validSlots = new Set(meta.slots.map((s) => s.name));
  const slotPattern = /slot="([^"]+)"/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let match: RegExpExecArray | null;
    slotPattern.lastIndex = 0;
    while ((match = slotPattern.exec(line)) !== null) {
      const slotName = match[1] ?? '';
      if (!validSlots.has(slotName)) {
        const slotNames = meta.slots.map((s) => s.name).filter((n) => n !== '');
        const closest = findClosestMatch(slotName, slotNames);
        const suggestion = closest
          ? `Did you mean slot="${closest}"? Available slots: ${slotNames.join(', ') || 'default only'}`
          : `Available slots: ${slotNames.join(', ') || 'default only'}`;
        issues.push({
          line: i + 1,
          severity: 'error',
          rule: 'unknown-slot',
          message: `"${slotName}" is not a known slot of <${meta.tagName}>.`,
          suggestion,
        });
      }
    }
  }

  return issues;
}

function checkEnumValues(lines: string[], meta: ComponentMetadata): HtmlUsageIssue[] {
  const issues: HtmlUsageIssue[] = [];

  // Build a map of attribute name → valid enum values
  const enumFields = new Map<string, string[]>();
  for (const member of meta.members) {
    if (member.kind !== 'field') continue;
    const values = extractEnumValues(member.type);
    if (values) {
      enumFields.set(member.name, values);
    }
  }

  if (enumFields.size === 0) return issues;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const [attrName, validValues] of enumFields) {
      const attrPattern = new RegExp(`${attrName}="([^"]*)"`, 'g');
      let match: RegExpExecArray | null;
      attrPattern.lastIndex = 0;
      while ((match = attrPattern.exec(line)) !== null) {
        const value = match[1] ?? '';
        if (!validValues.includes(value)) {
          issues.push({
            line: i + 1,
            severity: 'error',
            rule: 'invalid-enum-value',
            message: `"${value}" is not a valid value for "${attrName}" on <${meta.tagName}>.`,
            suggestion: `Valid values: ${validValues.join(', ')}`,
          });
        }
      }
    }
  }

  return issues;
}

function checkBooleanAttributes(lines: string[], meta: ComponentMetadata): HtmlUsageIssue[] {
  const issues: HtmlUsageIssue[] = [];

  const booleanFields = meta.members
    .filter((m) => m.kind === 'field' && m.type === 'boolean')
    .map((m) => m.name);

  if (booleanFields.length === 0) return issues;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const attrName of booleanFields) {
      const pattern = new RegExp(`${attrName}="([^"]*)"`, 'g');
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(line)) !== null) {
        const value = match[1] ?? '';
        if (value === '' || value === attrName) continue; // valid HTML boolean patterns
        if (value === 'true' || value === 'false') {
          const suggestion =
            value === 'false'
              ? `To disable "${attrName}", remove the attribute entirely.`
              : `Use bare attribute: <${meta.tagName} ${attrName}> instead of ${attrName}="true".`;
          issues.push({
            line: i + 1,
            severity: 'warning',
            rule: 'boolean-string-value',
            message: `Boolean attribute "${attrName}" should not be set to "${value}".`,
            suggestion,
          });
        }
      }
    }
  }

  return issues;
}

function checkUnknownAttributes(lines: string[], meta: ComponentMetadata): HtmlUsageIssue[] {
  const issues: HtmlUsageIssue[] = [];
  const knownAttrs = new Set(meta.members.filter((m) => m.kind === 'field').map((m) => m.name));

  // Match the component's opening tag and extract attributes
  const tagPattern = new RegExp(`<${escapeRegex(meta.tagName)}\\s+([^>]*)>`, 'gi');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let tagMatch: RegExpExecArray | null;
    tagPattern.lastIndex = 0;
    while ((tagMatch = tagPattern.exec(line)) !== null) {
      const attrsStr = tagMatch[1] ?? '';
      // Extract attribute names (handles bare attrs and key="value" attrs)
      const attrPattern = /(\S+?)(?:=(?:"[^"]*"|'[^']*'|\S+))?(?=\s|$)/g;
      let attrMatch: RegExpExecArray | null;
      attrPattern.lastIndex = 0;
      while ((attrMatch = attrPattern.exec(attrsStr)) !== null) {
        const rawAttr = attrMatch[1] ?? '';
        // Strip leading framework prefixes for checking
        const attrName = rawAttr.replace(/^[:.@]/, '');
        if (!attrName) continue;
        if (isAttributeIgnored(attrName)) continue;
        if (isAttributeIgnored(rawAttr)) continue;
        if (knownAttrs.has(attrName)) continue;

        const closest = findClosestMatch(attrName, Array.from(knownAttrs));
        const suggestion = closest
          ? `Did you mean "${closest}"? Known attributes: ${Array.from(knownAttrs).join(', ')}`
          : `Known attributes: ${Array.from(knownAttrs).join(', ')}`;

        issues.push({
          line: i + 1,
          severity: 'warning',
          rule: 'unknown-attribute',
          message: `"${attrName}" is not a known attribute of <${meta.tagName}>.`,
          suggestion,
        });
      }
    }
  }

  return issues;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkHtmlUsage(htmlText: string, meta: ComponentMetadata): HtmlUsageCheckResult {
  const lines = htmlText.split('\n');
  const issues: HtmlUsageIssue[] = [];

  issues.push(...checkSlots(lines, meta));
  issues.push(...checkEnumValues(lines, meta));
  issues.push(...checkBooleanAttributes(lines, meta));
  issues.push(...checkUnknownAttributes(lines, meta));

  issues.sort((a, b) => a.line - b.line);

  return {
    tagName: meta.tagName,
    issues,
    clean: issues.length === 0,
  };
}
