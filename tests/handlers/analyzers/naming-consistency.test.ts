/**
 * Naming Consistency Analyzer — unit tests (analyzers/ subdirectory)
 *
 * Tests all exported functions from naming-consistency.ts covering:
 *   - detectLibraryEventPrefix()
 *   - detectLibraryCssPrefix()
 *   - detectLibraryConventions()
 *   - scoreEventPrefixCoherence()
 *   - scorePropertyNamingConsistency()
 *   - scoreCSSCustomPropertyPrefixing()
 *   - scoreAttributePropertyCoherence()
 *   - analyzeNamingConsistency()
 *
 * Additional edge cases beyond tests/handlers/naming-consistency.test.ts:
 *   - snake_case properties detected as alternate convention
 *   - Confidence level logic
 *   - Normalization when dimensions are excluded
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeNamingConsistency,
  detectLibraryConventions,
  detectLibraryEventPrefix,
  detectLibraryCssPrefix,
  scoreEventPrefixCoherence,
  scorePropertyNamingConsistency,
  scoreCSSCustomPropertyPrefixing,
  scoreAttributePropertyCoherence,
  type LibraryNamingConventions,
} from '../../../packages/core/src/handlers/analyzers/naming-consistency.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDecl(overrides: Partial<CemDeclaration> = {}): CemDeclaration {
  return {
    kind: 'class',
    name: 'TestComponent',
    tagName: 'test-component',
    ...overrides,
  } as CemDeclaration;
}

const NO_PREFIX_CONVENTIONS: LibraryNamingConventions = {
  eventPrefix: null,
  eventPrefixConfidence: 0,
  cssPrefix: null,
  cssPrefixConfidence: 0,
};

const HX_CONVENTIONS: LibraryNamingConventions = {
  eventPrefix: 'hx-',
  eventPrefixConfidence: 1.0,
  cssPrefix: '--hx-',
  cssPrefixConfidence: 1.0,
};

// ─── detectLibraryEventPrefix ─────────────────────────────────────────────────

describe('detectLibraryEventPrefix', () => {
  it('returns null prefix for empty declarations array', () => {
    const result = detectLibraryEventPrefix([]);
    expect(result.prefix).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('returns null prefix when no events exist across library', () => {
    const decls = [makeDecl({ events: [] }), makeDecl({ events: [] })];
    const result = detectLibraryEventPrefix(decls);
    expect(result.prefix).toBeNull();
  });

  it('detects prefix when majority of events share it', () => {
    const decls = [
      makeDecl({ events: [{ name: 'sl-click' }, { name: 'sl-focus' }] }),
      makeDecl({ events: [{ name: 'sl-change' }, { name: 'sl-blur' }] }),
    ];
    const result = detectLibraryEventPrefix(decls);
    expect(result.prefix).toBe('sl-');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('returns null when events have no common prefix (below 50% threshold)', () => {
    const decls = [
      makeDecl({ events: [{ name: 'click' }, { name: 'change' }, { name: 'sl-focus' }] }),
    ];
    const result = detectLibraryEventPrefix(decls);
    // Only 1 of 3 events has 'sl-' prefix → below 50% → null
    expect(result.prefix).toBeNull();
  });

  it('aggregates events across multiple declarations', () => {
    const decls = [
      makeDecl({ events: [{ name: 'ion-click' }] }),
      makeDecl({ events: [{ name: 'ion-change' }] }),
      makeDecl({ events: [{ name: 'ion-focus' }] }),
    ];
    const result = detectLibraryEventPrefix(decls);
    expect(result.prefix).toBe('ion-');
  });
});

// ─── detectLibraryCssPrefix ───────────────────────────────────────────────────

describe('detectLibraryCssPrefix', () => {
  it('returns null prefix for empty declarations array', () => {
    const result = detectLibraryCssPrefix([]);
    expect(result.prefix).toBeNull();
  });

  it('returns null prefix when no CSS properties exist', () => {
    const decls = [makeDecl({ cssProperties: [] })];
    const result = detectLibraryCssPrefix(decls);
    expect(result.prefix).toBeNull();
  });

  it('detects -- prefix from CSS properties', () => {
    const decls = [
      makeDecl({ cssProperties: [{ name: '--sl-color-primary' }, { name: '--sl-spacing-base' }] }),
      makeDecl({ cssProperties: [{ name: '--sl-font-size' }, { name: '--sl-border-radius' }] }),
    ];
    const result = detectLibraryCssPrefix(decls);
    expect(result.prefix).toBe('--sl-');
  });

  it('adds -- prefix back to detected prefix', () => {
    const decls = [
      makeDecl({
        cssProperties: [{ name: '--hx-button-color' }, { name: '--hx-button-bg' }],
      }),
    ];
    const result = detectLibraryCssPrefix(decls);
    expect(result.prefix?.startsWith('--')).toBe(true);
  });
});

// ─── detectLibraryConventions ────────────────────────────────────────────────

describe('detectLibraryConventions', () => {
  it('detects both event and CSS prefixes together', () => {
    const decls = [
      makeDecl({
        events: [{ name: 'md-click' }, { name: 'md-change' }],
        cssProperties: [{ name: '--md-color-primary' }, { name: '--md-color-secondary' }],
      }),
      makeDecl({
        events: [{ name: 'md-focus' }, { name: 'md-blur' }],
        cssProperties: [{ name: '--md-spacing-md' }],
      }),
    ];
    const result = detectLibraryConventions(decls);
    expect(result.eventPrefix).toBe('md-');
    expect(result.cssPrefix).toBe('--md-');
    expect(result.eventPrefixConfidence).toBeGreaterThanOrEqual(0.5);
    expect(result.cssPrefixConfidence).toBeGreaterThanOrEqual(0.5);
  });

  it('returns null prefixes when library has no consistent conventions', () => {
    const decls = [
      makeDecl({
        events: [{ name: 'click' }, { name: 'change' }],
        cssProperties: [],
      }),
    ];
    const result = detectLibraryConventions(decls);
    expect(result.eventPrefix).toBeNull();
    expect(result.cssPrefix).toBeNull();
  });
});

// ─── scoreEventPrefixCoherence ────────────────────────────────────────────────

describe('scoreEventPrefixCoherence', () => {
  it('returns null for component with no events', () => {
    const decl = makeDecl({ events: [] });
    expect(scoreEventPrefixCoherence(decl, 'sl-')).toBeNull();
  });

  it('returns null when events is undefined', () => {
    const decl = makeDecl({});
    // Default events are undefined → treated as empty
    expect(scoreEventPrefixCoherence(decl, 'sl-')).toBeNull();
  });

  it('gives full 30 points when all events match prefix', () => {
    const decl = makeDecl({
      events: [{ name: 'hx-click' }, { name: 'hx-focus' }, { name: 'hx-change' }],
    });
    const result = scoreEventPrefixCoherence(decl, 'hx-');
    expect(result!.score).toBe(30);
    expect(result!.subMetric.maxScore).toBe(30);
  });

  it('gives 0 points when no events match prefix', () => {
    const decl = makeDecl({
      events: [{ name: 'click' }, { name: 'focus' }],
    });
    const result = scoreEventPrefixCoherence(decl, 'hx-');
    expect(result!.score).toBe(0);
  });

  it('scores proportionally for partial prefix match', () => {
    const decl = makeDecl({
      events: [
        { name: 'sl-click' },
        { name: 'sl-focus' },
        { name: 'custom-event' }, // doesn't match
      ],
    });
    const result = scoreEventPrefixCoherence(decl, 'sl-');
    // 2 of 3 match → round(2/3 * 30) = 20
    expect(result!.score).toBe(20);
  });

  it('gives full marks when no library prefix is detected (no penalty)', () => {
    const decl = makeDecl({ events: [{ name: 'click' }, { name: 'change' }] });
    const result = scoreEventPrefixCoherence(decl, null);
    expect(result!.score).toBe(30);
    expect(result!.subMetric.note).toContain('not scored');
  });

  it('subMetric name is "Event prefix coherence"', () => {
    const decl = makeDecl({ events: [{ name: 'hx-click' }] });
    const result = scoreEventPrefixCoherence(decl, 'hx-');
    expect(result!.subMetric.name).toBe('Event prefix coherence');
  });
});

// ─── scorePropertyNamingConsistency ──────────────────────────────────────────

describe('scorePropertyNamingConsistency', () => {
  it('gives full 25 points for components with no fields', () => {
    const decl = makeDecl({ members: [] });
    const result = scorePropertyNamingConsistency(decl);
    expect(result.score).toBe(25);
    expect(result.subMetric.note).toContain('trivially');
  });

  it('gives full 25 for all camelCase properties', () => {
    const decl = makeDecl({
      members: [
        { kind: 'field', name: 'value' },
        { kind: 'field', name: 'isDisabled' },
        { kind: 'field', name: 'maxLength' },
      ],
    });
    const result = scorePropertyNamingConsistency(decl);
    expect(result.score).toBe(25);
  });

  it('gives full 25 for all snake_case properties (alternate valid convention)', () => {
    const decl = makeDecl({
      members: [
        { kind: 'field', name: 'is_disabled' },
        { kind: 'field', name: 'max_length' },
        { kind: 'field', name: 'default_value' },
      ],
    });
    const result = scorePropertyNamingConsistency(decl);
    // All snake_case → consistent → full score
    expect(result.score).toBe(25);
  });

  it('scores mixed conventions proportionally using dominant convention', () => {
    const decl = makeDecl({
      members: [
        { kind: 'field', name: 'value' }, // camelCase (single word)
        { kind: 'field', name: 'maxLength' }, // camelCase
        { kind: 'field', name: 'is_broken' }, // snake_case
        { kind: 'field', name: 'CONSTANT' }, // neither (all caps)
      ],
    });
    const result = scorePropertyNamingConsistency(decl);
    // 2 camelCase, 1 snake_case, 1 neither → camelCase dominant → 2/4 consistent
    // round(2/4 * 25) = 13
    expect(result.score).toBe(13);
  });

  it('treats single-word lowercase names as camelCase', () => {
    const decl = makeDecl({
      members: [
        { kind: 'field', name: 'value' },
        { kind: 'field', name: 'label' },
        { kind: 'field', name: 'open' },
      ],
    });
    const result = scorePropertyNamingConsistency(decl);
    expect(result.score).toBe(25);
  });

  it('subMetric name is "Property naming consistency"', () => {
    const decl = makeDecl({ members: [{ kind: 'field', name: 'value' }] });
    const result = scorePropertyNamingConsistency(decl);
    expect(result.subMetric.name).toBe('Property naming consistency');
  });

  it('ignores method members (only scores fields)', () => {
    const decl = makeDecl({
      members: [
        { kind: 'method', name: 'RESET' }, // method with bad casing
        { kind: 'field', name: 'value' }, // camelCase field
      ],
    });
    const result = scorePropertyNamingConsistency(decl);
    // Only 1 field exists, it's camelCase → 25/25
    expect(result.score).toBe(25);
  });
});

// ─── scoreCSSCustomPropertyPrefixing ─────────────────────────────────────────

describe('scoreCSSCustomPropertyPrefixing', () => {
  it('returns null for component with no CSS properties', () => {
    const decl = makeDecl({ cssProperties: [] });
    expect(scoreCSSCustomPropertyPrefixing(decl, '--hx-')).toBeNull();
  });

  it('gives full 25 when all CSS properties match prefix', () => {
    const decl = makeDecl({
      cssProperties: [{ name: '--hx-color-primary' }, { name: '--hx-spacing-lg' }],
    });
    const result = scoreCSSCustomPropertyPrefixing(decl, '--hx-');
    expect(result!.score).toBe(25);
  });

  it('gives 0 when no CSS properties match prefix', () => {
    const decl = makeDecl({
      cssProperties: [{ name: '--other-color' }, { name: '--wrong-spacing' }],
    });
    const result = scoreCSSCustomPropertyPrefixing(decl, '--hx-');
    expect(result!.score).toBe(0);
  });

  it('gives full marks when no CSS prefix detected (no penalty)', () => {
    const decl = makeDecl({ cssProperties: [{ name: '--color-primary' }] });
    const result = scoreCSSCustomPropertyPrefixing(decl, null);
    expect(result!.score).toBe(25);
    expect(result!.subMetric.note).toContain('not scored');
  });

  it('scores proportionally for partial prefix match', () => {
    const decl = makeDecl({
      cssProperties: [
        { name: '--sl-color-primary' },
        { name: '--sl-spacing-base' },
        { name: '--custom-override' }, // doesn't match
      ],
    });
    const result = scoreCSSCustomPropertyPrefixing(decl, '--sl-');
    // 2 of 3 match → round(2/3 * 25) = 17
    expect(result!.score).toBe(17);
  });
});

// ─── scoreAttributePropertyCoherence ─────────────────────────────────────────

describe('scoreAttributePropertyCoherence', () => {
  it('gives full 20 points when no attribute-mapped properties exist', () => {
    const decl = makeDecl({
      members: [
        { kind: 'field', name: 'value' }, // no attribute
      ],
    });
    const result = scoreAttributePropertyCoherence(decl);
    expect(result.score).toBe(20);
    expect(result.subMetric.note).toContain('trivially');
  });

  it('gives full 20 for correct kebab-case attribute mappings', () => {
    const decl = makeDecl({
      members: [
        { kind: 'field', name: 'maxLength', attribute: 'max-length' },
        { kind: 'field', name: 'isDisabled', attribute: 'is-disabled' },
        { kind: 'field', name: 'value', attribute: 'value' }, // single word
      ],
    });
    const result = scoreAttributePropertyCoherence(decl);
    expect(result.score).toBe(20);
  });

  it('gives 0 for completely incoherent attribute mappings', () => {
    const decl = makeDecl({
      members: [
        { kind: 'field', name: 'maxLength', attribute: 'maxlength' }, // should be max-length
        { kind: 'field', name: 'isDisabled', attribute: 'disabled' }, // should be is-disabled
      ],
    });
    const result = scoreAttributePropertyCoherence(decl);
    expect(result.score).toBe(0);
  });

  it('scores proportionally for mixed coherence', () => {
    const decl = makeDecl({
      members: [
        { kind: 'field', name: 'value', attribute: 'value' }, // correct
        { kind: 'field', name: 'maxLength', attribute: 'max-length' }, // correct
        { kind: 'field', name: 'isOpen', attribute: 'isopen' }, // incorrect
        { kind: 'field', name: 'onClick', attribute: 'onclick' }, // incorrect
      ],
    });
    const result = scoreAttributePropertyCoherence(decl);
    // 2 of 4 coherent → round(2/4 * 20) = 10
    expect(result.score).toBe(10);
  });

  it('subMetric name is "Attribute-property coherence"', () => {
    const decl = makeDecl({ members: [{ kind: 'field', name: 'value', attribute: 'value' }] });
    const result = scoreAttributePropertyCoherence(decl);
    expect(result.subMetric.name).toBe('Attribute-property coherence');
  });
});

// ─── analyzeNamingConsistency ────────────────────────────────────────────────

describe('analyzeNamingConsistency', () => {
  it('returns a result with score, confidence, subMetrics', () => {
    const decl = makeDecl({
      events: [{ name: 'hx-click' }],
      members: [{ kind: 'field', name: 'value', attribute: 'value' }],
    });
    const result = analyzeNamingConsistency(decl, HX_CONVENTIONS);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('subMetrics');
  });

  it('scores 100 for fully consistent component with known conventions', () => {
    const decl = makeDecl({
      events: [{ name: 'hx-click' }, { name: 'hx-focus' }],
      members: [
        { kind: 'field', name: 'value', attribute: 'value' },
        { kind: 'field', name: 'isDisabled', attribute: 'is-disabled' },
      ],
      cssProperties: [{ name: '--hx-button-color' }, { name: '--hx-button-bg' }],
    });
    const result = analyzeNamingConsistency(decl, HX_CONVENTIONS);
    expect(result!.score).toBe(100);
  });

  it('scores low for inconsistent component with known conventions', () => {
    const decl = makeDecl({
      events: [{ name: 'CLICK' }, { name: 'FOCUS' }], // no hx- prefix
      members: [
        { kind: 'field', name: 'IS_VALUE', attribute: 'IS_VALUE' }, // inconsistent
      ],
      cssProperties: [{ name: '--wrong-prefix-color' }], // no hx- prefix
    });
    const result = analyzeNamingConsistency(decl, HX_CONVENTIONS);
    expect(result!.score).toBeLessThan(30);
  });

  it('assigns verified confidence when no prefix conventions exist', () => {
    // With no prefix to detect, it's pure naming analysis → verified
    const decl = makeDecl({
      members: [{ kind: 'field', name: 'value', attribute: 'value' }],
    });
    const result = analyzeNamingConsistency(decl, NO_PREFIX_CONVENTIONS);
    expect(result!.confidence).toBe('verified');
  });

  it('assigns verified confidence when prefix confidence is high (> 0.7)', () => {
    const decl = makeDecl({
      events: [{ name: 'hx-click' }],
      members: [{ kind: 'field', name: 'value', attribute: 'value' }],
    });
    const highConfConventions: LibraryNamingConventions = {
      ...HX_CONVENTIONS,
      eventPrefixConfidence: 0.9,
    };
    const result = analyzeNamingConsistency(decl, highConfConventions);
    expect(result!.confidence).toBe('verified');
  });

  it('assigns heuristic confidence when prefix confidence is medium (0-0.7)', () => {
    const decl = makeDecl({
      events: [{ name: 'hx-click' }],
      members: [{ kind: 'field', name: 'value', attribute: 'value' }],
    });
    const medConfConventions: LibraryNamingConventions = {
      eventPrefix: 'hx-',
      eventPrefixConfidence: 0.6,
      cssPrefix: null,
      cssPrefixConfidence: 0,
    };
    const result = analyzeNamingConsistency(decl, medConfConventions);
    expect(result!.confidence).toBe('heuristic');
  });

  it('normalizes score to 0-100 when some dimensions are excluded', () => {
    // No events, no CSS → only property naming (25) + attribute coherence (20) apply
    const decl = makeDecl({
      members: [
        { kind: 'field', name: 'value', attribute: 'value' },
        { kind: 'field', name: 'label', attribute: 'label' },
      ],
    });
    const result = analyzeNamingConsistency(decl, NO_PREFIX_CONVENTIONS);
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
    expect(result!.score).toBe(100); // both dimensions fully satisfied
  });

  it('includes event prefix sub-metric only when events exist', () => {
    const noEventDecl = makeDecl({
      members: [{ kind: 'field', name: 'value', attribute: 'value' }],
    });
    const withEventDecl = makeDecl({
      events: [{ name: 'hx-click' }],
      members: [{ kind: 'field', name: 'value', attribute: 'value' }],
    });

    const noEventResult = analyzeNamingConsistency(noEventDecl, HX_CONVENTIONS);
    const withEventResult = analyzeNamingConsistency(withEventDecl, HX_CONVENTIONS);

    const noEventNames = noEventResult!.subMetrics.map((m) => m.name);
    const withEventNames = withEventResult!.subMetrics.map((m) => m.name);

    expect(noEventNames).not.toContain('Event prefix coherence');
    expect(withEventNames).toContain('Event prefix coherence');
  });

  it('includes CSS prefix sub-metric only when CSS properties exist', () => {
    const noCssDecl = makeDecl({
      members: [{ kind: 'field', name: 'value', attribute: 'value' }],
    });
    const withCssDecl = makeDecl({
      cssProperties: [{ name: '--hx-color' }],
      members: [{ kind: 'field', name: 'value', attribute: 'value' }],
    });

    const noCssResult = analyzeNamingConsistency(noCssDecl, HX_CONVENTIONS);
    const withCssResult = analyzeNamingConsistency(withCssDecl, HX_CONVENTIONS);

    const noCssNames = noCssResult!.subMetrics.map((m) => m.name);
    const withCssNames = withCssResult!.subMetrics.map((m) => m.name);

    expect(noCssNames).not.toContain('CSS custom property prefixing');
    expect(withCssNames).toContain('CSS custom property prefixing');
  });
});
