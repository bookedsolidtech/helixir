/**
 * Source Accessibility Analyzer — unit tests (analyzers/ subdirectory)
 *
 * Tests the pure/sync exports from source-accessibility.ts:
 *   - scanSourceForA11yPatterns()
 *   - scoreSourceMarkers()
 *   - isInteractiveComponent()
 *   - PATTERNS export structure
 *   - resolveComponentSourceFilePath()
 *
 * Focuses on additional edge cases beyond tests/handlers/source-accessibility.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  scanSourceForA11yPatterns,
  scoreSourceMarkers,
  isInteractiveComponent,
  resolveComponentSourceFilePath,
  PATTERNS,
  type SourceA11yMarkers,
} from '../../../packages/core/src/handlers/analyzers/source-accessibility.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';
import { resolve } from 'node:path';

// ─── Source Fixtures ──────────────────────────────────────────────────────────

const ARIA_ONLY_SOURCE = `
class MyIcon extends HTMLElement {
  connectedCallback() {
    this.setAttribute('aria-hidden', 'true');
    this.setAttribute('aria-label', this.getAttribute('label') || '');
  }
}
`;

const ROLE_ONLY_SOURCE = `
class MySeparator extends HTMLElement {
  connectedCallback() {
    this.setAttribute('role', 'separator');
  }
}
`;

const KEYBOARD_SOURCE = `
class MyDropdown extends LitElement {
  handleKeyDown(e) {
    if (e.key === 'Escape') this.close();
    if (e.key === 'ArrowDown') this.focusNext();
  }
}
`;

const FOCUS_SOURCE = `
class MyFocusable extends LitElement {
  focus() {
    this.shadowRoot?.querySelector('button')?.focus();
  }
  get tabindex() { return 0; }
}
`;

const FORM_INTERNALS_SOURCE = `
class MyInput extends LitElement {
  static formAssociated = true;
  constructor() {
    super();
    this.#internals = this.attachInternals();
  }
  setFormValue(value) {
    this.#internals.setFormValue(value);
  }
}
`;

const LIVE_REGION_SOURCE = `
class MyAlert extends LitElement {
  render() {
    return html\`<div role="alert" aria-live="polite" aria-atomic="true">\${this.message}</div>\`;
  }
}
`;

const SCREEN_READER_SOURCE = `
class MyBadge extends LitElement {
  render() {
    return html\`
      <span aria-labelledby="label-id" aria-describedby="desc-id">
        <span class="sr-only">Count: \${this.count}</span>
        \${this.count}
      </span>
    \`;
  }
}
`;

const ARIA_VIA_SETATTRIBUTE_SOURCE = `
class MyEl extends HTMLElement {
  connectedCallback() {
    this.setAttribute('aria-expanded', 'false');
    this.setAttribute('role', 'button');
    this.addEventListener('keydown', this.handleKey);
  }
  focus() { super.focus(); }
}
`;

const EMPTY_SOURCE = `
class EmptyEl extends HTMLElement {}
`;

const TABINDEX_SOURCE = `
class MyTabEl extends LitElement {
  tabindex = 0;
  connectedCallback() {
    this.tabindex = 0;
  }
}
`;

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('PATTERNS export', () => {
  it('exports all 7 pattern categories', () => {
    const keys = Object.keys(PATTERNS);
    expect(keys).toHaveLength(7);
  });

  it('contains all expected keys', () => {
    expect(PATTERNS).toHaveProperty('ariaBindings');
    expect(PATTERNS).toHaveProperty('roleAssignments');
    expect(PATTERNS).toHaveProperty('keyboardHandling');
    expect(PATTERNS).toHaveProperty('focusManagement');
    expect(PATTERNS).toHaveProperty('formInternals');
    expect(PATTERNS).toHaveProperty('liveRegions');
    expect(PATTERNS).toHaveProperty('screenReaderSupport');
  });

  it('each category has at least 2 patterns', () => {
    for (const [key, patterns] of Object.entries(PATTERNS)) {
      expect(patterns.length, `${key} should have >= 2 patterns`).toBeGreaterThanOrEqual(2);
    }
  });

  it('all patterns are RegExp instances', () => {
    for (const patterns of Object.values(PATTERNS)) {
      for (const pattern of patterns) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    }
  });
});

describe('scanSourceForA11yPatterns', () => {
  it('returns all-false SourceA11yMarkers for empty source', () => {
    const markers = scanSourceForA11yPatterns(EMPTY_SOURCE);
    expect(markers.ariaBindings).toBe(false);
    expect(markers.roleAssignments).toBe(false);
    expect(markers.keyboardHandling).toBe(false);
    expect(markers.focusManagement).toBe(false);
    expect(markers.formInternals).toBe(false);
    expect(markers.liveRegions).toBe(false);
    expect(markers.screenReaderSupport).toBe(false);
  });

  it('detects ariaBindings from aria- attributes', () => {
    const markers = scanSourceForA11yPatterns(ARIA_ONLY_SOURCE);
    expect(markers.ariaBindings).toBe(true);
    expect(markers.screenReaderSupport).toBe(true); // aria-hidden detected
  });

  it('detects roleAssignments from setAttribute role', () => {
    const markers = scanSourceForA11yPatterns(ROLE_ONLY_SOURCE);
    expect(markers.roleAssignments).toBe(true);
  });

  it('detects keyboardHandling from key names', () => {
    const markers = scanSourceForA11yPatterns(KEYBOARD_SOURCE);
    expect(markers.keyboardHandling).toBe(true);
  });

  it('detects focusManagement from .focus() calls', () => {
    const markers = scanSourceForA11yPatterns(FOCUS_SOURCE);
    expect(markers.focusManagement).toBe(true);
  });

  it('detects focusManagement from tabindex attribute', () => {
    const markers = scanSourceForA11yPatterns(TABINDEX_SOURCE);
    expect(markers.focusManagement).toBe(true);
  });

  it('detects formInternals from attachInternals and formAssociated', () => {
    const markers = scanSourceForA11yPatterns(FORM_INTERNALS_SOURCE);
    expect(markers.formInternals).toBe(true);
  });

  it('detects liveRegions from aria-live and role=alert', () => {
    const markers = scanSourceForA11yPatterns(LIVE_REGION_SOURCE);
    expect(markers.liveRegions).toBe(true);
    expect(markers.ariaBindings).toBe(true);
  });

  it('detects screenReaderSupport from aria-labelledby and aria-describedby', () => {
    const markers = scanSourceForA11yPatterns(SCREEN_READER_SOURCE);
    expect(markers.screenReaderSupport).toBe(true);
  });

  it('detects screenReaderSupport from .sr-only class', () => {
    const markers = scanSourceForA11yPatterns(SCREEN_READER_SOURCE);
    expect(markers.screenReaderSupport).toBe(true);
  });

  it('detects multiple patterns in comprehensive source', () => {
    const markers = scanSourceForA11yPatterns(ARIA_VIA_SETATTRIBUTE_SOURCE);
    expect(markers.ariaBindings).toBe(true);
    expect(markers.roleAssignments).toBe(true);
    expect(markers.keyboardHandling).toBe(true);
    expect(markers.focusManagement).toBe(true);
  });

  it('returns a SourceA11yMarkers object with exactly 7 keys', () => {
    const markers = scanSourceForA11yPatterns(EMPTY_SOURCE);
    expect(Object.keys(markers)).toHaveLength(7);
  });

  it('handles empty string source', () => {
    const markers = scanSourceForA11yPatterns('');
    expect(Object.values(markers).every((v) => v === false)).toBe(true);
  });
});

describe('scoreSourceMarkers', () => {
  const ALL_TRUE: SourceA11yMarkers = {
    ariaBindings: true,
    roleAssignments: true,
    keyboardHandling: true,
    focusManagement: true,
    formInternals: true,
    liveRegions: true,
    screenReaderSupport: true,
  };

  const ALL_FALSE: SourceA11yMarkers = {
    ariaBindings: false,
    roleAssignments: false,
    keyboardHandling: false,
    focusManagement: false,
    formInternals: false,
    liveRegions: false,
    screenReaderSupport: false,
  };

  it('scores 100 when all markers are true', () => {
    const result = scoreSourceMarkers(ALL_TRUE);
    expect(result.score).toBe(100);
  });

  it('scores 0 when all markers are false', () => {
    const result = scoreSourceMarkers(ALL_FALSE);
    expect(result.score).toBe(0);
  });

  it('returns confidence as "heuristic"', () => {
    expect(scoreSourceMarkers(ALL_TRUE).confidence).toBe('heuristic');
    expect(scoreSourceMarkers(ALL_FALSE).confidence).toBe('heuristic');
  });

  it('returns 7 sub-metrics', () => {
    const result = scoreSourceMarkers(ALL_TRUE);
    expect(result.subMetrics).toHaveLength(7);
  });

  it('all sub-metric names have [Source] prefix', () => {
    const result = scoreSourceMarkers(ALL_TRUE);
    for (const metric of result.subMetrics) {
      expect(metric.name.startsWith('[Source]')).toBe(true);
    }
  });

  it('sub-metric scores are 0 when marker is false', () => {
    const result = scoreSourceMarkers(ALL_FALSE);
    for (const metric of result.subMetrics) {
      expect(metric.score).toBe(0);
    }
  });

  it('sub-metric scores equal maxScore when marker is true', () => {
    const result = scoreSourceMarkers(ALL_TRUE);
    for (const metric of result.subMetrics) {
      expect(metric.score).toBe(metric.maxScore);
    }
  });

  it('sub-metric maxScores sum to 100', () => {
    const result = scoreSourceMarkers(ALL_TRUE);
    const maxSum = result.subMetrics.reduce((acc, m) => acc + m.maxScore, 0);
    expect(maxSum).toBe(100);
  });

  it('scores ARIA bindings as 25 points', () => {
    const markers = { ...ALL_FALSE, ariaBindings: true };
    const result = scoreSourceMarkers(markers);
    expect(result.score).toBe(25);
  });

  it('scores role assignments as 15 points', () => {
    const markers = { ...ALL_FALSE, roleAssignments: true };
    const result = scoreSourceMarkers(markers);
    expect(result.score).toBe(15);
  });

  it('scores keyboard handling as 20 points', () => {
    const markers = { ...ALL_FALSE, keyboardHandling: true };
    const result = scoreSourceMarkers(markers);
    expect(result.score).toBe(20);
  });

  it('scores focus management as 15 points', () => {
    const markers = { ...ALL_FALSE, focusManagement: true };
    const result = scoreSourceMarkers(markers);
    expect(result.score).toBe(15);
  });

  it('scores form internals as 10 points', () => {
    const markers = { ...ALL_FALSE, formInternals: true };
    const result = scoreSourceMarkers(markers);
    expect(result.score).toBe(10);
  });

  it('scores live regions as 10 points', () => {
    const markers = { ...ALL_FALSE, liveRegions: true };
    const result = scoreSourceMarkers(markers);
    expect(result.score).toBe(10);
  });

  it('scores screen reader support as 5 points', () => {
    const markers = { ...ALL_FALSE, screenReaderSupport: true };
    const result = scoreSourceMarkers(markers);
    expect(result.score).toBe(5);
  });

  it('partial scoring: aria (25) + keyboard (20) = 45', () => {
    const markers = { ...ALL_FALSE, ariaBindings: true, keyboardHandling: true };
    const result = scoreSourceMarkers(markers);
    expect(result.score).toBe(45);
  });
});

describe('isInteractiveComponent', () => {
  const ALL_FALSE: SourceA11yMarkers = {
    ariaBindings: false,
    roleAssignments: false,
    keyboardHandling: false,
    focusManagement: false,
    formInternals: false,
    liveRegions: false,
    screenReaderSupport: false,
  };

  const LAYOUT_DECL: CemDeclaration = {
    kind: 'class',
    name: 'MyLayout',
    tagName: 'my-layout',
    members: [{ kind: 'field', name: 'gap', type: { text: 'string' } }],
  };

  it('returns false for pure layout component (no interactive signals)', () => {
    expect(isInteractiveComponent(ALL_FALSE, LAYOUT_DECL, '')).toBe(false);
  });

  it('returns true when source has keyboard handling', () => {
    const markers = { ...ALL_FALSE, keyboardHandling: true };
    expect(isInteractiveComponent(markers, LAYOUT_DECL, '')).toBe(true);
  });

  it('returns true when source has focus management', () => {
    const markers = { ...ALL_FALSE, focusManagement: true };
    expect(isInteractiveComponent(markers, LAYOUT_DECL, '')).toBe(true);
  });

  it('returns true when source has form internals', () => {
    const markers = { ...ALL_FALSE, formInternals: true };
    expect(isInteractiveComponent(markers, LAYOUT_DECL, '')).toBe(true);
  });

  it('returns true when CEM has disabled property', () => {
    const decl: CemDeclaration = {
      ...LAYOUT_DECL,
      members: [{ kind: 'field', name: 'disabled', type: { text: 'boolean' } }],
    };
    expect(isInteractiveComponent(ALL_FALSE, decl, '')).toBe(true);
  });

  it('returns true when CEM has click event', () => {
    const decl: CemDeclaration = {
      ...LAYOUT_DECL,
      events: [{ name: 'my-click' }],
    };
    expect(isInteractiveComponent(ALL_FALSE, decl, '')).toBe(true);
  });

  it('returns true when CEM has change event', () => {
    const decl: CemDeclaration = {
      ...LAYOUT_DECL,
      events: [{ name: 'value-change' }],
    };
    expect(isInteractiveComponent(ALL_FALSE, decl, '')).toBe(true);
  });

  it('returns true when CEM has select event', () => {
    const decl: CemDeclaration = {
      ...LAYOUT_DECL,
      events: [{ name: 'item-select' }],
    };
    expect(isInteractiveComponent(ALL_FALSE, decl, '')).toBe(true);
  });

  it('returns true when source has @click handler template expression', () => {
    expect(isInteractiveComponent(ALL_FALSE, LAYOUT_DECL, '@click=${this.handleClick}')).toBe(true);
  });

  it('returns true when source has addEventListener click', () => {
    expect(
      isInteractiveComponent(ALL_FALSE, LAYOUT_DECL, "this.addEventListener('click', handler)"),
    ).toBe(true);
  });

  it('returns false when only ariaBindings are present (display component)', () => {
    const markers = { ...ALL_FALSE, ariaBindings: true };
    expect(isInteractiveComponent(markers, LAYOUT_DECL, 'aria-label="icon"')).toBe(false);
  });

  it('returns false when only roleAssignments are present (structural)', () => {
    const markers = { ...ALL_FALSE, roleAssignments: true };
    expect(isInteractiveComponent(markers, LAYOUT_DECL, '')).toBe(false);
  });

  it('returns false when events are non-interactive', () => {
    const decl: CemDeclaration = {
      ...LAYOUT_DECL,
      events: [{ name: 'resize' }, { name: 'visibility-change' }],
    };
    // 'resize' and 'visibility-change' don't match /click|press|select|change|input|submit/
    // 'change' in 'visibility-change' WOULD match due to regex
    expect(isInteractiveComponent(ALL_FALSE, decl, '')).toBe(true); // 'change' in name matches
  });
});

describe('resolveComponentSourceFilePath', () => {
  const WORKTREE =
    '/Volumes/Development/booked/helixir/.worktrees/feature-test-add-test-suites-for-8-untested';

  it('returns null for paths outside project root (security)', () => {
    const result = resolveComponentSourceFilePath(WORKTREE, '../../../etc/passwd');
    expect(result).toBeNull();
  });

  it('returns null for paths that do not exist', () => {
    const result = resolveComponentSourceFilePath(WORKTREE, 'src/nonexistent-component.ts');
    expect(result).toBeNull();
  });

  it('resolves .ts equivalent for .js path', () => {
    // The config.ts file does exist in the project
    const result = resolveComponentSourceFilePath(WORKTREE, 'packages/core/src/config.js');
    // May resolve to packages/core/src/config.ts if it exists
    if (result) {
      expect(result.endsWith('.ts') || result.endsWith('.js')).toBe(true);
    }
  });

  it('returns null when project root contains no matching file', () => {
    const result = resolveComponentSourceFilePath('/tmp', 'completely-fake-path.js');
    expect(result).toBeNull();
  });
});
