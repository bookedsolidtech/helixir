/**
 * Unit tests for src/handlers/component.ts (formatPropConstraints).
 */
import { describe, it, expect } from 'vitest';
import { formatPropConstraints } from '../../src/handlers/component.js';
import type { CemMember } from '../../src/handlers/cem.js';

function makeMember(typeText: string, name = 'variant'): CemMember {
  return { kind: 'field', name, type: { text: typeText } };
}

describe('formatPropConstraints — union types', () => {
  it('returns type "union" with values array for a simple union', () => {
    const member = makeMember("'primary' | 'danger' | 'warning'");
    const result = formatPropConstraints(member);

    expect(result.type).toBe('union');
    expect(result.attribute).toBe('variant');
    expect(result.raw_type).toBe("'primary' | 'danger' | 'warning'");
    expect(result.values).toHaveLength(3);
    expect(result.values?.map((v) => v.value)).toEqual(['primary', 'danger', 'warning']);
  });

  it('generates heuristic descriptions for union values without jsdoc tags', () => {
    const member = makeMember("'small' | 'medium' | 'large'");
    const result = formatPropConstraints(member);

    expect(result.values?.[0]?.description).toBe('Small variant');
    expect(result.values?.[1]?.description).toBe('Medium variant');
  });

  it('uses jsdoc tag descriptions when available', () => {
    const member = makeMember("'primary' | 'danger'");
    const tags = [
      { name: 'param', text: 'primary The main action style' },
      { name: 'param', text: 'danger A destructive action style' },
    ];
    const result = formatPropConstraints(member, tags);

    expect(result.values?.[0]?.description).toBe('The main action style');
    expect(result.values?.[1]?.description).toBe('A destructive action style');
  });

  it('falls back to heuristic when jsdoc tag text is an exact match with no description', () => {
    const member = makeMember("'primary' | 'danger'");
    const tags = [{ name: 'param', text: 'primary' }];
    const result = formatPropConstraints(member, tags);

    // exact match with no trailing description → falls back to heuristic
    expect(result.values?.[0]?.description).toBe('Primary variant');
  });
});

describe('formatPropConstraints — simple types', () => {
  it('returns type "boolean" for boolean member', () => {
    const member = makeMember('boolean', 'disabled');
    const result = formatPropConstraints(member);

    expect(result.type).toBe('boolean');
    expect(result.values).toBeUndefined();
    expect(result.raw_type).toBe('boolean');
  });

  it('returns type "string" for string member', () => {
    const result = formatPropConstraints(makeMember('string', 'label'));
    expect(result.type).toBe('string');
  });

  it('returns type "number" for number member', () => {
    const result = formatPropConstraints(makeMember('number', 'count'));
    expect(result.type).toBe('number');
  });

  it('returns type "other" for complex types without a union', () => {
    const result = formatPropConstraints(makeMember('Record<string, string>', 'data'));
    expect(result.type).toBe('other');
    expect(result.values).toBeUndefined();
  });

  it('returns type "other" when no type is set', () => {
    const member: CemMember = { kind: 'field', name: 'data' };
    const result = formatPropConstraints(member);
    expect(result.type).toBe('other');
    expect(result.raw_type).toBe('unknown');
  });
});
