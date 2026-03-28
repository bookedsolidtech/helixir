/**
 * API Surface Quality Analyzer — unit tests
 *
 * Tests analyzeApiSurface() covering:
 *   - Method documentation scoring (30 pts)
 *   - Attribute reflection scoring (25 pts)
 *   - Default values documented scoring (25 pts)
 *   - Property descriptions scoring (20 pts)
 *   - Null return for empty components
 *   - Proportional normalization when some categories absent
 */

import { describe, it, expect } from 'vitest';
import { analyzeApiSurface } from '../../../packages/core/src/handlers/analyzers/api-surface.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FULLY_DOCUMENTED: CemDeclaration = {
  kind: 'class',
  name: 'FullyDocumented',
  tagName: 'fully-documented',
  members: [
    {
      kind: 'field',
      name: 'value',
      type: { text: 'string' },
      description: 'The current value.',
      default: '"hello"',
      attribute: 'value',
      reflects: true,
    },
    {
      kind: 'field',
      name: 'disabled',
      type: { text: 'boolean' },
      description: 'Disables the component.',
      default: 'false',
      attribute: 'disabled',
    },
    {
      kind: 'method',
      name: 'reset',
      description: 'Resets to initial state.',
      return: { type: { text: 'void' } },
    },
    {
      kind: 'method',
      name: 'validate',
      description: 'Validates the current value.',
      return: { type: { text: 'boolean' } },
    },
  ],
};

const UNDOCUMENTED: CemDeclaration = {
  kind: 'class',
  name: 'Undocumented',
  tagName: 'undocumented',
  members: [
    { kind: 'field', name: 'value' },
    { kind: 'field', name: 'count' },
    { kind: 'method', name: 'reset' },
    { kind: 'method', name: 'update' },
  ],
};

const EMPTY_COMPONENT: CemDeclaration = {
  kind: 'class',
  name: 'Empty',
  tagName: 'empty-thing',
};

const METHODS_ONLY: CemDeclaration = {
  kind: 'class',
  name: 'MethodsOnly',
  tagName: 'methods-only',
  members: [
    { kind: 'method', name: 'open', description: 'Opens the panel.' },
    { kind: 'method', name: 'close', description: 'Closes the panel.' },
    { kind: 'method', name: 'toggle', description: 'Toggles open state.' },
  ],
};

const FIELDS_ONLY: CemDeclaration = {
  kind: 'class',
  name: 'FieldsOnly',
  tagName: 'fields-only',
  members: [
    {
      kind: 'field',
      name: 'label',
      type: { text: 'string' },
      description: 'Visible label.',
      default: '""',
      attribute: 'label',
    },
    {
      kind: 'field',
      name: 'placeholder',
      type: { text: 'string' },
      description: 'Placeholder text.',
      default: '""',
      attribute: 'placeholder',
    },
  ],
};

const PARTIAL_DOCS: CemDeclaration = {
  kind: 'class',
  name: 'PartialDocs',
  tagName: 'partial-docs',
  members: [
    {
      kind: 'field',
      name: 'value',
      type: { text: 'string' },
      description: 'The value.',
      default: '""',
      attribute: 'value',
    },
    { kind: 'field', name: 'count', type: { text: 'number' } }, // no description, no default, no attribute
    {
      kind: 'method',
      name: 'reset',
      description: 'Resets it.',
    },
    { kind: 'method', name: 'update' }, // no description
  ],
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('analyzeApiSurface', () => {
  describe('null return cases', () => {
    it('returns null for component with no members', () => {
      const result = analyzeApiSurface(EMPTY_COMPONENT);
      expect(result).toBeNull();
    });

    it('returns null when members is undefined', () => {
      const decl: CemDeclaration = { kind: 'class', name: 'NoMembers', tagName: 'no-members' };
      expect(analyzeApiSurface(decl)).toBeNull();
    });

    it('returns null when members array is empty', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'EmptyMembers',
        tagName: 'empty-members',
        members: [],
      };
      expect(analyzeApiSurface(decl)).toBeNull();
    });
  });

  describe('result structure', () => {
    it('returns score, confidence, and subMetrics', () => {
      const result = analyzeApiSurface(FULLY_DOCUMENTED);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('subMetrics');
    });

    it('confidence is always heuristic', () => {
      expect(analyzeApiSurface(FULLY_DOCUMENTED)!.confidence).toBe('heuristic');
      expect(analyzeApiSurface(UNDOCUMENTED)!.confidence).toBe('heuristic');
      expect(analyzeApiSurface(METHODS_ONLY)!.confidence).toBe('heuristic');
    });

    it('has 4 sub-metrics', () => {
      const result = analyzeApiSurface(FULLY_DOCUMENTED);
      expect(result!.subMetrics).toHaveLength(4);
    });

    it('sub-metric names match expected categories', () => {
      const result = analyzeApiSurface(FULLY_DOCUMENTED);
      const names = result!.subMetrics.map((m) => m.name);
      expect(names).toContain('Method documentation');
      expect(names).toContain('Attribute reflection');
      expect(names).toContain('Default values documented');
      expect(names).toContain('Property descriptions');
    });
  });

  describe('full documentation scoring', () => {
    it('scores 100 for a fully-documented component', () => {
      const result = analyzeApiSurface(FULLY_DOCUMENTED);
      expect(result!.score).toBe(100);
    });

    it('scores method documentation as full when all methods have descriptions', () => {
      const result = analyzeApiSurface(FULLY_DOCUMENTED);
      const methodMetric = result!.subMetrics.find((m) => m.name === 'Method documentation');
      expect(methodMetric!.score).toBe(methodMetric!.maxScore);
    });

    it('scores attribute reflection as full when all fields have attributes', () => {
      const result = analyzeApiSurface(FULLY_DOCUMENTED);
      const attrMetric = result!.subMetrics.find((m) => m.name === 'Attribute reflection');
      expect(attrMetric!.score).toBe(attrMetric!.maxScore);
    });

    it('scores default values as full when all fields have defaults', () => {
      const result = analyzeApiSurface(FULLY_DOCUMENTED);
      const defaultMetric = result!.subMetrics.find((m) => m.name === 'Default values documented');
      expect(defaultMetric!.score).toBe(defaultMetric!.maxScore);
    });

    it('scores property descriptions as full when all fields have descriptions', () => {
      const result = analyzeApiSurface(FULLY_DOCUMENTED);
      const propMetric = result!.subMetrics.find((m) => m.name === 'Property descriptions');
      expect(propMetric!.score).toBe(propMetric!.maxScore);
    });
  });

  describe('low documentation scoring', () => {
    it('scores low for undocumented component', () => {
      const result = analyzeApiSurface(UNDOCUMENTED);
      expect(result!.score).toBeLessThan(20);
    });

    it('scores 0 for method documentation when no methods have descriptions', () => {
      const result = analyzeApiSurface(UNDOCUMENTED);
      const methodMetric = result!.subMetrics.find((m) => m.name === 'Method documentation');
      expect(methodMetric!.score).toBe(0);
    });

    it('scores 0 for attribute reflection when no fields have attributes', () => {
      const result = analyzeApiSurface(UNDOCUMENTED);
      const attrMetric = result!.subMetrics.find((m) => m.name === 'Attribute reflection');
      expect(attrMetric!.score).toBe(0);
    });

    it('scores 0 for default values when no fields have defaults', () => {
      const result = analyzeApiSurface(UNDOCUMENTED);
      const defaultMetric = result!.subMetrics.find((m) => m.name === 'Default values documented');
      expect(defaultMetric!.score).toBe(0);
    });

    it('scores 0 for property descriptions when no fields have descriptions', () => {
      const result = analyzeApiSurface(UNDOCUMENTED);
      const propMetric = result!.subMetrics.find((m) => m.name === 'Property descriptions');
      expect(propMetric!.score).toBe(0);
    });
  });

  describe('methods-only component', () => {
    it('returns a result for methods-only component', () => {
      const result = analyzeApiSurface(METHODS_ONLY);
      expect(result).not.toBeNull();
    });

    it('scores well when all methods are documented', () => {
      const result = analyzeApiSurface(METHODS_ONLY);
      // Only method dimension applies; field dimensions score 0 (no fields)
      // Score is normalized to applicable max
      expect(result!.score).toBeGreaterThan(0);
    });

    it('scores field-related sub-metrics as 0 when no fields exist', () => {
      const result = analyzeApiSurface(METHODS_ONLY);
      const attrMetric = result!.subMetrics.find((m) => m.name === 'Attribute reflection');
      const defaultMetric = result!.subMetrics.find((m) => m.name === 'Default values documented');
      const propMetric = result!.subMetrics.find((m) => m.name === 'Property descriptions');
      expect(attrMetric!.score).toBe(0);
      expect(defaultMetric!.score).toBe(0);
      expect(propMetric!.score).toBe(0);
    });
  });

  describe('fields-only component', () => {
    it('returns a result for fields-only component', () => {
      const result = analyzeApiSurface(FIELDS_ONLY);
      expect(result).not.toBeNull();
    });

    it('scores method documentation as 0 when no methods exist', () => {
      const result = analyzeApiSurface(FIELDS_ONLY);
      const methodMetric = result!.subMetrics.find((m) => m.name === 'Method documentation');
      expect(methodMetric!.score).toBe(0);
    });

    it('normalizes score to 100 for fully-documented fields-only component', () => {
      const result = analyzeApiSurface(FIELDS_ONLY);
      expect(result!.score).toBe(100);
    });
  });

  describe('partial documentation scoring', () => {
    it('scores proportionally for partial documentation', () => {
      const result = analyzeApiSurface(PARTIAL_DOCS);
      expect(result).not.toBeNull();
      // Not 0 and not 100
      expect(result!.score).toBeGreaterThan(0);
      expect(result!.score).toBeLessThan(100);
    });

    it('scores method documentation at 50% when half methods documented', () => {
      const result = analyzeApiSurface(PARTIAL_DOCS);
      const methodMetric = result!.subMetrics.find((m) => m.name === 'Method documentation');
      // 1 of 2 methods has description → round(1/2 * 30) = 15
      expect(methodMetric!.score).toBe(15);
    });

    it('scores attribute reflection at 50% when half fields have attributes', () => {
      const result = analyzeApiSurface(PARTIAL_DOCS);
      const attrMetric = result!.subMetrics.find((m) => m.name === 'Attribute reflection');
      // 1 of 2 fields has attribute → round(1/2 * 25) = 13 (or 12)
      expect(attrMetric!.score).toBeGreaterThan(0);
      expect(attrMetric!.score).toBeLessThan(25);
    });

    it('scores default values at 50% when half fields have defaults', () => {
      const result = analyzeApiSurface(PARTIAL_DOCS);
      const defaultMetric = result!.subMetrics.find((m) => m.name === 'Default values documented');
      // 1 of 2 fields has default
      expect(defaultMetric!.score).toBeGreaterThan(0);
      expect(defaultMetric!.score).toBeLessThan(25);
    });
  });

  describe('reflects field for attribute reflection', () => {
    it('counts reflects:true as attribute binding', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'WithReflects',
        tagName: 'with-reflects',
        members: [
          { kind: 'field', name: 'open', type: { text: 'boolean' }, reflects: true },
          { kind: 'field', name: 'value', type: { text: 'string' }, attribute: 'value' },
        ],
      };
      const result = analyzeApiSurface(decl);
      const attrMetric = result!.subMetrics.find((m) => m.name === 'Attribute reflection');
      // Both fields qualify: one via reflects, one via attribute
      expect(attrMetric!.score).toBe(attrMetric!.maxScore);
    });
  });

  describe('score bounds', () => {
    it('score is always in range [0, 100]', () => {
      const decls = [FULLY_DOCUMENTED, UNDOCUMENTED, PARTIAL_DOCS, METHODS_ONLY, FIELDS_ONLY];
      for (const decl of decls) {
        const result = analyzeApiSurface(decl);
        if (result) {
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
        }
      }
    });

    it('sub-metric maxScore values sum to 100', () => {
      const result = analyzeApiSurface(FULLY_DOCUMENTED);
      const maxSum = result!.subMetrics.reduce((acc, m) => acc + m.maxScore, 0);
      expect(maxSum).toBe(100);
    });
  });
});
