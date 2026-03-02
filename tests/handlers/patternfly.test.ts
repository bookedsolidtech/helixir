import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { CemSchema, listAllComponents, parseCem } from '../../src/handlers/cem.js';
import type { Cem } from '../../src/handlers/cem.js';
import { validateUsage } from '../../src/handlers/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

const FIXTURE_CEM: Cem = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'patternfly-custom-elements.json'), 'utf-8')),
);

describe('Patternfly Web Components', () => {
  describe('listAllComponents', () => {
    it('returns all 4 Patternfly components', () => {
      const result = listAllComponents(FIXTURE_CEM);
      expect(result).toHaveLength(4);
      expect(result).toContain('pf-button');
      expect(result).toContain('pf-modal');
      expect(result).toContain('pf-text-input');
      expect(result).toContain('pf-badge');
    });
  });

  describe('parseCem (getComponentDocs)', () => {
    it('returns pf-button metadata', () => {
      const result = parseCem('pf-button', FIXTURE_CEM);
      expect(result.tagName).toBe('pf-button');
      expect(result.name).toBe('PfButton');
    });

    it('includes all 8 variant enum values for pf-button', () => {
      const result = parseCem('pf-button', FIXTURE_CEM);
      const variantField = result.members.find((m) => m.kind === 'field' && m.name === 'variant');
      expect(variantField).toBeDefined();
      const typeText = variantField!.type;
      expect(typeText).toContain('primary');
      expect(typeText).toContain('secondary');
      expect(typeText).toContain('tertiary');
      expect(typeText).toContain('danger');
      expect(typeText).toContain('warning');
      expect(typeText).toContain('link');
      expect(typeText).toContain('plain');
      expect(typeText).toContain('control');
    });

    it('includes correct slots for pf-button', () => {
      const result = parseCem('pf-button', FIXTURE_CEM);
      const slotNames = result.slots.map((s) => s.name);
      expect(slotNames).toContain('');
      expect(slotNames).toContain('icon');
    });

    it('includes events for pf-button', () => {
      const result = parseCem('pf-button', FIXTURE_CEM);
      const eventNames = result.events.map((e) => e.name);
      expect(eventNames).toContain('click');
    });

    it('includes correct slots for pf-modal', () => {
      const result = parseCem('pf-modal', FIXTURE_CEM);
      const slotNames = result.slots.map((s) => s.name);
      expect(slotNames).toContain('');
      expect(slotNames).toContain('header');
      expect(slotNames).toContain('footer');
      expect(slotNames).toContain('description');
    });
  });

  describe('validateUsage', () => {
    it('accepts pf-button with valid variant="primary"', () => {
      const result = validateUsage(
        'pf-button',
        '<pf-button variant="primary">Click</pf-button>',
        FIXTURE_CEM,
      );
      expect(result.valid).toBe(true);
      expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    });

    it('warns for pf-button with invalid variant="ghost"', () => {
      const result = validateUsage(
        'pf-button',
        '<pf-button variant="ghost">Click</pf-button>',
        FIXTURE_CEM,
      );
      const warnings = result.issues.filter((i) => i.level === 'warning' || i.level === 'error');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('accepts pf-modal with open attribute and header slot', () => {
      const result = validateUsage(
        'pf-modal',
        '<pf-modal open><p slot="header">Title</p></pf-modal>',
        FIXTURE_CEM,
      );
      expect(result.valid).toBe(true);
      expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    });
  });
});
