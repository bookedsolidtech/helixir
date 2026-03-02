import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { getCompositionExample } from '../../src/handlers/composition.js';
import { CemSchema } from '../../src/handlers/cem.js';
import type { Cem } from '../../src/handlers/cem.js';
import { MCPError } from '../../src/shared/error-handling.js';
import { ErrorCategory } from '../../src/shared/error-handling.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

const FIXTURE_CEM: Cem = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'custom-elements.json'), 'utf-8')),
);

// ---------------------------------------------------------------------------
// Single component
// ---------------------------------------------------------------------------

describe('getCompositionExample — single component', () => {
  it('returns html containing the component tag', () => {
    const result = getCompositionExample(FIXTURE_CEM, ['my-button']);
    expect(result.html).toContain('<my-button');
    expect(result.html).toContain('</my-button>');
  });

  it('populates slots_used for slots defined on the component', () => {
    const result = getCompositionExample(FIXTURE_CEM, ['my-button']);
    // my-button has prefix and suffix named slots
    expect(result.slots_used).toHaveProperty('prefix');
    expect(result.slots_used).toHaveProperty('suffix');
  });

  it('returns a non-empty description', () => {
    const result = getCompositionExample(FIXTURE_CEM, ['my-button']);
    expect(result.description).toBeTruthy();
    expect(result.description).toContain('my-button');
  });
});

// ---------------------------------------------------------------------------
// card + button (container with named slots)
// ---------------------------------------------------------------------------

describe('getCompositionExample — card + button', () => {
  it('uses my-card as container (it has more named slots)', () => {
    const result = getCompositionExample(FIXTURE_CEM, ['my-card', 'my-button']);
    // Container is my-card; description mentions it
    expect(result.description).toContain('my-card');
  });

  it('html wraps my-button inside my-card', () => {
    const result = getCompositionExample(FIXTURE_CEM, ['my-card', 'my-button']);
    const cardOpen = result.html.indexOf('<my-card');
    const buttonLine = result.html.indexOf('<my-button');
    const cardClose = result.html.lastIndexOf('</my-card>');
    // button appears after card opens and before card closes
    expect(cardOpen).toBeGreaterThanOrEqual(0);
    expect(buttonLine).toBeGreaterThan(cardOpen);
    expect(cardClose).toBeGreaterThan(buttonLine);
  });

  it('slot assignment for my-button appears in slots_used', () => {
    const result = getCompositionExample(FIXTURE_CEM, ['my-card', 'my-button']);
    const slotValues = Object.values(result.slots_used);
    expect(slotValues).toContain('my-button');
  });

  it('html includes a slot attribute on my-button', () => {
    const result = getCompositionExample(FIXTURE_CEM, ['my-card', 'my-button']);
    expect(result.html).toMatch(/my-button[^>]*slot="/);
  });
});

// ---------------------------------------------------------------------------
// Multi-component (card + button + select)
// ---------------------------------------------------------------------------

describe('getCompositionExample — card + button + select', () => {
  it('generates valid html with all three tags present', () => {
    const result = getCompositionExample(FIXTURE_CEM, ['my-card', 'my-button', 'my-select']);
    expect(result.html).toContain('<my-card');
    expect(result.html).toContain('<my-button');
    expect(result.html).toContain('<my-select');
  });

  it('slots_used has entries for child components', () => {
    const result = getCompositionExample(FIXTURE_CEM, ['my-card', 'my-button', 'my-select']);
    expect(Object.keys(result.slots_used).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Unknown tag names
// ---------------------------------------------------------------------------

describe('getCompositionExample — unknown tag names', () => {
  it('throws MCPError for a completely unknown tag', () => {
    expect(() => getCompositionExample(FIXTURE_CEM, ['unknown-tag'])).toThrow(MCPError);
  });

  it('error message lists the unknown tag', () => {
    try {
      getCompositionExample(FIXTURE_CEM, ['unknown-tag']);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as MCPError).message).toContain('unknown-tag');
    }
  });

  it('error has NOT_FOUND category', () => {
    try {
      getCompositionExample(FIXTURE_CEM, ['nope-component']);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as MCPError).category).toBe(ErrorCategory.NOT_FOUND);
    }
  });

  it('error message includes valid tags', () => {
    try {
      getCompositionExample(FIXTURE_CEM, ['unknown-tag']);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as MCPError).message).toContain('my-button');
    }
  });

  it('throws for mixed known + unknown tags', () => {
    expect(() => getCompositionExample(FIXTURE_CEM, ['my-button', 'does-not-exist'])).toThrow(
      MCPError,
    );
  });

  it('mixed error message lists the unknown component', () => {
    try {
      getCompositionExample(FIXTURE_CEM, ['my-button', 'does-not-exist']);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as MCPError).message).toContain('does-not-exist');
    }
  });
});

// ---------------------------------------------------------------------------
// Side-by-side fallback (components with no named slots toward each other)
// ---------------------------------------------------------------------------

describe('getCompositionExample — side-by-side fallback', () => {
  it('generates side-by-side layout when no container has named slots', () => {
    // Build a minimal CEM where no component has named slots
    const minimalCem: Cem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'a.js',
          declarations: [
            {
              kind: 'class',
              name: 'CompA',
              tagName: 'comp-a',
              slots: [{ name: '' }], // default slot only
            },
          ],
        },
        {
          kind: 'javascript-module',
          path: 'b.js',
          declarations: [
            {
              kind: 'class',
              name: 'CompB',
              tagName: 'comp-b',
              slots: [{ name: '' }], // default slot only
            },
          ],
        },
      ],
    };
    const result = getCompositionExample(minimalCem, ['comp-a', 'comp-b']);
    expect(result.description).toContain('Side-by-side');
    expect(result.html).toContain('<comp-a');
    expect(result.html).toContain('<comp-b');
  });
});
