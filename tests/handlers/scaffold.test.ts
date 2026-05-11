import { describe, it, expect } from 'vitest';
import { scaffoldComponent, detectConventions } from '../../packages/core/src/handlers/scaffold.js';
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

  it('emits a TODO import when the base class origin is unknown', () => {
    // EMPTY_CEM has no superclass metadata, so we cannot resolve where to
    // import FormAssociatedMixin from. The generator should leave a TODO
    // import marker rather than silently shipping uncompilable output that
    // references an undefined symbol.
    expect(result.component).toContain('// TODO: import { FormAssociatedMixin }');
  });
});

// ─── scaffoldComponent — non-Lit base class import (codex bug fix) ───────────

describe('scaffoldComponent — non-Lit base class import', () => {
  // CEM whose components extend a custom base class the generator must import.
  const CUSTOM_BASE_CEM: Cem = {
    schemaVersion: '1.0.0',
    modules: [
      {
        kind: 'javascript-module',
        path: './hx-button.js',
        declarations: [
          {
            kind: 'class',
            name: 'HxButton',
            tagName: 'hx-button',
            customElement: true,
            superclass: {
              name: 'BookedSolidElement',
              package: '@bookedsolid/elements',
            },
          },
        ],
      },
    ],
  };

  it('imports the detected non-Lit base class from its package', () => {
    const result = scaffoldComponent({ tagName: 'hx-card' }, CUSTOM_BASE_CEM);
    expect(result.component).toContain('extends BookedSolidElement');
    expect(result.component).toContain(
      "import { BookedSolidElement } from '@bookedsolid/elements';",
    );
    // LitElement should NOT be imported when it is not the base class
    expect(result.component).not.toContain('LitElement,');
  });

  it('emits TODO when only a local-relative module path is recorded (runbook §4b)', () => {
    // Per runbook §4b: package wins, BARE-SPECIFIER module fallback,
    // local-relative module → TODO. A relative module path (./foo.js)
    // is source-relative and won't resolve at the scaffold destination,
    // so the right move is to flag it explicitly rather than emit a
    // broken-by-default import.
    const MODULE_ONLY_CEM: Cem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: './hx-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'HxButton',
              tagName: 'hx-button',
              customElement: true,
              superclass: {
                name: 'CustomBase',
                module: './custom-base.js',
              },
            },
          ],
        },
      ],
    };
    const result = scaffoldComponent({ tagName: 'hx-card' }, MODULE_ONLY_CEM);
    expect(result.component).toContain('TODO: import { CustomBase }');
    expect(result.component).not.toContain("from './custom-base.js'");
  });

  it('emits a TODO import when options.baseClass overrides the detected base class', () => {
    // CEM detects BookedSolidElement from package @bookedsolid/elements, but
    // the caller passes baseClass: FormAssociatedMixin. Importing
    // FormAssociatedMixin from @bookedsolid/elements would be wrong — the
    // generator must not reuse the detected metadata for the override.
    const DETECTED_BASE_CEM: Cem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: './hx-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'HxButton',
              tagName: 'hx-button',
              customElement: true,
              superclass: {
                name: 'BookedSolidElement',
                package: '@bookedsolid/elements',
              },
            },
          ],
        },
      ],
    };
    const result = scaffoldComponent(
      { tagName: 'hx-form-field', baseClass: 'FormAssociatedMixin' },
      DETECTED_BASE_CEM,
    );
    expect(result.component).toContain('extends FormAssociatedMixin');
    expect(result.component).toContain('// TODO: import { FormAssociatedMixin }');
    // Critical: must NOT emit FormAssociatedMixin from the detected base's package
    expect(result.component).not.toContain(
      "import { FormAssociatedMixin } from '@bookedsolid/elements';",
    );
  });

  it('merges superclass origin metadata across declarations (non-null wins)', () => {
    // CEM where the first declaration of a shared superclass omits its
    // package, but a later declaration of the same class includes it.
    // Convention detection must keep the non-null metadata so scaffolds
    // generate a real import, not a TODO.
    const MIXED_QUALITY_CEM: Cem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: './hx-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'HxButton',
              tagName: 'hx-button',
              customElement: true,
              superclass: { name: 'BookedSolidElement' }, // no package/module
            },
          ],
        },
        {
          kind: 'javascript-module',
          path: './hx-card.js',
          declarations: [
            {
              kind: 'class',
              name: 'HxCard',
              tagName: 'hx-card',
              customElement: true,
              superclass: {
                name: 'BookedSolidElement',
                package: '@bookedsolid/elements',
              },
            },
          ],
        },
      ],
    };
    const result = scaffoldComponent({ tagName: 'hx-input' }, MIXED_QUALITY_CEM);
    expect(result.component).toContain('extends BookedSolidElement');
    expect(result.component).toContain(
      "import { BookedSolidElement } from '@bookedsolid/elements';",
    );
    expect(result.component).not.toContain('// TODO');
  });

  it('does NOT guess the base-class import from an unrelated inherited member package', () => {
    // CEM where superclass has no module/package metadata, but an inherited
    // member records a package. That inheritedFrom.package is unrelated to
    // where the base class lives — emitting an import from it would compile
    // to a "not exported from" error. The generator must leave a TODO.
    const UNRELATED_PACKAGE_CEM: Cem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: './hx-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'HxButton',
              tagName: 'hx-button',
              customElement: true,
              superclass: {
                name: 'LocalBase',
                // No module or package — locally defined, origin unknown
              },
              members: [
                {
                  kind: 'field',
                  name: 'someInheritedField',
                  inheritedFrom: {
                    name: 'AnotherClass',
                    package: '@unrelated/library',
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const result = scaffoldComponent({ tagName: 'hx-card' }, UNRELATED_PACKAGE_CEM);
    expect(result.component).toContain('// TODO: import { LocalBase }');
    expect(result.component).not.toContain('@unrelated/library');
  });
});
