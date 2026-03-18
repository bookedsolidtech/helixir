/**
 * Regression tests for @helixui/library CEM event name correctness.
 *
 * Bug: The CEM previously documented hx-carousel's slide change event as
 * `hx-slide-change`. The component actually dispatches `hx-slide`.
 * This test suite locks in the correct event name so future CEM updates
 * don't silently reintroduce the mismatch.
 */
import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import {
  parseCem,
  listAllComponents,
  listAllEvents,
  CemSchema,
} from '../../packages/core/src/handlers/cem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

const HELIXUI_CEM = CemSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'helixui-custom-elements.json'), 'utf-8')),
);

describe('@helixui/library CEM', () => {
  describe('listAllComponents', () => {
    it('includes hx-carousel', () => {
      const components = listAllComponents(HELIXUI_CEM);
      expect(components).toContain('hx-carousel');
    });
  });

  describe('hx-carousel event name', () => {
    it('reports event as hx-slide, not hx-slide-change', () => {
      const result = parseCem('hx-carousel', HELIXUI_CEM);
      const eventNames = result.events.map((e) => e.name);

      // The correct event name dispatched by the component is hx-slide
      expect(eventNames).toContain('hx-slide');

      // hx-slide-change was the incorrect name previously in the CEM
      expect(eventNames).not.toContain('hx-slide-change');
    });

    it('hx-slide event has the correct detail type', () => {
      const result = parseCem('hx-carousel', HELIXUI_CEM);
      const slideEvent = result.events.find((e) => e.name === 'hx-slide');

      expect(slideEvent).toBeDefined();
      expect(slideEvent!.type).toContain('index');
      expect(slideEvent!.type).toContain('HelixCarouselItem');
    });

    it('hx-slide event has a description', () => {
      const result = parseCem('hx-carousel', HELIXUI_CEM);
      const slideEvent = result.events.find((e) => e.name === 'hx-slide');

      expect(slideEvent).toBeDefined();
      expect(slideEvent!.description).toBeTruthy();
    });
  });

  describe('listAllEvents for hx-carousel', () => {
    it('returns hx-slide when filtered by hx-carousel', () => {
      const events = listAllEvents(HELIXUI_CEM, 'hx-carousel');
      const names = events.map((e) => e.eventName);

      expect(names).toContain('hx-slide');
      expect(names).not.toContain('hx-slide-change');
    });

    it('event row contains expected metadata', () => {
      const events = listAllEvents(HELIXUI_CEM, 'hx-carousel');
      const slideEvent = events.find((e) => e.eventName === 'hx-slide');

      expect(slideEvent).toBeDefined();
      expect(slideEvent!.tagName).toBe('hx-carousel');
      expect(slideEvent!.type).toContain('CustomEvent');
    });
  });

  describe('hx-carousel component metadata', () => {
    it('returns correct tag name and class name', () => {
      const result = parseCem('hx-carousel', HELIXUI_CEM);
      expect(result.tagName).toBe('hx-carousel');
      expect(result.name).toBe('HxCarousel');
    });

    it('has currentIndex, autoplay, and loop properties', () => {
      const result = parseCem('hx-carousel', HELIXUI_CEM);
      const fieldNames = result.members.filter((m) => m.kind === 'field').map((m) => m.name);
      expect(fieldNames).toContain('currentIndex');
      expect(fieldNames).toContain('autoplay');
      expect(fieldNames).toContain('loop');
    });
  });
});
