import type { CemMember } from './cem.js';

export interface PropConstraintValue {
  value: string;
  description: string;
}

export interface PropConstraintTable {
  attribute: string;
  type: 'union' | 'boolean' | 'string' | 'number' | 'other';
  values?: PropConstraintValue[];
  raw_type: string;
}

/**
 * Parses a union type string (e.g. "'primary' | 'danger' | 'warning'") into
 * an array of individual value strings. Returns null if the type is not a union.
 */
function parseUnionType(typeText: string): string[] | null {
  if (!typeText.includes('|')) return null;
  return typeText
    .split('|')
    .map((v) => v.trim().replace(/^['"`]|['"`]$/g, ''))
    .filter(Boolean);
}

/**
 * Looks for a per-value description in jsdocTags.
 * Matches tags whose text begins with the value name followed by a space.
 * E.g. `{ name: "param", text: "primary Primary call-to-action variant" }`.
 */
function descriptionFromJsdocTags(
  value: string,
  jsdocTags?: Array<{ name: string; text?: string }>,
): string | null {
  if (!jsdocTags) return null;
  for (const tag of jsdocTags) {
    const text = (tag.text ?? '').trim();
    if (text.startsWith(value + ' ') || text.startsWith(value + '\t')) {
      return text.slice(value.length).trim();
    }
    if (text === value) {
      return null; // exact match but no description
    }
  }
  return null;
}

/**
 * Heuristically generates a human-readable description from a union type value name.
 * E.g. "primary" → "Primary variant", "success" → "Success variant".
 */
function heuristicDescription(value: string): string {
  const capitalized = value.charAt(0).toUpperCase() + value.slice(1);
  return `${capitalized} variant`;
}

/**
 * Formats a CEM member's type as a structured constraint table.
 *
 * - For union types: returns `type: "union"` with a `values` array. Each value
 *   gets a description sourced from jsdocTags (if provided) or heuristically
 *   generated from the value name.
 * - For boolean, string, or number types: returns the simple type with no values array.
 * - For unknown/complex types: returns `type: "other"` with no values array.
 */
export function formatPropConstraints(
  attribute: CemMember,
  jsdocTags?: Array<{ name: string; text?: string }>,
): PropConstraintTable {
  const rawType = attribute.type?.text ?? 'unknown';
  const unionValues = parseUnionType(rawType);

  if (unionValues) {
    const values: PropConstraintValue[] = unionValues.map((v) => ({
      value: v,
      description: descriptionFromJsdocTags(v, jsdocTags) ?? heuristicDescription(v),
    }));
    return {
      attribute: attribute.name,
      type: 'union',
      values,
      raw_type: rawType,
    };
  }

  const normalizedType = rawType.toLowerCase().trim();
  let simpleType: 'boolean' | 'string' | 'number' | 'other' = 'other';
  if (normalizedType === 'boolean') simpleType = 'boolean';
  else if (normalizedType === 'string') simpleType = 'string';
  else if (normalizedType === 'number') simpleType = 'number';

  return {
    attribute: attribute.name,
    type: simpleType,
    raw_type: rawType,
  };
}
