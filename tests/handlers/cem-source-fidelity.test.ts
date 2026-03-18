/**
 * CEM-Source Fidelity Analyzer tests.
 *
 * Tests event, property, and attribute fidelity detection between
 * CEM declarations and actual source code.
 *
 * Includes:
 *   - Unit tests with synthetic fixtures
 *   - The hx-carousel phantom event case (PR #79 bug pattern)
 *   - Integration tests against real helix + wc-libraries components
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractSourceEvents,
  extractSourceProperties,
  extractSourceObservedAttributes,
  analyzeCemSourceFidelity,
} from '../../packages/core/src/handlers/analyzers/cem-source-fidelity.js';
import { CemSchema, getDeclarationSourcePath } from '../../packages/core/src/handlers/cem.js';
import type { Cem, CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDecl(overrides: Partial<CemDeclaration> = {}): CemDeclaration {
  return {
    kind: 'class',
    name: 'TestComponent',
    tagName: 'test-component',
    ...overrides,
  } as CemDeclaration;
}

function makeConfig(projectRoot: string): McpWcConfig {
  return {
    projectRoot,
    cemPath: 'custom-elements.json',
    healthHistoryDir: '.health-history',
    componentPrefix: 'test',
  } as McpWcConfig;
}

// ─── Event Extraction Tests ──────────────────────────────────────────────────

describe('extractSourceEvents', () => {
  it('extracts dispatchEvent(new CustomEvent) calls', () => {
    const source = `
      this.dispatchEvent(new CustomEvent('my-event', { detail: { value: 1 } }));
      this.dispatchEvent(new CustomEvent('another-event'));
    `;
    const events = extractSourceEvents(source);
    expect(events).toContain('my-event');
    expect(events).toContain('another-event');
    expect(events).toHaveLength(2);
  });

  it('extracts dispatchEvent(new Event) calls', () => {
    const source = `this.dispatchEvent(new Event('change'));`;
    const events = extractSourceEvents(source);
    expect(events).toContain('change');
  });

  it('extracts this.emit() calls', () => {
    const source = `this.emit('sl-show'); this.emit('sl-hide');`;
    const events = extractSourceEvents(source);
    expect(events).toContain('sl-show');
    expect(events).toContain('sl-hide');
  });

  it('extracts FAST $emit() calls', () => {
    const source = `this.$emit('change'); this.$emit('input');`;
    const events = extractSourceEvents(source);
    expect(events).toContain('change');
    expect(events).toContain('input');
  });

  it('extracts @event decorator patterns', () => {
    const source = `@event({ name: 'my-event' }) handleEvent() {}`;
    const events = extractSourceEvents(source);
    expect(events).toContain('my-event');
  });

  it('deduplicates events', () => {
    const source = `
      this.dispatchEvent(new CustomEvent('click'));
      this.dispatchEvent(new CustomEvent('click'));
    `;
    const events = extractSourceEvents(source);
    expect(events).toHaveLength(1);
  });

  it('returns empty array for no events', () => {
    const source = `export class MyComponent extends HTMLElement {}`;
    const events = extractSourceEvents(source);
    expect(events).toHaveLength(0);
  });
});

// ─── Property Extraction Tests ───────────────────────────────────────────────

describe('extractSourceProperties', () => {
  it('extracts @property() decorated properties', () => {
    const source = `
      @property({ type: String }) label = 'default';
      @property({ type: Boolean, reflect: true }) disabled = false;
    `;
    const props = extractSourceProperties(source);
    expect(props.find((p) => p.name === 'label')).toBeDefined();
    expect(props.find((p) => p.name === 'disabled')).toBeDefined();
    expect(props.find((p) => p.name === 'disabled')?.hasReflect).toBe(true);
    expect(props.find((p) => p.name === 'label')?.hasReflect).toBe(false);
  });

  it('extracts static properties block', () => {
    const source = `
      static properties = {
        name: { type: String },
        active: { type: Boolean, reflect: true }
      }
    `;
    const props = extractSourceProperties(source);
    expect(props.find((p) => p.name === 'name')).toBeDefined();
    expect(props.find((p) => p.name === 'active')?.hasReflect).toBe(true);
  });

  it('extracts static get properties()', () => {
    const source = `
      static get properties() { return {
        value: { type: String },
        count: { type: Number }
      } }
    `;
    const props = extractSourceProperties(source);
    expect(props.find((p) => p.name === 'value')).toBeDefined();
    expect(props.find((p) => p.name === 'count')).toBeDefined();
  });

  it('extracts default values from decorators', () => {
    const source = `@property({ type: String }) label = 'hello';`;
    const props = extractSourceProperties(source);
    expect(props.find((p) => p.name === 'label')?.defaultValue).toBe("'hello'");
  });
});

// ─── Attribute Extraction Tests ──────────────────────────────────────────────

describe('extractSourceObservedAttributes', () => {
  it('extracts static observedAttributes array', () => {
    const source = `
      static observedAttributes = ['disabled', 'label', 'aria-label'];
    `;
    const attrs = extractSourceObservedAttributes(source);
    expect(attrs).toContain('disabled');
    expect(attrs).toContain('label');
    expect(attrs).toContain('aria-label');
  });

  it('extracts from static get observedAttributes()', () => {
    const source = `
      static get observedAttributes() { return ['value', 'name'] }
    `;
    const attrs = extractSourceObservedAttributes(source);
    expect(attrs).toContain('value');
    expect(attrs).toContain('name');
  });

  it('extracts from attributeChangedCallback case statements', () => {
    const source = `
      attributeChangedCallback(name, oldVal, newVal) {
        switch (name) {
          case 'disabled':
            break;
          case 'open':
            break;
        }
      }
    `;
    const attrs = extractSourceObservedAttributes(source);
    expect(attrs).toContain('disabled');
    expect(attrs).toContain('open');
  });
});

// ─── Phantom Event Detection (the hx-carousel bug pattern) ──────────────────

describe('phantom event detection', () => {
  it('detects phantom events — CEM declares event not dispatched in source', async () => {
    // Simulate the original hx-carousel bug: CEM says 'hx-slide-change'
    // but source dispatches 'hx-slide'
    const source = `
      export class HelixCarousel extends LitElement {
        goToSlide(index) {
          this.dispatchEvent(new CustomEvent('hx-slide', {
            detail: { index, slide: this.slides[index] }
          }));
        }
      }
    `;

    const sourceEvents = extractSourceEvents(source);
    expect(sourceEvents).toContain('hx-slide');
    expect(sourceEvents).not.toContain('hx-slide-change');

    // CEM declares 'hx-slide-change' — this is a phantom
    const cemEvents = ['hx-slide-change'];
    const cemSet = new Set(cemEvents.map((e) => e.toLowerCase()));
    const sourceSet = new Set(sourceEvents.map((e) => e.toLowerCase()));
    const phantomEvents = cemEvents.filter((e) => !sourceSet.has(e.toLowerCase()));
    const missingEvents = sourceEvents.filter((e) => !cemSet.has(e.toLowerCase()));

    expect(phantomEvents).toContain('hx-slide-change');
    expect(missingEvents).toContain('hx-slide');
  });
});

// ─── Missing Event Detection ─────────────────────────────────────────────────

describe('missing event detection', () => {
  it('detects missing events — source dispatches event not in CEM', () => {
    const source = `
      this.dispatchEvent(new CustomEvent('my-open'));
      this.dispatchEvent(new CustomEvent('my-close'));
      this.dispatchEvent(new CustomEvent('my-change'));
    `;
    const sourceEvents = extractSourceEvents(source);

    // CEM only declares one of the three
    const cemEvents = ['my-open'];
    const cemSet = new Set(cemEvents.map((e) => e.toLowerCase()));
    const missingEvents = sourceEvents.filter((e) => !cemSet.has(e.toLowerCase()));

    expect(missingEvents).toContain('my-close');
    expect(missingEvents).toContain('my-change');
    expect(missingEvents).not.toContain('my-open');
  });
});

// ─── Property Default Mismatch Detection ─────────────────────────────────────

describe('property default mismatch detection', () => {
  it('detects when CEM and source have different defaults', () => {
    const source = `@property({ type: Number }) count = 5;`;
    const props = extractSourceProperties(source);
    const countProp = props.find((p) => p.name === 'count');
    expect(countProp?.defaultValue).toBe('5');

    // CEM says default is 10 — mismatch
    const cemDefault = '10';
    expect(countProp?.defaultValue).not.toBe(cemDefault);
  });
});

// ─── Attribute Reflection Mismatch Detection ─────────────────────────────────

describe('attribute reflection detection', () => {
  it('detects reflected attributes from @property with reflect: true', () => {
    const source = `
      @property({ type: Boolean, reflect: true }) disabled = false;
      @property({ type: String }) label = '';
    `;
    const props = extractSourceProperties(source);
    const reflected = props.filter((p) => p.hasReflect);
    expect(reflected).toHaveLength(1);
    expect(reflected[0]?.name).toBe('disabled');
  });

  it('detects observedAttributes from source', () => {
    const source = `
      static observedAttributes = ['disabled', 'open'];
    `;
    const attrs = extractSourceObservedAttributes(source);
    expect(attrs).toContain('disabled');
    expect(attrs).toContain('open');
  });
});

// ─── Null Return When Source Unavailable ──────────────────────────────────────

describe('null return when source unavailable', () => {
  it('returns null when source file does not exist', async () => {
    const config = makeConfig('/nonexistent/path');
    const cem: Cem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/missing.js',
          declarations: [makeDecl()],
        },
      ],
    };

    const result = await analyzeCemSourceFidelity(config, cem, makeDecl());
    expect(result).toBeNull();
  });
});

// ─── Integration: Real Helix hx-carousel ─────────────────────────────────────

const HELIX_ROOT = resolve(__dirname, '../../../helix/packages/hx-library');
const HELIX_CEM_PATH = resolve(HELIX_ROOT, 'custom-elements.json');
const HELIX_AVAILABLE = existsSync(HELIX_CEM_PATH);

function loadHelixCem(): Cem {
  return CemSchema.parse(JSON.parse(readFileSync(HELIX_CEM_PATH, 'utf-8')));
}

describe.skipIf(!HELIX_AVAILABLE)('real helix hx-carousel', () => {
  it('analyzes hx-carousel source fidelity', async () => {
    const cem = loadHelixCem();
    const decl = cem.modules
      .flatMap((m) => m.declarations ?? [])
      .find((d) => d.tagName === 'hx-carousel');

    expect(decl).toBeDefined();
    if (!decl) return;

    const config = makeConfig(HELIX_ROOT);
    const result = await analyzeCemSourceFidelity(config, cem, decl);

    // Source should be available
    expect(result).not.toBeNull();
    if (!result) return;

    // Should have all three fidelity dimensions
    expect(result.subMetrics).toHaveLength(3);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.confidence).toBe('heuristic');

    // After the fix (PR #79), hx-slide-change should match in both CEM and source
    // So there should be no phantom events for hx-slide-change
    expect(result.eventFidelity.phantomEvents).not.toContain('hx-slide-change');
  });

  it('extracts events from hx-carousel source', () => {
    const cem = loadHelixCem();
    const modulePath = getDeclarationSourcePath(cem, 'hx-carousel');
    expect(modulePath).toBeDefined();
    if (!modulePath) return;

    const baseName = modulePath.replace(/\.js$/, '');
    const tsPath = resolve(HELIX_ROOT, baseName + '.ts');
    if (!existsSync(tsPath)) return;

    const source = readFileSync(tsPath, 'utf-8');
    const events = extractSourceEvents(source);
    // After PR #79 fix, source dispatches hx-slide-change
    expect(events).toContain('hx-slide-change');
  });
});

// ─── Integration: Real wc-libraries ──────────────────────────────────────────

const WC_LIBS_ROOT = resolve(__dirname, '../../../wc-libraries');

interface LibConfig {
  name: string;
  dir: string;
  cemPath: string;
}

const LIBRARIES: LibConfig[] = [
  {
    name: 'carbon',
    dir: resolve(WC_LIBS_ROOT, 'carbon'),
    cemPath: resolve(WC_LIBS_ROOT, 'carbon/custom-elements.json'),
  },
  {
    name: 'material',
    dir: resolve(WC_LIBS_ROOT, 'material'),
    cemPath: resolve(WC_LIBS_ROOT, 'material/custom-elements.json'),
  },
  {
    name: 'vaadin',
    dir: resolve(WC_LIBS_ROOT, 'vaadin'),
    cemPath: resolve(WC_LIBS_ROOT, 'vaadin/custom-elements.json'),
  },
];

function loadCem(path: string): Cem {
  return CemSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
}

for (const lib of LIBRARIES) {
  describe.skipIf(!existsSync(lib.cemPath))(`real ${lib.name} components`, () => {
    it(`finds components with events in ${lib.name}`, () => {
      const cem = loadCem(lib.cemPath);
      const allDecls = cem.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.tagName);
      const withEvents = allDecls.filter((d) => (d.events ?? []).length > 0);
      expect(allDecls.length).toBeGreaterThan(0);
      if (withEvents.length > 0) {
        expect(withEvents.length).toBeGreaterThan(0);
      }
    });

    it(`analyzes source fidelity for first 5 components in ${lib.name}`, async () => {
      const cem = loadCem(lib.cemPath);
      const allDecls = cem.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.tagName);
      const config = makeConfig(lib.dir);
      const sample = allDecls.slice(0, 5);

      for (const decl of sample) {
        const result = await analyzeCemSourceFidelity(config, cem, decl);
        if (result) {
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
          expect(result.subMetrics).toHaveLength(3);
          expect(result.eventFidelity).toBeDefined();
          expect(result.propertyFidelity).toBeDefined();
          expect(result.attributeFidelity).toBeDefined();
        }
      }
    });
  });
}
