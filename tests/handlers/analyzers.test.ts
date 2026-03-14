import { describe, it, expect } from 'vitest';
import { analyzeTypeCoverage } from '../../packages/core/src/handlers/analyzers/type-coverage.js';
import { analyzeApiSurface } from '../../packages/core/src/handlers/analyzers/api-surface.js';
import { analyzeCssArchitecture } from '../../packages/core/src/handlers/analyzers/css-architecture.js';
import { analyzeEventArchitecture } from '../../packages/core/src/handlers/analyzers/event-architecture.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WELL_TYPED_DECL: CemDeclaration = {
  kind: 'class',
  name: 'WellTyped',
  tagName: 'well-typed',
  description: 'A well-typed component.',
  members: [
    {
      kind: 'field',
      name: 'value',
      type: { text: 'string' },
      description: 'Current value.',
      default: '"hello"',
      attribute: 'value',
      reflects: true,
    },
    {
      kind: 'field',
      name: 'count',
      type: { text: 'number' },
      description: 'A count.',
      default: '0',
      attribute: 'count',
    },
    {
      kind: 'method',
      name: 'reset',
      description: 'Resets the component.',
      return: { type: { text: 'void' } },
    },
    {
      kind: 'method',
      name: 'getValue',
      description: 'Gets value.',
      return: { type: { text: 'string' } },
    },
  ],
  events: [
    {
      name: 'value-change',
      type: { text: 'CustomEvent<{ value: string }>' },
      description: 'Value changed.',
    },
    {
      name: 'count-update',
      type: { text: 'CustomEvent<{ count: number }>' },
      description: 'Count updated.',
    },
  ],
  slots: [{ name: '', description: 'Default slot.' }],
  cssParts: [{ name: 'base', description: 'Root element.' }],
  cssProperties: [
    { name: '--wt-color', default: 'blue', description: 'Primary color.' },
    { name: '--wt-size', default: '16px', description: 'Font size.' },
  ],
};

const UNTYPED_DECL: CemDeclaration = {
  kind: 'class',
  name: 'Untyped',
  tagName: 'un-typed',
  members: [
    { kind: 'field', name: 'value' },
    { kind: 'field', name: 'count' },
    { kind: 'method', name: 'reset' },
  ],
  events: [
    { name: 'change' },
    { name: 'UpdateValue', type: { text: 'Event' } }, // bare Event, not typed
  ],
};

const EMPTY_DECL: CemDeclaration = {
  kind: 'class',
  name: 'Empty',
  tagName: 'empty-component',
  description: 'An empty component.',
};

const CSS_RICH_DECL: CemDeclaration = {
  kind: 'class',
  name: 'CssRich',
  tagName: 'css-rich',
  cssProperties: [
    { name: '--cr-primary', default: '#000', description: 'Primary color.' },
    { name: '--cr-secondary', description: 'Secondary color.' },
    { name: 'badname', description: 'Bad naming.' }, // doesn't follow --prefix-* pattern
  ],
  cssParts: [
    { name: 'base', description: 'Root element.' },
    { name: 'header' }, // no description
    { name: 'footer', description: 'Footer part.' },
  ],
};

// ─── analyzeTypeCoverage ─────────────────────────────────────────────────────

describe('analyzeTypeCoverage', () => {
  it('returns 100 for a fully-typed component', () => {
    const result = analyzeTypeCoverage(WELL_TYPED_DECL);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
  });

  it('returns low score for an untyped component', () => {
    const result = analyzeTypeCoverage(UNTYPED_DECL);
    expect(result.score).toBeLessThan(50);
  });

  it('has 3 sub-metrics', () => {
    const result = analyzeTypeCoverage(WELL_TYPED_DECL);
    expect(result.subMetrics).toHaveLength(3);
    expect(result.subMetrics.map((m) => m.name)).toContain('Property type annotations');
    expect(result.subMetrics.map((m) => m.name)).toContain('Event typed payloads');
    expect(result.subMetrics.map((m) => m.name)).toContain('Method return types');
  });

  it('returns null for empty arrays (no members/events/methods — not scorable)', () => {
    const result = analyzeTypeCoverage(EMPTY_DECL);
    expect(result).toBeNull();
  });

  it('treats bare "Event" as untyped payload', () => {
    const result = analyzeTypeCoverage(UNTYPED_DECL);
    const eventMetric = result.subMetrics.find((m) => m.name === 'Event typed payloads');
    expect(eventMetric).toBeDefined();
    // 0 of 2 events have proper types (one has no type, one has bare Event)
    expect(eventMetric!.score).toBe(0);
  });

  it('sub-metrics scores sum to total score', () => {
    const result = analyzeTypeCoverage(WELL_TYPED_DECL);
    const sum = result.subMetrics.reduce((s, m) => s + m.score, 0);
    expect(sum).toBe(result.score);
  });

  it('sub-metrics maxScores sum to 100', () => {
    const result = analyzeTypeCoverage(WELL_TYPED_DECL);
    const maxSum = result.subMetrics.reduce((s, m) => s + m.maxScore, 0);
    expect(maxSum).toBe(100);
  });
});

// ─── analyzeApiSurface ───────────────────────────────────────────────────────

describe('analyzeApiSurface', () => {
  it('returns high score for well-documented API surface', () => {
    const result = analyzeApiSurface(WELL_TYPED_DECL);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.confidence).toBe('heuristic');
  });

  it('returns low score for undocumented component', () => {
    const result = analyzeApiSurface(UNTYPED_DECL);
    expect(result.score).toBeLessThan(50);
  });

  it('has 4 sub-metrics', () => {
    const result = analyzeApiSurface(WELL_TYPED_DECL);
    expect(result.subMetrics).toHaveLength(4);
  });

  it('returns null for empty component (no members — not scorable)', () => {
    const result = analyzeApiSurface(EMPTY_DECL);
    expect(result).toBeNull();
  });

  it('checks method documentation', () => {
    const result = analyzeApiSurface(WELL_TYPED_DECL);
    const methodDoc = result.subMetrics.find((m) => m.name === 'Method documentation');
    expect(methodDoc).toBeDefined();
    expect(methodDoc!.score).toBe(methodDoc!.maxScore); // 2/2 methods have descriptions
  });

  it('checks attribute reflection', () => {
    const result = analyzeApiSurface(WELL_TYPED_DECL);
    const attrReflect = result.subMetrics.find((m) => m.name === 'Attribute reflection');
    expect(attrReflect).toBeDefined();
    expect(attrReflect!.score).toBe(attrReflect!.maxScore); // 2/2 have attribute bindings
  });

  it('checks default values documentation', () => {
    const result = analyzeApiSurface(WELL_TYPED_DECL);
    const defaults = result.subMetrics.find((m) => m.name === 'Default values documented');
    expect(defaults).toBeDefined();
    expect(defaults!.score).toBe(defaults!.maxScore); // 2/2 have defaults
  });

  it('sub-metrics scores sum to total score', () => {
    const result = analyzeApiSurface(WELL_TYPED_DECL);
    const sum = result.subMetrics.reduce((s, m) => s + m.score, 0);
    expect(sum).toBe(result.score);
  });
});

// ─── analyzeCssArchitecture ──────────────────────────────────────────────────

describe('analyzeCssArchitecture', () => {
  it('returns 100 for component with well-documented CSS', () => {
    const result = analyzeCssArchitecture(WELL_TYPED_DECL);
    expect(result.score).toBe(100);
  });

  it('returns null for component with no CSS properties or parts (not scorable)', () => {
    const result = analyzeCssArchitecture(EMPTY_DECL);
    expect(result).toBeNull();
  });

  it('penalizes missing descriptions', () => {
    const result = analyzeCssArchitecture(CSS_RICH_DECL);
    // 1 of 3 CSS parts missing description → not full marks on that sub-metric
    const partsMetric = result.subMetrics.find((m) => m.name === 'CSS parts documentation');
    expect(partsMetric).toBeDefined();
    expect(partsMetric!.score).toBeLessThan(partsMetric!.maxScore);
  });

  it('penalizes bad token naming', () => {
    const result = analyzeCssArchitecture(CSS_RICH_DECL);
    const tokenMetric = result.subMetrics.find((m) => m.name === 'Design token naming');
    expect(tokenMetric).toBeDefined();
    // "badname" doesn't match --prefix-* pattern → 2/3 well-named
    expect(tokenMetric!.score).toBeLessThan(tokenMetric!.maxScore);
  });

  it('has 3 sub-metrics', () => {
    const result = analyzeCssArchitecture(WELL_TYPED_DECL);
    expect(result.subMetrics).toHaveLength(3);
  });

  it('confidence is heuristic', () => {
    const result = analyzeCssArchitecture(WELL_TYPED_DECL);
    expect(result.confidence).toBe('heuristic');
  });
});

// ─── analyzeEventArchitecture ────────────────────────────────────────────────

describe('analyzeEventArchitecture', () => {
  it('returns 100 for well-architected events', () => {
    const result = analyzeEventArchitecture(WELL_TYPED_DECL);
    expect(result.score).toBe(100);
  });

  it('returns null for component with no events (not scorable)', () => {
    const result = analyzeEventArchitecture(EMPTY_DECL);
    expect(result).toBeNull();
  });

  it('penalizes non-kebab-case event names', () => {
    const result = analyzeEventArchitecture(UNTYPED_DECL);
    const namingMetric = result.subMetrics.find((m) => m.name === 'Kebab-case naming');
    expect(namingMetric).toBeDefined();
    // "change" is valid kebab-case, but "UpdateValue" is not → 1/2
    expect(namingMetric!.score).toBeLessThan(namingMetric!.maxScore);
  });

  it('penalizes missing event types', () => {
    const result = analyzeEventArchitecture(UNTYPED_DECL);
    const typeMetric = result.subMetrics.find((m) => m.name === 'Typed event payloads');
    expect(typeMetric).toBeDefined();
    // "change" has no type, "UpdateValue" has bare Event → both untested
    expect(typeMetric!.score).toBe(0);
  });

  it('penalizes missing event descriptions', () => {
    const result = analyzeEventArchitecture(UNTYPED_DECL);
    const descMetric = result.subMetrics.find((m) => m.name === 'Event descriptions');
    expect(descMetric).toBeDefined();
    expect(descMetric!.score).toBe(0); // 0/2 events have descriptions
  });

  it('has 3 sub-metrics', () => {
    const result = analyzeEventArchitecture(WELL_TYPED_DECL);
    expect(result.subMetrics).toHaveLength(3);
  });

  it('confidence is heuristic', () => {
    const result = analyzeEventArchitecture(WELL_TYPED_DECL);
    expect(result.confidence).toBe('heuristic');
  });

  it('sub-metrics scores sum to total score', () => {
    const result = analyzeEventArchitecture(WELL_TYPED_DECL);
    const sum = result.subMetrics.reduce((s, m) => s + m.score, 0);
    expect(sum).toBe(result.score);
  });

  it('sub-metrics maxScores sum to 100', () => {
    const result = analyzeEventArchitecture(WELL_TYPED_DECL);
    const maxSum = result.subMetrics.reduce((s, m) => s + m.maxScore, 0);
    expect(maxSum).toBe(100);
  });
});
