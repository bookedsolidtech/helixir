import { describe, it, expect } from 'vitest';
import { checkComponentImports } from '../../packages/core/src/handlers/import-checker.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fixture: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module' as const,
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyButton',
          tagName: 'my-button',
          members: [],
          events: [],
          slots: [],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-card.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyCard',
          tagName: 'my-card',
          members: [],
          events: [],
          slots: [],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
    {
      kind: 'javascript-module' as const,
      path: 'src/my-select.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MySelect',
          tagName: 'my-select',
          members: [],
          events: [],
          slots: [],
          cssProperties: [],
          cssParts: [],
        },
      ],
    },
  ],
};

// ─── Valid Usage ─────────────────────────────────────────────────────────────

describe('checkComponentImports — valid tags', () => {
  it('reports no issues for known components', () => {
    const html = `<my-button>Click</my-button>
<my-card>
  <my-button>OK</my-button>
</my-card>`;
    const result = checkComponentImports(html, fixture);
    expect(result.unknownTags).toHaveLength(0);
    expect(result.clean).toBe(true);
  });

  it('ignores standard HTML elements', () => {
    const html = `<div><span>text</span><input /><br /><hr /></div>`;
    const result = checkComponentImports(html, fixture);
    expect(result.unknownTags).toHaveLength(0);
  });

  it('ignores self-closing custom elements', () => {
    const html = `<my-button />`;
    const result = checkComponentImports(html, fixture);
    expect(result.unknownTags).toHaveLength(0);
  });
});

// ─── Unknown Tags ───────────────────────────────────────────────────────────

describe('checkComponentImports — unknown tags', () => {
  it('detects unknown custom element tags', () => {
    const html = `<my-dialog>
  <my-button>OK</my-button>
</my-dialog>`;
    const result = checkComponentImports(html, fixture);
    expect(result.unknownTags).toHaveLength(1);
    expect(result.unknownTags[0]?.tagName).toBe('my-dialog');
    expect(result.clean).toBe(false);
  });

  it('detects multiple unknown tags', () => {
    const html = `<my-dialog>
  <my-tooltip>Hover me</my-tooltip>
  <my-badge>3</my-badge>
</my-dialog>`;
    const result = checkComponentImports(html, fixture);
    expect(result.unknownTags).toHaveLength(3);
  });

  it('deduplicates unknown tags', () => {
    const html = `<my-dialog>text</my-dialog>
<my-dialog>more text</my-dialog>`;
    const result = checkComponentImports(html, fixture);
    expect(result.unknownTags).toHaveLength(1);
  });

  it('suggests closest tag name for typos', () => {
    const html = `<my-buton>Click</my-buton>`;
    const result = checkComponentImports(html, fixture);
    expect(result.unknownTags).toHaveLength(1);
    expect(result.unknownTags[0]?.suggestion).toBe('my-button');
  });

  it('suggests closest for similar prefixes', () => {
    const html = `<my-selet>Choose</my-selet>`;
    const result = checkComponentImports(html, fixture);
    expect(result.unknownTags[0]?.suggestion).toBe('my-select');
  });
});

// ─── Framework Patterns ─────────────────────────────────────────────────────

describe('checkComponentImports — framework patterns', () => {
  it('detects custom elements in JSX', () => {
    const jsx = `function App() {
  return <my-widget>Content</my-widget>;
}`;
    const result = checkComponentImports(jsx, fixture);
    expect(result.unknownTags).toHaveLength(1);
    expect(result.unknownTags[0]?.tagName).toBe('my-widget');
  });

  it('handles Vue template syntax', () => {
    const vue = `<template>
  <my-button>Click</my-button>
  <my-panel>Panel</my-panel>
</template>`;
    const result = checkComponentImports(vue, fixture);
    expect(result.unknownTags).toHaveLength(1);
    expect(result.unknownTags[0]?.tagName).toBe('my-panel');
  });
});

// ─── Result Structure ────────────────────────────────────────────────────────

describe('checkComponentImports — result structure', () => {
  it('returns knownTags list', () => {
    const html = `<my-button>OK</my-button><my-card>Card</my-card>`;
    const result = checkComponentImports(html, fixture);
    expect(result.knownTags).toContain('my-button');
    expect(result.knownTags).toContain('my-card');
  });

  it('returns totalCustomElements count', () => {
    const html = `<my-button>OK</my-button><my-card>Card</my-card><my-dialog>X</my-dialog>`;
    const result = checkComponentImports(html, fixture);
    expect(result.totalCustomElements).toBe(3);
  });

  it('unknown tags include line numbers', () => {
    const html = `<div>
<my-unknown>test</my-unknown>
</div>`;
    const result = checkComponentImports(html, fixture);
    expect(result.unknownTags[0]?.line).toBe(2);
  });
});
