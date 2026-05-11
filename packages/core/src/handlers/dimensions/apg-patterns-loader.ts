/**
 * APG-pattern catalogue used by apg-keyboard + accessible-label scorers.
 *
 * Inlined as a TypeScript constant (not a sibling JSON read at runtime)
 * because tsc does not copy *.json into `build/` and the published
 * helixir package's `files` allowlist excludes the source tree. A
 * readFileSync against `../evidence/apg-patterns.json` succeeds against
 * the local src tree (so tests pass) but throws in any installed copy,
 * which silently regresses every verified APG scoring path (codex
 * push-gate P1, 2026-05-10).
 *
 * Per-pattern shape:
 *   { activate?: string[]; navigate?: string[]; dismiss?: string[]; url: string }
 *
 * Some patterns (tabpanel, group) carry no required keys — they are
 * passive/landmark roles. Consumers must treat an empty key set as
 * "no contract needed," not as "data missing."
 */

export interface ApgPattern {
  activate?: string[];
  navigate?: string[];
  dismiss?: string[];
  url?: string;
}

export type ApgPatterns = Record<string, ApgPattern>;

const APG_PATTERNS: ApgPatterns = {
  button: {
    activate: ['Enter', 'Space'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/button/',
  },
  link: {
    activate: ['Enter'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/link/',
  },
  checkbox: {
    activate: ['Space'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/',
  },
  radio: {
    activate: ['Space'],
    navigate: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/radio/',
  },
  switch: {
    activate: ['Enter', 'Space'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/switch/',
  },
  combobox: {
    activate: ['Enter'],
    navigate: ['ArrowDown', 'ArrowUp', 'Home', 'End'],
    dismiss: ['Escape'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/combobox/',
  },
  listbox: {
    activate: ['Enter', 'Space'],
    navigate: ['ArrowDown', 'ArrowUp', 'Home', 'End'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/listbox/',
  },
  menu: {
    activate: ['Enter', 'Space'],
    navigate: ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'],
    dismiss: ['Escape'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/menu/',
  },
  menubar: {
    activate: ['Enter', 'Space'],
    navigate: ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End'],
    dismiss: ['Escape'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/menubar/',
  },
  menuitem: {
    activate: ['Enter', 'Space'],
    navigate: ['ArrowDown', 'ArrowUp'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/menu/',
  },
  dialog: {
    dismiss: ['Escape'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/',
  },
  alertdialog: {
    dismiss: ['Escape'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/',
  },
  tablist: {
    navigate: ['ArrowLeft', 'ArrowRight', 'Home', 'End'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/tabs/',
  },
  tab: {
    activate: ['Enter', 'Space'],
    navigate: ['ArrowLeft', 'ArrowRight', 'Home', 'End'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/tabs/',
  },
  tabpanel: {
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/tabs/',
  },
  tree: {
    activate: ['Enter', 'Space'],
    navigate: ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/treeview/',
  },
  treeitem: {
    activate: ['Enter', 'Space'],
    navigate: ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/treeview/',
  },
  grid: {
    navigate: [
      'ArrowDown',
      'ArrowUp',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/grid/',
  },
  toolbar: {
    navigate: ['ArrowLeft', 'ArrowRight', 'Home', 'End'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/',
  },
  group: {
    url: 'https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/',
  },
  slider: {
    navigate: [
      'ArrowLeft',
      'ArrowRight',
      'ArrowDown',
      'ArrowUp',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/slider/',
  },
  spinbutton: {
    navigate: ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/',
  },
  disclosure: {
    activate: ['Enter', 'Space'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/',
  },
  accordion: {
    activate: ['Enter', 'Space'],
    navigate: ['ArrowDown', 'ArrowUp', 'Home', 'End'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/accordion/',
  },
  feed: {
    navigate: ['PageDown', 'PageUp', 'Home', 'End'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/feed/',
  },
  carousel: {
    navigate: ['ArrowLeft', 'ArrowRight'],
    url: 'https://www.w3.org/WAI/ARIA/apg/patterns/carousel/',
  },
};

export function loadApgPatterns(): ApgPatterns {
  return APG_PATTERNS;
}

/**
 * Test hook — kept as a no-op so existing tests that call this between
 * cases continue to work. The catalogue is now a frozen const so there
 * is no module-scoped cache state to clear.
 */
export function _resetApgPatternsCache(): void {
  // intentionally empty — the constant has no mutable cache
}

/**
 * True when the named APG pattern is a passive role (no required
 * activate/navigate/dismiss keys). Tabpanel and group are the canonical
 * examples — they appear in APG but the keyboard contract belongs to
 * their parents (tablist, the form, etc.), not to themselves. Consumers
 * MUST NOT score a passive pattern as "missing keyboard contract" when
 * no contract is declared on the component.
 */
export function isPassiveApgPattern(name: string, patterns?: ApgPatterns): boolean {
  const cat = patterns ?? APG_PATTERNS;
  const p = cat[name];
  if (!p) return false;
  const empty = (a?: string[]) => !a || a.length === 0;
  return empty(p.activate) && empty(p.navigate) && empty(p.dismiss);
}
