import { describe, it, expect } from 'vitest';
import { checkMethodCalls } from '../../packages/core/src/handlers/method-checker.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fixture: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module' as const,
      path: 'src/my-dialog.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyDialog',
          tagName: 'my-dialog',
          members: [
            {
              kind: 'field' as const,
              name: 'open',
              type: { text: 'boolean' },
              description: 'Whether the dialog is visible.',
            },
            {
              kind: 'field' as const,
              name: 'label',
              type: { text: 'string' },
              description: 'Accessible label.',
            },
            {
              kind: 'method' as const,
              name: 'show',
              description: 'Opens the dialog.',
            },
            {
              kind: 'method' as const,
              name: 'hide',
              description: 'Closes the dialog.',
            },
          ],
          events: [
            { name: 'my-show', type: { text: 'CustomEvent' } },
            { name: 'my-hide', type: { text: 'CustomEvent' } },
          ],
          slots: [{ name: '', description: 'Dialog content.' }],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyButton',
          tagName: 'my-button',
          members: [
            {
              kind: 'field' as const,
              name: 'variant',
              type: { text: "'primary' | 'default'" },
              description: 'Button variant.',
            },
            {
              kind: 'method' as const,
              name: 'click',
              description: 'Simulates a click.',
            },
          ],
          events: [],
          slots: [],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
  ],
};

// ─── Clean code ─────────────────────────────────────────────────────────────

describe('checkMethodCalls — clean code', () => {
  it('returns clean for valid method calls', () => {
    const code = `const dialog = document.querySelector('my-dialog');
dialog.show();
dialog.hide();`;
    const result = checkMethodCalls(code, 'my-dialog', fixture);
    expect(result.clean).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns clean for valid property access', () => {
    const code = `const dialog = document.querySelector('my-dialog');
dialog.open = true;
dialog.label = 'Confirm';`;
    const result = checkMethodCalls(code, 'my-dialog', fixture);
    expect(result.clean).toBe(true);
  });
});

// ─── Unknown method detection ────────────────────────────────────────────────

describe('checkMethodCalls — unknown methods', () => {
  it('catches calls to non-existent methods', () => {
    const code = `const dialog = document.querySelector('my-dialog');
dialog.toggle();`;
    const result = checkMethodCalls(code, 'my-dialog', fixture);
    expect(result.issues.some((i) => i.rule === 'unknown-method')).toBe(true);
    expect(result.issues[0]?.name).toBe('toggle');
  });

  it('suggests correct method for typos', () => {
    const code = `const dialog = document.querySelector('my-dialog');
dialog.shwo();`;
    const result = checkMethodCalls(code, 'my-dialog', fixture);
    expect(result.issues.some((i) => i.rule === 'unknown-method')).toBe(true);
    expect(result.issues[0]?.suggestion).toBe('show');
  });

  it('catches hallucinated methods', () => {
    const code = `const dialog = document.querySelector('my-dialog');
dialog.toggle();
dialog.close();`;
    const result = checkMethodCalls(code, 'my-dialog', fixture);
    const unknown = result.issues.filter((i) => i.rule === 'unknown-method');
    expect(unknown).toHaveLength(2);
  });
});

// ─── Property-as-method detection ────────────────────────────────────────────

describe('checkMethodCalls — property-as-method', () => {
  it('catches property called as method', () => {
    const code = `dialog.open();`;
    const result = checkMethodCalls(code, 'my-dialog', fixture);
    expect(result.issues.some((i) => i.rule === 'property-as-method')).toBe(true);
    expect(result.issues[0]?.message).toContain('property');
  });

  it('catches label called as method', () => {
    const code = `dialog.label('test');`;
    const result = checkMethodCalls(code, 'my-dialog', fixture);
    expect(result.issues.some((i) => i.rule === 'property-as-method')).toBe(true);
  });
});

// ─── Method-as-property detection ────────────────────────────────────────────

describe('checkMethodCalls — method-as-property', () => {
  it('catches method assigned as property', () => {
    const code = `dialog.show = true;`;
    const result = checkMethodCalls(code, 'my-dialog', fixture);
    expect(result.issues.some((i) => i.rule === 'method-as-property')).toBe(true);
    expect(result.issues[0]?.message).toContain('method');
  });
});

// ─── Result structure ───────────────────────────────────────────────────────

describe('checkMethodCalls — result structure', () => {
  it('includes available methods and properties', () => {
    const code = `dialog.toggle();`;
    const result = checkMethodCalls(code, 'my-dialog', fixture);
    expect(result.availableMethods).toContain('show');
    expect(result.availableMethods).toContain('hide');
    expect(result.availableProperties).toContain('open');
    expect(result.availableProperties).toContain('label');
  });

  it('returns line numbers', () => {
    const code = `// line 1
dialog.toggle();`;
    const result = checkMethodCalls(code, 'my-dialog', fixture);
    expect(result.issues[0]?.line).toBe(2);
  });
});
