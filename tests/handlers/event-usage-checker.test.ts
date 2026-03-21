import { describe, it, expect } from 'vitest';
import { checkEventUsage } from '../../packages/core/src/handlers/event-usage-checker.js';
import type { ComponentMetadata } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const buttonMeta: ComponentMetadata = {
  tagName: 'my-button',
  name: 'MyButton',
  description: 'A button component',
  members: [],
  events: [
    {
      name: 'my-click',
      type: 'CustomEvent<{ originalEvent: MouseEvent }>',
      description: 'Fired on click',
    },
    {
      name: 'my-focus',
      type: 'CustomEvent<void>',
      description: 'Fired on focus',
    },
    {
      name: 'my-blur',
      type: '',
      description: '',
    },
  ],
  slots: [],
  cssProperties: [],
  cssParts: [],
};

// ─── React Event Anti-Patterns ──────────────────────────────────────────────

describe('checkEventUsage — React custom event anti-patterns', () => {
  it('detects React onXxx props for custom events', () => {
    const code = `<my-button onMyClick={handler}>Click</my-button>`;
    const result = checkEventUsage(code, buttonMeta, 'react');
    const issues = result.issues.filter((i) => i.rule === 'react-custom-event-prop');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('onMyClick');
  });

  it('suggests ref + addEventListener for React', () => {
    const code = `<my-button onMyClick={handler}>Click</my-button>`;
    const result = checkEventUsage(code, buttonMeta, 'react');
    const issues = result.issues.filter((i) => i.rule === 'react-custom-event-prop');
    expect(issues[0]?.suggestion).toContain('addEventListener');
  });

  it('does not flag standard React events (onClick, onFocus)', () => {
    const code = `<my-button onClick={handler} onFocus={handler}>Click</my-button>`;
    const result = checkEventUsage(code, buttonMeta, 'react');
    const issues = result.issues.filter((i) => i.rule === 'react-custom-event-prop');
    expect(issues).toHaveLength(0);
  });

  it('detects camelCase event props that match component events', () => {
    const code = `<my-button onMyFocus={handler}>Click</my-button>`;
    const result = checkEventUsage(code, buttonMeta, 'react');
    const issues = result.issues.filter((i) => i.rule === 'react-custom-event-prop');
    expect(issues).toHaveLength(1);
  });
});

// ─── Unknown Event Names ────────────────────────────────────────────────────

describe('checkEventUsage — unknown event names', () => {
  it('detects addEventListener with unknown event name', () => {
    const code = `el.addEventListener('my-select', handler);`;
    const result = checkEventUsage(code, buttonMeta);
    const issues = result.issues.filter((i) => i.rule === 'unknown-event');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('my-select');
  });

  it('suggests closest event name for typos', () => {
    const code = `el.addEventListener('my-clck', handler);`;
    const result = checkEventUsage(code, buttonMeta);
    const issues = result.issues.filter((i) => i.rule === 'unknown-event');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.suggestion).toContain('my-click');
  });

  it('does not flag known event names', () => {
    const code = `el.addEventListener('my-click', handler);`;
    const result = checkEventUsage(code, buttonMeta);
    const issues = result.issues.filter((i) => i.rule === 'unknown-event');
    expect(issues).toHaveLength(0);
  });

  it('does not flag standard DOM events', () => {
    const code = `el.addEventListener('click', handler);
el.addEventListener('focus', handler);
el.addEventListener('keydown', handler);`;
    const result = checkEventUsage(code, buttonMeta);
    const issues = result.issues.filter((i) => i.rule === 'unknown-event');
    expect(issues).toHaveLength(0);
  });
});

// ─── Vue Event Patterns ─────────────────────────────────────────────────────

describe('checkEventUsage — Vue event patterns', () => {
  it('detects unknown events in Vue @event syntax', () => {
    const code = `<my-button @my-select="handler">Click</my-button>`;
    const result = checkEventUsage(code, buttonMeta, 'vue');
    const issues = result.issues.filter((i) => i.rule === 'unknown-event');
    expect(issues).toHaveLength(1);
  });

  it('does not flag known events in Vue @event syntax', () => {
    const code = `<my-button @my-click="handler">Click</my-button>`;
    const result = checkEventUsage(code, buttonMeta, 'vue');
    const issues = result.issues.filter((i) => i.rule === 'unknown-event');
    expect(issues).toHaveLength(0);
  });
});

// ─── Angular Event Patterns ─────────────────────────────────────────────────

describe('checkEventUsage — Angular event patterns', () => {
  it('detects unknown events in Angular (event) syntax', () => {
    const code = `<my-button (my-select)="handler($event)">Click</my-button>`;
    const result = checkEventUsage(code, buttonMeta, 'angular');
    const issues = result.issues.filter((i) => i.rule === 'unknown-event');
    expect(issues).toHaveLength(1);
  });

  it('does not flag known events in Angular (event) syntax', () => {
    const code = `<my-button (my-click)="handler($event)">Click</my-button>`;
    const result = checkEventUsage(code, buttonMeta, 'angular');
    const issues = result.issues.filter((i) => i.rule === 'unknown-event');
    expect(issues).toHaveLength(0);
  });
});

// ─── Result Structure ────────────────────────────────────────────────────────

describe('checkEventUsage — result structure', () => {
  it('returns clean: true when no issues', () => {
    const code = `el.addEventListener('my-click', handler);`;
    const result = checkEventUsage(code, buttonMeta);
    expect(result.clean).toBe(true);
  });

  it('returns tagName from metadata', () => {
    const code = `el.addEventListener('my-click', handler);`;
    const result = checkEventUsage(code, buttonMeta);
    expect(result.tagName).toBe('my-button');
  });

  it('issues contain all required fields', () => {
    const code = `<my-button onMyClick={handler}>Click</my-button>`;
    const result = checkEventUsage(code, buttonMeta, 'react');
    expect(result.issues.length).toBeGreaterThan(0);
    const issue = result.issues[0];
    expect(issue).toHaveProperty('line');
    expect(issue).toHaveProperty('severity');
    expect(issue).toHaveProperty('rule');
    expect(issue).toHaveProperty('message');
    expect(issue).toHaveProperty('suggestion');
  });
});
