import { describe, it, expect } from 'vitest';
import { checkShadowDomUsage } from '../../packages/core/src/handlers/shadow-dom-checker.js';
import type { ComponentMetadata } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const buttonMeta: ComponentMetadata = {
  tagName: 'my-button',
  name: 'MyButton',
  description: 'A button',
  members: [],
  events: [],
  slots: [{ name: '', description: 'Default slot' }],
  cssProperties: [
    { name: '--my-button-bg', description: 'Background color' },
    { name: '--my-button-color', description: 'Text color' },
    { name: '--my-button-border-radius', description: 'Border radius' },
  ],
  cssParts: [
    { name: 'base', description: 'The button element' },
    { name: 'label', description: 'Label container' },
    { name: 'spinner', description: 'Loading spinner' },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('checkShadowDomUsage', () => {
  describe('descendant selector piercing', () => {
    it('detects descendant selectors targeting shadow internals', () => {
      const css = `my-button .internal { color: red; }`;
      const result = checkShadowDomUsage(css, 'my-button');
      expect(result.clean).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.rule).toBe('no-shadow-pierce');
      expect(result.issues[0]!.line).toBe(1);
    });

    it('detects ID selectors targeting shadow internals', () => {
      const css = `my-button #inner { display: none; }`;
      const result = checkShadowDomUsage(css, 'my-button');
      expect(result.issues.some((i) => i.rule === 'no-shadow-pierce')).toBe(true);
    });

    it('does not flag ::part() as a descendant selector', () => {
      const css = `my-button::part(base) { color: red; }`;
      const result = checkShadowDomUsage(css, 'my-button');
      const pierceIssues = result.issues.filter((i) => i.rule === 'no-shadow-pierce');
      expect(pierceIssues).toHaveLength(0);
    });

    it('does not flag ::slotted() as a descendant selector', () => {
      // Note: ::slotted will still trigger no-external-slotted, but not no-shadow-pierce
      const css = `my-button::slotted(div) { color: red; }`;
      const result = checkShadowDomUsage(css, 'my-button');
      const pierceIssues = result.issues.filter((i) => i.rule === 'no-shadow-pierce');
      expect(pierceIssues).toHaveLength(0);
    });
  });

  describe('::slotted() misuse', () => {
    it('detects ::slotted() in consumer CSS', () => {
      const css = `my-button::slotted(span) { font-weight: bold; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-external-slotted')).toBe(true);
    });

    it('reports correct line number', () => {
      const css = `/* comment */\n/* another */\nmy-button::slotted(div) { color: red; }`;
      const result = checkShadowDomUsage(css);
      const issue = result.issues.find((i) => i.rule === 'no-external-slotted');
      expect(issue!.line).toBe(3);
    });
  });

  describe('::part() descendant chaining', () => {
    it('detects ::part() followed by descendant selector', () => {
      const css = `my-button::part(base) span { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-part-descendant')).toBe(true);
    });

    it('detects ::part() followed by class selector', () => {
      const css = `my-button::part(label) .text { color: blue; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-part-descendant')).toBe(true);
    });

    it('does not flag valid ::part() usage', () => {
      const css = `my-button::part(base) { color: red; }`;
      const result = checkShadowDomUsage(css);
      const partIssues = result.issues.filter((i) => i.rule === 'no-part-descendant');
      expect(partIssues).toHaveLength(0);
    });
  });

  describe('!important on custom properties', () => {
    it('detects !important on CSS custom properties', () => {
      const css = `my-button { --my-button-bg: red !important; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-important-on-tokens')).toBe(true);
    });

    it('does not flag !important on regular properties', () => {
      const css = `my-button { color: red !important; }`;
      const result = checkShadowDomUsage(css);
      const tokenIssues = result.issues.filter((i) => i.rule === 'no-important-on-tokens');
      expect(tokenIssues).toHaveLength(0);
    });
  });

  describe('CEM-based: unknown parts', () => {
    it('detects unknown ::part() names', () => {
      const css = `my-button::part(nonexistent) { color: red; }`;
      const result = checkShadowDomUsage(css, 'my-button', buttonMeta);
      expect(result.issues.some((i) => i.rule === 'unknown-part')).toBe(true);
      expect(result.issues.find((i) => i.rule === 'unknown-part')!.message).toContain(
        'nonexistent',
      );
    });

    it('does not flag known parts', () => {
      const css = `my-button::part(base) { color: red; }`;
      const result = checkShadowDomUsage(css, 'my-button', buttonMeta);
      const unknownParts = result.issues.filter((i) => i.rule === 'unknown-part');
      expect(unknownParts).toHaveLength(0);
    });

    it('suggests closest match for typo in part name', () => {
      const css = `my-button::part(baze) { color: red; }`;
      const result = checkShadowDomUsage(css, 'my-button', buttonMeta);
      const issue = result.issues.find((i) => i.rule === 'unknown-part');
      expect(issue).toBeDefined();
      expect(issue!.suggestion).toContain('base');
    });
  });

  describe('CEM-based: misspelled tokens', () => {
    it('detects potential typos in CSS custom property names', () => {
      const css = `my-button { --my-button-bq: red; }`;
      const result = checkShadowDomUsage(css, 'my-button', buttonMeta);
      const typoIssues = result.issues.filter((i) => i.rule === 'possible-typo');
      expect(typoIssues.length).toBeGreaterThan(0);
      expect(typoIssues[0]!.message).toContain('--my-button-bg');
    });

    it('detects typos in var() references', () => {
      const css = `my-button { color: var(--my-button-colr); }`;
      const result = checkShadowDomUsage(css, 'my-button', buttonMeta);
      const typoIssues = result.issues.filter((i) => i.rule === 'possible-typo');
      expect(typoIssues.length).toBeGreaterThan(0);
      expect(typoIssues[0]!.message).toContain('--my-button-color');
    });

    it('does not flag correct token names', () => {
      const css = `my-button { --my-button-bg: red; color: var(--my-button-color); }`;
      const result = checkShadowDomUsage(css, 'my-button', buttonMeta);
      const typoIssues = result.issues.filter((i) => i.rule === 'possible-typo');
      expect(typoIssues).toHaveLength(0);
    });

    it('does not flag unrelated tokens', () => {
      const css = `body { --global-font: sans-serif; }`;
      const result = checkShadowDomUsage(css, 'my-button', buttonMeta);
      const typoIssues = result.issues.filter((i) => i.rule === 'possible-typo');
      expect(typoIssues).toHaveLength(0);
    });
  });

  describe('deprecated shadow-piercing selectors', () => {
    it('detects /deep/ combinator', () => {
      const css = `my-button /deep/ .inner { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'deprecated-deep')).toBe(true);
    });

    it('detects >>> combinator', () => {
      const css = `my-button >>> .inner { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'deprecated-deep')).toBe(true);
    });

    it('detects ::deep pseudo-element', () => {
      const css = `my-button::deep .inner { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'deprecated-deep')).toBe(true);
    });
  });

  describe('::part() advanced anti-patterns', () => {
    it('detects class selector directly after ::part()', () => {
      const css = `my-button::part(base).active { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-part-structural')).toBe(true);
    });

    it('detects attribute selector directly after ::part()', () => {
      const css = `my-button::part(base)[data-active] { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-part-structural')).toBe(true);
    });

    it('detects ::part()::part() chaining', () => {
      const css = `my-card::part(body)::part(inner) { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-part-chain')).toBe(true);
    });

    it('allows valid ::part() with :hover', () => {
      const css = `my-button::part(base):hover { color: blue; }`;
      const result = checkShadowDomUsage(css);
      const partIssues = result.issues.filter(
        (i) => i.rule === 'no-part-structural' || i.rule === 'no-part-chain',
      );
      expect(partIssues).toHaveLength(0);
    });

    it('allows valid ::part() with :focus', () => {
      const css = `my-button::part(base):focus { outline: 2px solid blue; }`;
      const result = checkShadowDomUsage(css);
      const partIssues = result.issues.filter(
        (i) => i.rule === 'no-part-structural' || i.rule === 'no-part-chain',
      );
      expect(partIssues).toHaveLength(0);
    });

    it('allows valid ::part() with ::before pseudo-element', () => {
      const css = `my-button::part(base)::before { content: "→"; }`;
      const result = checkShadowDomUsage(css);
      const partIssues = result.issues.filter(
        (i) => i.rule === 'no-part-structural' || i.rule === 'no-part-chain',
      );
      expect(partIssues).toHaveLength(0);
    });

    it('detects child combinator after ::part()', () => {
      const css = `my-button::part(base) > span { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-part-descendant')).toBe(true);
    });
  });

  describe('display:contents on host', () => {
    it('detects display:contents on component host', () => {
      const css = `my-button { display: contents; }`;
      const result = checkShadowDomUsage(css, 'my-button');
      expect(result.issues.some((i) => i.rule === 'no-display-contents-host')).toBe(true);
    });

    it('does not flag display:contents on non-host elements', () => {
      const css = `.wrapper { display: contents; }`;
      const result = checkShadowDomUsage(css, 'my-button');
      const contentIssues = result.issues.filter((i) => i.rule === 'no-display-contents-host');
      expect(contentIssues).toHaveLength(0);
    });
  });

  describe(':host pseudo-class misuse', () => {
    it('detects :host in consumer CSS', () => {
      const css = `:host { display: block; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-external-host')).toBe(true);
    });

    it('detects :host() with selector in consumer CSS', () => {
      const css = `:host(.active) { background: blue; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-external-host')).toBe(true);
    });

    it('detects :host-context() in consumer CSS', () => {
      const css = `:host-context(.dark-theme) { color: white; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-external-host')).toBe(true);
    });

    it('does not flag :host when inside a comment-like context', () => {
      // Just the word "host" in a class name should not trigger
      const css = `.my-host { display: block; }`;
      const result = checkShadowDomUsage(css);
      const hostIssues = result.issues.filter((i) => i.rule === 'no-external-host');
      expect(hostIssues).toHaveLength(0);
    });
  });

  describe('::slotted() compound selector misuse', () => {
    it('detects ::slotted() with descendant selector', () => {
      const css = `::slotted(div) span { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-slotted-descendant')).toBe(true);
    });

    it('detects ::slotted() with child combinator', () => {
      const css = `::slotted(div) > span { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-slotted-descendant')).toBe(true);
    });

    it('detects compound selector inside ::slotted()', () => {
      const css = `::slotted(div.foo) { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-slotted-compound')).toBe(true);
    });

    it('detects descendant selector inside ::slotted()', () => {
      const css = `::slotted(div span) { color: red; }`;
      const result = checkShadowDomUsage(css);
      expect(result.issues.some((i) => i.rule === 'no-slotted-compound')).toBe(true);
    });

    it('allows simple ::slotted() selector', () => {
      // Note: ::slotted() still triggers no-external-slotted in consumer CSS,
      // but should NOT trigger compound/descendant issues
      const css = `::slotted(div) { color: red; }`;
      const result = checkShadowDomUsage(css);
      const compoundIssues = result.issues.filter(
        (i) => i.rule === 'no-slotted-compound' || i.rule === 'no-slotted-descendant',
      );
      expect(compoundIssues).toHaveLength(0);
    });

    it('allows ::slotted(*) universal selector', () => {
      const css = `::slotted(*) { margin: 0; }`;
      const result = checkShadowDomUsage(css);
      const compoundIssues = result.issues.filter(
        (i) => i.rule === 'no-slotted-compound' || i.rule === 'no-slotted-descendant',
      );
      expect(compoundIssues).toHaveLength(0);
    });
  });

  describe('clean CSS', () => {
    it('reports clean for valid CSS', () => {
      const css = [
        'my-button { --my-button-bg: blue; }',
        'my-button::part(base) { padding: 8px; }',
      ].join('\n');
      const result = checkShadowDomUsage(css, 'my-button', buttonMeta);
      expect(result.clean).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('reports clean for empty CSS', () => {
      const result = checkShadowDomUsage('');
      expect(result.clean).toBe(true);
    });
  });

  describe('result structure', () => {
    it('includes tagName when provided', () => {
      const result = checkShadowDomUsage('', 'my-button');
      expect(result.tagName).toBe('my-button');
    });

    it('sets tagName to null when not provided', () => {
      const result = checkShadowDomUsage('');
      expect(result.tagName).toBeNull();
    });

    it('sorts issues by line number', () => {
      const css = [
        'my-button .inner { color: red; }',
        'my-button::part(base) span { font-weight: bold; }',
        'my-button { --my-button-bg: red !important; }',
      ].join('\n');
      const result = checkShadowDomUsage(css, 'my-button', buttonMeta);
      for (let i = 1; i < result.issues.length; i++) {
        expect(result.issues[i]!.line).toBeGreaterThanOrEqual(result.issues[i - 1]!.line);
      }
    });
  });
});
