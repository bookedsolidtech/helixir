import { describe, it, expect } from 'vitest';
import {
  scaffoldComponent,
  detectConventions,
} from '../../packages/core/src/handlers/scaffold.js';
import type { ScaffoldComponentOptions } from '../../packages/core/src/handlers/scaffold.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMPTY_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

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
          members: [
            {
              kind: 'field',
              name: 'variant',
              attribute: 'variant',
              type: { text: 'string' },
              inheritedFrom: { name: 'LitElement', package: 'lit' },
            },
          ],
        },
      ],
    },
    {
      kind: 'javascript-module',
      path: 'src/hx-input.ts',
      declarations: [
        {
          kind: 'class',
          name: 'HxInput',
          tagName: 'hx-input',
          superclass: { name: 'LitElement', package: 'lit' },
          members: [],
        },
      ],
    },
  ],
};

// ─── detectConventions ────────────────────────────────────────────────────────

describe('detectConventions', () => {
  it('returns LitElement as default base class when CEM is empty', () => {
    const conv = detectConventions(EMPTY_CEM);
    expect(conv.baseClass).toBe('LitElement');
    expect(conv.prefix).toBe('');
    expect(conv.packageName).toBeNull();
  });

  it('detects prefix from CEM tag names', () => {
    const conv = detectConventions(HX_CEM);
    expect(conv.prefix).toBe('hx-');
  });

  it('detects LitElement as base class from CEM superclass', () => {
    const conv = detectConventions(HX_CEM);
    expect(conv.baseClass).toBe('LitElement');
  });

  it('detects package name from inherited members', () => {
    const conv = detectConventions(HX_CEM);
    expect(conv.packageName).toBe('lit');
  });

  it('respects configPrefix override', () => {
    const conv = detectConventions(HX_CEM, 'my-');
    expect(conv.prefix).toBe('my-');
  });
});

// ─── scaffoldComponent — minimal ──────────────────────────────────────────────

describe('scaffoldComponent — minimal (tagName only)', () => {
  const result = scaffoldComponent({ tagName: 'my-widget' }, EMPTY_CEM);

  it('returns correct tagName', () => {
    expect(result.tagName).toBe('my-widget');
  });

  it('component contains @customElement decorator', () => {
    expect(result.component).toContain("@customElement('my-widget')");
  });

  it('component exports the class', () => {
    expect(result.component).toContain('export class MyWidget extends LitElement');
  });

  it('component contains HTMLElementTagNameMap augmentation', () => {
    expect(result.component).toContain("'my-widget': MyWidget");
  });

  it('component imports from lit', () => {
    expect(result.component).toContain("from 'lit'");
    expect(result.component).toContain("from 'lit/decorators.js'");
  });

  it('component has static styles with :host display block', () => {
    expect(result.component).toContain('static styles');
    expect(result.component).toContain(':host');
    expect(result.component).toContain('display: block');
  });

  it('component has a render method with a default slot', () => {
    expect(result.component).toContain('render()');
    expect(result.component).toContain('<slot></slot>');
  });

  it('test contains describe block for tag name', () => {
    expect(result.test).toContain("describe('my-widget'");
  });

  it('test contains renders without errors assertion', () => {
    expect(result.test).toContain('renders without errors');
    expect(result.test).toContain('expect(el.shadowRoot).toBeTruthy()');
  });

  it('test imports from vitest', () => {
    expect(result.test).toContain("from 'vitest'");
  });

  it('story contains Meta import from storybook', () => {
    expect(result.story).toContain("from '@storybook/web-components'");
  });

  it('story includes component tag name in meta', () => {
    expect(result.story).toContain("component: 'my-widget'");
  });

  it('story exports Default story', () => {
    expect(result.story).toContain('export const Default: Story');
  });

  it('css contains :host block', () => {
    expect(result.css).toContain(':host');
    expect(result.css).toContain('display: block');
  });
});

// ─── scaffoldComponent — with properties ──────────────────────────────────────

describe('scaffoldComponent — with properties', () => {
  const options: ScaffoldComponentOptions = {
    tagName: 'hx-button',
    properties: [
      { name: 'variant', type: 'string', attribute: 'variant', default: "'primary'" },
      { name: 'disabled', type: 'boolean', reflects: true },
      { name: 'count', type: 'number' },
    ],
  };
  const result = scaffoldComponent(options, EMPTY_CEM);

  it('component declares string property with @property decorator', () => {
    expect(result.component).toContain('@property({ type: String');
    expect(result.component).toContain("variant: string = 'primary'");
  });

  it('component declares boolean property', () => {
    expect(result.component).toContain('@property({ type: Boolean');
    expect(result.component).toContain('disabled: boolean = false');
  });

  it('component declares number property', () => {
    expect(result.component).toContain('@property({ type: Number');
    expect(result.component).toContain('count: number = 0');
  });

  it('reflect: true appears for reflected property', () => {
    expect(result.component).toContain('reflect: true');
  });

  it('custom attribute name appears for variant', () => {
    expect(result.component).toContain("attribute: 'variant'");
  });

  it('test includes property test for each property', () => {
    expect(result.test).toContain("'variant property'");
    expect(result.test).toContain("'disabled property'");
    expect(result.test).toContain("'count property'");
  });

  it('story includes argTypes for all properties', () => {
    expect(result.story).toContain("variant: { control: { type: 'text' }");
    expect(result.story).toContain("disabled: { control: { type: 'boolean' }");
    expect(result.story).toContain("count: { control: { type: 'number' }");
  });

  it('story render function uses property bindings', () => {
    expect(result.story).toContain('render: ({ variant, disabled, count })');
  });
});

// ─── scaffoldComponent — with slots ───────────────────────────────────────────

describe('scaffoldComponent — with slots', () => {
  const options: ScaffoldComponentOptions = {
    tagName: 'hx-card',
    slots: [
      { name: '', description: 'Card body content' },
      { name: 'header', description: 'Card header area' },
    ],
  };
  const result = scaffoldComponent(options, EMPTY_CEM);

  it('component contains @slot JSDoc annotation for default slot', () => {
    expect(result.component).toContain('@slot - Card body content');
  });

  it('component contains @slot JSDoc annotation for named slot', () => {
    expect(result.component).toContain('@slot header - Card header area');
  });

  it('component render includes default slot', () => {
    expect(result.component).toContain('<slot></slot>');
  });

  it('component render includes named slot', () => {
    expect(result.component).toContain('<slot name="header">');
  });
});

// ─── scaffoldComponent — with cssParts ────────────────────────────────────────

describe('scaffoldComponent — with cssParts', () => {
  const options: ScaffoldComponentOptions = {
    tagName: 'hx-dialog',
    cssParts: [
      { name: 'base', description: 'The dialog container' },
      { name: 'overlay', description: 'The backdrop overlay' },
    ],
  };
  const result = scaffoldComponent(options, EMPTY_CEM);

  it('component contains @csspart JSDoc annotation', () => {
    expect(result.component).toContain('@csspart base - The dialog container');
    expect(result.component).toContain('@csspart overlay - The backdrop overlay');
  });

  it('component render includes part attribute', () => {
    expect(result.component).toContain('part="base"');
  });

  it('css file includes part selector', () => {
    expect(result.css).toContain('[part="base"]');
    expect(result.css).toContain('[part="overlay"]');
  });
});

// ─── scaffoldComponent — with events ──────────────────────────────────────────

describe('scaffoldComponent — with events', () => {
  const options: ScaffoldComponentOptions = {
    tagName: 'hx-select',
    events: [
      { name: 'hx-change', type: '{ value: string }', description: 'Fired when selection changes' },
    ],
  };
  const result = scaffoldComponent(options, EMPTY_CEM);

  it('component contains @fires JSDoc annotation with detail type', () => {
    expect(result.component).toContain('@fires {CustomEvent<{ value: string }>} hx-change');
  });
});

// ─── scaffoldComponent — convention detection from CEM ───────────────────────

describe('scaffoldComponent — convention detection used in output', () => {
  const result = scaffoldComponent({ tagName: 'hx-badge' }, HX_CEM);

  it('detects hx- prefix from CEM', () => {
    expect(result.conventions.prefix).toBe('hx-');
  });

  it('detects LitElement as base class', () => {
    expect(result.conventions.baseClass).toBe('LitElement');
  });

  it('component extends LitElement', () => {
    expect(result.component).toContain('extends LitElement');
  });
});

// ─── scaffoldComponent — custom baseClass ────────────────────────────────────

describe('scaffoldComponent — custom baseClass option', () => {
  const result = scaffoldComponent(
    { tagName: 'hx-form-field', baseClass: 'FormAssociatedMixin' },
    EMPTY_CEM,
  );

  it('uses the provided baseClass', () => {
    expect(result.component).toContain('extends FormAssociatedMixin');
  });
});
