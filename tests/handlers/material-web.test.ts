import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { CemSchema, listAllComponents, parseCem } from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import { validateUsage } from '../../packages/core/src/handlers/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '../__fixtures__/material-web-custom-elements.json');

function loadFixture(): Cem {
  return CemSchema.parse(JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')));
}

describe('Material Web fixture', () => {
  it('loads and parses the CEM fixture without errors', () => {
    const cem = loadFixture();
    expect(cem.schemaVersion).toBe('1.0.0');
    expect(cem.modules).toHaveLength(4);
  });

  it('listAllComponents returns all 4 md-* components', () => {
    const cem = loadFixture();
    const components = listAllComponents(cem);
    expect(components).toHaveLength(4);
    expect(components).toContain('md-filled-button');
    expect(components).toContain('md-outlined-button');
    expect(components).toContain('md-checkbox');
    expect(components).toContain('md-dialog');
  });

  it('getComponentDocs (parseCem) returns properties and events for md-filled-button', () => {
    const cem = loadFixture();
    const meta = parseCem('md-filled-button', cem);
    expect(meta.tagName).toBe('md-filled-button');

    // Properties
    const memberNames = meta.members.map((m) => m.name);
    expect(memberNames).toContain('disabled');
    expect(memberNames).toContain('href');
    expect(memberNames).toContain('trailingIcon');

    // Events
    const eventNames = meta.events.map((e) => e.name);
    expect(eventNames).toContain('click');

    // Slots
    const slotNames = meta.slots.map((s) => s.name);
    expect(slotNames).toContain('');
    expect(slotNames).toContain('icon');

    // CSS custom properties
    const cssProps = meta.cssProperties.map((p) => p.name);
    expect(cssProps).toContain('--md-filled-button-container-color');
  });

  it('validateUsage passes for valid md-filled-button usage with known attribute', () => {
    const cem = loadFixture();
    const result = validateUsage(
      'md-filled-button',
      '<md-filled-button disabled>Click</md-filled-button>',
      cem,
    );
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('validateUsage fails for md-filled-button with unknown attribute', () => {
    const cem = loadFixture();
    const result = validateUsage(
      'md-filled-button',
      '<md-filled-button bad-attr="x">Click</md-filled-button>',
      cem,
    );
    expect(result.valid).toBe(false);
    const errors = result.issues.filter((i) => i.level === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('bad-attr'))).toBe(true);
  });

  it('parseCem returns correct metadata for md-checkbox', () => {
    const cem = loadFixture();
    const meta = parseCem('md-checkbox', cem);
    expect(meta.tagName).toBe('md-checkbox');
    const memberNames = meta.members.map((m) => m.name);
    expect(memberNames).toContain('checked');
    expect(memberNames).toContain('indeterminate');
    expect(memberNames).toContain('disabled');
    const eventNames = meta.events.map((e) => e.name);
    expect(eventNames).toContain('change');
  });

  it('parseCem returns correct metadata for md-dialog', () => {
    const cem = loadFixture();
    const meta = parseCem('md-dialog', cem);
    expect(meta.tagName).toBe('md-dialog');
    const memberNames = meta.members.map((m) => m.name);
    expect(memberNames).toContain('open');
    expect(memberNames).toContain('returnValue');
    const eventNames = meta.events.map((e) => e.name);
    expect(eventNames).toContain('open');
    expect(eventNames).toContain('close');
    expect(eventNames).toContain('cancel');
    const slotNames = meta.slots.map((s) => s.name);
    expect(slotNames).toContain('headline');
    expect(slotNames).toContain('actions');
  });
});
