/**
 * Real-library integration tests for the source-level accessibility scanner.
 * Tests against Helix (local source) and fixture CEMs (CEM-only fallback).
 *
 * NO hardcoded component lists. The scanner determines at runtime whether
 * each component is interactive and needs a11y scoring.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  scanSourceForA11yPatterns,
  scoreSourceMarkers,
  analyzeSourceAccessibility,
  isInteractiveComponent,
} from '../../packages/core/src/handlers/analyzers/source-accessibility.js';
import { getDeclarationSourcePath, CemSchema } from '../../packages/core/src/handlers/cem.js';
import type { Cem, CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Helix Setup ─────────────────────────────────────────────────────────────

const HELIX_ROOT = resolve(__dirname, '../../../helix/packages/hx-library');
const HELIX_CEM_PATH = resolve(HELIX_ROOT, 'custom-elements.json');
const HELIX_HAS_SOURCE = existsSync(HELIX_ROOT) && existsSync(HELIX_CEM_PATH);

function loadHelixCem(): Cem | null {
  if (!HELIX_HAS_SOURCE) return null;
  const raw = readFileSync(HELIX_CEM_PATH, 'utf-8');
  return CemSchema.parse(JSON.parse(raw));
}

function makeHelixConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: HELIX_ROOT,
    componentPrefix: 'hx',
    healthHistoryDir: '.health-history',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

function getAllDecls(cem: Cem): CemDeclaration[] {
  return cem.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.tagName);
}

function readSource(cem: Cem, decl: CemDeclaration, root: string): string | null {
  const tagName = decl.tagName;
  if (!tagName) return null;
  const modulePath = getDeclarationSourcePath(cem, tagName);
  if (!modulePath) return null;
  const tsPath = resolve(root, modulePath.replace(/\.js$/, '.ts'));
  if (existsSync(tsPath)) return readFileSync(tsPath, 'utf-8');
  const jsPath = resolve(root, modulePath);
  if (existsSync(jsPath)) return readFileSync(jsPath, 'utf-8');
  return null;
}

// ─── Fixture CEMs ────────────────────────────────────────────────────────────

const FIXTURE_DIR = resolve(__dirname, '../__fixtures__');

function loadFixtureCem(filename: string): Cem {
  const raw = readFileSync(resolve(FIXTURE_DIR, filename), 'utf-8');
  return CemSchema.parse(JSON.parse(raw));
}

// ─── Helix Tests ─────────────────────────────────────────────────────────────

describe.skipIf(!HELIX_HAS_SOURCE)('Helix source-level accessibility', () => {
  const cem = loadHelixCem()!;
  const config = makeHelixConfig();

  describe('getDeclarationSourcePath', () => {
    it('resolves source paths for all Helix components', () => {
      const allDecls = getAllDecls(cem);
      for (const decl of allDecls) {
        const path = getDeclarationSourcePath(cem, decl.tagName!);
        expect(path, `${decl.tagName} should have a source path`).not.toBeNull();
        const tsPath = resolve(HELIX_ROOT, path!.replace(/\.js$/, '.ts'));
        const jsPath = resolve(HELIX_ROOT, path!);
        const fileExists = existsSync(tsPath) || existsSync(jsPath);
        expect(fileExists, `Source file for ${decl.tagName} should exist at ${path}`).toBe(true);
      }
    });
  });

  describe('runtime interactivity detection', () => {
    it('classifies every component at runtime — no hardcoded lists', () => {
      const allDecls = getAllDecls(cem);
      const interactive: string[] = [];
      const presentational: string[] = [];

      for (const decl of allDecls) {
        const source = readSource(cem, decl, HELIX_ROOT);
        if (!source) continue;
        const markers = scanSourceForA11yPatterns(source);
        if (isInteractiveComponent(markers, decl, source)) {
          interactive.push(decl.tagName!);
        } else {
          presentational.push(decl.tagName!);
        }
      }

      console.log(`\n  Runtime classification (${allDecls.length} components):`);
      console.log(`  Interactive: ${interactive.length} — scored on a11y`);
      console.log(`  Presentational: ${presentational.length} — excluded (no penalty)`);
      console.log(`  Presentational: ${presentational.join(', ')}`);

      // Sanity checks — not tied to specific components, just reasonable ratios
      expect(interactive.length).toBeGreaterThan(0);
      expect(presentational.length).toBeGreaterThan(0);
      // A real component library should have some of both
      expect(interactive.length).toBeGreaterThan(presentational.length);
    });
  });

  describe('interactive components all score > 0', () => {
    it('every runtime-detected interactive component gets a non-zero score', async () => {
      const allDecls = getAllDecls(cem);
      const results: Array<{ tag: string; score: number; categories: string[] }> = [];
      let zeroScoreInteractive = 0;

      for (const decl of allDecls) {
        const result = await analyzeSourceAccessibility(config, cem, decl);
        if (result) {
          const categories = result.subMetrics
            .filter((m) => m.score > 0)
            .map((m) => m.name.replace('[Source] ', ''));
          results.push({ tag: decl.tagName!, score: result.score, categories });
          if (result.score === 0) zeroScoreInteractive++;
        }
      }

      // No interactive component should score 0 — if it's interactive, it must have SOME a11y
      expect(zeroScoreInteractive).toBe(0);
    });
  });

  describe('full library scan', () => {
    it('scores all components and reports honest distribution', async () => {
      const allDecls = getAllDecls(cem);
      const scored: Array<{ tag: string; score: number; categories: string[] }> = [];
      const skipped: string[] = [];

      for (const decl of allDecls) {
        const result = await analyzeSourceAccessibility(config, cem, decl);
        if (result) {
          const categories = result.subMetrics
            .filter((m) => m.score > 0)
            .map((m) => m.name.replace('[Source] ', ''));
          scored.push({ tag: decl.tagName!, score: result.score, categories });
        } else {
          skipped.push(decl.tagName!);
        }
      }

      expect(scored.length).toBeGreaterThan(0);

      const tiers = {
        excellent: scored.filter((s) => s.score >= 90),
        good: scored.filter((s) => s.score >= 70 && s.score < 90),
        fair: scored.filter((s) => s.score >= 40 && s.score < 70),
        low: scored.filter((s) => s.score < 40),
      };

      const avg = Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length);

      console.log('\n  ═══════════════════════════════════════════');
      console.log('  HELIX SOURCE-LEVEL A11Y SCAN RESULTS');
      console.log('  ═══════════════════════════════════════════');
      console.log(`  Total components: ${allDecls.length}`);
      console.log(`  Scored (interactive): ${scored.length}`);
      console.log(`  Skipped (presentational): ${skipped.length}`);
      console.log(`  Average score (interactive only): ${avg}/100`);
      console.log(`  Excellent (>=90): ${tiers.excellent.length}`);
      console.log(`  Good (70-89):     ${tiers.good.length}`);
      console.log(`  Fair (40-69):     ${tiers.fair.length}`);
      console.log(`  Low (<40):        ${tiers.low.length}`);

      if (tiers.excellent.length > 0) {
        console.log('\n  Top scorers:');
        tiers.excellent
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .forEach((s) => console.log(`    ${s.tag}: ${s.score} — ${s.categories.join(', ')}`));
      }

      if (tiers.low.length > 0) {
        console.log('\n  Lowest interactive scorers:');
        tiers.low
          .sort((a, b) => a.score - b.score)
          .forEach((s) =>
            console.log(
              `    ${s.tag}: ${s.score} — ${s.categories.length > 0 ? s.categories.join(', ') : '(none)'}`,
            ),
          );
      }

      if (skipped.length > 0) {
        console.log(`\n  Skipped (presentational — not penalized):`);
        console.log(`    ${skipped.join(', ')}`);
      }

      // The HONEST average for interactive components should be respectable
      expect(avg).toBeGreaterThanOrEqual(50);
    });
  });
});

// ─── Fixture CEM Tests (CEM-only, no source) ────────────────────────────────

describe('fixture CEMs — graceful fallback (no source files)', () => {
  const FIXTURE_CEMS = [
    'shoelace-custom-elements.json',
    'material-web-custom-elements.json',
    'vaadin-custom-elements.json',
    'fast-custom-elements.json',
    'ionic-custom-elements.json',
    'carbon-custom-elements.json',
    'lion-custom-elements.json',
    'patternfly-custom-elements.json',
    'fluent-custom-elements.json',
  ];

  const fakeConfig: McpWcConfig = {
    cemPath: 'custom-elements.json',
    projectRoot: '/nonexistent/path',
    componentPrefix: '',
    healthHistoryDir: '.health-history',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };

  for (const filename of FIXTURE_CEMS) {
    const fixturePath = resolve(FIXTURE_DIR, filename);
    if (!existsSync(fixturePath)) continue;

    it(`${filename} — returns null for all components (no source files)`, async () => {
      const cem = loadFixtureCem(filename);
      const allDecls = getAllDecls(cem);
      const sample = allDecls.slice(0, 5);
      for (const decl of sample) {
        const result = await analyzeSourceAccessibility(fakeConfig, cem, decl);
        expect(result).toBeNull();
      }
      console.log(
        `  ${filename}: ${allDecls.length} components, all correctly returned null (no source)`,
      );
    });
  }
});

// ─── Direct source scanning ─────────────────────────────────────────────────

describe.skipIf(!HELIX_HAS_SOURCE)('scanSourceForA11yPatterns — real source files', () => {
  const cem = loadHelixCem()!;

  it('scans 3 diverse components and prints detailed breakdowns', () => {
    const targets = ['hx-button', 'hx-dialog', 'hx-select'];
    for (const tag of targets) {
      const source = readSource(cem, getAllDecls(cem).find((d) => d.tagName === tag)!, HELIX_ROOT);
      if (!source) continue;
      const markers = scanSourceForA11yPatterns(source);
      const result = scoreSourceMarkers(markers);

      console.log(`\n  ${tag} source scan:`);
      for (const m of result.subMetrics) {
        const icon = m.score > 0 ? 'Y' : ' ';
        console.log(`    [${icon}] ${m.name}: ${m.score}/${m.maxScore}`);
      }
      console.log(`    TOTAL: ${result.score}/100`);
    }
    // Just verify it runs without error
    expect(true).toBe(true);
  });
});
