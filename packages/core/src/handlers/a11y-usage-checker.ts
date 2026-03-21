/**
 * Accessibility Usage Checker — validates consumer HTML for common
 * accessibility mistakes when using web components.
 *
 * Detects:
 * 1. Missing accessible labels on components that require them
 *    (icon buttons, dialogs, selects, etc.)
 * 2. Manual role overrides on components that self-assign ARIA roles
 */

import { parseCem } from './cem.js';
import type { Cem, ComponentMetadata } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface A11yUsageIssue {
  rule: 'missing-label' | 'role-override';
  severity: 'error' | 'warning';
  line: number;
  message: string;
}

export interface A11yUsageResult {
  issues: A11yUsageIssue[];
  clean: boolean;
}

// ─── Known patterns ─────────────────────────────────────────────────────────

/**
 * Components known to self-assign ARIA roles. Manual `role` on these
 * will conflict with the component's internal role management.
 * Pattern: tag name suffixes that imply a role.
 */
const SELF_ASSIGNING_ROLE_SUFFIXES = [
  '-tab',
  '-tab-panel',
  '-option',
  '-listbox',
  '-dialog',
  '-alert',
  '-menu',
  '-menu-item',
  '-radio',
  '-radio-button',
  '-checkbox',
  '-switch',
  '-slider',
  '-tooltip',
  '-combobox',
  '-tree',
  '-tree-item',
];

/**
 * Heuristic: components that need an accessible label are those with
 * a `label` member whose description mentions "accessible", "accessibility",
 * or "required", OR are icon-only components (icon-button pattern).
 */
function needsAccessibleLabel(meta: ComponentMetadata): boolean {
  // Check if any member named "label" has accessibility-related description
  const labelMember = meta.members.find((m) => m.name === 'label' || m.attribute === 'label');
  if (!labelMember) return false;

  const desc = (labelMember.description ?? '').toLowerCase();
  return (
    desc.includes('accessib') ||
    desc.includes('required') ||
    desc.includes('icon-only') ||
    desc.includes('icon only') ||
    // Components with "label" slot + "label" attribute often need labels
    meta.slots.some((s) => s.name === 'label')
  );
}

// ─── HTML Parsing ───────────────────────────────────────────────────────────

interface ParsedTag {
  attributes: Map<string, string | true>;
  hasTextContent: boolean;
  line: number;
}

function parseTag(html: string, tagName: string): ParsedTag | null {
  const lines = html.split('\n');
  const openRegex = new RegExp(`<${tagName}(\\s|>|$)`, 'i');
  let startLine = -1;
  let tagContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (startLine === -1) {
      if (openRegex.test(line)) {
        startLine = i + 1;
        tagContent += line;
      }
    } else {
      tagContent += ' ' + line;
    }
    if (startLine !== -1 && tagContent.includes('>')) break;
  }

  if (startLine === -1) return null;

  // Extract attributes
  const attributes = new Map<string, string | true>();
  const afterTag = tagContent.slice(tagContent.toLowerCase().indexOf(tagName) + tagName.length);
  const closingIdx = afterTag.indexOf('>');
  const attrStr = closingIdx >= 0 ? afterTag.slice(0, closingIdx) : afterTag;

  const attrRegex = /\b([a-z][a-z0-9-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/gi;
  let match: RegExpExecArray | null;
  attrRegex.lastIndex = 0;
  while ((match = attrRegex.exec(attrStr)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    if (name === '/' || name === '') continue;
    const value = match[2] ?? match[3] ?? match[4] ?? true;
    attributes.set(name, value);
  }

  // Check for text content between open/close tags
  const closeRegex = new RegExp(`</${tagName}\\s*>`, 'i');
  const fullMatch = html.match(
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)${closeRegex.source}`, 'i'),
  );
  const innerContent = fullMatch?.[1]?.trim() ?? '';
  const hasTextContent = innerContent.length > 0;

  return { attributes, hasTextContent, line: startLine };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkA11yUsage(html: string, tagName: string, cem: Cem): A11yUsageResult {
  const meta = parseCem(tagName, cem);
  const parsed = parseTag(html, tagName);

  if (!parsed) {
    return { issues: [], clean: true };
  }

  const issues: A11yUsageIssue[] = [];

  // Check 1: Missing accessible label
  if (needsAccessibleLabel(meta)) {
    const hasLabel = parsed.attributes.has('label');
    const hasAriaLabel = parsed.attributes.has('aria-label');
    const hasAriaLabelledBy = parsed.attributes.has('aria-labelledby');
    const hasLabelSlotChild = /<[^>]+\bslot\s*=\s*"label"/.test(html);

    if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy && !hasLabelSlotChild) {
      issues.push({
        rule: 'missing-label',
        severity: 'error',
        line: parsed.line,
        message: `<${tagName}> requires an accessible label. Add a "label" attribute, "aria-label", "aria-labelledby", or use the "label" slot.`,
      });
    }
  }

  // Check 2: Manual role override on self-assigning components
  if (parsed.attributes.has('role')) {
    const lower = tagName.toLowerCase();
    const selfAssigns = SELF_ASSIGNING_ROLE_SUFFIXES.some((suffix) => lower.endsWith(suffix));

    if (selfAssigns) {
      issues.push({
        rule: 'role-override',
        severity: 'warning',
        line: parsed.line,
        message: `<${tagName}> self-assigns its ARIA role. Setting role="${String(parsed.attributes.get('role'))}" manually will conflict with the component's internal accessibility implementation.`,
      });
    }
  }

  return {
    issues,
    clean: issues.length === 0,
  };
}
