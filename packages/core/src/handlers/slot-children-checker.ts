/**
 * Slot Children Checker — validates that children placed inside a component's
 * slots match the expected element types declared in the CEM slot descriptions.
 *
 * Detects:
 * 1. Wrong child elements in constrained slots ("Must be <X>" → error)
 * 2. Suboptimal child elements in advisory slots ("Works best with <X>" → warning)
 * 3. Multiple allowed tag patterns ("or" / comma-separated)
 */

import { parseCem } from './cem.js';
import type { Cem, CemSlot } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SlotConstraint {
  slotName: string;
  requiredTags: string[];
  severity: 'error' | 'warning';
  description: string;
}

export interface SlotChildIssue {
  slotName: string;
  childTag: string;
  expectedTags: string[];
  severity: 'error' | 'warning';
  line: number;
  message: string;
}

export interface SlotChildCheckResult {
  issues: SlotChildIssue[];
  constraintsFound: number;
  clean: boolean;
}

// ─── Constraint Extraction ──────────────────────────────────────────────────

// Matches tag names in backtick-wrapped or bare angle-bracket patterns
const TAG_PATTERN = /`?<([a-z][a-z0-9]*-[a-z0-9-]*)>`?/gi;

/**
 * Extracts all custom element tag names from a description string.
 */
function extractTags(description: string): string[] {
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  TAG_PATTERN.lastIndex = 0;
  while ((match = TAG_PATTERN.exec(description)) !== null) {
    const tag = match[1]?.toLowerCase();
    if (tag) tags.push(tag);
  }
  return tags;
}

/**
 * Determines the severity of a slot constraint based on description keywords.
 * - "Must be" / "Accepts" → error (hard constraint)
 * - "Works best with" / "should be" → warning (soft recommendation)
 */
function detectSeverity(description: string): 'error' | 'warning' | null {
  const lower = description.toLowerCase();
  if (/\bmust be\b/.test(lower) || /\baccepts\b/.test(lower)) return 'error';
  if (/\bworks best with\b/.test(lower) || /\bshould be\b/.test(lower)) return 'warning';
  // Check for patterns like "where <tag> elements are placed"
  if (/where\b.*elements?\b/.test(lower)) return 'warning';
  return null;
}

/**
 * Parses CEM slot definitions to extract slot child constraints.
 */
export function parseSlotConstraints(slots: CemSlot[]): SlotConstraint[] {
  const constraints: SlotConstraint[] = [];

  for (const slot of slots) {
    const desc = slot.description ?? '';
    const tags = extractTags(desc);
    if (tags.length === 0) continue;

    const severity = detectSeverity(desc);
    if (severity === null) continue;

    constraints.push({
      slotName: slot.name,
      requiredTags: tags,
      severity,
      description: desc,
    });
  }

  return constraints;
}

// ─── HTML Parsing Helpers ───────────────────────────────────────────────────

interface ChildElement {
  tagName: string;
  slotAttr: string | null;
  line: number;
}

/**
 * Extracts direct children of the outermost occurrence of `parentTag` in HTML.
 * Uses a tag-stack approach to track nesting depth.
 */
function extractDirectChildren(html: string, parentTag: string): ChildElement[] {
  const children: ChildElement[] = [];
  const lines = html.split('\n');

  // Find the opening and closing lines of parentTag
  const openPattern = new RegExp(`<${parentTag}(\\s|>|/>)`, 'i');
  const closePattern = new RegExp(`</${parentTag}\\s*>`, 'i');
  let parentStartLine = -1;
  let parentEndLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (parentStartLine === -1 && openPattern.test(lines[i] ?? '')) {
      parentStartLine = i;
    }
  }
  if (parentStartLine === -1) return children;

  for (let i = lines.length - 1; i >= parentStartLine; i--) {
    if (closePattern.test(lines[i] ?? '')) {
      parentEndLine = i;
      break;
    }
  }
  if (parentEndLine === -1) return children;

  // Join inner content and scan it token by token
  const innerLines = lines.slice(parentStartLine + 1, parentEndLine);
  const innerOffset = parentStartLine + 1;

  // Track nesting depth — at depth 0, opening tags are direct children
  let depth = 0;

  for (let i = 0; i < innerLines.length; i++) {
    const line = innerLines[i] ?? '';
    const lineNum = innerOffset + i + 1; // 1-based

    // Process all tags on this line in order
    const tagRegex = /<\/?([a-z][a-z0-9-]*)([^>]*?)(\/?)\s*>/gi;
    let match: RegExpExecArray | null;
    tagRegex.lastIndex = 0;

    while ((match = tagRegex.exec(line)) !== null) {
      const fullMatch = match[0] ?? '';
      const tagNameMatch = (match[1] ?? '').toLowerCase();
      const attrs = match[2] ?? '';
      const selfClose = match[3] === '/';
      const isClose = fullMatch.startsWith('</');

      if (isClose) {
        depth = Math.max(0, depth - 1);
      } else if (depth === 0) {
        // Direct child of our parent element
        const slotMatch = /\bslot\s*=\s*"([^"]*)"/.exec(attrs);
        const slotAttr = slotMatch ? (slotMatch[1] ?? null) : null;

        children.push({ tagName: tagNameMatch, slotAttr, line: lineNum });

        if (!selfClose) {
          depth++;
        }
      } else {
        // Nested element — just track depth
        if (!selfClose) {
          depth++;
        }
      }
    }
  }

  return children;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkSlotChildren(html: string, tagName: string, cem: Cem): SlotChildCheckResult {
  const meta = parseCem(tagName, cem);
  const constraints = parseSlotConstraints(meta.slots);

  if (constraints.length === 0) {
    return { issues: [], constraintsFound: 0, clean: true };
  }

  const children = extractDirectChildren(html, tagName);
  const issues: SlotChildIssue[] = [];

  for (const child of children) {
    // Determine which slot this child targets
    const targetSlot = child.slotAttr ?? '';

    // Find matching constraint
    const constraint = constraints.find((c) => c.slotName === targetSlot);
    if (!constraint) continue;

    // Check if child tag is in the allowed list
    const childLower = child.tagName.toLowerCase();
    const isAllowed = constraint.requiredTags.some((t) => t === childLower);

    if (!isAllowed) {
      issues.push({
        slotName: targetSlot,
        childTag: child.tagName,
        expectedTags: constraint.requiredTags,
        severity: constraint.severity,
        line: child.line,
        message:
          constraint.severity === 'error'
            ? `<${child.tagName}> is not a valid child for the "${targetSlot || 'default'}" slot of <${tagName}>. Expected: ${constraint.requiredTags.map((t) => `<${t}>`).join(' or ')}.`
            : `<${child.tagName}> in the "${targetSlot || 'default'}" slot of <${tagName}> — works best with ${constraint.requiredTags.map((t) => `<${t}>`).join(' or ')}.`,
      });
    }
  }

  return {
    issues,
    constraintsFound: constraints.length,
    clean: issues.length === 0,
  };
}
