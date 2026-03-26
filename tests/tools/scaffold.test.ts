/**
 * Tests for the scaffold_component tool dispatcher.
 * Covers isScaffoldTool, handleScaffoldCall, argument validation,
 * and response formatting.
 */
import { describe, it, expect, vi } from 'vitest';
import { isScaffoldTool, handleScaffoldCall } from '../../packages/core/src/tools/scaffold.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../packages/core/src/handlers/scaffold.js', () => ({
  scaffoldComponent: vi.fn(() => ({
    tagName: 'hx-button',
    conventions: { prefix: 'hx-', baseClass: 'LitElement', packageName: 'lit' },
    component: 'export class HxButton extends LitElement {}',
    test: "import { describe, it } from 'vitest';",
    story: "import type { Meta } from '@storybook/web-components';",
    css: ':host { display: block; }',
  })),
  detectConventions: vi.fn(() => ({
    prefix: 'hx-',
    baseClass: 'LitElement',
    packageName: 'lit',
  })),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_CONFIG: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: '/fake/project',
  componentPrefix: '',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: null,
  cdnBase: null,
  watch: false,
};

const FAKE_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

const HX_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/hx-button.ts',
      declarations: [
        {
          kind: 'class',
          name: 'HxButton',
          tagName: 'hx-button',
          superclass: { name: 'LitElement', package: 'lit' },
          members: [],
        },
      ],
    },
  ],
};

// ─── isScaffoldTool ───────────────────────────────────────────────────────────

describe('isScaffoldTool', () => {
  it('returns true for scaffold_component', () => {
    expect(isScaffoldTool('scaffold_component')).toBe(true);
  });

  it('returns false for unknown tool names', () => {
    expect(isScaffoldTool('get_component')).toBe(false);
    expect(isScaffoldTool('extend_component')).toBe(false);
    expect(isScaffoldTool('')).toBe(false);
  });

  it('returns false for near-matches', () => {
    expect(isScaffoldTool('scaffold')).toBe(false);
    expect(isScaffoldTool('scaffold_components')).toBe(false);
  });
});

// ─── handleScaffoldCall — valid inputs ────────────────────────────────────────

describe('handleScaffoldCall — valid inputs', () => {
  it('returns a success result for scaffold_component with minimal args', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('scaffold_component');
  });

  it('output includes the tag name heading', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.content[0].text).toContain('hx-button');
  });

  it('output includes detected conventions block', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.content[0].text).toContain('Detected conventions');
    expect(result.content[0].text).toContain('prefix=');
    expect(result.content[0].text).toContain('baseClass=');
  });

  it('output includes Component section', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.content[0].text).toContain('### Component:');
  });

  it('output includes Test section', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.content[0].text).toContain('### Test:');
  });

  it('output includes Story section', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.content[0].text).toContain('### Story:');
  });

  it('output includes CSS section', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.content[0].text).toContain('### CSS:');
  });

  it('accepts optional baseClass override', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-card', baseClass: 'BaseElement' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts optional slots array', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-card', slots: [{ name: '' }, { name: 'footer' }] },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts optional cssParts array', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-card', cssParts: [{ name: 'base' }] },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts optional events array', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-card', events: [{ name: 'hx-change', type: 'CustomEvent<void>' }] },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('accepts optional properties array', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      {
        tagName: 'hx-card',
        properties: [{ name: 'variant', type: 'string', default: "'primary'" }],
      },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('passes componentPrefix from config to scaffoldComponent', () => {
    const configWithPrefix: McpWcConfig = { ...FAKE_CONFIG, componentPrefix: 'hx-' };
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-badge' },
      configWithPrefix,
      HX_CEM,
    );
    expect(result.isError).toBeFalsy();
  });
});

// ─── handleScaffoldCall — error cases ─────────────────────────────────────────

describe('handleScaffoldCall — error cases', () => {
  it('returns error for unknown tool name', () => {
    const result = handleScaffoldCall('nonexistent_tool', {}, FAKE_CONFIG, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown scaffold tool');
  });

  it('returns error when tagName is missing', () => {
    const result = handleScaffoldCall('scaffold_component', {}, FAKE_CONFIG, FAKE_CEM);
    expect(result.isError).toBe(true);
  });

  it('returns error when tagName has no hyphen', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error when tagName starts with uppercase', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'Hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error when tagName contains invalid characters', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx_button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
  });

  it('returns error for empty tool name', () => {
    const result = handleScaffoldCall('', {}, FAKE_CONFIG, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown scaffold tool');
  });
});

// ─── handleScaffoldCall — output format ───────────────────────────────────────

describe('handleScaffoldCall — output format', () => {
  it('wraps component source in typescript code block', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    const text = result.content[0].text;
    expect(text).toContain('```typescript');
  });

  it('wraps CSS source in css code block', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    const text = result.content[0].text;
    expect(text).toContain('```css');
  });

  it('includes the tag name in file path hints', () => {
    const result = handleScaffoldCall(
      'scaffold_component',
      { tagName: 'hx-button' },
      FAKE_CONFIG,
      FAKE_CEM,
    );
    // Component section uses tagName for file name hint
    expect(result.content[0].text).toContain('hx-button.ts');
  });
});
