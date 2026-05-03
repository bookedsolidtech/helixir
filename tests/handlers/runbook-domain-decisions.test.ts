/**
 * Runbook §4 Domain Decision Pins
 *
 * These tests pin the two domain decisions documented in the rea
 * migration retry runbook at:
 *   bst-cto-kb/Projects/HELiXiR/HELiXiR migration retry runbook —
 *     rea 0.13.0 (2026-05-03).md
 *
 * Per runbook §6 step 3: "Pattern of flipping across a session: the
 * underlying code is ambivalent (see §4). Pick a side, document it,
 * write a regression test, push that — codex stops flipping when the
 * code commits to one position."
 *
 * Each describe block names the runbook section it pins.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from '../../packages/core/src/config.js';
import { scaffoldComponent } from '../../packages/core/src/handlers/scaffold.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// ─── §4a: out-of-tree cemPath from MCP_WC_CONFIG_PATH ───────────────────────
//
// Decision: drop with explicit allowlist override.
//   Default: drop (defense-in-depth — out-of-tree absolute paths are a
//   path-traversal vector for the MCP server).
//   Override: set MCP_WC_CONFIG_ALLOW_EXTERNAL_PATHS=1 for legitimate
//   sibling-repo / vendored-CEM use cases.

describe('runbook §4a — out-of-tree cemPath drop with allowlist override', () => {
  let projectDir: string;
  let externalDir: string;
  let externalConfig: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    projectDir = mkdtempSync(join(tmpdir(), 'helixir-runbook-§4a-project-'));
    externalDir = mkdtempSync(join(tmpdir(), 'helixir-runbook-§4a-external-'));
    externalConfig = join(externalDir, 'helixir.mcp.json');
    writeFileSync(
      externalConfig,
      JSON.stringify({ cemPath: join(externalDir, 'dist', 'cem.json') }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(externalDir, { recursive: true, force: true });
  });

  it('drops out-of-tree absolute cemPath by default (no env opt-in)', () => {
    vi.stubEnv('MCP_WC_PROJECT_ROOT', projectDir);
    vi.stubEnv('MCP_WC_CONFIG_PATH', externalConfig);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const config = loadConfig();
      // Field dropped → falls back to default
      expect(config.cemPath).toBe('custom-elements.json');
      // Warning explains the drop and names the env override
      const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrCalls).toContain('outside projectRoot');
      expect(stderrCalls).toContain('MCP_WC_CONFIG_ALLOW_EXTERNAL_PATHS=1');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('preserves out-of-tree absolute cemPath when MCP_WC_CONFIG_ALLOW_EXTERNAL_PATHS=1', () => {
    vi.stubEnv('MCP_WC_PROJECT_ROOT', projectDir);
    vi.stubEnv('MCP_WC_CONFIG_PATH', externalConfig);
    vi.stubEnv('MCP_WC_CONFIG_ALLOW_EXTERNAL_PATHS', '1');
    const config = loadConfig();
    expect(config.cemPath).toBe(join(externalDir, 'dist', 'cem.json'));
  });

  it('does not honor non-"1" values of MCP_WC_CONFIG_ALLOW_EXTERNAL_PATHS', () => {
    vi.stubEnv('MCP_WC_PROJECT_ROOT', projectDir);
    vi.stubEnv('MCP_WC_CONFIG_PATH', externalConfig);
    vi.stubEnv('MCP_WC_CONFIG_ALLOW_EXTERNAL_PATHS', 'true');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const config = loadConfig();
      // Strict "1" gate — keeps the security contract obvious. "true",
      // "yes", "on" all DROP — only literal "1" allows.
      expect(config.cemPath).toBe('custom-elements.json');
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

// ─── M2 design pin: resolveAnalyzerNull "all absent" rule ──────────────────
//
// This is NOT a runbook §4 decision — it's an M2 design choice the codex
// push-gate has flipped on across rounds:
//   round 1 → "any absent → unknown" (catches partial gaps but penalizes
//             real CEMs that omit empty optional arrays as a normal
//             serialization choice — Shoelace fixture is the canonical
//             example)
//   round 2 → "all absent → unknown" (preserves Shoelace; misses partial
//             omissions like members:[] + missing events key)
//   round 5 → "any absent" again
//
// Pinned position: **all absent → unknown.** Catching partial omissions
// correctly requires source-fidelity cross-reference (compare CEM to
// source AST to know whether a key SHOULD be present), which is M2
// follow-up work. Until then, only deeply-empty CEMs flip to unknown;
// real-world libraries with normal serialization keep their existing
// scoring contract.
//
// This test exists per runbook §6 step 3 — pin the decision with a
// regression test so future codex flips on the same code are caught
// with named context.

describe('M2 design pin — resolveAnalyzerNull "all absent → unknown"', () => {
  let projectDir: string;
  beforeEach(() => {
    vi.unstubAllEnvs();
    projectDir = mkdtempSync(join(tmpdir(), 'helixir-m2-pin-'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('returns N/A (not unknown) for partially-empty CEMs that omit one optional key', async () => {
    // members: present (empty), events: ABSENT.
    // Type Coverage requires both members and events. Pre-pin (codex
    // rounds 1 and 5 position): this would flag as `unknown`. Post-pin:
    // it's N/A because at least one input axis (members) is
    // authoritatively declared empty.
    const partialDecl = {
      kind: 'class' as const,
      name: 'PartialDecl',
      tagName: 'partial-decl',
      members: [],
      // events: deliberately absent
    };
    const { scoreComponentMultiDimensional } =
      await import('../../packages/core/src/handlers/health.js');
    const config = {
      cemPath: 'custom-elements.json',
      projectRoot: projectDir,
      componentPrefix: '',
      healthHistoryDir: '.mcp-wc/health',
      tsconfigPath: 'tsconfig.json',
      tokensPath: null,
      cdnBase: null,
      watch: false,
    };
    const result = await scoreComponentMultiDimensional(config, partialDecl);
    const typeCoverage = result.dimensions.find((d) => d.name === 'Type Coverage');
    expect(typeCoverage).toBeDefined();
    // Pin: NOT 'unknown' — the dimension is N/A because members is
    // present-but-empty (component has authoritatively declared "no
    // members to type-cover"). If this assertion ever fails because
    // someone flipped to "any absent", READ THE RUNBOOK §6 STEP 3
    // and the comment above before changing it.
    expect(typeCoverage?.confidence).not.toBe('unknown');
  });

  it('returns unknown for fully-empty CEMs that omit ALL required keys', async () => {
    // No members, no events, no slots, no cssProperties, no cssParts.
    // CSS Architecture requires both cssProperties AND cssParts —
    // both absent → unknown.
    const emptyDecl = {
      kind: 'class' as const,
      name: 'EmptyDecl',
      tagName: 'empty-decl',
      description: 'A component whose CEM omits every structured key.',
    };
    const { scoreComponentMultiDimensional } =
      await import('../../packages/core/src/handlers/health.js');
    const config = {
      cemPath: 'custom-elements.json',
      projectRoot: projectDir,
      componentPrefix: '',
      healthHistoryDir: '.mcp-wc/health',
      tsconfigPath: 'tsconfig.json',
      tokensPath: null,
      cdnBase: null,
      watch: false,
    };
    const result = await scoreComponentMultiDimensional(config, emptyDecl);
    const cssArch = result.dimensions.find((d) => d.name === 'CSS Architecture');
    expect(cssArch).toBeDefined();
    expect(cssArch?.confidence).toBe('unknown');
  });
});

// ─── §4b: scaffold base-class import precedence ─────────────────────────────
//
// Decision: package wins, bare-specifier module fallback,
//           local-relative module → TODO.
//
// Reconciles runbook's "module-first" intent (when module is a
// published bare specifier — matches Node resolution) with codex
// round-3 P2's "local modules emit broken imports" concern.

describe('runbook §4b — scaffold base-class import precedence', () => {
  function cemWithBase(opts: {
    baseClass: string;
    baseClassPackage?: string;
    baseClassModule?: string;
  }): Cem {
    const superclass: { name: string; package?: string; module?: string } = {
      name: opts.baseClass,
    };
    if (opts.baseClassPackage) superclass.package = opts.baseClassPackage;
    if (opts.baseClassModule) superclass.module = opts.baseClassModule;
    return {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'src/sample.ts',
          declarations: [
            {
              kind: 'class',
              name: 'SampleComponent',
              tagName: 'sample-component',
              superclass,
              members: [],
            },
          ],
        },
      ],
    } as Cem;
  }

  it('uses package import when baseClassPackage is available', () => {
    const cem = cemWithBase({ baseClass: 'HxBase', baseClassPackage: '@helixir/base' });
    const result = scaffoldComponent(
      { tagName: 'my-button', name: 'MyButton', baseClass: 'HxBase' },
      cem,
    );
    expect(result.component).toContain("from '@helixir/base'");
    expect(result.component).not.toContain('TODO');
  });

  it('falls back to module when it is a bare specifier and package is absent', () => {
    const cem = cemWithBase({
      baseClass: 'HxBase',
      baseClassModule: '@helixir/base/dist/index.js',
    });
    const result = scaffoldComponent(
      { tagName: 'my-button', name: 'MyButton', baseClass: 'HxBase' },
      cem,
    );
    expect(result.component).toContain("from '@helixir/base/dist/index.js'");
    expect(result.component).not.toContain('TODO');
  });

  it('emits TODO when module is a local relative path (would not resolve at destination)', () => {
    const cem = cemWithBase({ baseClass: 'HxBase', baseClassModule: './base.ts' });
    const result = scaffoldComponent(
      { tagName: 'my-button', name: 'MyButton', baseClass: 'HxBase' },
      cem,
    );
    expect(result.component).toContain('TODO: import { HxBase }');
    expect(result.component).not.toContain("from './base.ts'");
  });

  it('emits TODO when module is an absolute path (would not resolve at destination)', () => {
    const cem = cemWithBase({ baseClass: 'HxBase', baseClassModule: '/abs/base.js' });
    const result = scaffoldComponent(
      { tagName: 'my-button', name: 'MyButton', baseClass: 'HxBase' },
      cem,
    );
    expect(result.component).toContain('TODO: import { HxBase }');
  });

  it('package wins when both package and bare-specifier module are present', () => {
    const cem = cemWithBase({
      baseClass: 'HxBase',
      baseClassPackage: '@helixir/base',
      baseClassModule: '@helixir/base/internal.js',
    });
    const result = scaffoldComponent(
      { tagName: 'my-button', name: 'MyButton', baseClass: 'HxBase' },
      cem,
    );
    expect(result.component).toContain("from '@helixir/base'");
    expect(result.component).not.toContain('internal.js');
  });
});
