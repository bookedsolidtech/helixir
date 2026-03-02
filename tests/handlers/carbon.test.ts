import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import {
  parseCem,
  validateCompleteness,
  listAllComponents,
  CemSchema,
} from '../../src/handlers/cem.js';
import { validateUsage } from '../../src/handlers/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

const CARBON_CEM = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'carbon-custom-elements.json'), 'utf-8')),
);

describe('IBM Carbon Web Components', () => {
  describe('listAllComponents', () => {
    it('returns exactly 4 components', () => {
      const components = listAllComponents(CARBON_CEM);
      expect(components).toHaveLength(4);
    });

    it('includes all Carbon cds-* components', () => {
      const components = listAllComponents(CARBON_CEM);
      expect(components).toContain('cds-button');
      expect(components).toContain('cds-modal');
      expect(components).toContain('cds-text-input');
      expect(components).toContain('cds-dropdown');
    });
  });

  describe('getComponentDocs (parseCem)', () => {
    it('returns cds-button metadata', () => {
      const result = parseCem('cds-button', CARBON_CEM);
      expect(result.tagName).toBe('cds-button');
      expect(result.name).toBe('CDSButton');
    });

    it('cds-button has kind enum property', () => {
      const result = parseCem('cds-button', CARBON_CEM);
      const kindField = result.members.find((m) => m.name === 'kind');
      expect(kindField).toBeDefined();
      expect(kindField!.type).toContain('primary');
      expect(kindField!.type).toContain('secondary');
      expect(kindField!.type).toContain('danger');
      expect(kindField!.type).toContain('ghost');
      expect(kindField!.type).toContain('tertiary');
    });

    it('cds-button has size enum property', () => {
      const result = parseCem('cds-button', CARBON_CEM);
      const sizeField = result.members.find((m) => m.name === 'size');
      expect(sizeField).toBeDefined();
      expect(sizeField!.type).toContain('sm');
      expect(sizeField!.type).toContain('md');
      expect(sizeField!.type).toContain('lg');
      expect(sizeField!.type).toContain('xl');
      expect(sizeField!.type).toContain('2xl');
    });
  });

  describe('validateUsage', () => {
    it('validates valid cds-button usage', () => {
      const result = validateUsage(
        'cds-button',
        '<cds-button kind="primary">Click</cds-button>',
        CARBON_CEM,
      );
      expect(result.valid).toBe(true);
      expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    });

    it('warns on invalid kind enum value', () => {
      const result = validateUsage(
        'cds-button',
        '<cds-button kind="invalid-kind">Click</cds-button>',
        CARBON_CEM,
      );
      const warn = result.issues.find(
        (i) => i.level === 'warning' && i.message.includes('invalid-kind'),
      );
      expect(warn).toBeDefined();
    });
  });

  describe('validateCompleteness', () => {
    it('returns a numeric score for cds-button', () => {
      const result = validateCompleteness('cds-button', CARBON_CEM);
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('cds-button has a high completeness score (all fields documented)', () => {
      const result = validateCompleteness('cds-button', CARBON_CEM);
      expect(result.score).toBeGreaterThan(70);
    });
  });
});
