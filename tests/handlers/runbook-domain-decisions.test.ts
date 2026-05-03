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
