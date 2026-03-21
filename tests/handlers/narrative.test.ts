import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import {
  getComponentNarrative,
  buildNarrative,
} from '../../packages/core/src/handlers/narrative.js';
import { CemSchema } from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import { MCPError, ErrorCategory } from '../../packages/core/src/shared/error-handling.js';
import type { ComponentMetadata } from '../../packages/core/src/handlers/cem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

const FIXTURE_CEM: Cem = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'custom-elements.json'), 'utf-8')),
);

// ---------------------------------------------------------------------------
// getComponentNarrative
// ---------------------------------------------------------------------------

describe('getComponentNarrative', () => {
  it('returns a non-empty markdown string for an existing component', () => {
    const result = getComponentNarrative('my-button', FIXTURE_CEM);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the component tag name in the output', () => {
    const result = getComponentNarrative('my-button', FIXTURE_CEM);
    expect(result).toContain('my-button');
  });

  it('includes a markdown heading', () => {
    const result = getComponentNarrative('my-button', FIXTURE_CEM);
    expect(result).toContain('## my-button');
  });

  it('throws MCPError with NOT_FOUND for a missing component', () => {
    let err: unknown;
    try {
      getComponentNarrative('no-such-element', FIXTURE_CEM);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MCPError);
    expect((err as MCPError).category).toBe(ErrorCategory.NOT_FOUND);
  });
});

// ---------------------------------------------------------------------------
// getComponentNarrative — enhanced CSS customization section
// ---------------------------------------------------------------------------

describe('getComponentNarrative — CSS customization section (my-button)', () => {
  it('includes var() usage examples for CSS custom properties', () => {
    const result = getComponentNarrative('my-button', FIXTURE_CEM);
    expect(result).toContain('var(--my-button-bg');
  });

  it('includes a CSS code block example for custom properties', () => {
    const result = getComponentNarrative('my-button', FIXTURE_CEM);
    expect(result).toContain('```css');
    expect(result).toContain('--my-button-bg');
  });

  it('includes ::part() selector examples', () => {
    const result = getComponentNarrative('my-button', FIXTURE_CEM);
    expect(result).toContain('my-button::part(base)');
  });

  it('includes Shadow DOM constraints section with anti-hallucination warnings', () => {
    const result = getComponentNarrative('my-button', FIXTURE_CEM);
    expect(result).toContain('Shadow DOM constraints');
    expect(result).toContain('cannot pierce Shadow DOM');
    expect(result).toContain('::part()');
  });

  it('includes part code block example', () => {
    const result = getComponentNarrative('my-button', FIXTURE_CEM);
    expect(result).toContain('::part(base) {');
  });
});

// ---------------------------------------------------------------------------
// buildNarrative — component-tailored Shadow DOM warnings
// ---------------------------------------------------------------------------

describe('buildNarrative — tailored Shadow DOM constraints', () => {
  const baseMeta: ComponentMetadata = {
    tagName: 'test-el',
    description: 'A test element.',
    members: [],
    events: [],
    slots: [],
    cssProperties: [{ name: '--test-color', description: 'Text color', default: 'black' }],
    cssParts: [],
  };

  it('includes ::part() warnings when component has CSS parts', () => {
    const meta: ComponentMetadata = {
      ...baseMeta,
      cssParts: [{ name: 'base', description: 'The base element' }],
    };
    const result = buildNarrative(meta);
    expect(result).toContain('::part()::part()');
  });

  it('excludes ::part() chaining warning when component has no CSS parts', () => {
    const result = buildNarrative(baseMeta);
    expect(result).not.toContain('::part()::part()');
  });

  it('includes ::slotted() warning when component has slots', () => {
    const meta: ComponentMetadata = {
      ...baseMeta,
      slots: [{ name: '', description: 'Default slot' }],
    };
    const result = buildNarrative(meta);
    expect(result).toContain('::slotted()');
  });

  it('excludes ::slotted() warning when component has no slots', () => {
    const result = buildNarrative(baseMeta);
    expect(result).not.toContain('::slotted()');
  });

  it('always includes core encapsulation warning regardless of parts/slots', () => {
    const result = buildNarrative(baseMeta);
    expect(result).toContain('cannot pierce Shadow DOM');
  });

  it('always includes :host warning', () => {
    const result = buildNarrative(baseMeta);
    expect(result).toContain(':host');
  });
});
