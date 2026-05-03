/**
 * M5 Component-extension contract verification tests
 *
 * Covers defect-corpus classes 05-11 with one passing-baseline + one
 * failing-fixture per check. Each fixture maps to a specific helix
 * commit cited in the corpus doc.
 */

import { describe, it, expect } from 'vitest';
import { verifyExtension } from '../../packages/core/src/handlers/verify-extension.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';

// ─── Fixture builders ──────────────────────────────────────────────────────

function buttonParent(overrides: Partial<CemDeclaration> = {}): CemDeclaration {
  return {
    kind: 'class',
    name: 'HxButton',
    tagName: 'hx-button',
    description: 'Helix button.',
    members: [
      {
        kind: 'field',
        name: 'variant',
        type: { text: 'string' },
        attribute: 'variant',
      },
      {
        kind: 'field',
        name: 'role',
        type: { text: 'string' },
        attribute: 'role',
      },
      {
        kind: 'field',
        name: 'aria-label',
        type: { text: 'string' },
        attribute: 'aria-label',
      },
      {
        kind: 'field',
        name: 'accessibleLabel',
        type: { text: 'string' },
        attribute: 'accessible-label',
      },
    ],
    events: [{ name: 'hx-click', type: { text: 'CustomEvent' }, description: 'Click' }],
    slots: [
      { name: '', description: 'Default content' },
      { name: 'leading', description: 'Leading icon' },
      { name: 'trailing', description: 'Trailing icon' },
    ],
    cssParts: [{ name: 'base', description: 'Root' }],
    cssProperties: [
      { name: '--hx-button-bg', description: 'BG' },
      { name: '--hx-button-fg', description: 'FG' },
    ],
    ...overrides,
  } as CemDeclaration;
}

function listboxParent(): CemDeclaration {
  return {
    kind: 'class',
    name: 'HxSelect',
    tagName: 'hx-select',
    description: 'Helix select.',
    members: [
      {
        kind: 'field',
        name: 'role',
        type: { text: 'string' },
        attribute: 'role',
      },
      {
        kind: 'field',
        name: 'aria-selected',
        type: { text: 'string' },
        attribute: 'aria-selected',
      },
    ],
    events: [],
    slots: [{ name: '', description: 'Options' }],
    cssParts: [],
    cssProperties: [],
  } as CemDeclaration;
}

function textInputFormParent(): CemDeclaration {
  return {
    kind: 'class',
    name: 'HxTextInput',
    tagName: 'hx-text-input',
    description: 'Form-associated text input.',
    formAssociated: true,
    members: [],
    events: [{ name: 'hx-change', type: { text: 'CustomEvent' }, description: 'Changed' }],
    slots: [],
    cssParts: [],
    cssProperties: [],
  } as unknown as CemDeclaration;
}

function emptyDecl(tag: string, overrides: Partial<CemDeclaration> = {}): CemDeclaration {
  return {
    kind: 'class',
    name: tag.replace(/(?:^|-)([a-z])/g, (_, c: string) => c.toUpperCase()),
    tagName: tag,
    description: 'Test subclass.',
    members: [],
    events: [],
    slots: [],
    cssParts: [],
    cssProperties: [],
    ...overrides,
  } as CemDeclaration;
}

// ─── Defect class 09 — slot contract drift ─────────────────────────────────

describe('verify_extension — 09-slot-contract-drift', () => {
  it('flags subclass that drops a parent slot', () => {
    const parent = buttonParent();
    const subclass = emptyDecl('figgy-button', {
      slots: [
        { name: '', description: '' },
        { name: 'leading', description: '' },
        // 'trailing' dropped
      ],
    });
    const { findings } = verifyExtension({ parent, subclass });
    const slot = findings.find((f) => f.classId === '09-slot-contract-drift');
    expect(slot).toBeDefined();
    expect(slot?.severity).toBe('P1');
    expect(slot?.title).toContain('trailing');
  });

  it('passes when subclass preserves all parent slots', () => {
    const parent = buttonParent();
    const subclass = emptyDecl('figgy-button', {
      slots: [
        { name: '', description: '' },
        { name: 'leading', description: '' },
        { name: 'trailing', description: '' },
      ],
    });
    const { findings } = verifyExtension({ parent, subclass });
    expect(findings.filter((f) => f.classId === '09-slot-contract-drift')).toEqual([]);
  });
});

// ─── Defect class 05 — ARIA regression ─────────────────────────────────────

describe('verify_extension — 05-aria-regression', () => {
  it('flags subclass that declares its own ARIA but is missing one parent has', () => {
    const parent = listboxParent();
    const subclass = emptyDecl('my-select', {
      members: [
        // Declares role but DROPS aria-selected.
        { kind: 'field', name: 'role', type: { text: 'string' }, attribute: 'role' },
      ],
    });
    const { findings } = verifyExtension({ parent, subclass });
    const aria = findings.find((f) => f.classId === '05-aria-regression');
    expect(aria).toBeDefined();
    expect(aria?.severity).toBe('P1');
    expect(aria?.title).toContain('aria-selected');
  });

  it('does not flag subclass that declares zero ARIA (delta-only CEM = inherits)', () => {
    // Codex round-26 (M3-M6 local preview) P1 — pinned: subclass with
    // ZERO ARIA attrs of its own is INHERITING parent's, not dropping
    // them. CEM tools commonly emit only the subclass delta.
    const parent = listboxParent();
    const subclass = emptyDecl('my-select');
    const { findings } = verifyExtension({ parent, subclass });
    expect(findings.filter((f) => f.classId === '05-aria-regression')).toEqual([]);
  });

  it('passes when subclass preserves parent ARIA attributes', () => {
    const parent = listboxParent();
    const subclass = emptyDecl('my-select', {
      members: [
        { kind: 'field', name: 'role', type: { text: 'string' }, attribute: 'role' },
        {
          kind: 'field',
          name: 'aria-selected',
          type: { text: 'string' },
          attribute: 'aria-selected',
        },
      ],
    });
    const { findings } = verifyExtension({ parent, subclass });
    expect(findings.filter((f) => f.classId === '05-aria-regression')).toEqual([]);
  });
});

// ─── Defect class 10 — ElementInternals dropped ────────────────────────────

describe('verify_extension — 10-element-internals-dropped', () => {
  it('does NOT flag subclass that omits formAssociated (inherits via prototype)', () => {
    // Codex round-28 P1: in custom elements, constructor.formAssociated
    // is read via normal prototype lookup, so subclasses inherit the
    // parent's static flag. A delta-only CEM that omits the field is
    // still form-associated at runtime — flagging it is a false P1.
    const parent = textInputFormParent();
    const subclass = emptyDecl('my-text-input');
    const { findings } = verifyExtension({ parent, subclass });
    expect(findings.filter((f) => f.classId === '10-element-internals-dropped')).toEqual([]);
  });

  it('flags subclass that explicitly opts out (formAssociated: false)', () => {
    const parent = textInputFormParent();
    const subclass = emptyDecl('my-text-input', {
      formAssociated: false,
    } as unknown as Partial<CemDeclaration>);
    const { findings } = verifyExtension({ parent, subclass });
    const fa = findings.find((f) => f.classId === '10-element-internals-dropped');
    expect(fa).toBeDefined();
    expect(fa?.severity).toBe('P1');
    expect(fa?.body).toContain('FS-021');
  });

  it('passes when subclass also declares formAssociated: true', () => {
    const parent = textInputFormParent();
    const subclass = emptyDecl('my-text-input', {
      formAssociated: true,
    } as unknown as Partial<CemDeclaration>);
    const { findings } = verifyExtension({ parent, subclass });
    expect(findings.filter((f) => f.classId === '10-element-internals-dropped')).toEqual([]);
  });

  it('does nothing when parent is not form-associated', () => {
    const parent = buttonParent();
    const subclass = emptyDecl('figgy-button');
    const { findings } = verifyExtension({ parent, subclass });
    expect(findings.filter((f) => f.classId === '10-element-internals-dropped')).toEqual([]);
  });
});

// ─── Defect class 11 — event contract suppressed ───────────────────────────

describe('verify_extension — 11-event-contract-suppressed', () => {
  it('flags P2 when subclass CEM declares its own events but omits parent event', () => {
    const parent = textInputFormParent();
    const subclass = emptyDecl('my-text-input', {
      formAssociated: true,
      // Declares its own event surface — but doesn't redeclare hx-change.
      events: [{ name: 'my-custom', type: { text: 'CustomEvent' }, description: '' }],
    } as unknown as Partial<CemDeclaration>);
    const { findings } = verifyExtension({ parent, subclass });
    const evt = findings.find((f) => f.classId === '11-event-contract-suppressed');
    expect(evt).toBeDefined();
    expect(evt?.severity).toBe('P2');
    expect(evt?.title).toContain('hx-change');
  });

  it('does not flag P2 when subclass declares zero events (delta-only CEM = inherits)', () => {
    // Codex round-26 (M3-M6 local preview) P1 — pinned: subclass with
    // zero events of its own is inheriting parent's, not suppressing.
    const parent = textInputFormParent();
    const subclass = emptyDecl('my-text-input', {
      formAssociated: true,
    } as unknown as Partial<CemDeclaration>);
    const { findings } = verifyExtension({ parent, subclass });
    expect(findings.filter((f) => f.classId === '11-event-contract-suppressed')).toEqual([]);
  });

  it('escalates to P1 when subclass source has no super or dispatchEvent', () => {
    const parent = textInputFormParent();
    const subclass = emptyDecl('my-text-input');
    const { findings } = verifyExtension({
      parent,
      subclass,
      subclassSources: {
        code: `class MyTextInput extends HxTextInput {
          handleChange(e) {
            // Suppression bug — the override never delegates upstream.
            this.value = e.target.value;
          }
        }`,
      },
    });
    const escalated = findings.filter(
      (f) => f.classId === '11-event-contract-suppressed' && f.severity === 'P1',
    );
    expect(escalated.length).toBeGreaterThan(0);
  });

  it('does not escalate when subclass source has super-call', () => {
    const parent = textInputFormParent();
    const subclass = emptyDecl('my-text-input');
    const { findings } = verifyExtension({
      parent,
      subclass,
      subclassSources: {
        code: `class MyTextInput extends HxTextInput {
          handleChange(e) { super.handleChange(e); }
        }`,
      },
    });
    const escalated = findings.filter(
      (f) => f.classId === '11-event-contract-suppressed' && f.severity === 'P1',
    );
    expect(escalated).toEqual([]);
  });
});

// ─── Defect class 06 — forced-colors missing ───────────────────────────────

describe('verify_extension — 06-forced-colors-missing', () => {
  it('flags subclass that overrides paint without forced-colors block', () => {
    const parent = buttonParent();
    const subclass = emptyDecl('figgy-button');
    const { findings } = verifyExtension({
      parent,
      subclass,
      subclassSources: {
        styles: `.figgy-button:hover { background: linear-gradient(blue, purple); }`,
      },
    });
    const fc = findings.find((f) => f.classId === '06-forced-colors-missing');
    expect(fc).toBeDefined();
    expect(fc?.severity).toBe('P1');
  });

  it('passes when subclass declares a forced-colors block', () => {
    const parent = buttonParent();
    const subclass = emptyDecl('figgy-button');
    const { findings } = verifyExtension({
      parent,
      subclass,
      subclassSources: {
        styles: `
          .figgy-button:hover { background: linear-gradient(blue, purple); }
          @media (forced-colors: active) {
            .figgy-button:hover { background: Highlight; color: HighlightText; }
          }`,
      },
    });
    expect(findings.filter((f) => f.classId === '06-forced-colors-missing')).toEqual([]);
  });
});

// ─── Defect class 07 — touch target undersized ─────────────────────────────

describe('verify_extension — 07-touch-target-undersized', () => {
  it('flags subclass with sub-44px size on an interactive selector', () => {
    const parent = buttonParent();
    const subclass = emptyDecl('figgy-rating');
    const { findings } = verifyExtension({
      parent,
      subclass,
      subclassSources: {
        styles: `button.star { width: 1.5rem; height: 1.5rem; }`,
      },
    });
    const tt = findings.find((f) => f.classId === '07-touch-target-undersized');
    expect(tt).toBeDefined();
    expect(tt?.severity).toBe('P1');
  });

  it('does NOT flag undersized rules on decorative descendants (codex round-34 P2)', () => {
    const parent = buttonParent();
    const subclass = emptyDecl('figgy-rating');
    const { findings } = verifyExtension({
      parent,
      subclass,
      subclassSources: {
        // .icon is decorative, not the click target — should be silent.
        styles: `.icon { width: 1rem; height: 1rem; }`,
      },
    });
    expect(findings.filter((f) => f.classId === '07-touch-target-undersized')).toEqual([]);
  });

  it('passes when interactive selector keeps min-width at 44px floor', () => {
    const parent = buttonParent();
    const subclass = emptyDecl('figgy-rating');
    const { findings } = verifyExtension({
      parent,
      subclass,
      subclassSources: {
        styles: `button.star { width: 100%; min-width: 2.75rem; min-height: 2.75rem; }`,
      },
    });
    expect(findings.filter((f) => f.classId === '07-touch-target-undersized')).toEqual([]);
  });
});

// ─── Defect class 08 — accessible-label devWarn pattern ────────────────────

describe('verify_extension — 08-accessible-label-pattern', () => {
  it('flags subclass that re-implements _effectiveLabel without trim + devWarn', () => {
    const parent = buttonParent();
    const subclass = emptyDecl('figgy-checkbox');
    const { findings } = verifyExtension({
      parent,
      subclass,
      subclassSources: {
        code: `class FiggyCheckbox extends HxCheckbox {
          get _effectiveLabel() { return this.accessibleLabel; }
        }`,
      },
    });
    const al = findings.find((f) => f.classId === '08-accessible-label-pattern');
    expect(al).toBeDefined();
    expect(al?.severity).toBe('P2');
  });

  it('passes when subclass preserves trim + devWarn semantics', () => {
    const parent = buttonParent();
    const subclass = emptyDecl('figgy-checkbox');
    const { findings } = verifyExtension({
      parent,
      subclass,
      subclassSources: {
        code: `class FiggyCheckbox extends HxCheckbox {
          get _effectiveLabel() {
            const lbl = (this.accessibleLabel ?? '').trim();
            if (!lbl) devWarn('missing accessible name');
            return lbl;
          }
        }`,
      },
    });
    expect(findings.filter((f) => f.classId === '08-accessible-label-pattern')).toEqual([]);
  });
});
