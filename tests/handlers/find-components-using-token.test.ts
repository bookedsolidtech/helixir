import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { findComponentsUsingToken } from '../../packages/core/src/handlers/tokens.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../__fixtures__/cem-token-lookup.json');

function loadFixture(): Cem {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Cem;
}

describe('findComponentsUsingToken', () => {
  it('returns all components referencing an exact token', () => {
    const cem = loadFixture();
    const result = findComponentsUsingToken(cem, '--color-primary-500');

    expect(result.token).toBe('--color-primary-500');
    expect(result.total).toBe(2);
    const tagNames = result.components.map((c) => c.tagName);
    expect(tagNames).toContain('my-button');
    expect(tagNames).toContain('my-badge');
  });

  it('result entries include tagName, usedIn, and description', () => {
    const cem = loadFixture();
    const result = findComponentsUsingToken(cem, '--color-primary-500');

    const buttonEntry = result.components.find((c) => c.tagName === 'my-button');
    expect(buttonEntry).toBeDefined();
    expect(buttonEntry?.usedIn).toBe('--color-primary-500');
    expect(buttonEntry?.description).toBe("Controls the button's background color");
  });

  it('returns empty components array (not error) when no match found', () => {
    const cem = loadFixture();
    const result = findComponentsUsingToken(cem, '--does-not-exist');

    expect(result.token).toBe('--does-not-exist');
    expect(result.components).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('fuzzy: true with trailing wildcard matches all tokens with that prefix', () => {
    const cem = loadFixture();
    // --color-primary-* should match --color-primary-500 and --color-primary-600
    const result = findComponentsUsingToken(cem, '--color-primary-*', { fuzzy: true });

    // my-button has both, my-badge has one
    expect(result.total).toBe(3);
    const tagNames = result.components.map((c) => c.tagName);
    expect(tagNames).toContain('my-button');
    expect(tagNames).toContain('my-badge');
  });

  it('fuzzy: true with substring match (no wildcard) finds partial names', () => {
    const cem = loadFixture();
    const result = findComponentsUsingToken(cem, '--color-primary', { fuzzy: true });

    expect(result.total).toBe(3);
  });

  it('fuzzy wildcard matches the usedIn field with the actual property name', () => {
    const cem = loadFixture();
    const result = findComponentsUsingToken(cem, '--spacing-*', { fuzzy: true });

    const usedIns = result.components.map((c) => c.usedIn);
    expect(usedIns).toContain('--spacing-md');
    // Both my-button and my-card use --spacing-md
    expect(result.total).toBe(2);
  });

  it('exact match does not return partial matches', () => {
    const cem = loadFixture();
    const result = findComponentsUsingToken(cem, '--color-primary-500');

    const usedIns = result.components.map((c) => c.usedIn);
    expect(usedIns).not.toContain('--color-primary-600');
  });

  it('token used by a single component returns total of 1', () => {
    const cem = loadFixture();
    const result = findComponentsUsingToken(cem, '--color-neutral-100');

    expect(result.total).toBe(1);
    expect(result.components[0]?.tagName).toBe('my-badge');
  });

  it('components with empty cssProperties are not included in results', () => {
    const cem = loadFixture();
    const result = findComponentsUsingToken(cem, '--color-primary-500');

    const tagNames = result.components.map((c) => c.tagName);
    expect(tagNames).not.toContain('my-icon');
  });

  it('handles CEM with no modules gracefully', () => {
    const emptyCem: Cem = { schemaVersion: '1.0.0', modules: [] };
    const result = findComponentsUsingToken(emptyCem, '--any-token');

    expect(result.components).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('handles CEM with declarations that have no cssProperties', () => {
    const cem: Cem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/x.js',
          declarations: [{ kind: 'class', name: 'MyX', tagName: 'my-x' }],
        },
      ],
    };
    const result = findComponentsUsingToken(cem, '--any-token');

    expect(result.components).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('fuzzy: false is the default (exact match only)', () => {
    const cem = loadFixture();
    // Without fuzzy, '--color-primary' should not match '--color-primary-500'
    const result = findComponentsUsingToken(cem, '--color-primary');

    expect(result.total).toBe(0);
  });
});
