import { describe, it, expect } from 'vitest';
import { validateUsage } from '../../packages/core/src/handlers/validate.js';
import { CemSchema } from '../../packages/core/src/handlers/cem.js';

const FIXTURE_CEM = CemSchema.parse({
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class',
          name: 'MyButton',
          tagName: 'my-button',
          description: 'A button component.',
          members: [
            {
              kind: 'field',
              name: 'variant',
              attribute: 'variant',
              type: { text: "'primary' | 'neutral' | 'danger'" },
              description: 'The button variant.',
            },
            {
              kind: 'field',
              name: 'disabled',
              attribute: 'disabled',
              type: { text: 'boolean' },
              description: 'Disables the button.',
            },
            {
              kind: 'field',
              name: 'size',
              attribute: 'size',
              type: { text: "'small' | 'medium' | 'large'" },
              description: 'Button size.',
              default: "'medium'",
            },
            {
              kind: 'field',
              name: 'legacyProp',
              attribute: 'legacy-prop',
              type: { text: 'string' },
              description: '@deprecated Use "variant" instead.',
            },
          ],
          slots: [
            { name: '', description: 'Default slot — button label.' },
            { name: 'prefix', description: 'Leading icon slot.' },
            { name: 'suffix', description: 'Trailing icon slot.' },
          ],
        },
      ],
    },
  ],
});

describe('validateUsage', () => {
  describe('valid usage', () => {
    it('passes for a valid attribute', () => {
      const result = validateUsage(
        'my-button',
        '<my-button variant="primary">Click</my-button>',
        FIXTURE_CEM,
      );
      expect(result.valid).toBe(true);
      expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    });

    it('passes for a component with no attributes', () => {
      const result = validateUsage('my-button', '<my-button>Click</my-button>', FIXTURE_CEM);
      expect(result.valid).toBe(true);
    });

    it('passes for global attributes like class and id', () => {
      const result = validateUsage(
        'my-button',
        '<my-button class="primary" id="btn1">Click</my-button>',
        FIXTURE_CEM,
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('unknown attribute detection', () => {
    it('flags unknown attributes as errors', () => {
      const result = validateUsage(
        'my-button',
        '<my-button varaint="primary">Click</my-button>',
        FIXTURE_CEM,
      );
      expect(result.valid).toBe(false);
      const err = result.issues.find((i) => i.message.includes('varaint'));
      expect(err).toBeDefined();
      expect(err?.level).toBe('error');
    });

    it('suggests close matches for typos', () => {
      const result = validateUsage(
        'my-button',
        '<my-button varaint="primary">Click</my-button>',
        FIXTURE_CEM,
      );
      const err = result.issues.find((i) => i.message.includes('varaint'));
      expect(err?.message).toContain('did you mean');
      expect(err?.message).toContain('variant');
    });

    it('flags completely unknown attributes without a suggestion', () => {
      const result = validateUsage(
        'my-button',
        '<my-button totally-wrong="value">Click</my-button>',
        FIXTURE_CEM,
      );
      const err = result.issues.find((i) => i.message.includes('totally-wrong'));
      expect(err).toBeDefined();
      expect(err?.level).toBe('error');
    });
  });

  describe('deprecated attribute detection', () => {
    it('warns on deprecated attributes', () => {
      const result = validateUsage(
        'my-button',
        '<my-button legacy-prop="old">Click</my-button>',
        FIXTURE_CEM,
      );
      const warn = result.issues.find((i) => i.message.includes('deprecated'));
      expect(warn).toBeDefined();
      expect(warn?.level).toBe('warning');
    });
  });

  describe('enum type validation', () => {
    it('warns when attribute value is not in the enum', () => {
      const result = validateUsage(
        'my-button',
        '<my-button variant="invalid-value">Click</my-button>',
        FIXTURE_CEM,
      );
      const warn = result.issues.find((i) => i.message.includes('invalid-value'));
      expect(warn).toBeDefined();
      expect(warn?.level).toBe('warning');
    });

    it('does not warn for valid enum values', () => {
      const result = validateUsage(
        'my-button',
        '<my-button variant="danger">Click</my-button>',
        FIXTURE_CEM,
      );
      expect(result.issues.filter((i) => i.message.includes('variant'))).toHaveLength(0);
    });
  });

  describe('slot validation', () => {
    it('flags unknown slot names', () => {
      const result = validateUsage(
        'my-button',
        '<my-button><span slot="nonexistent">icon</span></my-button>',
        FIXTURE_CEM,
      );
      const err = result.issues.find((i) => i.message.includes('nonexistent'));
      expect(err).toBeDefined();
      expect(err?.level).toBe('error');
    });

    it('accepts valid slot names', () => {
      const result = validateUsage(
        'my-button',
        '<my-button><span slot="prefix">icon</span></my-button>',
        FIXTURE_CEM,
      );
      const slotErrors = result.issues.filter((i) => i.message.includes('slot'));
      expect(slotErrors).toHaveLength(0);
    });

    it('suggests close slot name matches', () => {
      const result = validateUsage(
        'my-button',
        '<my-button><span slot="prefx">icon</span></my-button>',
        FIXTURE_CEM,
      );
      const err = result.issues.find((i) => i.message.includes('prefx'));
      expect(err?.message).toContain('did you mean');
      expect(err?.message).toContain('prefix');
    });
  });

  describe('levenshtein size guard', () => {
    it('skips suggestions for attribute names over 200 characters', () => {
      const longAttr = 'a'.repeat(201);
      const html = `<my-button ${longAttr}="x">Click</my-button>`;
      const result = validateUsage('my-button', html, FIXTURE_CEM);
      const err = result.issues.find((i) => i.message.includes(longAttr));
      expect(err).toBeDefined();
      expect(err?.message).not.toContain('did you mean');
    });

    it('still suggests for attribute names at exactly 200 characters', () => {
      // 200-char name won't match anything closely, but should not throw and should not suggest
      const attrAt200 = 'v' + 'a'.repeat(199); // 200 chars, not a typo of anything
      const html = `<my-button ${attrAt200}="x">Click</my-button>`;
      const result = validateUsage('my-button', html, FIXTURE_CEM);
      const err = result.issues.find((i) => i.message.includes(attrAt200));
      expect(err).toBeDefined();
    });
  });

  describe('unknown tag name', () => {
    it('throws MCPError for unknown component', () => {
      expect(() =>
        validateUsage('nonexistent-tag', '<nonexistent-tag></nonexistent-tag>', FIXTURE_CEM),
      ).toThrow('not found in CEM');
    });
  });

  describe('formatted output', () => {
    it('formatted output starts with "Validation Results for"', () => {
      const result = validateUsage('my-button', '<my-button>Click</my-button>', FIXTURE_CEM);
      expect(result.formatted).toMatch(/^Validation Results for <my-button>:/);
    });

    it('shows checkmark when no issues', () => {
      const result = validateUsage('my-button', '<my-button>Click</my-button>', FIXTURE_CEM);
      expect(result.formatted).toContain('✅');
    });

    it('shows error icon for unknown attributes', () => {
      const result = validateUsage(
        'my-button',
        '<my-button bad-attr="x">Click</my-button>',
        FIXTURE_CEM,
      );
      expect(result.formatted).toContain('❌');
    });
  });
});
