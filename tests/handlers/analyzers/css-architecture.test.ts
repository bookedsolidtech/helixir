/**
 * CSS Architecture Analyzer — unit tests
 *
 * Tests analyzeCssArchitecture() covering:
 *   - CSS property descriptions scoring (35 pts)
 *   - Design token naming patterns scoring (30 pts)
 *   - CSS parts documentation scoring (35 pts)
 *   - Null return for components with no CSS metadata
 *   - Proportional normalization when only props OR parts exist
 *   - Token naming pattern validation (--prefix-name)
 */

import { describe, it, expect } from 'vitest';
import { analyzeCssArchitecture } from '../../../packages/core/src/handlers/analyzers/css-architecture.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const IDEAL_CSS: CemDeclaration = {
  kind: 'class',
  name: 'IdealCss',
  tagName: 'ideal-css',
  cssProperties: [
    { name: '--ic-color-primary', default: '#0066cc', description: 'Primary brand color.' },
    { name: '--ic-color-secondary', default: '#666', description: 'Secondary color.' },
    { name: '--ic-spacing-base', default: '16px', description: 'Base spacing unit.' },
    { name: '--ic-border-radius', default: '4px', description: 'Border radius.' },
  ],
  cssParts: [
    { name: 'base', description: 'The root element.' },
    { name: 'label', description: 'The label text element.' },
    { name: 'icon', description: 'The leading icon.' },
  ],
};

const NO_CSS_METADATA: CemDeclaration = {
  kind: 'class',
  name: 'NoCss',
  tagName: 'no-css',
  members: [{ kind: 'field', name: 'value', type: { text: 'string' } }],
};

const CSS_PROPS_ONLY: CemDeclaration = {
  kind: 'class',
  name: 'CssPropsOnly',
  tagName: 'css-props-only',
  cssProperties: [
    { name: '--cp-color', description: 'Primary color.' },
    { name: '--cp-size', description: 'Size value.' },
  ],
};

const CSS_PARTS_ONLY: CemDeclaration = {
  kind: 'class',
  name: 'CssPartsOnly',
  tagName: 'css-parts-only',
  cssParts: [
    { name: 'base', description: 'Base element.' },
    { name: 'header', description: 'Header element.' },
  ],
};

const BAD_TOKEN_NAMING: CemDeclaration = {
  kind: 'class',
  name: 'BadTokenNaming',
  tagName: 'bad-token-naming',
  cssProperties: [
    { name: '--color', description: 'A color (missing prefix).' }, // no prefix
    { name: 'noLeadingDash', description: 'Missing dashes.' }, // no -- prefix
    { name: '--a', description: 'Too short.' }, // single letter prefix
    { name: '--bt-color', description: 'Good naming.' }, // valid
  ],
};

const MISSING_DESCRIPTIONS: CemDeclaration = {
  kind: 'class',
  name: 'MissingDescriptions',
  tagName: 'missing-descriptions',
  cssProperties: [
    { name: '--md-color-primary', description: 'Primary color.' },
    { name: '--md-color-secondary' }, // no description
    { name: '--md-spacing-base' }, // no description
  ],
  cssParts: [
    { name: 'base', description: 'Root element.' },
    { name: 'inner' }, // no description
  ],
};

const EMPTY_ARRAYS: CemDeclaration = {
  kind: 'class',
  name: 'EmptyArrays',
  tagName: 'empty-arrays',
  cssProperties: [],
  cssParts: [],
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('analyzeCssArchitecture', () => {
  describe('null return cases', () => {
    it('returns null for component with no CSS metadata', () => {
      const result = analyzeCssArchitecture(NO_CSS_METADATA);
      expect(result).toBeNull();
    });

    it('returns null when cssProperties and cssParts are both empty', () => {
      expect(analyzeCssArchitecture(EMPTY_ARRAYS)).toBeNull();
    });

    it('returns null when both arrays are undefined', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'NoCssAtAll',
        tagName: 'no-css-at-all',
      };
      expect(analyzeCssArchitecture(decl)).toBeNull();
    });
  });

  describe('result structure', () => {
    it('returns score, confidence, and subMetrics', () => {
      const result = analyzeCssArchitecture(IDEAL_CSS);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('subMetrics');
    });

    it('confidence is always heuristic', () => {
      expect(analyzeCssArchitecture(IDEAL_CSS)!.confidence).toBe('heuristic');
      expect(analyzeCssArchitecture(CSS_PROPS_ONLY)!.confidence).toBe('heuristic');
    });

    it('has exactly 3 sub-metrics', () => {
      const result = analyzeCssArchitecture(IDEAL_CSS);
      expect(result!.subMetrics).toHaveLength(3);
    });

    it('sub-metric names match expected categories', () => {
      const result = analyzeCssArchitecture(IDEAL_CSS);
      const names = result!.subMetrics.map((m) => m.name);
      expect(names).toContain('CSS property descriptions');
      expect(names).toContain('Design token naming');
      expect(names).toContain('CSS parts documentation');
    });
  });

  describe('ideal CSS scoring', () => {
    it('scores 100 for fully-compliant CSS architecture', () => {
      const result = analyzeCssArchitecture(IDEAL_CSS);
      expect(result!.score).toBe(100);
    });

    it('scores CSS property descriptions at max when all have descriptions', () => {
      const result = analyzeCssArchitecture(IDEAL_CSS);
      const propDescMetric = result!.subMetrics.find((m) => m.name === 'CSS property descriptions');
      expect(propDescMetric!.score).toBe(propDescMetric!.maxScore);
    });

    it('scores design token naming at max when all follow --prefix-name pattern', () => {
      const result = analyzeCssArchitecture(IDEAL_CSS);
      const tokenMetric = result!.subMetrics.find((m) => m.name === 'Design token naming');
      expect(tokenMetric!.score).toBe(tokenMetric!.maxScore);
    });

    it('scores CSS parts documentation at max when all parts have descriptions', () => {
      const result = analyzeCssArchitecture(IDEAL_CSS);
      const partsMetric = result!.subMetrics.find((m) => m.name === 'CSS parts documentation');
      expect(partsMetric!.score).toBe(partsMetric!.maxScore);
    });
  });

  describe('design token naming validation', () => {
    it('requires --prefix-name pattern (at least 2 segments with -)', () => {
      const result = analyzeCssArchitecture(BAD_TOKEN_NAMING);
      const tokenMetric = result!.subMetrics.find((m) => m.name === 'Design token naming');
      // Only '--bt-color' is well-named (1 of 4)
      // '--color' has no secondary prefix, 'noLeadingDash' fails completely, '--a' is single letter
      expect(tokenMetric!.score).toBeLessThan(tokenMetric!.maxScore);
      expect(tokenMetric!.score).toBeGreaterThan(0); // 1/4 valid
    });

    it('accepts multi-prefix tokens like --sl-button-color', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'MultiPrefix',
        tagName: 'multi-prefix',
        cssProperties: [
          { name: '--sl-button-color', description: 'Shoelace button color.' },
          { name: '--md-sys-color-primary', description: 'Material color token.' },
          { name: '--hx-spacing-md', description: 'Helix spacing medium.' },
        ],
      };
      const result = analyzeCssArchitecture(decl);
      const tokenMetric = result!.subMetrics.find((m) => m.name === 'Design token naming');
      expect(tokenMetric!.score).toBe(tokenMetric!.maxScore);
    });

    it('rejects properties without -- prefix', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'NoPrefix',
        tagName: 'no-prefix',
        cssProperties: [
          { name: 'color', description: 'No prefix.' },
          { name: 'background', description: 'No prefix.' },
        ],
      };
      const result = analyzeCssArchitecture(decl);
      const tokenMetric = result!.subMetrics.find((m) => m.name === 'Design token naming');
      expect(tokenMetric!.score).toBe(0);
    });
  });

  describe('missing descriptions', () => {
    it('scores CSS property descriptions proportionally', () => {
      const result = analyzeCssArchitecture(MISSING_DESCRIPTIONS);
      const propDescMetric = result!.subMetrics.find((m) => m.name === 'CSS property descriptions');
      // 1 of 3 CSS properties have descriptions → round(1/3 * 35) = 12 (or 11)
      expect(propDescMetric!.score).toBeGreaterThan(0);
      expect(propDescMetric!.score).toBeLessThan(propDescMetric!.maxScore);
    });

    it('scores CSS parts documentation proportionally', () => {
      const result = analyzeCssArchitecture(MISSING_DESCRIPTIONS);
      const partsMetric = result!.subMetrics.find((m) => m.name === 'CSS parts documentation');
      // 1 of 2 CSS parts have descriptions → round(1/2 * 35) = 18 (or 17)
      expect(partsMetric!.score).toBeGreaterThan(0);
      expect(partsMetric!.score).toBeLessThan(partsMetric!.maxScore);
    });
  });

  describe('CSS properties only', () => {
    it('returns a result when only cssProperties exist', () => {
      const result = analyzeCssArchitecture(CSS_PROPS_ONLY);
      expect(result).not.toBeNull();
    });

    it('scores CSS parts at 0 when no parts exist', () => {
      const result = analyzeCssArchitecture(CSS_PROPS_ONLY);
      const partsMetric = result!.subMetrics.find((m) => m.name === 'CSS parts documentation');
      expect(partsMetric!.score).toBe(0);
    });

    it('normalizes score based on applicable dimensions', () => {
      const result = analyzeCssArchitecture(CSS_PROPS_ONLY);
      // cssProperties: all described + all well-named → 65/65 → normalized to 100
      expect(result!.score).toBe(100);
    });
  });

  describe('CSS parts only', () => {
    it('returns a result when only cssParts exist', () => {
      const result = analyzeCssArchitecture(CSS_PARTS_ONLY);
      expect(result).not.toBeNull();
    });

    it('scores CSS properties at 0 when no properties exist', () => {
      const result = analyzeCssArchitecture(CSS_PARTS_ONLY);
      const propDescMetric = result!.subMetrics.find((m) => m.name === 'CSS property descriptions');
      const tokenMetric = result!.subMetrics.find((m) => m.name === 'Design token naming');
      expect(propDescMetric!.score).toBe(0);
      expect(tokenMetric!.score).toBe(0);
    });

    it('normalizes score based on applicable dimensions', () => {
      const result = analyzeCssArchitecture(CSS_PARTS_ONLY);
      // cssParts: all described → 35/35 → normalized to 100
      expect(result!.score).toBe(100);
    });
  });

  describe('score bounds', () => {
    it('score is always in range [0, 100]', () => {
      const decls = [
        IDEAL_CSS,
        CSS_PROPS_ONLY,
        CSS_PARTS_ONLY,
        BAD_TOKEN_NAMING,
        MISSING_DESCRIPTIONS,
      ];
      for (const decl of decls) {
        const result = analyzeCssArchitecture(decl);
        if (result) {
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
        }
      }
    });

    it('sub-metric maxScore values sum to 100', () => {
      const result = analyzeCssArchitecture(IDEAL_CSS);
      const maxSum = result!.subMetrics.reduce((acc, m) => acc + m.maxScore, 0);
      expect(maxSum).toBe(100);
    });
  });

  describe('whitespace description handling', () => {
    it('treats whitespace-only descriptions as missing', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'WhitespaceDesc',
        tagName: 'whitespace-desc',
        cssProperties: [
          { name: '--ws-color', description: '   ' }, // whitespace only
          { name: '--ws-bg', description: 'Valid description.' },
        ],
        cssParts: [
          { name: 'base', description: '' }, // empty string
          { name: 'inner', description: 'Inner element.' },
        ],
      };
      const result = analyzeCssArchitecture(decl);
      const propDescMetric = result!.subMetrics.find((m) => m.name === 'CSS property descriptions');
      const partsMetric = result!.subMetrics.find((m) => m.name === 'CSS parts documentation');
      // 1 of 2 CSS props has valid description
      expect(propDescMetric!.score).toBeLessThan(propDescMetric!.maxScore);
      // 1 of 2 CSS parts has valid description
      expect(partsMetric!.score).toBeLessThan(partsMetric!.maxScore);
    });
  });
});
