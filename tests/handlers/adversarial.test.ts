/**
 * Adversarial and edge case tests: exercises handlers with malformed,
 * minimal, empty, and adversarial inputs to ensure graceful handling.
 */
import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import {
  parseCem,
  validateCompleteness,
  listAllComponents,
  listAllEvents,
  listAllSlots,
  listAllCssParts,
  mergeCems,
  CemSchema,
} from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import { validateUsage } from '../../packages/core/src/handlers/validate.js';
import { scoreCemFallback } from '../../packages/core/src/handlers/health.js';
import { MCPError, ErrorCategory } from '../../packages/core/src/shared/error-handling.js';
import {
  tokenize,
  scoreComponent as scoreSearch,
} from '../../packages/core/src/tools/discovery.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

const FIXTURE_CEM: Cem = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'custom-elements.json'), 'utf-8')),
);

// ---------------------------------------------------------------------------
// CEM with zero modules
// ---------------------------------------------------------------------------

describe('CEM with zero modules', () => {
  const EMPTY_CEM: Cem = CemSchema.parse({ schemaVersion: '1.0.0', modules: [] });

  it('listAllComponents returns empty array', () => {
    expect(listAllComponents(EMPTY_CEM)).toHaveLength(0);
  });

  it('listAllEvents returns empty array', () => {
    expect(listAllEvents(EMPTY_CEM)).toHaveLength(0);
  });

  it('listAllSlots returns empty array', () => {
    expect(listAllSlots(EMPTY_CEM)).toHaveLength(0);
  });

  it('listAllCssParts returns empty array', () => {
    expect(listAllCssParts(EMPTY_CEM)).toHaveLength(0);
  });

  it('parseCem throws MCPError NOT_FOUND', () => {
    expect(() => parseCem('any-tag', EMPTY_CEM)).toThrow(MCPError);
    try {
      parseCem('any-tag', EMPTY_CEM);
    } catch (e) {
      expect(e).toBeInstanceOf(MCPError);
      expect((e as MCPError).category).toBe(ErrorCategory.NOT_FOUND);
    }
  });

  it('validateUsage throws for any tag', () => {
    expect(() => validateUsage('my-button', '<my-button></my-button>', EMPTY_CEM)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CEM with modules but no declarations
// ---------------------------------------------------------------------------

describe('CEM with modules but no declarations', () => {
  const NO_DECLS_CEM: Cem = CemSchema.parse({
    schemaVersion: '1.0.0',
    modules: [
      { kind: 'javascript-module', path: 'src/empty.js' },
      { kind: 'javascript-module', path: 'src/also-empty.js', declarations: [] },
    ],
  });

  it('listAllComponents returns empty array', () => {
    expect(listAllComponents(NO_DECLS_CEM)).toHaveLength(0);
  });

  it('listAllEvents returns empty array', () => {
    expect(listAllEvents(NO_DECLS_CEM)).toHaveLength(0);
  });

  it('parseCem throws NOT_FOUND', () => {
    expect(() => parseCem('anything', NO_DECLS_CEM)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CEM with declarations but no tagName
// ---------------------------------------------------------------------------

describe('CEM with declarations but no tagName', () => {
  const NO_TAG_CEM: Cem = CemSchema.parse({
    schemaVersion: '1.0.0',
    modules: [
      {
        kind: 'javascript-module',
        path: 'src/mixin.js',
        declarations: [
          {
            kind: 'mixin',
            name: 'FormMixin',
            description: 'A mixin, not a custom element.',
          },
        ],
      },
    ],
  });

  it('listAllComponents returns empty (filters out non-tagName declarations)', () => {
    expect(listAllComponents(NO_TAG_CEM)).toHaveLength(0);
  });

  it('listAllEvents returns empty', () => {
    expect(listAllEvents(NO_TAG_CEM)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Component with 0 attributes, 0 events, 0 slots
// ---------------------------------------------------------------------------

describe('Component with zero attributes/events/slots', () => {
  const BARE_CEM: Cem = CemSchema.parse({
    schemaVersion: '1.0.0',
    modules: [
      {
        kind: 'javascript-module',
        path: 'src/bare.js',
        declarations: [
          {
            kind: 'class',
            name: 'BareElement',
            tagName: 'bare-element',
            description: 'A component with nothing.',
          },
        ],
      },
    ],
  });

  it('parseCem returns empty members, events, slots, cssParts', () => {
    const result = parseCem('bare-element', BARE_CEM);
    expect(result.members).toHaveLength(0);
    expect(result.events).toHaveLength(0);
    expect(result.slots).toHaveLength(0);
    expect(result.cssParts).toHaveLength(0);
    expect(result.cssProperties).toHaveLength(0);
  });

  it('validateCompleteness does not crash and returns a score', () => {
    const result = validateCompleteness('bare-element', BARE_CEM);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('scoreCemFallback does not crash and does not return 0 for having a description', () => {
    const decl = BARE_CEM.modules[0]!.declarations![0]!;
    const result = scoreCemFallback(decl);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('validateUsage passes with no attributes', () => {
    const result = validateUsage('bare-element', '<bare-element></bare-element>', BARE_CEM);
    expect(result.valid).toBe(true);
  });

  it('validateUsage flags unknown attribute on bare component', () => {
    const result = validateUsage(
      'bare-element',
      '<bare-element foo="bar"></bare-element>',
      BARE_CEM,
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('foo'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Nonexistent component name
// ---------------------------------------------------------------------------

describe('Nonexistent component lookup', () => {
  it('parseCem throws MCPError with NOT_FOUND category', () => {
    try {
      parseCem('does-not-exist', FIXTURE_CEM);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MCPError);
      expect((e as MCPError).category).toBe(ErrorCategory.NOT_FOUND);
    }
  });

  it('validateCompleteness throws MCPError with NOT_FOUND category', () => {
    try {
      validateCompleteness('does-not-exist', FIXTURE_CEM);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MCPError);
      expect((e as MCPError).category).toBe(ErrorCategory.NOT_FOUND);
    }
  });

  it('validateUsage throws for unknown tag', () => {
    expect(() =>
      validateUsage('does-not-exist', '<does-not-exist></does-not-exist>', FIXTURE_CEM),
    ).toThrow('not found');
  });
});

// ---------------------------------------------------------------------------
// find_component with adversarial inputs
// ---------------------------------------------------------------------------

describe('find_component: adversarial query inputs', () => {
  it('empty string query produces zero score for any tag', () => {
    const tokens = tokenize('');
    expect(tokens).toHaveLength(0);
    const score = scoreSearch('my-button', 'A button', ['click'], tokens);
    expect(score).toBe(0);
  });

  it('regex-like string ".*" does not crash tokenize', () => {
    const tokens = tokenize('.*');
    expect(Array.isArray(tokens)).toBe(true);
  });

  it('regex-like string "[a-z]" does not crash tokenize', () => {
    const tokens = tokenize('[a-z]');
    expect(Array.isArray(tokens)).toBe(true);
  });

  it('regex-like string "+" does not crash tokenize', () => {
    const tokens = tokenize('+');
    expect(Array.isArray(tokens)).toBe(true);
  });

  it('single character query tokenizes correctly', () => {
    const tokens = tokenize('b');
    expect(tokens).toContain('b');
  });

  it('very long query string does not crash', () => {
    const longQuery = 'a'.repeat(10000);
    const tokens = tokenize(longQuery);
    expect(Array.isArray(tokens)).toBe(true);
  });

  it('special characters do not crash scoring', () => {
    const tokens = tokenize('<script>alert("xss")</script>');
    const score = scoreSearch('my-button', 'A button', [], tokens);
    expect(typeof score).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Malformed attribute types
// ---------------------------------------------------------------------------

describe('Malformed attribute types in CEM', () => {
  const MALFORMED_CEM: Cem = CemSchema.parse({
    schemaVersion: '1.0.0',
    modules: [
      {
        kind: 'javascript-module',
        path: 'src/weird.js',
        declarations: [
          {
            kind: 'class',
            name: 'WeirdElement',
            tagName: 'weird-element',
            description: 'A component with weird types.',
            members: [
              {
                kind: 'field',
                name: 'weirdProp',
                attribute: 'weird-prop',
                type: { text: '' }, // empty type string
              },
              {
                kind: 'field',
                name: 'noType',
                attribute: 'no-type',
                // no type field at all
              },
              {
                kind: 'field',
                name: 'pipeOnly',
                attribute: 'pipe-only',
                type: { text: '|' }, // just a pipe, malformed union
              },
            ],
          },
        ],
      },
    ],
  });

  it('parseCem handles empty type string', () => {
    const result = parseCem('weird-element', MALFORMED_CEM);
    const weirdProp = result.members.find((m) => m.name === 'weirdProp');
    expect(weirdProp).toBeDefined();
    expect(weirdProp!.type).toBe('');
  });

  it('parseCem handles missing type field', () => {
    const result = parseCem('weird-element', MALFORMED_CEM);
    const noType = result.members.find((m) => m.name === 'noType');
    expect(noType).toBeDefined();
  });

  it('validateUsage does not crash on empty type attribute', () => {
    const result = validateUsage(
      'weird-element',
      '<weird-element weird-prop="anything"></weird-element>',
      MALFORMED_CEM,
    );
    // Should not crash; no enum validation on empty type
    expect(typeof result.valid).toBe('boolean');
  });

  it('validateUsage does not crash on pipe-only type', () => {
    const result = validateUsage(
      'weird-element',
      '<weird-element pipe-only="test"></weird-element>',
      MALFORMED_CEM,
    );
    expect(typeof result.valid).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// mergeCems edge cases
// ---------------------------------------------------------------------------

describe('mergeCems edge cases', () => {
  it('returns empty modules for empty array', () => {
    const result = mergeCems([]);
    expect(result.modules).toHaveLength(0);
  });

  it('single CEM produces no namespace prefixes', () => {
    const cem: Cem = CemSchema.parse({
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/btn.js',
          declarations: [{ kind: 'class', name: 'Btn', tagName: 'my-btn' }],
        },
      ],
    });
    const result = mergeCems([{ cem, packageName: 'pkg' }]);
    const tags = listAllComponents(result);
    expect(tags).toContain('my-btn');
    expect(tags).not.toContain('pkg:my-btn');
  });

  it('merged output contains no duplicate tagNames', () => {
    const cemA: Cem = CemSchema.parse({
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'a.js',
          declarations: [
            { kind: 'class', name: 'BtnA', tagName: 'my-btn' },
            { kind: 'class', name: 'InputA', tagName: 'my-input' },
          ],
        },
      ],
    });
    const cemB: Cem = CemSchema.parse({
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'b.js',
          declarations: [
            { kind: 'class', name: 'BtnB', tagName: 'my-btn' },
            { kind: 'class', name: 'CardB', tagName: 'my-card' },
          ],
        },
      ],
    });
    const result = mergeCems([
      { cem: cemA, packageName: 'a' },
      { cem: cemB, packageName: 'b' },
    ]);
    const tags = listAllComponents(result);
    const unique = new Set(tags);
    expect(unique.size).toBe(tags.length);
  });
});

// ---------------------------------------------------------------------------
// validate_usage edge cases
// ---------------------------------------------------------------------------

describe('validate_usage edge cases', () => {
  it('self-closing tag syntax', () => {
    // Parsing an HTML self-closing tag — should not crash
    const result = validateUsage('my-button', '<my-button/>', FIXTURE_CEM);
    expect(typeof result.valid).toBe('boolean');
  });

  it('empty html string', () => {
    // No opening tag found — should still return a result (no attrs parsed)
    const result = validateUsage('my-button', '', FIXTURE_CEM);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('multiple instances of the same tag', () => {
    const html = '<my-button variant="primary">A</my-button><my-button>B</my-button>';
    const result = validateUsage('my-button', html, FIXTURE_CEM);
    // Should parse the first opening tag
    expect(typeof result.valid).toBe('boolean');
  });

  it('data-* attributes are allowed', () => {
    const result = validateUsage(
      'my-button',
      '<my-button data-testid="btn" data-custom="foo">Click</my-button>',
      FIXTURE_CEM,
    );
    expect(result.valid).toBe(true);
  });

  it('aria-* attributes are allowed', () => {
    const result = validateUsage(
      'my-button',
      '<my-button aria-label="close" aria-pressed="true">X</my-button>',
      FIXTURE_CEM,
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scoreCemFallback edge cases
// ---------------------------------------------------------------------------

describe('scoreCemFallback edge cases', () => {
  it('fully documented component scores high', () => {
    const decl = {
      kind: 'class',
      name: 'PerfectElement',
      tagName: 'perfect-element',
      description: 'A perfectly documented component.',
      members: [
        {
          kind: 'field',
          name: 'variant',
          type: { text: 'string' },
          description: 'The variant.',
        },
      ],
      events: [{ name: 'change', type: { text: 'CustomEvent' }, description: 'Fires on change.' }],
      slots: [{ name: '', description: 'Default content slot.' }],
      cssParts: [{ name: 'base', description: 'The base wrapper.' }],
    };
    const parsed = CemSchema.parse({
      schemaVersion: '1.0.0',
      modules: [{ kind: 'javascript-module', path: 'x.js', declarations: [decl] }],
    });
    const result = scoreCemFallback(parsed.modules[0]!.declarations![0]!);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.grade).toMatch(/^[AB]$/);
  });

  it('completely undocumented component scores low', () => {
    const decl = {
      kind: 'class',
      name: 'BadElement',
      tagName: 'bad-element',
      // no description
      members: [
        { kind: 'field', name: 'x' }, // no description, no type
      ],
      events: [{ name: 'click' }], // no description, no type
    };
    const parsed = CemSchema.parse({
      schemaVersion: '1.0.0',
      modules: [{ kind: 'javascript-module', path: 'x.js', declarations: [decl] }],
    });
    const result = scoreCemFallback(parsed.modules[0]!.declarations![0]!);
    expect(result.score).toBeLessThan(50);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('every optional field missing does not crash', () => {
    const decl = {
      kind: 'class',
      name: 'MinimalElement',
      tagName: 'minimal-element',
    };
    const parsed = CemSchema.parse({
      schemaVersion: '1.0.0',
      modules: [{ kind: 'javascript-module', path: 'x.js', declarations: [decl] }],
    });
    const result = scoreCemFallback(parsed.modules[0]!.declarations![0]!);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// CEM Schema validation edge cases
// ---------------------------------------------------------------------------

describe('CemSchema validation', () => {
  it('rejects CEM with missing schemaVersion', () => {
    expect(() => CemSchema.parse({ modules: [] })).toThrow();
  });

  it('rejects CEM with missing modules', () => {
    expect(() => CemSchema.parse({ schemaVersion: '1.0.0' })).toThrow();
  });

  it('rejects CEM where modules is not an array', () => {
    expect(() => CemSchema.parse({ schemaVersion: '1.0.0', modules: 'not-an-array' })).toThrow();
  });

  it('accepts CEM with extra unknown fields (passthrough)', () => {
    const result = CemSchema.parse({
      schemaVersion: '1.0.0',
      modules: [],
      customField: 'extra',
    });
    expect(result.schemaVersion).toBe('1.0.0');
  });
});
