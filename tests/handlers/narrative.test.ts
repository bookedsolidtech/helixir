import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { getComponentNarrative } from '../../src/handlers/narrative.js';
import { CemSchema } from '../../src/handlers/cem.js';
import type { Cem } from '../../src/handlers/cem.js';
import { MCPError, ErrorCategory } from '../../src/shared/error-handling.js';

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
