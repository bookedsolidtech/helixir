import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { findComponentsByToken } from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../__fixtures__/cem-token-lookup.json');

function loadFixture(): Cem {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Cem;
  return raw;
}

describe('findComponentsByToken', () => {
  it('finds all components that use an exact token (partialMatch=false)', () => {
    const cem = loadFixture();
    const result = findComponentsByToken('--color-primary-500', false, cem);

    expect(result.token).toBe('--color-primary-500');
    expect(result.totalMatches).toBe(2);
    const tagNames = result.components.map((c) => c.tagName);
    expect(tagNames).toContain('my-button');
    expect(tagNames).toContain('my-badge');
  });

  it('includes tokenDescription and defaultValue in each match', () => {
    const cem = loadFixture();
    const result = findComponentsByToken('--color-primary-500', false, cem);

    const buttonMatch = result.components.find((c) => c.tagName === 'my-button');
    expect(buttonMatch).toBeDefined();
    expect(buttonMatch?.tokenDescription).toBe("Controls the button's background color");
    expect(buttonMatch?.defaultValue).toBe('#0066cc');
  });

  it('partial match returns components using any token containing the query string', () => {
    const cem = loadFixture();
    // "--color-primary" should match "--color-primary-500" and "--color-primary-600"
    const result = findComponentsByToken('--color-primary', true, cem);

    // my-button has both --color-primary-500 and --color-primary-600 → 2 matches from button
    // my-badge has --color-primary-500 → 1 match from badge
    expect(result.totalMatches).toBe(3);
    const tagNames = result.components.map((c) => c.tagName);
    expect(tagNames).toContain('my-button');
    expect(tagNames).toContain('my-badge');
  });

  it('token used by zero components returns empty array, not an error', () => {
    const cem = loadFixture();
    const result = findComponentsByToken('--color-does-not-exist', false, cem);

    expect(result.token).toBe('--color-does-not-exist');
    expect(result.components).toEqual([]);
    expect(result.totalMatches).toBe(0);
  });

  it('invalid token name without "--" prefix throws a helpful error', () => {
    const cem = loadFixture();
    expect(() => findComponentsByToken('color-primary-500', true, cem)).toThrow(
      /must start with "--"/,
    );
  });

  it('invalid token name without "--" prefix includes the bad name in the error', () => {
    const cem = loadFixture();
    expect(() => findComponentsByToken('badToken', false, cem)).toThrow('badToken');
  });

  it('components with no cssProperties are not included in results', () => {
    const cem = loadFixture();
    // my-icon has empty cssProperties
    const result = findComponentsByToken('--color-primary-500', false, cem);
    const tagNames = result.components.map((c) => c.tagName);
    expect(tagNames).not.toContain('my-icon');
  });

  it('exact match does not include partial matches', () => {
    const cem = loadFixture();
    // exact "--color-primary-500" should NOT match "--color-primary-600"
    const result = findComponentsByToken('--color-primary-500', false, cem);
    const descriptions = result.components.map((c) => c.tokenDescription);
    expect(descriptions).not.toContain('Darker shade for hover state');
  });

  it('finds a token used by a single component', () => {
    const cem = loadFixture();
    const result = findComponentsByToken('--color-neutral-100', false, cem);
    expect(result.totalMatches).toBe(1);
    expect(result.components[0]?.tagName).toBe('my-badge');
  });

  it('partialMatch defaults semantics: --spacing-md matches both button and card', () => {
    const cem = loadFixture();
    const result = findComponentsByToken('--spacing-md', true, cem);
    const tagNames = result.components.map((c) => c.tagName);
    expect(tagNames).toContain('my-button');
    expect(tagNames).toContain('my-card');
  });
});
