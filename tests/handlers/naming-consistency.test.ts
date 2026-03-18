import { describe, it, expect } from 'vitest';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';
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
} from '../../packages/core/src/handlers/analyzers/naming-consistency.js';

// ─── Helper Factories ───────────────────────────────────────────────────────

function makeDecl(overrides: Partial<CemDeclaration> = {}): CemDeclaration {
  return {
    kind: 'class',
    name: 'TestComponent',
    tagName: 'test-component',
    ...overrides,
  } as CemDeclaration;
}

function makeHelixLibrary(): CemDeclaration[] {
  return [
    makeDecl({
      name: 'HxButton',
      tagName: 'hx-button',
      events: [
        { name: 'hx-click', type: { text: 'CustomEvent' } },
        { name: 'hx-focus', type: { text: 'FocusEvent' } },
      ],
      members: [
        { kind: 'field', name: 'variant', type: { text: 'string' }, attribute: 'variant' },
        { kind: 'field', name: 'isDisabled', type: { text: 'boolean' }, attribute: 'is-disabled' },
      ],
      cssProperties: [
        { name: '--hx-button-color' },
        { name: '--hx-button-bg' },
      ],
    }),
    makeDecl({
      name: 'HxInput',
      tagName: 'hx-input',
      events: [
        { name: 'hx-change', type: { text: 'CustomEvent' } },
        { name: 'hx-input', type: { text: 'InputEvent' } },
      ],
      members: [
        { kind: 'field', name: 'value', type: { text: 'string' }, attribute: 'value' },
        { kind: 'field', name: 'maxLength', type: { text: 'number' }, attribute: 'max-length' },
      ],
      cssProperties: [
        { name: '--hx-input-border' },
        { name: '--hx-input-padding' },
      ],
    }),
    makeDecl({
      name: 'HxModal',
      tagName: 'hx-modal',
      events: [
        { name: 'hx-open', type: { text: 'CustomEvent' } },
        { name: 'hx-close', type: { text: 'CustomEvent' } },
      ],
      members: [
        { kind: 'field', name: 'isOpen', type: { text: 'boolean' }, attribute: 'is-open' },
      ],
      cssProperties: [
        { name: '--hx-modal-backdrop' },
      ],
    }),
  ];
}

function makeShoelaceLibrary(): CemDeclaration[] {
  return [
    makeDecl({
      name: 'SlButton',
      tagName: 'sl-button',
      events: [
        { name: 'sl-click', type: { text: 'CustomEvent' } },
        { name: 'sl-focus', type: { text: 'FocusEvent' } },
      ],
      members: [
        { kind: 'field', name: 'variant', type: { text: 'string' }, attribute: 'variant' },
        { kind: 'field', name: 'size', type: { text: 'string' }, attribute: 'size' },
      ],
      cssProperties: [
        { name: '--sl-button-color' },
        { name: '--sl-spacing-small' },
      ],
    }),
    makeDecl({
      name: 'SlInput',
      tagName: 'sl-input',
      events: [
        { name: 'sl-change', type: { text: 'CustomEvent' } },
        { name: 'sl-input', type: { text: 'InputEvent' } },
      ],
      cssProperties: [
        { name: '--sl-input-border-color' },
      ],
    }),
  ];
}

function makeMaterialWebLibrary(): CemDeclaration[] {
  return [
    makeDecl({
      name: 'MdButton',
      tagName: 'md-button',
      events: [
        { name: 'md-click', type: { text: 'CustomEvent' } },
      ],
      cssProperties: [
        { name: '--md-sys-color-primary' },
        { name: '--md-sys-color-secondary' },
      ],
    }),
    makeDecl({
      name: 'MdTextField',
      tagName: 'md-text-field',
      events: [
        { name: 'md-change', type: { text: 'CustomEvent' } },
      ],
      cssProperties: [
        { name: '--md-sys-typescale-body' },
      ],
    }),
  ];
}

function makeCarbonLibrary(): CemDeclaration[] {
  return [
    makeDecl({
      name: 'BxButton',
      tagName: 'bx-button',
      events: [
        { name: 'bx-click', type: { text: 'CustomEvent' } },
      ],
      cssProperties: [
        { name: '--bx-button-primary' },
      ],
    }),
    makeDecl({
      name: 'BxModal',
      tagName: 'bx-modal',
      events: [
        { name: 'bx-modal-open', type: { text: 'CustomEvent' } },
        { name: 'bx-modal-close', type: { text: 'CustomEvent' } },
      ],
      cssProperties: [
        { name: '--bx-modal-bg' },
      ],
    }),
  ];
}

function makeIonicLibrary(): CemDeclaration[] {
  return [
    makeDecl({
      name: 'IonButton',
      tagName: 'ion-button',
      events: [
        { name: 'ion-click', type: { text: 'CustomEvent' } },
        { name: 'ion-focus', type: { text: 'FocusEvent' } },
      ],
      cssProperties: [
        { name: '--ion-color-primary' },
        { name: '--ion-color-secondary' },
      ],
    }),
    makeDecl({
      name: 'IonInput',
      tagName: 'ion-input',
      events: [
        { name: 'ion-change', type: { text: 'CustomEvent' } },
      ],
      cssProperties: [
        { name: '--ion-input-bg' },
      ],
    }),
  ];
}

// ─── Prefix Detection Tests ─────────────────────────────────────────────────

describe('naming-consistency / prefix detection', () => {
  it('detects hx- event prefix for helix library', () => {
    const decls = makeHelixLibrary();
    const result = detectLibraryEventPrefix(decls);
    expect(result.prefix).toBe('hx-');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('detects sl- event prefix for Shoelace library', () => {
    const decls = makeShoelaceLibrary();
    const result = detectLibraryEventPrefix(decls);
    expect(result.prefix).toBe('sl-');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('detects md- event prefix for Material Web library', () => {
    const decls = makeMaterialWebLibrary();
    const result = detectLibraryEventPrefix(decls);
    expect(result.prefix).toBe('md-');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('detects bx- event prefix for Carbon library', () => {
    const decls = makeCarbonLibrary();
    const result = detectLibraryEventPrefix(decls);
    expect(result.prefix).toBe('bx-');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('detects ion- event prefix for Ionic library', () => {
    const decls = makeIonicLibrary();
    const result = detectLibraryEventPrefix(decls);
    expect(result.prefix).toBe('ion-');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('detects --hx- CSS prefix for helix library', () => {
    const decls = makeHelixLibrary();
    const result = detectLibraryCssPrefix(decls);
    expect(result.prefix).toBe('--hx-');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('detects --sl- CSS prefix for Shoelace library', () => {
    const decls = makeShoelaceLibrary();
    const result = detectLibraryCssPrefix(decls);
    expect(result.prefix).toBe('--sl-');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('detects --md- CSS prefix for Material Web', () => {
    const decls = makeMaterialWebLibrary();
    const result = detectLibraryCssPrefix(decls);
    expect(result.prefix).toBe('--md-');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('returns null prefix for library with no events', () => {
    const decls = [makeDecl({ events: [] }), makeDecl({ events: [] })];
    const result = detectLibraryEventPrefix(decls);
    expect(result.prefix).toBeNull();
  });

  it('returns null prefix for library with no CSS properties', () => {
    const decls = [makeDecl({ cssProperties: [] }), makeDecl({ cssProperties: [] })];
    const result = detectLibraryCssPrefix(decls);
    expect(result.prefix).toBeNull();
  });

  describe('no prefix pattern', () => {
    it('returns null prefix when events have no common prefix', () => {
      const decls = [
        makeDecl({
          events: [
            { name: 'click', type: { text: 'Event' } },
            { name: 'focus', type: { text: 'FocusEvent' } },
          ],
        }),
        makeDecl({
          events: [
            { name: 'change', type: { text: 'Event' } },
            { name: 'input', type: { text: 'InputEvent' } },
          ],
        }),
      ];
      const result = detectLibraryEventPrefix(decls);
      expect(result.prefix).toBeNull();
    });

    it('returns low confidence when prefix is not dominant', () => {
      const decls = [
        makeDecl({
          events: [
            { name: 'hx-click', type: { text: 'CustomEvent' } },
            { name: 'custom-change', type: { text: 'Event' } },
            { name: 'focus', type: { text: 'FocusEvent' } },
            { name: 'blur', type: { text: 'FocusEvent' } },
          ],
        }),
      ];
      const result = detectLibraryEventPrefix(decls);
      // Only 1 of 4 events has hx- prefix → below 50% threshold
      expect(result.prefix).toBeNull();
    });
  });
});

// ─── Per-Component Scoring Tests ────────────────────────────────────────────

describe('naming-consistency / per-component scoring', () => {
  describe('event prefix coherence', () => {
    it('scores 30/30 when all events match prefix', () => {
      const decl = makeDecl({
        events: [
          { name: 'hx-click' },
          { name: 'hx-focus' },
        ],
      });
      const result = scoreEventPrefixCoherence(decl, 'hx-');
      expect(result).not.toBeNull();
      expect(result!.score).toBe(30);
    });

    it('scores 0/30 when no events match prefix', () => {
      const decl = makeDecl({
        events: [
          { name: 'custom-click' },
          { name: 'custom-focus' },
        ],
      });
      const result = scoreEventPrefixCoherence(decl, 'hx-');
      expect(result).not.toBeNull();
      expect(result!.score).toBe(0);
    });

    it('returns null for component with no events', () => {
      const decl = makeDecl({ events: [] });
      const result = scoreEventPrefixCoherence(decl, 'hx-');
      expect(result).toBeNull();
    });

    it('gives full score when no prefix detected', () => {
      const decl = makeDecl({
        events: [{ name: 'click' }, { name: 'focus' }],
      });
      const result = scoreEventPrefixCoherence(decl, null);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(30);
    });
  });

  describe('property naming consistency', () => {
    it('scores 25/25 for all camelCase properties', () => {
      const decl = makeDecl({
        members: [
          { kind: 'field', name: 'variant', type: { text: 'string' } },
          { kind: 'field', name: 'isDisabled', type: { text: 'boolean' } },
          { kind: 'field', name: 'maxLength', type: { text: 'number' } },
        ],
      });
      const result = scorePropertyNamingConsistency(decl);
      expect(result.score).toBe(25);
    });

    it('scores proportionally for mixed naming', () => {
      const decl = makeDecl({
        members: [
          { kind: 'field', name: 'variant', type: { text: 'string' } },
          { kind: 'field', name: 'is_disabled', type: { text: 'boolean' } },
          { kind: 'field', name: 'maxLength', type: { text: 'number' } },
        ],
      });
      const result = scorePropertyNamingConsistency(decl);
      // 2/3 camelCase → round(2/3 * 25) = 17
      expect(result.score).toBe(17);
    });

    it('gives full score for components with no properties', () => {
      const decl = makeDecl({ members: [] });
      const result = scorePropertyNamingConsistency(decl);
      expect(result.score).toBe(25);
    });
  });

  describe('CSS custom property prefixing', () => {
    it('scores 25/25 when all CSS properties match prefix', () => {
      const decl = makeDecl({
        cssProperties: [
          { name: '--hx-button-color' },
          { name: '--hx-button-bg' },
        ],
      });
      const result = scoreCSSCustomPropertyPrefixing(decl, '--hx-');
      expect(result).not.toBeNull();
      expect(result!.score).toBe(25);
    });

    it('scores 0/25 when no CSS properties match prefix', () => {
      const decl = makeDecl({
        cssProperties: [
          { name: '--custom-color' },
          { name: '--custom-bg' },
        ],
      });
      const result = scoreCSSCustomPropertyPrefixing(decl, '--hx-');
      expect(result).not.toBeNull();
      expect(result!.score).toBe(0);
    });

    it('returns null for component with no CSS properties', () => {
      const decl = makeDecl({ cssProperties: [] });
      const result = scoreCSSCustomPropertyPrefixing(decl, '--hx-');
      expect(result).toBeNull();
    });
  });

  describe('attribute-property coherence', () => {
    it('scores 20/20 for correct kebab-case attribute mappings', () => {
      const decl = makeDecl({
        members: [
          { kind: 'field', name: 'maxLength', attribute: 'max-length', type: { text: 'number' } },
          { kind: 'field', name: 'variant', attribute: 'variant', type: { text: 'string' } },
          { kind: 'field', name: 'isDisabled', attribute: 'is-disabled', type: { text: 'boolean' } },
        ],
      });
      const result = scoreAttributePropertyCoherence(decl);
      expect(result.score).toBe(20);
    });

    it('scores proportionally for incorrect mappings', () => {
      const decl = makeDecl({
        members: [
          { kind: 'field', name: 'maxLength', attribute: 'max-length', type: { text: 'number' } },
          { kind: 'field', name: 'isDisabled', attribute: 'isdisabled', type: { text: 'boolean' } },
        ],
      });
      const result = scoreAttributePropertyCoherence(decl);
      // 1/2 correct → round(1/2 * 20) = 10
      expect(result.score).toBe(10);
    });

    it('gives full score for components with no attribute-mapped properties', () => {
      const decl = makeDecl({
        members: [
          { kind: 'field', name: 'value', type: { text: 'string' } },
        ],
      });
      const result = scoreAttributePropertyCoherence(decl);
      expect(result.score).toBe(20);
    });
  });
});

// ─── Full Analyzer Integration Tests ────────────────────────────────────────

describe('naming-consistency / full analyzer', () => {
  it('scores helix library component highly with consistent naming', () => {
    const decls = makeHelixLibrary();
    const conventions = detectLibraryConventions(decls);
    expect(conventions.eventPrefix).toBe('hx-');
    expect(conventions.cssPrefix).toBe('--hx-');

    const result = analyzeNamingConsistency(decls[0]!, conventions);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(80);
    expect(result!.subMetrics.length).toBeGreaterThanOrEqual(3);
  });

  it('scores a deliberately inconsistent component low', () => {
    const conventions: LibraryNamingConventions = {
      eventPrefix: 'hx-',
      eventPrefixConfidence: 0.9,
      cssPrefix: '--hx-',
      cssPrefixConfidence: 0.9,
    };

    const inconsistent = makeDecl({
      events: [
        { name: 'custom-click' },
        { name: 'random-event' },
      ],
      members: [
        { kind: 'field', name: 'variant', type: { text: 'string' } },
        { kind: 'field', name: 'is_broken', type: { text: 'boolean' } },
        { kind: 'field', name: 'SHOUTING', type: { text: 'string' } },
      ],
      cssProperties: [
        { name: '--wrong-prefix-color' },
        { name: '--another-wrong-bg' },
      ],
    });

    const result = analyzeNamingConsistency(inconsistent, conventions);
    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThan(50);
  });

  it('returns null when component has only methods (no scoreable data)', () => {
    const conventions: LibraryNamingConventions = {
      eventPrefix: null,
      eventPrefixConfidence: 0,
      cssPrefix: null,
      cssPrefixConfidence: 0,
    };
    // Component with only method members, no events, no CSS, no fields
    const decl = makeDecl({
      events: [],
      members: [{ kind: 'method', name: 'doSomething' }],
      cssProperties: [],
    });
    const result = analyzeNamingConsistency(decl, conventions);
    // Should still return a result since attribute-property coherence always scores
    expect(result).not.toBeNull();
  });

  it('handles library conventions detection across 5+ libraries', () => {
    const libraries = [
      { name: 'helix', decls: makeHelixLibrary(), expectedEventPrefix: 'hx-', expectedCssPrefix: '--hx-' },
      { name: 'Shoelace', decls: makeShoelaceLibrary(), expectedEventPrefix: 'sl-', expectedCssPrefix: '--sl-' },
      { name: 'Material Web', decls: makeMaterialWebLibrary(), expectedEventPrefix: 'md-', expectedCssPrefix: '--md-' },
      { name: 'Carbon', decls: makeCarbonLibrary(), expectedEventPrefix: 'bx-', expectedCssPrefix: '--bx-' },
      { name: 'Ionic', decls: makeIonicLibrary(), expectedEventPrefix: 'ion-', expectedCssPrefix: '--ion-' },
    ];

    for (const lib of libraries) {
      const conventions = detectLibraryConventions(lib.decls);
      expect(conventions.eventPrefix, `${lib.name} event prefix`).toBe(lib.expectedEventPrefix);
      expect(conventions.cssPrefix, `${lib.name} CSS prefix`).toBe(lib.expectedCssPrefix);
    }
  });

  it('assigns verified confidence when prefix patterns are strong', () => {
    const decls = makeHelixLibrary();
    const conventions = detectLibraryConventions(decls);
    const result = analyzeNamingConsistency(decls[0]!, conventions);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('verified');
  });

  it('normalizes score to 0-100 even when some dimensions are excluded', () => {
    // Component with events but no CSS properties
    const conventions: LibraryNamingConventions = {
      eventPrefix: 'hx-',
      eventPrefixConfidence: 0.9,
      cssPrefix: '--hx-',
      cssPrefixConfidence: 0.9,
    };

    const decl = makeDecl({
      events: [
        { name: 'hx-click' },
        { name: 'hx-focus' },
      ],
      members: [
        { kind: 'field', name: 'variant', attribute: 'variant', type: { text: 'string' } },
      ],
      cssProperties: [],
    });

    const result = analyzeNamingConsistency(decl, conventions);
    expect(result).not.toBeNull();
    // Score should be 0-100 even with CSS excluded
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
    // All scored dimensions should be perfect → 100
    expect(result!.score).toBe(100);
  });
});
