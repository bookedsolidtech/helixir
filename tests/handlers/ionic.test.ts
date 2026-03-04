import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { CemSchema, listAllComponents, parseCem } from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import { validateUsage } from '../../packages/core/src/handlers/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

const IONIC_CEM: Cem = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'ionic-custom-elements.json'), 'utf-8')),
);

describe('Ionic Web Components — fixture', () => {
  it('listAllComponents returns 4 components', () => {
    const components = listAllComponents(IONIC_CEM);
    expect(components).toHaveLength(4);
    expect(components).toContain('ion-button');
    expect(components).toContain('ion-modal');
    expect(components).toContain('ion-input');
    expect(components).toContain('ion-select');
  });

  describe('getComponentDocs (parseCem) — ion-button', () => {
    it('returns fill, expand, and color properties', () => {
      const meta = parseCem('ion-button', IONIC_CEM);
      const memberNames = meta.members.map((m) => m.name);
      expect(memberNames).toContain('fill');
      expect(memberNames).toContain('expand');
      expect(memberNames).toContain('color');
    });

    it('fill has correct enum type', () => {
      const meta = parseCem('ion-button', IONIC_CEM);
      const fill = meta.members.find((m) => m.name === 'fill');
      expect(fill?.type).toContain('solid');
      expect(fill?.type).toContain('outline');
      expect(fill?.type).toContain('clear');
    });

    it('has ionFocus and ionBlur events', () => {
      const meta = parseCem('ion-button', IONIC_CEM);
      const eventNames = meta.events.map((e) => e.name);
      expect(eventNames).toContain('ionFocus');
      expect(eventNames).toContain('ionBlur');
    });

    it('has expected slots: default, icon-only, start, end', () => {
      const meta = parseCem('ion-button', IONIC_CEM);
      const slotNames = meta.slots.map((s) => s.name);
      expect(slotNames).toContain('');
      expect(slotNames).toContain('icon-only');
      expect(slotNames).toContain('start');
      expect(slotNames).toContain('end');
    });
  });

  describe('validateUsage — ion-button', () => {
    it('valid: fill="solid" color="primary"', () => {
      const result = validateUsage(
        'ion-button',
        '<ion-button fill="solid" color="primary">Click</ion-button>',
        IONIC_CEM,
      );
      expect(result.valid).toBe(true);
      expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    });

    it('warning: fill="invalid-fill" produces enum warning', () => {
      const result = validateUsage(
        'ion-button',
        '<ion-button fill="invalid-fill">Click</ion-button>',
        IONIC_CEM,
      );
      const warn = result.issues.find(
        (i) => i.level === 'warning' && i.message.includes('invalid-fill'),
      );
      expect(warn).toBeDefined();
    });

    it('valid slot: ion-icon with slot="start"', () => {
      const result = validateUsage(
        'ion-button',
        '<ion-button><ion-icon slot="start"></ion-icon>Click</ion-button>',
        IONIC_CEM,
      );
      const slotErrors = result.issues.filter(
        (i) => i.message.toLowerCase().includes('slot') && i.level === 'error',
      );
      expect(slotErrors).toHaveLength(0);
    });
  });
});
