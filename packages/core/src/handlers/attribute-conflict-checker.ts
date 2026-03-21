/**
 * Attribute Conflict Checker — detects conditional attributes used without
 * their guard conditions, based on CEM member descriptions.
 *
 * Detects:
 * 1. "Only used when X is present/set" — attribute needs a guard attribute
 * 2. "Only applies to X types" — attribute needs a specific type value
 * 3. "Only valid when type is X" — attribute gated by type value
 */

import { parseCem } from './cem.js';
import type { Cem } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AttributeConstraint {
  attribute: string;
  guardAttribute: string;
  guardValues: string[] | null; // null = guard just needs to be present, string[] = needs specific values
  description: string;
}

export interface AttributeConflictIssue {
  attribute: string;
  guardAttribute: string;
  guardValues: string[] | null;
  line: number;
  message: string;
}

export interface AttributeConflictResult {
  issues: AttributeConflictIssue[];
  constraintsChecked: number;
  clean: boolean;
}

// ─── Constraint Extraction ──────────────────────────────────────────────────

// "Only used when `href` is present/set"
const ONLY_WHEN_PRESENT =
  /only\s+(?:used|applicable|relevant)\s+when\s+[`"]?(\w[\w-]*)[`"]?\s+is\s+(?:present|set)/i;

// "Only applies to X and Y types" / "Only applies to X types"
const ONLY_APPLIES_TO_TYPES = /only\s+applies\s+to\s+([\w,\s]+?)\s+(?:input\s+)?types?/i;

// "Only valid when type is X" / "Only valid when type is 'checkbox'"
const ONLY_VALID_WHEN_TYPE = /only\s+valid\s+when\s+(\w+)\s+is\s+[`"']?(\w+)[`"']?/i;

/**
 * Extract type values from a phrase like "date and number" or "password"
 */
function extractTypeValues(phrase: string): string[] {
  return phrase
    .split(/\s+and\s+|\s*,\s*/)
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

/**
 * Parse CEM member descriptions to extract attribute constraints.
 */
export function parseAttributeConstraints(cem: Cem, tagName: string): AttributeConstraint[] {
  const meta = parseCem(tagName, cem);
  const constraints: AttributeConstraint[] = [];

  for (const member of meta.members) {
    const desc = member.description ?? '';
    if (!desc) continue;

    const attrName = member.attribute ?? member.name;

    // Check "Only used when X is present/set"
    const presentMatch = ONLY_WHEN_PRESENT.exec(desc);
    if (presentMatch) {
      constraints.push({
        attribute: attrName,
        guardAttribute: presentMatch[1] ?? '',
        guardValues: null,
        description: desc,
      });
      continue;
    }

    // Check "Only applies to X types"
    const typesMatch = ONLY_APPLIES_TO_TYPES.exec(desc);
    if (typesMatch) {
      const values = extractTypeValues(typesMatch[1] ?? '');
      constraints.push({
        attribute: attrName,
        guardAttribute: 'type',
        guardValues: values,
        description: desc,
      });
      continue;
    }

    // Check "Only valid when type is X"
    const validMatch = ONLY_VALID_WHEN_TYPE.exec(desc);
    if (validMatch) {
      constraints.push({
        attribute: attrName,
        guardAttribute: validMatch[1] ?? 'type',
        guardValues: [validMatch[2]?.toLowerCase() ?? ''],
        description: desc,
      });
      continue;
    }
  }

  return constraints;
}

// ─── HTML Attribute Extraction ──────────────────────────────────────────────

interface ParsedElement {
  attributes: Map<string, string | true>; // true = boolean attribute (no value)
  startLine: number;
}

/**
 * Parse the opening tag of a component from HTML to extract attributes.
 */
function parseOpeningTag(html: string, tagName: string): ParsedElement | null {
  const lines = html.split('\n');

  // Find lines containing the opening tag
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

  // Extract attributes from the tag content
  const attributes = new Map<string, string | true>();

  // Match attribute="value" or attribute='value' or bare attribute
  const attrRegex = /\b([a-z][a-z0-9-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/gi;
  // Skip the tag name itself
  const afterTag = tagContent.slice(tagContent.indexOf(tagName) + tagName.length);

  let match: RegExpExecArray | null;
  attrRegex.lastIndex = 0;
  while ((match = attrRegex.exec(afterTag)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    if (name === '/' || name === '') continue;
    const value = match[2] ?? match[3] ?? match[4] ?? true;
    attributes.set(name, typeof value === 'string' ? value.toLowerCase() : value);
  }

  return { attributes, startLine };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkAttributeConflicts(
  html: string,
  tagName: string,
  cem: Cem,
): AttributeConflictResult {
  const constraints = parseAttributeConstraints(cem, tagName);
  if (constraints.length === 0) {
    return { issues: [], constraintsChecked: 0, clean: true };
  }

  const parsed = parseOpeningTag(html, tagName);
  if (!parsed) {
    return { issues: [], constraintsChecked: constraints.length, clean: true };
  }

  const issues: AttributeConflictIssue[] = [];

  for (const constraint of constraints) {
    const hasAttr = parsed.attributes.has(constraint.attribute);
    if (!hasAttr) continue; // Attribute not used, no conflict possible

    const guardValue = parsed.attributes.get(constraint.guardAttribute);

    if (constraint.guardValues === null) {
      // Guard just needs to be present
      if (guardValue === undefined) {
        issues.push({
          attribute: constraint.attribute,
          guardAttribute: constraint.guardAttribute,
          guardValues: null,
          line: parsed.startLine,
          message: `"${constraint.attribute}" has no effect without "${constraint.guardAttribute}". ${constraint.description}`,
        });
      }
    } else {
      // Guard needs a specific value
      const currentValue = typeof guardValue === 'string' ? guardValue : undefined;
      const isValid = currentValue !== undefined && constraint.guardValues.includes(currentValue);

      if (!isValid) {
        issues.push({
          attribute: constraint.attribute,
          guardAttribute: constraint.guardAttribute,
          guardValues: constraint.guardValues,
          line: parsed.startLine,
          message: `"${constraint.attribute}" only applies when "${constraint.guardAttribute}" is ${constraint.guardValues.map((v) => `"${v}"`).join(' or ')}. ${constraint.description}`,
        });
      }
    }
  }

  return {
    issues,
    constraintsChecked: constraints.length,
    clean: issues.length === 0,
  };
}
