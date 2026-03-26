/**
 * Event Architecture Analyzer — unit tests
 *
 * Tests analyzeEventArchitecture() covering:
 *   - Kebab-case naming convention scoring (35 pts)
 *   - Typed event payloads scoring (35 pts)
 *   - Event descriptions scoring (30 pts)
 *   - Null return for components with no events
 *   - isKebabCase validation edge cases
 *   - Mixed convention components
 */

import { describe, it, expect } from 'vitest';
import { analyzeEventArchitecture } from '../../../packages/core/src/handlers/analyzers/event-architecture.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const IDEAL_EVENTS: CemDeclaration = {
  kind: 'class',
  name: 'IdealEvents',
  tagName: 'ideal-events',
  events: [
    {
      name: 'value-change',
      type: { text: 'CustomEvent<{ value: string }>' },
      description: 'Fired when the value changes.',
    },
    {
      name: 'menu-open',
      type: { text: 'CustomEvent<void>' },
      description: 'Fired when the menu opens.',
    },
    {
      name: 'item-selected',
      type: { text: 'CustomEvent<{ item: object }>' },
      description: 'Fired when an item is selected.',
    },
  ],
};

const POOR_EVENTS: CemDeclaration = {
  kind: 'class',
  name: 'PoorEvents',
  tagName: 'poor-events',
  events: [
    { name: 'ValueChange' }, // PascalCase, no type, no desc
    { name: 'onUpdate' }, // camelCase with 'on' prefix, no type, no desc
    { name: 'CLICK_EVENT' }, // SCREAMING_SNAKE, no type, no desc
  ],
};

const NO_EVENTS: CemDeclaration = {
  kind: 'class',
  name: 'NoEvents',
  tagName: 'no-events',
};

const SINGLE_PERFECT_EVENT: CemDeclaration = {
  kind: 'class',
  name: 'SinglePerfect',
  tagName: 'single-perfect',
  events: [
    {
      name: 'sl-click',
      type: { text: 'CustomEvent<{ originalEvent: MouseEvent }>' },
      description: 'Emitted when the button is clicked.',
    },
  ],
};

const MIXED_NAMING: CemDeclaration = {
  kind: 'class',
  name: 'MixedNaming',
  tagName: 'mixed-naming',
  events: [
    { name: 'value-change', type: { text: 'CustomEvent<string>' }, description: 'Value changed.' },
    { name: 'ItemClick', type: { text: 'Event' }, description: 'Item clicked.' }, // PascalCase
    { name: 'focus', type: { text: 'CustomEvent<void>' }, description: 'Focused.' }, // valid single-word
  ],
};

const BARE_EVENT_TYPES: CemDeclaration = {
  kind: 'class',
  name: 'BareEventTypes',
  tagName: 'bare-event-types',
  events: [
    { name: 'change', type: { text: 'Event' }, description: 'Changed.' },
    { name: 'blur', type: { text: 'Event' }, description: 'Blurred.' },
    { name: 'value-change', type: { text: 'CustomEvent<string>' }, description: 'Value changed.' },
  ],
};

const NO_DESCRIPTIONS: CemDeclaration = {
  kind: 'class',
  name: 'NoDescriptions',
  tagName: 'no-descriptions',
  events: [
    { name: 'click', type: { text: 'CustomEvent<void>' } },
    { name: 'change', type: { text: 'CustomEvent<string>' } },
    { name: 'focus', type: { text: 'CustomEvent<void>' } },
  ],
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('analyzeEventArchitecture', () => {
  describe('null return cases', () => {
    it('returns null when no events are declared', () => {
      const result = analyzeEventArchitecture(NO_EVENTS);
      expect(result).toBeNull();
    });

    it('returns null when events array is empty', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'EmptyEvents',
        tagName: 'empty-events',
        events: [],
      };
      expect(analyzeEventArchitecture(decl)).toBeNull();
    });

    it('returns null when events is undefined', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'UndefinedEvents',
        tagName: 'undefined-events',
      };
      expect(analyzeEventArchitecture(decl)).toBeNull();
    });
  });

  describe('result structure', () => {
    it('returns score, confidence, and subMetrics', () => {
      const result = analyzeEventArchitecture(IDEAL_EVENTS);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('subMetrics');
    });

    it('confidence is always heuristic', () => {
      expect(analyzeEventArchitecture(IDEAL_EVENTS)!.confidence).toBe('heuristic');
      expect(analyzeEventArchitecture(POOR_EVENTS)!.confidence).toBe('heuristic');
    });

    it('has exactly 3 sub-metrics', () => {
      const result = analyzeEventArchitecture(IDEAL_EVENTS);
      expect(result!.subMetrics).toHaveLength(3);
    });

    it('sub-metric names match expected categories', () => {
      const result = analyzeEventArchitecture(IDEAL_EVENTS);
      const names = result!.subMetrics.map((m) => m.name);
      expect(names).toContain('Kebab-case naming');
      expect(names).toContain('Typed event payloads');
      expect(names).toContain('Event descriptions');
    });
  });

  describe('ideal events scoring', () => {
    it('scores 100 for fully-compliant events', () => {
      const result = analyzeEventArchitecture(IDEAL_EVENTS);
      expect(result!.score).toBe(100);
    });

    it('scores kebab-case naming at max when all events use kebab-case', () => {
      const result = analyzeEventArchitecture(IDEAL_EVENTS);
      const namingMetric = result!.subMetrics.find((m) => m.name === 'Kebab-case naming');
      expect(namingMetric!.score).toBe(namingMetric!.maxScore);
    });

    it('scores typed payloads at max when all events have CustomEvent<T>', () => {
      const result = analyzeEventArchitecture(IDEAL_EVENTS);
      const typeMetric = result!.subMetrics.find((m) => m.name === 'Typed event payloads');
      expect(typeMetric!.score).toBe(typeMetric!.maxScore);
    });

    it('scores event descriptions at max when all events have descriptions', () => {
      const result = analyzeEventArchitecture(IDEAL_EVENTS);
      const descMetric = result!.subMetrics.find((m) => m.name === 'Event descriptions');
      expect(descMetric!.score).toBe(descMetric!.maxScore);
    });
  });

  describe('poor events scoring', () => {
    it('scores 0 for events with no kebab-case, no types, no descriptions', () => {
      const result = analyzeEventArchitecture(POOR_EVENTS);
      expect(result!.score).toBe(0);
    });

    it('scores kebab-case naming at 0 for PascalCase events', () => {
      const result = analyzeEventArchitecture(POOR_EVENTS);
      const namingMetric = result!.subMetrics.find((m) => m.name === 'Kebab-case naming');
      expect(namingMetric!.score).toBe(0);
    });

    it('scores typed payloads at 0 when no events have types', () => {
      const result = analyzeEventArchitecture(POOR_EVENTS);
      const typeMetric = result!.subMetrics.find((m) => m.name === 'Typed event payloads');
      expect(typeMetric!.score).toBe(0);
    });

    it('scores event descriptions at 0 when no events have descriptions', () => {
      const result = analyzeEventArchitecture(POOR_EVENTS);
      const descMetric = result!.subMetrics.find((m) => m.name === 'Event descriptions');
      expect(descMetric!.score).toBe(0);
    });
  });

  describe('kebab-case naming validation', () => {
    it('accepts single lowercase words as kebab-case', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'SingleWord',
        tagName: 'single-word',
        events: [{ name: 'click' }, { name: 'focus' }, { name: 'change' }],
      };
      const result = analyzeEventArchitecture(decl);
      const namingMetric = result!.subMetrics.find((m) => m.name === 'Kebab-case naming');
      expect(namingMetric!.score).toBe(namingMetric!.maxScore);
    });

    it('accepts multi-segment kebab-case names', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'MultiSegment',
        tagName: 'multi-segment',
        events: [
          { name: 'value-change' },
          { name: 'menu-item-click' },
          { name: 'form-submit' },
        ],
      };
      const result = analyzeEventArchitecture(decl);
      const namingMetric = result!.subMetrics.find((m) => m.name === 'Kebab-case naming');
      expect(namingMetric!.score).toBe(namingMetric!.maxScore);
    });

    it('rejects PascalCase event names', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'PascalCase',
        tagName: 'pascal-case',
        events: [{ name: 'ValueChange' }, { name: 'MenuOpen' }],
      };
      const result = analyzeEventArchitecture(decl);
      const namingMetric = result!.subMetrics.find((m) => m.name === 'Kebab-case naming');
      expect(namingMetric!.score).toBe(0);
    });

    it('rejects camelCase event names', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'CamelCase',
        tagName: 'camel-case',
        events: [{ name: 'valueChange' }, { name: 'menuOpen' }],
      };
      const result = analyzeEventArchitecture(decl);
      const namingMetric = result!.subMetrics.find((m) => m.name === 'Kebab-case naming');
      expect(namingMetric!.score).toBe(0);
    });

    it('allows numbers in kebab-case segments', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'WithNumbers',
        tagName: 'with-numbers',
        events: [{ name: 'step2-complete' }, { name: 'item3-click' }],
      };
      const result = analyzeEventArchitecture(decl);
      const namingMetric = result!.subMetrics.find((m) => m.name === 'Kebab-case naming');
      expect(namingMetric!.score).toBe(namingMetric!.maxScore);
    });
  });

  describe('typed payload validation', () => {
    it('excludes bare "Event" type as untyped', () => {
      const result = analyzeEventArchitecture(BARE_EVENT_TYPES);
      const typeMetric = result!.subMetrics.find((m) => m.name === 'Typed event payloads');
      // 1 of 3 events has proper CustomEvent<T>, 2 have bare 'Event'
      expect(typeMetric!.score).toBeGreaterThan(0);
      expect(typeMetric!.score).toBeLessThan(typeMetric!.maxScore);
    });

    it('accepts CustomEvent<T> as properly typed', () => {
      const result = analyzeEventArchitecture(SINGLE_PERFECT_EVENT);
      const typeMetric = result!.subMetrics.find((m) => m.name === 'Typed event payloads');
      expect(typeMetric!.score).toBe(typeMetric!.maxScore);
    });
  });

  describe('no descriptions', () => {
    it('scores event descriptions at 0 when no events have descriptions', () => {
      const result = analyzeEventArchitecture(NO_DESCRIPTIONS);
      const descMetric = result!.subMetrics.find((m) => m.name === 'Event descriptions');
      expect(descMetric!.score).toBe(0);
    });

    it('still scores kebab-case and typed payloads even without descriptions', () => {
      const result = analyzeEventArchitecture(NO_DESCRIPTIONS);
      const namingMetric = result!.subMetrics.find((m) => m.name === 'Kebab-case naming');
      const typeMetric = result!.subMetrics.find((m) => m.name === 'Typed event payloads');
      expect(namingMetric!.score).toBeGreaterThan(0);
      expect(typeMetric!.score).toBeGreaterThan(0);
    });
  });

  describe('mixed naming conventions', () => {
    it('scores proportionally for mixed kebab/non-kebab events', () => {
      const result = analyzeEventArchitecture(MIXED_NAMING);
      const namingMetric = result!.subMetrics.find((m) => m.name === 'Kebab-case naming');
      // 2 of 3 events are kebab-case (value-change, focus); ItemClick is not
      // round(2/3 * 35) = 23
      expect(namingMetric!.score).toBe(23);
    });
  });

  describe('single event component', () => {
    it('scores 100 for a single perfectly-defined event', () => {
      const result = analyzeEventArchitecture(SINGLE_PERFECT_EVENT);
      expect(result!.score).toBe(100);
    });
  });

  describe('score bounds', () => {
    it('score is always in range [0, 100]', () => {
      const decls = [IDEAL_EVENTS, POOR_EVENTS, MIXED_NAMING, BARE_EVENT_TYPES, NO_DESCRIPTIONS];
      for (const decl of decls) {
        const result = analyzeEventArchitecture(decl);
        if (result) {
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
        }
      }
    });

    it('sub-metric maxScore values sum to 100', () => {
      const result = analyzeEventArchitecture(IDEAL_EVENTS);
      const maxSum = result!.subMetrics.reduce((acc, m) => acc + m.maxScore, 0);
      expect(maxSum).toBe(100);
    });

    it('sub-metric scores sum to total score', () => {
      const result = analyzeEventArchitecture(IDEAL_EVENTS);
      const scoreSum = result!.subMetrics.reduce((acc, m) => acc + m.score, 0);
      expect(scoreSum).toBe(result!.score);
    });
  });
});
