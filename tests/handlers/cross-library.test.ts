/**
 * Cross-library test suite: exercises every library fixture through the same
 * operations to prove handler consistency across Carbon, Fluent, Ionic, Lion,
 * Material Web, Patternfly, and Vaadin.
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
  CemSchema,
} from '../../src/handlers/cem.js';
import type { Cem } from '../../src/handlers/cem.js';
import { validateUsage } from '../../src/handlers/validate.js';
import { scoreCemFallback } from '../../src/handlers/health.js';
import { tokenize, scoreComponent as scoreSearch } from '../../src/tools/discovery.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

interface LibraryFixture {
  name: string;
  file: string;
  cem: Cem;
  expectedCount: number;
  sampleTag: string; // a known tag to use for detailed tests
}

function loadFixture(file: string): Cem {
  return CemSchema.parse(JSON.parse(readFileSync(resolve(FIXTURES_DIR, file), 'utf-8')));
}

const LIBRARIES: LibraryFixture[] = [
  {
    name: 'Carbon',
    file: 'carbon-custom-elements.json',
    cem: loadFixture('carbon-custom-elements.json'),
    expectedCount: 4,
    sampleTag: 'cds-button',
  },
  {
    name: 'Fluent',
    file: 'fluent-custom-elements.json',
    cem: loadFixture('fluent-custom-elements.json'),
    expectedCount: 4,
    sampleTag: 'fluent-button',
  },
  {
    name: 'Ionic',
    file: 'ionic-custom-elements.json',
    cem: loadFixture('ionic-custom-elements.json'),
    expectedCount: 4,
    sampleTag: 'ion-button',
  },
  {
    name: 'Lion',
    file: 'lion-custom-elements.json',
    cem: loadFixture('lion-custom-elements.json'),
    expectedCount: 4,
    sampleTag: 'lion-button',
  },
  {
    name: 'Material Web',
    file: 'material-web-custom-elements.json',
    cem: loadFixture('material-web-custom-elements.json'),
    expectedCount: 4,
    sampleTag: 'md-filled-button',
  },
  {
    name: 'Patternfly',
    file: 'patternfly-custom-elements.json',
    cem: loadFixture('patternfly-custom-elements.json'),
    expectedCount: 4,
    sampleTag: 'pf-button',
  },
  {
    name: 'Vaadin',
    file: 'vaadin-custom-elements.json',
    cem: loadFixture('vaadin-custom-elements.json'),
    expectedCount: 3,
    sampleTag: 'vaadin-button',
  },
];

// ---------------------------------------------------------------------------
// list_components — cross-library
// ---------------------------------------------------------------------------

describe('Cross-library: list_components', () => {
  for (const lib of LIBRARIES) {
    describe(lib.name, () => {
      it(`returns exactly ${lib.expectedCount} components`, () => {
        const components = listAllComponents(lib.cem);
        expect(components).toHaveLength(lib.expectedCount);
      });

      it('returns an array of strings (tagNames)', () => {
        const components = listAllComponents(lib.cem);
        for (const tag of components) {
          expect(typeof tag).toBe('string');
          expect(tag.length).toBeGreaterThan(0);
        }
      });

      it('all tagNames contain a hyphen (custom element requirement)', () => {
        const components = listAllComponents(lib.cem);
        for (const tag of components) {
          expect(tag).toContain('-');
        }
      });

      it('contains no duplicate tagNames', () => {
        const components = listAllComponents(lib.cem);
        const unique = new Set(components);
        expect(unique.size).toBe(components.length);
      });

      it(`includes known sample tag "${lib.sampleTag}"`, () => {
        const components = listAllComponents(lib.cem);
        expect(components).toContain(lib.sampleTag);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// find_component (via search scoring) — cross-library
// ---------------------------------------------------------------------------

describe('Cross-library: find_component (search scoring)', () => {
  for (const lib of LIBRARIES) {
    describe(lib.name, () => {
      it('exact tagName match produces a positive score', () => {
        const tokens = tokenize(lib.sampleTag);
        const score = scoreSearch(lib.sampleTag, '', [], tokens);
        expect(score).toBeGreaterThan(0);
      });

      it('partial match (just "button") produces a positive score for button tags', () => {
        if (!lib.sampleTag.includes('button')) return; // skip non-button samples
        const tokens = tokenize('button');
        const score = scoreSearch(lib.sampleTag, '', [], tokens);
        expect(score).toBeGreaterThan(0);
      });

      it('totally unrelated query produces zero score', () => {
        const tokens = tokenize('xyzzy-nothing-matches');
        const score = scoreSearch(lib.sampleTag, '', [], tokens);
        expect(score).toBe(0);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// get_component (parseCem) — cross-library
// ---------------------------------------------------------------------------

describe('Cross-library: get_component (parseCem)', () => {
  for (const lib of LIBRARIES) {
    describe(lib.name, () => {
      it(`returns metadata for "${lib.sampleTag}"`, () => {
        const result = parseCem(lib.sampleTag, lib.cem);
        expect(result.tagName).toBe(lib.sampleTag);
        expect(result.name).toBeTruthy();
      });

      it('metadata has a members array', () => {
        const result = parseCem(lib.sampleTag, lib.cem);
        expect(Array.isArray(result.members)).toBe(true);
      });

      it('metadata has an events array', () => {
        const result = parseCem(lib.sampleTag, lib.cem);
        expect(Array.isArray(result.events)).toBe(true);
      });

      it('metadata has a slots array', () => {
        const result = parseCem(lib.sampleTag, lib.cem);
        expect(Array.isArray(result.slots)).toBe(true);
      });

      it('metadata has a cssParts array', () => {
        const result = parseCem(lib.sampleTag, lib.cem);
        expect(Array.isArray(result.cssParts)).toBe(true);
      });

      it('metadata has a cssProperties array', () => {
        const result = parseCem(lib.sampleTag, lib.cem);
        expect(Array.isArray(result.cssProperties)).toBe(true);
      });

      it('each member has name and kind fields', () => {
        const result = parseCem(lib.sampleTag, lib.cem);
        for (const member of result.members) {
          expect(member.name).toBeTruthy();
          expect(member.kind).toBeTruthy();
        }
      });

      it('throws MCPError for nonexistent component', () => {
        expect(() => parseCem('nonexistent-component-xyz', lib.cem)).toThrow();
      });
    });
  }
});

// ---------------------------------------------------------------------------
// score_component (scoreCemFallback) — cross-library
// ---------------------------------------------------------------------------

describe('Cross-library: score_component (scoreCemFallback)', () => {
  for (const lib of LIBRARIES) {
    describe(lib.name, () => {
      it(`produces a score between 0 and 100 for "${lib.sampleTag}"`, () => {
        const decl = lib.cem.modules
          .flatMap((m) => m.declarations ?? [])
          .find((d) => d.tagName === lib.sampleTag);
        expect(decl).toBeDefined();
        const result = scoreCemFallback(decl!);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      });

      it('produces a valid grade (A-F)', () => {
        const decl = lib.cem.modules
          .flatMap((m) => m.declarations ?? [])
          .find((d) => d.tagName === lib.sampleTag);
        const result = scoreCemFallback(decl!);
        expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
      });

      it('includes a timestamp', () => {
        const decl = lib.cem.modules
          .flatMap((m) => m.declarations ?? [])
          .find((d) => d.tagName === lib.sampleTag);
        const result = scoreCemFallback(decl!);
        expect(result.timestamp).toBeTruthy();
      });

      it('scores all components in the library without crashing', () => {
        const allDecls = lib.cem.modules.flatMap((m) => m.declarations ?? []);
        for (const decl of allDecls) {
          if (!decl.tagName) continue;
          const result = scoreCemFallback(decl);
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// validate_usage — cross-library
// ---------------------------------------------------------------------------

describe('Cross-library: validate_usage', () => {
  for (const lib of LIBRARIES) {
    describe(lib.name, () => {
      it(`valid usage of "${lib.sampleTag}" with no attributes passes`, () => {
        const html = `<${lib.sampleTag}>Content</${lib.sampleTag}>`;
        const result = validateUsage(lib.sampleTag, html, lib.cem);
        expect(result.valid).toBe(true);
      });

      it('flags completely unknown attribute as error', () => {
        const html = `<${lib.sampleTag} zzz-unknown-attr="bad">Content</${lib.sampleTag}>`;
        const result = validateUsage(lib.sampleTag, html, lib.cem);
        const errors = result.issues.filter((i) => i.level === 'error');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('allows global HTML attributes (class, id)', () => {
        const html = `<${lib.sampleTag} class="test" id="btn">Content</${lib.sampleTag}>`;
        const result = validateUsage(lib.sampleTag, html, lib.cem);
        expect(result.valid).toBe(true);
      });

      it('throws for nonexistent tag in this library', () => {
        expect(() =>
          validateUsage('totally-fake-tag', '<totally-fake-tag></totally-fake-tag>', lib.cem),
        ).toThrow();
      });
    });
  }
});

// ---------------------------------------------------------------------------
// validateCompleteness — cross-library
// ---------------------------------------------------------------------------

describe('Cross-library: validateCompleteness', () => {
  for (const lib of LIBRARIES) {
    describe(lib.name, () => {
      it(`returns a numeric score for "${lib.sampleTag}"`, () => {
        const result = validateCompleteness(lib.sampleTag, lib.cem);
        expect(typeof result.score).toBe('number');
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      });

      it('returns an issues array', () => {
        const result = validateCompleteness(lib.sampleTag, lib.cem);
        expect(Array.isArray(result.issues)).toBe(true);
      });

      it('validates all components in the library', () => {
        const components = listAllComponents(lib.cem);
        for (const tag of components) {
          const result = validateCompleteness(tag, lib.cem);
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// listAllEvents — cross-library
// ---------------------------------------------------------------------------

describe('Cross-library: listAllEvents', () => {
  for (const lib of LIBRARIES) {
    it(`${lib.name}: returns an array of events (may be empty)`, () => {
      const events = listAllEvents(lib.cem);
      expect(Array.isArray(events)).toBe(true);
      for (const evt of events) {
        expect(evt.eventName).toBeTruthy();
      }
    });

    it(`${lib.name}: filtering by known tag returns subset`, () => {
      const all = listAllEvents(lib.cem);
      const filtered = listAllEvents(lib.cem, lib.sampleTag);
      expect(filtered.length).toBeLessThanOrEqual(all.length);
    });
  }
});

// ---------------------------------------------------------------------------
// listAllSlots — cross-library
// ---------------------------------------------------------------------------

describe('Cross-library: listAllSlots', () => {
  for (const lib of LIBRARIES) {
    it(`${lib.name}: returns an array of slots (may be empty)`, () => {
      const slots = listAllSlots(lib.cem);
      expect(Array.isArray(slots)).toBe(true);
    });

    it(`${lib.name}: filtering by known tag returns subset`, () => {
      const all = listAllSlots(lib.cem);
      const filtered = listAllSlots(lib.cem, lib.sampleTag);
      expect(filtered.length).toBeLessThanOrEqual(all.length);
    });
  }
});

// ---------------------------------------------------------------------------
// listAllCssParts — cross-library
// ---------------------------------------------------------------------------

describe('Cross-library: listAllCssParts', () => {
  for (const lib of LIBRARIES) {
    it(`${lib.name}: returns an array of CSS parts (may be empty)`, () => {
      const parts = listAllCssParts(lib.cem);
      expect(Array.isArray(parts)).toBe(true);
    });

    it(`${lib.name}: filtering by known tag returns subset`, () => {
      const all = listAllCssParts(lib.cem);
      const filtered = listAllCssParts(lib.cem, lib.sampleTag);
      expect(filtered.length).toBeLessThanOrEqual(all.length);
    });
  }
});
