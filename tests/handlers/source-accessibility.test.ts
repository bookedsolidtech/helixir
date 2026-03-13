import { describe, it, expect } from 'vitest';
import {
  scanSourceForA11yPatterns,
  scoreSourceMarkers,
  isInteractiveComponent,
  PATTERNS,
  type SourceA11yMarkers,
} from '../../packages/core/src/handlers/analyzers/source-accessibility.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';

// ─── Source Fixtures ─────────────────────────────────────────────────────────

const LIT_BUTTON_SOURCE = `
import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';

export class MyButton extends LitElement {
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ type: String }) label = '';

  static formAssociated = true;
  #internals;

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'button');
    }
    this.setAttribute('tabindex', '0');
  }

  render() {
    return html\`
      <div
        part="base"
        class="button"
        aria-disabled=\${this.disabled}
        aria-label=\${this.label}
        @keydown=\${this._handleKeyDown}
        @click=\${this._handleClick}
      >
        <slot></slot>
      </div>
    \`;
  }

  _handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'Space') {
      this._handleClick();
    }
  }

  _handleClick() {
    if (!this.disabled) {
      this.dispatchEvent(new CustomEvent('my-click'));
    }
  }

  focus() {
    this.shadowRoot?.querySelector('.button')?.focus();
  }
}
`;

const FAST_DIALOG_SOURCE = `
import { FASTElement, html, attr } from '@microsoft/fast-element';

export class MyDialog extends FASTElement {
  @attr({ mode: 'boolean' }) open = false;
  @attr hidden = false;

  connectedCallback() {
    super.connectedCallback();
    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-modal', 'true');
  }

  show() {
    this.open = true;
    this.setAttribute('aria-hidden', 'false');
    this.trapFocus();
  }

  hide() {
    this.open = false;
    this.setAttribute('aria-hidden', 'true');
  }

  trapFocus() {
    // Focus trap implementation
    const focusable = this.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) {
      (focusable[0] as HTMLElement).focus();
    }
  }

  handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.hide();
    }
  }
}
`;

const STENCIL_SELECT_SOURCE = `
import { Component, h, Prop, Event, EventEmitter, Listen, Element } from '@stencil/core';

@Component({ tag: 'my-select', shadow: true })
export class MySelect {
  @Element() el!: HTMLElement;
  @Prop() value: string = '';
  @Prop() disabled: boolean = false;
  @Prop() label: string = '';

  @Event() valueChange!: EventEmitter<string>;

  private listboxEl?: HTMLElement;

  connectedCallback() {
    this.el.setAttribute('role', 'combobox');
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-atomic', 'true');
    this.el.setAttribute('aria-labelledby', 'label-id');
    this.el.setAttribute('aria-describedby', 'desc-id');
  }

  @Listen('keydown')
  handleKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown': this.focusNext(); break;
      case 'ArrowUp': this.focusPrev(); break;
      case 'Enter': this.selectCurrent(); break;
      case 'Escape': this.close(); break;
    }
  }

  setFormValue(value: string) {
    // form internals
  }

  render() {
    return (
      <div class="select" aria-activedescendant={this.activeId}>
        <slot></slot>
      </div>
    );
  }
}
`;

const VANILLA_MINIMAL_SOURCE = `
class MyDivider extends HTMLElement {
  connectedCallback() {
    this.setAttribute('role', 'separator');
  }
}
customElements.define('my-divider', MyDivider);
`;

const EMPTY_SOURCE = `
class EmptyComponent extends HTMLElement {
  connectedCallback() {
    this.textContent = 'Hello';
  }
}
`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('scanSourceForA11yPatterns', () => {
  it('detects all patterns in a Lit button source', () => {
    const markers = scanSourceForA11yPatterns(LIT_BUTTON_SOURCE);
    expect(markers.ariaBindings).toBe(true);
    expect(markers.roleAssignments).toBe(true);
    expect(markers.keyboardHandling).toBe(true);
    expect(markers.focusManagement).toBe(true);
    expect(markers.formInternals).toBe(true);
  });

  it('detects ARIA and focus patterns in a FAST dialog source', () => {
    const markers = scanSourceForA11yPatterns(FAST_DIALOG_SOURCE);
    expect(markers.ariaBindings).toBe(true);
    expect(markers.roleAssignments).toBe(true);
    expect(markers.keyboardHandling).toBe(true);
    expect(markers.focusManagement).toBe(true);
    expect(markers.screenReaderSupport).toBe(true);
  });

  it('detects comprehensive patterns in Stencil select source', () => {
    const markers = scanSourceForA11yPatterns(STENCIL_SELECT_SOURCE);
    expect(markers.ariaBindings).toBe(true);
    expect(markers.roleAssignments).toBe(true);
    expect(markers.keyboardHandling).toBe(true);
    expect(markers.focusManagement).toBe(true);
    expect(markers.formInternals).toBe(true);
    expect(markers.liveRegions).toBe(true);
    expect(markers.screenReaderSupport).toBe(true);
  });

  it('detects only role in a vanilla minimal component', () => {
    const markers = scanSourceForA11yPatterns(VANILLA_MINIMAL_SOURCE);
    expect(markers.roleAssignments).toBe(true);
    expect(markers.ariaBindings).toBe(false);
    expect(markers.keyboardHandling).toBe(false);
    expect(markers.focusManagement).toBe(false);
    expect(markers.formInternals).toBe(false);
    expect(markers.liveRegions).toBe(false);
    expect(markers.screenReaderSupport).toBe(false);
  });

  it('returns all false for empty source', () => {
    const markers = scanSourceForA11yPatterns(EMPTY_SOURCE);
    expect(markers.ariaBindings).toBe(false);
    expect(markers.roleAssignments).toBe(false);
    expect(markers.keyboardHandling).toBe(false);
    expect(markers.focusManagement).toBe(false);
    expect(markers.formInternals).toBe(false);
    expect(markers.liveRegions).toBe(false);
    expect(markers.screenReaderSupport).toBe(false);
  });
});

describe('scoreSourceMarkers', () => {
  it('scores 100 when all patterns are present', () => {
    const allTrue: SourceA11yMarkers = {
      ariaBindings: true,
      roleAssignments: true,
      keyboardHandling: true,
      focusManagement: true,
      formInternals: true,
      liveRegions: true,
      screenReaderSupport: true,
    };
    const result = scoreSourceMarkers(allTrue);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('heuristic');
    expect(result.subMetrics).toHaveLength(7);
    expect(result.subMetrics.every((m) => m.score === m.maxScore)).toBe(true);
  });

  it('scores 0 when no patterns are present', () => {
    const allFalse: SourceA11yMarkers = {
      ariaBindings: false,
      roleAssignments: false,
      keyboardHandling: false,
      focusManagement: false,
      formInternals: false,
      liveRegions: false,
      screenReaderSupport: false,
    };
    const result = scoreSourceMarkers(allFalse);
    expect(result.score).toBe(0);
    expect(result.subMetrics.every((m) => m.score === 0)).toBe(true);
  });

  it('scores partial when some patterns are present', () => {
    const partial: SourceA11yMarkers = {
      ariaBindings: true, // 25
      roleAssignments: true, // 15
      keyboardHandling: false,
      focusManagement: false,
      formInternals: false,
      liveRegions: false,
      screenReaderSupport: false,
    };
    const result = scoreSourceMarkers(partial);
    expect(result.score).toBe(40);
  });

  it('sub-metrics contain [Source] prefix', () => {
    const markers = scanSourceForA11yPatterns(LIT_BUTTON_SOURCE);
    const result = scoreSourceMarkers(markers);
    expect(result.subMetrics.every((m) => m.name.startsWith('[Source]'))).toBe(true);
  });
});

describe('PATTERNS', () => {
  it('exports all 7 pattern categories', () => {
    const keys = Object.keys(PATTERNS);
    expect(keys).toHaveLength(7);
    expect(keys).toContain('ariaBindings');
    expect(keys).toContain('roleAssignments');
    expect(keys).toContain('keyboardHandling');
    expect(keys).toContain('focusManagement');
    expect(keys).toContain('formInternals');
    expect(keys).toContain('liveRegions');
    expect(keys).toContain('screenReaderSupport');
  });

  it('each category has at least one pattern', () => {
    for (const patterns of Object.values(PATTERNS)) {
      expect(patterns.length).toBeGreaterThan(0);
    }
  });
});

describe('isInteractiveComponent — runtime detection', () => {
  const ALL_FALSE: SourceA11yMarkers = {
    ariaBindings: false,
    roleAssignments: false,
    keyboardHandling: false,
    focusManagement: false,
    formInternals: false,
    liveRegions: false,
    screenReaderSupport: false,
  };

  const MINIMAL_DECL: CemDeclaration = {
    kind: 'class',
    name: 'MyContainer',
    tagName: 'my-container',
    members: [{ kind: 'field', name: 'padding', type: { text: 'string' } }],
  };

  it('returns false for a pure layout component (no interactive signals)', () => {
    expect(isInteractiveComponent(ALL_FALSE, MINIMAL_DECL, '<div></div>')).toBe(false);
  });

  it('returns true when source has keyboard handling', () => {
    const markers = { ...ALL_FALSE, keyboardHandling: true };
    expect(isInteractiveComponent(markers, MINIMAL_DECL, '')).toBe(true);
  });

  it('returns true when source has focus management', () => {
    const markers = { ...ALL_FALSE, focusManagement: true };
    expect(isInteractiveComponent(markers, MINIMAL_DECL, '')).toBe(true);
  });

  it('returns true when source has form internals', () => {
    const markers = { ...ALL_FALSE, formInternals: true };
    expect(isInteractiveComponent(markers, MINIMAL_DECL, '')).toBe(true);
  });

  it('returns true when CEM has disabled property', () => {
    const decl: CemDeclaration = {
      ...MINIMAL_DECL,
      members: [{ kind: 'field', name: 'disabled', type: { text: 'boolean' } }],
    };
    expect(isInteractiveComponent(ALL_FALSE, decl, '')).toBe(true);
  });

  it('returns true when CEM has click event', () => {
    const decl: CemDeclaration = {
      ...MINIMAL_DECL,
      events: [{ name: 'my-click', type: { text: 'CustomEvent' } }],
    };
    expect(isInteractiveComponent(ALL_FALSE, decl, '')).toBe(true);
  });

  it('returns true when CEM has change event', () => {
    const decl: CemDeclaration = {
      ...MINIMAL_DECL,
      events: [{ name: 'value-change', type: { text: 'CustomEvent' } }],
    };
    expect(isInteractiveComponent(ALL_FALSE, decl, '')).toBe(true);
  });

  it('returns true when source has @click handler', () => {
    expect(isInteractiveComponent(ALL_FALSE, MINIMAL_DECL, '@click=${this.handleClick}')).toBe(
      true,
    );
  });

  it('returns true when source has addEventListener click', () => {
    expect(
      isInteractiveComponent(ALL_FALSE, MINIMAL_DECL, "addEventListener('click', handler)"),
    ).toBe(true);
  });

  it('returns false when only ARIA bindings are present (display component with aria-label)', () => {
    const markers = { ...ALL_FALSE, ariaBindings: true };
    expect(isInteractiveComponent(markers, MINIMAL_DECL, 'aria-label="icon"')).toBe(false);
  });
});

describe('end-to-end source scoring', () => {
  it('Lit button scores high', () => {
    const markers = scanSourceForA11yPatterns(LIT_BUTTON_SOURCE);
    const result = scoreSourceMarkers(markers);
    // Has aria, role, keyboard, focus, form internals = 25+15+20+15+10 = 85
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('Stencil select scores 100 (all categories)', () => {
    const markers = scanSourceForA11yPatterns(STENCIL_SELECT_SOURCE);
    const result = scoreSourceMarkers(markers);
    expect(result.score).toBe(100);
  });

  it('vanilla minimal scores only 15 (role only)', () => {
    const markers = scanSourceForA11yPatterns(VANILLA_MINIMAL_SOURCE);
    const result = scoreSourceMarkers(markers);
    expect(result.score).toBe(15);
  });
});
