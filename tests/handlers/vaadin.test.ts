import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CemSchema } from '../../src/handlers/cem.js';
import { listAllComponents, parseCem } from '../../src/handlers/cem.js';
import { validateUsage } from '../../src/handlers/validate.js';

const fixturesDir = join(import.meta.dirname, '../__fixtures__');

let cem: ReturnType<typeof CemSchema.parse>;

beforeAll(() => {
  const raw = readFileSync(join(fixturesDir, 'vaadin-custom-elements.json'), 'utf-8');
  cem = CemSchema.parse(JSON.parse(raw));
});

describe('Vaadin — listAllComponents', () => {
  it('returns all 3 Vaadin components', () => {
    const components = listAllComponents(cem);
    expect(components).toHaveLength(3);
    expect(components).toContain('vaadin-button');
    expect(components).toContain('vaadin-text-field');
    expect(components).toContain('vaadin-grid');
  });
});

describe('Vaadin — parseCem (component docs)', () => {
  it('vaadin-text-field has label, value, and errorMessage properties', () => {
    const meta = parseCem('vaadin-text-field', cem);
    const memberNames = meta.members.map((m) => m.name);
    expect(memberNames).toContain('label');
    expect(memberNames).toContain('value');
    expect(memberNames).toContain('errorMessage');
  });

  it('vaadin-text-field has required, disabled, readonly, placeholder, invalid properties', () => {
    const meta = parseCem('vaadin-text-field', cem);
    const memberNames = meta.members.map((m) => m.name);
    expect(memberNames).toContain('required');
    expect(memberNames).toContain('disabled');
    expect(memberNames).toContain('readonly');
    expect(memberNames).toContain('placeholder');
    expect(memberNames).toContain('invalid');
  });

  it('vaadin-text-field has value-changed, change, and input events', () => {
    const meta = parseCem('vaadin-text-field', cem);
    const eventNames = meta.events.map((e) => e.name);
    expect(eventNames).toContain('value-changed');
    expect(eventNames).toContain('change');
    expect(eventNames).toContain('input');
  });
});

describe('Vaadin — validateUsage', () => {
  it('accepts valid vaadin-text-field usage', () => {
    const result = validateUsage(
      'vaadin-text-field',
      '<vaadin-text-field label="Email" required></vaadin-text-field>',
      cem,
    );
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('rejects typo attribute and suggests did you mean', () => {
    const result = validateUsage(
      'vaadin-text-field',
      '<vaadin-text-field lable="Email"></vaadin-text-field>',
      cem,
    );
    expect(result.valid).toBe(false);
    const errorMessages = result.issues.map((i) => i.message).join(' ');
    expect(errorMessages).toMatch(/did you mean ['"]?label['"]?/i);
  });
});
