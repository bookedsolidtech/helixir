import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { parseCem, listAllComponents, CemSchema } from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import { validateUsage } from '../../packages/core/src/handlers/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

const FLUENT_CEM: Cem = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'fluent-custom-elements.json'), 'utf-8')),
);

describe('Fluent UI Web Components fixture', () => {
  describe('listAllComponents', () => {
    it('returns exactly 4 components', () => {
      const components = listAllComponents(FLUENT_CEM);
      expect(components).toHaveLength(4);
    });

    it('includes all expected fluent- prefixed tags', () => {
      const components = listAllComponents(FLUENT_CEM);
      expect(components).toContain('fluent-button');
      expect(components).toContain('fluent-text-field');
      expect(components).toContain('fluent-dialog');
      expect(components).toContain('fluent-badge');
    });
  });

  describe('parseCem - fluent-button', () => {
    it('returns button metadata', () => {
      const result = parseCem('fluent-button', FLUENT_CEM);
      expect(result.tagName).toBe('fluent-button');
      expect(result.name).toBe('FluentButton');
    });

    it('has appearance field member with enum type', () => {
      const result = parseCem('fluent-button', FLUENT_CEM);
      const appearance = result.members.find((m) => m.name === 'appearance');
      expect(appearance).toBeDefined();
      // parseCem maps type to a plain string
      expect(appearance?.type).toContain('accent');
    });

    it('has iconPosition field with kebab-case attribute name icon-position (raw CEM)', () => {
      // parseCem strips the attribute field; access raw CEM declaration directly
      const decl = FLUENT_CEM.modules
        .flatMap((m) => m.declarations ?? [])
        .find((d) => d.tagName === 'fluent-button');
      const iconPosition = (decl?.members ?? []).find((m) => m.name === 'iconPosition');
      expect(iconPosition).toBeDefined();
      expect(iconPosition?.attribute).toBe('icon-position');
    });
  });

  describe('raw CEM - fluent-text-field', () => {
    it('has readOnly field with read-only attribute (kebab-case) in raw CEM', () => {
      const decl = FLUENT_CEM.modules
        .flatMap((m) => m.declarations ?? [])
        .find((d) => d.tagName === 'fluent-text-field');
      const readOnly = (decl?.members ?? []).find((m) => m.name === 'readOnly');
      expect(readOnly).toBeDefined();
      expect(readOnly?.attribute).toBe('read-only');
    });
  });

  describe('validateUsage - fluent-button', () => {
    it('passes for valid appearance enum value', () => {
      const result = validateUsage(
        'fluent-button',
        '<fluent-button appearance="accent">Click</fluent-button>',
        FLUENT_CEM,
      );
      expect(result.valid).toBe(true);
      expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    });

    it('warns for invalid appearance enum value', () => {
      const result = validateUsage(
        'fluent-button',
        '<fluent-button appearance="bad-value">Click</fluent-button>',
        FLUENT_CEM,
      );
      const warn = result.issues.find((i) => i.message.includes('bad-value'));
      expect(warn).toBeDefined();
      expect(warn?.level).toBe('warning');
    });

    it('recognizes icon-position as the HTML attribute for iconPosition', () => {
      const result = validateUsage(
        'fluent-button',
        '<fluent-button icon-position="before">Click</fluent-button>',
        FLUENT_CEM,
      );
      const errors = result.issues.filter(
        (i) => i.level === 'error' && i.message.includes('icon-position'),
      );
      expect(errors).toHaveLength(0);
    });

    it('flags unknown attributes as errors', () => {
      const result = validateUsage(
        'fluent-button',
        '<fluent-button unknown-attr="value">Click</fluent-button>',
        FLUENT_CEM,
      );
      expect(result.valid).toBe(false);
    });
  });
});
