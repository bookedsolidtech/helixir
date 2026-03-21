/**
 * Event Usage Checker — validates event listener patterns in consumer code.
 *
 * Detects framework-specific anti-patterns:
 * 1. React: onXxx props for custom events (won't work without refs)
 * 2. Unknown event names in addEventListener / @event / (event)
 * 3. Misspelled event names with fuzzy match suggestions
 */

import type { ComponentMetadata } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EventUsageIssue {
  line: number;
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  suggestion: string;
}

export interface EventUsageCheckResult {
  tagName: string;
  issues: EventUsageIssue[];
  clean: boolean;
}

// ─── Standard DOM events that should not trigger unknown-event ──────────────

const STANDARD_DOM_EVENTS = new Set([
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseenter',
  'mouseleave',
  'mouseover',
  'mouseout',
  'contextmenu',
  'focus',
  'blur',
  'focusin',
  'focusout',
  'keydown',
  'keyup',
  'keypress',
  'input',
  'change',
  'submit',
  'reset',
  'scroll',
  'resize',
  'load',
  'unload',
  'error',
  'abort',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel',
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerenter',
  'pointerleave',
  'pointerover',
  'pointerout',
  'pointercancel',
  'gotpointercapture',
  'lostpointercapture',
  'wheel',
  'drag',
  'dragstart',
  'dragend',
  'dragover',
  'dragenter',
  'dragleave',
  'drop',
  'animationstart',
  'animationend',
  'animationiteration',
  'transitionstart',
  'transitionend',
  'transitionrun',
  'transitioncancel',
  'compositionstart',
  'compositionend',
  'compositionupdate',
  'copy',
  'cut',
  'paste',
  'select',
  'beforeinput',
  'formdata',
  'toggle',
  'invalid',
]);

// Standard React event handler names that map to DOM events
const STANDARD_REACT_EVENTS = new Set([
  'onClick',
  'onDoubleClick',
  'onMouseDown',
  'onMouseUp',
  'onMouseMove',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseOver',
  'onMouseOut',
  'onContextMenu',
  'onFocus',
  'onBlur',
  'onKeyDown',
  'onKeyUp',
  'onKeyPress',
  'onInput',
  'onChange',
  'onSubmit',
  'onReset',
  'onScroll',
  'onWheel',
  'onDrag',
  'onDragStart',
  'onDragEnd',
  'onDragOver',
  'onDragEnter',
  'onDragLeave',
  'onDrop',
  'onTouchStart',
  'onTouchEnd',
  'onTouchMove',
  'onTouchCancel',
  'onPointerDown',
  'onPointerUp',
  'onPointerMove',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerOver',
  'onPointerOut',
  'onPointerCancel',
  'onAnimationStart',
  'onAnimationEnd',
  'onAnimationIteration',
  'onTransitionEnd',
  'onCopy',
  'onCut',
  'onPaste',
  'onSelect',
  'onCompositionStart',
  'onCompositionEnd',
  'onCompositionUpdate',
  'onLoad',
  'onError',
]);

// ─── Levenshtein distance ────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) {
    const row = dp[i];
    if (row) row[0] = i;
  }
  for (let j = 0; j <= n; j++) {
    const row = dp[0];
    if (row) row[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const prevRow = dp[i - 1];
      const currRow = dp[i];
      if (prevRow && currRow) {
        currRow[j] = Math.min(
          (prevRow[j] ?? 0) + 1,
          (currRow[j - 1] ?? 0) + 1,
          (prevRow[j - 1] ?? 0) + cost,
        );
      }
    }
  }

  const lastRow = dp[m];
  return lastRow ? (lastRow[n] ?? 0) : 0;
}

function findClosestMatch(input: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  let best: string | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(input, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return bestDist <= 3 ? best : null;
}

// ─── Checkers ───────────────────────────────────────────────────────────────

function checkReactCustomEventProps(lines: string[]): EventUsageIssue[] {
  const issues: EventUsageIssue[] = [];
  // Match on[A-Z]xxx={...} patterns — React event handler props
  const pattern = /\bon([A-Z][a-zA-Z]*)\s*=\s*\{/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(line)) !== null) {
      const propName = `on${match[1] ?? ''}`;
      if (STANDARD_REACT_EVENTS.has(propName)) continue;

      issues.push({
        line: i + 1,
        severity: 'error',
        rule: 'react-custom-event-prop',
        message: `"${propName}" is not a standard React event. Custom element events don't work as React JSX props.`,
        suggestion: `Use a ref and addEventListener instead: ref.current.addEventListener('${eventNameFromProp(propName)}', handler)`,
      });
    }
  }

  return issues;
}

function eventNameFromProp(propName: string): string {
  // Convert "onMyClick" → "my-click"
  const withoutOn = propName.replace(/^on/, '');
  return withoutOn.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function checkUnknownEvents(
  lines: string[],
  meta: ComponentMetadata,
  framework?: string,
): EventUsageIssue[] {
  const issues: EventUsageIssue[] = [];
  const knownEvents = new Set(meta.events.map((e) => e.name));
  const allEventNames = meta.events.map((e) => e.name);

  // addEventListener('event-name', ...)
  const addListenerPattern = /addEventListener\(\s*['"]([^'"]+)['"]/g;
  // Vue: @event-name="handler"
  const vuePattern = /@([\w-]+)\s*=/g;
  // Angular: (event-name)="handler"
  const angularPattern = /\(([\w-]+)\)\s*=/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Check addEventListener calls
    let match: RegExpExecArray | null;
    addListenerPattern.lastIndex = 0;
    while ((match = addListenerPattern.exec(line)) !== null) {
      const eventName = match[1] ?? '';
      if (STANDARD_DOM_EVENTS.has(eventName)) continue;
      if (knownEvents.has(eventName)) continue;

      const closest = findClosestMatch(eventName, allEventNames);
      const suggestion = closest
        ? `Did you mean "${closest}"? Known events: ${allEventNames.join(', ')}`
        : `Known events: ${allEventNames.join(', ')}`;

      issues.push({
        line: i + 1,
        severity: 'warning',
        rule: 'unknown-event',
        message: `"${eventName}" is not a known event of <${meta.tagName}>.`,
        suggestion,
      });
    }

    // Check Vue @event syntax
    if (framework === 'vue') {
      vuePattern.lastIndex = 0;
      while ((match = vuePattern.exec(line)) !== null) {
        const eventName = match[1] ?? '';
        if (STANDARD_DOM_EVENTS.has(eventName)) continue;
        if (knownEvents.has(eventName)) continue;

        const closest = findClosestMatch(eventName, allEventNames);
        const suggestion = closest
          ? `Did you mean "@${closest}"? Known events: ${allEventNames.join(', ')}`
          : `Known events: ${allEventNames.join(', ')}`;

        issues.push({
          line: i + 1,
          severity: 'warning',
          rule: 'unknown-event',
          message: `"${eventName}" is not a known event of <${meta.tagName}>.`,
          suggestion,
        });
      }
    }

    // Check Angular (event) syntax
    if (framework === 'angular') {
      angularPattern.lastIndex = 0;
      while ((match = angularPattern.exec(line)) !== null) {
        const eventName = match[1] ?? '';
        if (STANDARD_DOM_EVENTS.has(eventName)) continue;
        if (knownEvents.has(eventName)) continue;

        const closest = findClosestMatch(eventName, allEventNames);
        const suggestion = closest
          ? `Did you mean "(${closest})"? Known events: ${allEventNames.join(', ')}`
          : `Known events: ${allEventNames.join(', ')}`;

        issues.push({
          line: i + 1,
          severity: 'warning',
          rule: 'unknown-event',
          message: `"${eventName}" is not a known event of <${meta.tagName}>.`,
          suggestion,
        });
      }
    }
  }

  return issues;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkEventUsage(
  codeText: string,
  meta: ComponentMetadata,
  framework?: string,
): EventUsageCheckResult {
  const lines = codeText.split('\n');
  const issues: EventUsageIssue[] = [];

  if (framework === 'react') {
    issues.push(...checkReactCustomEventProps(lines));
  }

  issues.push(...checkUnknownEvents(lines, meta, framework));

  issues.sort((a, b) => a.line - b.line);

  return {
    tagName: meta.tagName,
    issues,
    clean: issues.length === 0,
  };
}
