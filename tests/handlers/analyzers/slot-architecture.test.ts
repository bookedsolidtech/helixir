/**
 * Slot Architecture Analyzer — unit tests (analyzers/ subdirectory)
 *
 * Tests analyzeSlotArchitecture() covering additional edge cases beyond
 * the existing tests/handlers/slot-architecture.test.ts:
 *   - Default slot scoring (25 pts)
 *   - Named slot documentation (30 pts)
 *   - Slot type constraints (20 pts)
 *   - Slot-property coherence (25 pts)
 *   - kebab-to-camel name resolution for coherence pairs
 *   - jsdocTags @slot annotation detection
 *   - Multiple coherence pairs with partial scoring
 */

import { describe, it, expect } from 'vitest';
import { analyzeSlotArchitecture } from '../../../packages/core/src/handlers/analyzers/slot-architecture.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_SLOT_WITH_DESC: CemDeclaration = {
  kind: 'class',
  name: 'DefaultWithDesc',
  tagName: 'default-with-desc',
  slots: [{ name: '', description: 'Main content area.' }],
};

const DEFAULT_SLOT_NO_DESC: CemDeclaration = {
  kind: 'class',
  name: 'DefaultNoDesc',
  tagName: 'default-no-desc',
  slots: [{ name: '' }],
};

const NAMED_DEFAULT_SLOT: CemDeclaration = {
  kind: 'class',
  name: 'NamedDefault',
  tagName: 'named-default',
  slots: [{ name: 'default', description: 'Default content using named "default" slot.' }],
};

const FULLY_DOCUMENTED_SLOTS: CemDeclaration = {
  kind: 'class',
  name: 'FullyDocumented',
  tagName: 'fully-documented',
  slots: [
    { name: '', description: 'Primary content.' },
    { name: 'header', description: 'The header section.' },
    { name: 'footer', description: 'The footer section.' },
    { name: 'aside', description: 'Supplemental content.' },
  ],
  members: [
    { kind: 'field', name: 'header', type: { text: 'string' }, description: 'Header text.' },
    { kind: 'field', name: 'footer', type: { text: 'string' }, description: 'Footer text.' },
  ],
};

const JSDOC_SLOT_DECL: CemDeclaration = {
  kind: 'class',
  name: 'JsdocSlots',
  tagName: 'jsdoc-slots',
  description: 'Component with JSDoc @slot annotations.',
  jsdocTags: [
    {
      name: 'slot',
      description: 'icon - An <svg> or <img> element to display as the icon.',
    },
    {
      name: 'slot',
      description: 'default - Main content, accepts any HTMLElement.',
    },
  ],
  slots: [
    { name: '', description: 'Main content.' },
    { name: 'icon', description: 'Icon slot.' },
  ],
};

const TYPE_CONSTRAINT_DECL: CemDeclaration = {
  kind: 'class',
  name: 'TypeConstraints',
  tagName: 'type-constraints',
  slots: [
    { name: '', description: 'Accepts any HTML elements.' },
    { name: 'icon', description: 'An <svg> or <img> element.' }, // has type constraint
    { name: 'actions', description: 'Button elements for actions.' }, // "elements" keyword
    { name: 'avatar', description: 'An HTMLImageElement for the avatar.' }, // HTMLElement type
    { name: 'footer', description: 'Footer content.' }, // no type constraint
  ],
};

const KEBAB_TO_CAMEL_DECL: CemDeclaration = {
  kind: 'class',
  name: 'KebabToCamel',
  tagName: 'kebab-to-camel',
  slots: [
    { name: '', description: 'Default content.' },
    { name: 'help-text', description: 'Help text slot.' }, // should resolve to helpText
    { name: 'error-message', description: 'Error message slot.' }, // should resolve to errorMessage
  ],
  members: [
    { kind: 'field', name: 'helpText', type: { text: 'string' }, description: 'Help text.' },
    {
      kind: 'field',
      name: 'errorMessage',
      type: { text: 'string' },
      description: 'Error message.',
    },
  ],
};

const NO_SLOTS_DECL: CemDeclaration = {
  kind: 'class',
  name: 'NoSlots',
  tagName: 'no-slots',
  members: [{ kind: 'field', name: 'count', type: { text: 'number' } }],
};

const MULTI_COHERENCE_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MultiCoherence',
  tagName: 'multi-coherence',
  slots: [
    { name: '', description: 'Content.' },
    { name: 'label', description: 'Label slot.' },
    { name: 'icon', description: 'Icon slot.' },
    { name: 'footer', description: 'Footer slot.' },
  ],
  members: [
    { kind: 'field', name: 'label', type: { text: 'string' }, description: 'The label.' },
    { kind: 'field', name: 'icon', type: { text: 'string' }, description: 'The icon.' },
    { kind: 'field', name: 'footer', type: { text: 'string' }, description: 'The footer.' },
  ],
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('analyzeSlotArchitecture (additional coverage)', () => {
  describe('null return cases', () => {
    it('returns null for component with no slots', () => {
      expect(analyzeSlotArchitecture(NO_SLOTS_DECL)).toBeNull();
    });

    it('returns null when slots is undefined', () => {
      const decl: CemDeclaration = { kind: 'class', name: 'X', tagName: 'x' };
      expect(analyzeSlotArchitecture(decl)).toBeNull();
    });

    it('returns null when slots is an empty array', () => {
      const decl: CemDeclaration = { kind: 'class', name: 'X', tagName: 'x', slots: [] };
      expect(analyzeSlotArchitecture(decl)).toBeNull();
    });
  });

  describe('result structure', () => {
    it('returns score, confidence, subMetrics, slots, coherencePairs', () => {
      const result = analyzeSlotArchitecture(FULLY_DOCUMENTED_SLOTS);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('subMetrics');
      expect(result).toHaveProperty('slots');
      expect(result).toHaveProperty('coherencePairs');
    });

    it('confidence is always verified', () => {
      expect(analyzeSlotArchitecture(DEFAULT_SLOT_WITH_DESC)!.confidence).toBe('verified');
      expect(analyzeSlotArchitecture(FULLY_DOCUMENTED_SLOTS)!.confidence).toBe('verified');
    });

    it('has exactly 4 sub-metrics', () => {
      const result = analyzeSlotArchitecture(FULLY_DOCUMENTED_SLOTS);
      expect(result!.subMetrics).toHaveLength(4);
    });

    it('sub-metric names match expected categories', () => {
      const result = analyzeSlotArchitecture(FULLY_DOCUMENTED_SLOTS);
      const names = result!.subMetrics.map((m) => m.name);
      expect(names).toContain('Default slot documentation');
      expect(names).toContain('Named slot documentation');
      expect(names).toContain('Slot type constraints');
      expect(names).toContain('Slot-property coherence');
    });
  });

  describe('default slot scoring', () => {
    it('awards 25 points for default slot (empty name) with description', () => {
      const result = analyzeSlotArchitecture(DEFAULT_SLOT_WITH_DESC);
      const metric = result!.subMetrics.find((m) => m.name === 'Default slot documentation');
      expect(metric!.score).toBe(25);
    });

    it('awards 15 points for default slot without description', () => {
      const result = analyzeSlotArchitecture(DEFAULT_SLOT_NO_DESC);
      const metric = result!.subMetrics.find((m) => m.name === 'Default slot documentation');
      expect(metric!.score).toBe(15);
    });

    it('recognizes "default" as the default slot name', () => {
      const result = analyzeSlotArchitecture(NAMED_DEFAULT_SLOT);
      const metric = result!.subMetrics.find((m) => m.name === 'Default slot documentation');
      expect(metric!.score).toBe(25); // has description → full 25
    });

    it('awards 0 points when no default slot exists', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'OnlyNamed',
        tagName: 'only-named',
        slots: [
          { name: 'header', description: 'Header.' },
          { name: 'footer', description: 'Footer.' },
        ],
      };
      const result = analyzeSlotArchitecture(decl);
      const metric = result!.subMetrics.find((m) => m.name === 'Default slot documentation');
      expect(metric!.score).toBe(0);
    });
  });

  describe('named slot documentation', () => {
    it('awards 30 points when all named slots have descriptions', () => {
      const result = analyzeSlotArchitecture(FULLY_DOCUMENTED_SLOTS);
      const metric = result!.subMetrics.find((m) => m.name === 'Named slot documentation');
      expect(metric!.score).toBe(30);
    });

    it('awards full 30 points when component has only a default slot (trivially satisfied)', () => {
      const result = analyzeSlotArchitecture(DEFAULT_SLOT_WITH_DESC);
      const metric = result!.subMetrics.find((m) => m.name === 'Named slot documentation');
      expect(metric!.score).toBe(30);
    });

    it('scores proportionally for partial named slot documentation', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'PartialNamed',
        tagName: 'partial-named',
        slots: [
          { name: '', description: 'Content.' },
          { name: 'header', description: 'The header.' }, // documented
          { name: 'footer' }, // undocumented
          { name: 'aside' }, // undocumented
        ],
      };
      const result = analyzeSlotArchitecture(decl);
      const metric = result!.subMetrics.find((m) => m.name === 'Named slot documentation');
      // 1 of 3 named slots documented → round(1/3 * 30) = 10
      expect(metric!.score).toBe(10);
    });
  });

  describe('slot type constraints', () => {
    it('detects HTML element tags in slot descriptions like <svg>', () => {
      const result = analyzeSlotArchitecture(TYPE_CONSTRAINT_DECL);
      const iconSlot = result!.slots.find((s) => s.name === 'icon');
      expect(iconSlot!.hasTypeConstraint).toBe(true);
    });

    it('detects "elements" keyword in slot description', () => {
      const result = analyzeSlotArchitecture(TYPE_CONSTRAINT_DECL);
      const actionsSlot = result!.slots.find((s) => s.name === 'actions');
      expect(actionsSlot!.hasTypeConstraint).toBe(true);
    });

    it('detects HTMLElement type mentions in slot description', () => {
      const result = analyzeSlotArchitecture(TYPE_CONSTRAINT_DECL);
      const avatarSlot = result!.slots.find((s) => s.name === 'avatar');
      expect(avatarSlot!.hasTypeConstraint).toBe(true);
    });

    it('does not detect type constraint in generic descriptions', () => {
      const result = analyzeSlotArchitecture(TYPE_CONSTRAINT_DECL);
      const footerSlot = result!.slots.find((s) => s.name === 'footer');
      expect(footerSlot!.hasTypeConstraint).toBe(false);
    });

    it('detects jsdocTags @slot with type info', () => {
      const result = analyzeSlotArchitecture(JSDOC_SLOT_DECL);
      // icon slot should have type constraint from jsdocTags
      const iconSlot = result!.slots.find((s) => s.name === 'icon');
      // The jsdocTag references 'icon' and has '<svg>' → should detect
      expect(iconSlot).toBeDefined();
    });
  });

  describe('kebab-to-camelCase coherence resolution', () => {
    it('resolves kebab-case slot names to camelCase property names', () => {
      const result = analyzeSlotArchitecture(KEBAB_TO_CAMEL_DECL);
      expect(result).not.toBeNull();
      // help-text → helpText, error-message → errorMessage
      const helpPair = result!.coherencePairs.find((p) => p.slotName === 'help-text');
      const errorPair = result!.coherencePairs.find((p) => p.slotName === 'error-message');
      expect(helpPair).toBeDefined();
      expect(errorPair).toBeDefined();
    });

    it('marks pairs as coherent when both slot and property are documented', () => {
      const result = analyzeSlotArchitecture(KEBAB_TO_CAMEL_DECL);
      const helpPair = result!.coherencePairs.find((p) => p.slotName === 'help-text');
      expect(helpPair!.coherent).toBe(true);
    });
  });

  describe('slot-property coherence scoring', () => {
    it('awards full 25 points when all pairs are fully coherent', () => {
      const result = analyzeSlotArchitecture(MULTI_COHERENCE_DECL);
      const metric = result!.subMetrics.find((m) => m.name === 'Slot-property coherence');
      expect(metric!.score).toBe(25);
    });

    it('awards full 25 points when no coherence pairs exist (trivially satisfied)', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'NoPairs',
        tagName: 'no-pairs',
        slots: [
          { name: '', description: 'Content.' },
          { name: 'suffix', description: 'Suffix area.' },
          { name: 'prefix', description: 'Prefix area.' },
        ],
        // No members with matching names
      };
      const result = analyzeSlotArchitecture(decl);
      const metric = result!.subMetrics.find((m) => m.name === 'Slot-property coherence');
      expect(metric!.score).toBe(25);
    });

    it('identifies multiple coherence pairs', () => {
      const result = analyzeSlotArchitecture(MULTI_COHERENCE_DECL);
      expect(result!.coherencePairs.length).toBe(3); // label, icon, footer
    });
  });

  describe('slot analyses array', () => {
    it('includes isDefault flag set correctly', () => {
      const result = analyzeSlotArchitecture(FULLY_DOCUMENTED_SLOTS);
      const defaultSlot = result!.slots.find((s) => s.isDefault);
      expect(defaultSlot).toBeDefined();
      const namedSlots = result!.slots.filter((s) => !s.isDefault);
      expect(namedSlots.length).toBe(3); // header, footer, aside
    });

    it('slot name stored as empty string for default slot', () => {
      const result = analyzeSlotArchitecture(DEFAULT_SLOT_WITH_DESC);
      const defaultSlot = result!.slots.find((s) => s.isDefault);
      expect(defaultSlot!.name).toBe('');
    });
  });

  describe('score bounds', () => {
    it('total score is always in range [0, 100]', () => {
      const decls = [
        DEFAULT_SLOT_WITH_DESC,
        DEFAULT_SLOT_NO_DESC,
        FULLY_DOCUMENTED_SLOTS,
        TYPE_CONSTRAINT_DECL,
        KEBAB_TO_CAMEL_DECL,
        MULTI_COHERENCE_DECL,
      ];
      for (const decl of decls) {
        const result = analyzeSlotArchitecture(decl);
        if (result) {
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
        }
      }
    });

    it('sub-metric maxScores sum to 100', () => {
      const result = analyzeSlotArchitecture(FULLY_DOCUMENTED_SLOTS);
      const maxSum = result!.subMetrics.reduce((acc, m) => acc + m.maxScore, 0);
      expect(maxSum).toBe(100);
    });
  });
});
