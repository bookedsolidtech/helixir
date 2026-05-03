/**
 * M4 Token-extension verification tests
 *
 * Covers defect-corpus classes 01, 02, 03, 14:
 *   - 01-token-deprecated-alias
 *   - 02-token-cascade-gap
 *   - 03-token-color-literal
 *   - 14-cssprop-deprecation-drift
 *
 * Each test asserts both the finding shape and the runbook §4a
 * provenance (R-round + commit + version) so future drift on the
 * alias map is caught.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  loadDeprecatedAliases,
  resolveCanonicality,
  buildCanonicalityIndex,
} from '../../packages/core/src/handlers/token-canonicality.js';
import type { DeprecatedAlias } from '../../packages/core/src/handlers/token-canonicality.js';
import { verifyTokenInheritance } from '../../packages/core/src/handlers/verify-token-inheritance.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import type { DesignToken } from '../../packages/core/src/handlers/tokens.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Fixture data ──────────────────────────────────────────────────────────

const R8_ALIAS: DeprecatedAlias = {
  alias: '--hx-color-border-on-dark-default',
  replacedBy: '--hx-color-surface-on-dark-overlay-default',
  deprecatedSinceVersion: '3.2.2',
  deprecatedSinceRound: 'R8',
  deprecatedSinceCommit: '2435cbfe5',
  removalScheduledFor: '4.0.0',
  rationale:
    'border.on-dark-default never honored WCAG 1.4.11 against surface.default — translucent FILL, not a border. Renamed to surface namespace per type honesty.',
};

const R8_ALIAS_SUBTLE: DeprecatedAlias = {
  alias: '--hx-color-border-on-dark-subtle',
  replacedBy: '--hx-color-surface-on-dark-overlay-subtle',
  deprecatedSinceVersion: '3.2.2',
  deprecatedSinceRound: 'R8',
  deprecatedSinceCommit: '2435cbfe5',
  removalScheduledFor: '4.0.0',
  rationale: null,
};

function buttonDecl(overrides: Partial<CemDeclaration> = {}): CemDeclaration {
  return {
    kind: 'class',
    name: 'FiggyButton',
    tagName: 'figgy-button',
    description: 'Extension of hx-button.',
    cssProperties: [],
    members: [],
    events: [],
    slots: [],
    cssParts: [],
    ...overrides,
  } as CemDeclaration;
}

function colorTokens(): DesignToken[] {
  return [
    {
      name: 'hx-color-action-primary-bg',
      value: '#2563eb',
      category: 'color',
      description: 'Primary action background',
    },
  ];
}

// ─── token-canonicality unit tests ─────────────────────────────────────────

describe('resolveCanonicality', () => {
  it('returns canonical: true for unmapped tokens', () => {
    const result = resolveCanonicality('--hx-color-action-primary-bg', [R8_ALIAS]);
    expect(result.canonical).toBe(true);
    expect(result.replacedBy).toBeNull();
  });

  it('returns canonical: false with provenance for mapped aliases', () => {
    const result = resolveCanonicality('--hx-color-border-on-dark-default', [R8_ALIAS]);
    expect(result.canonical).toBe(false);
    expect(result.replacedBy).toBe('--hx-color-surface-on-dark-overlay-default');
    expect(result.deprecatedSinceVersion).toBe('3.2.2');
    expect(result.deprecatedSinceRound).toBe('R8');
    expect(result.deprecatedSinceCommit).toBe('2435cbfe5');
    expect(result.removalScheduledFor).toBe('4.0.0');
  });

  it('buildCanonicalityIndex enables O(1) batch lookup', () => {
    const idx = buildCanonicalityIndex([R8_ALIAS, R8_ALIAS_SUBTLE]);
    expect(idx.has('--hx-color-border-on-dark-default')).toBe(true);
    expect(idx.has('--hx-color-border-on-dark-subtle')).toBe(true);
    expect(idx.get('--hx-color-border-on-dark-default')?.replacedBy).toBe(
      '--hx-color-surface-on-dark-overlay-default',
    );
  });
});

describe('loadDeprecatedAliases', () => {
  let projectDir: string;
  let tokensDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'helixir-m4-tokens-'));
    tokensDir = join(projectDir, 'tokens');
    mkdirSync(tokensDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function makeConfig(tokensPath: string | null = 'tokens/tokens.json'): McpWcConfig {
    return {
      cemPath: 'custom-elements.json',
      projectRoot: projectDir,
      componentPrefix: '',
      healthHistoryDir: '.mcp-wc/health',
      tsconfigPath: 'tsconfig.json',
      tokensPath,
      cdnBase: null,
      watch: false,
    };
  }

  it('returns empty when no tokens.deprecated.json exists', async () => {
    const aliases = await loadDeprecatedAliases(makeConfig());
    expect(aliases).toEqual([]);
  });

  it('returns empty when tokensPath is null', async () => {
    const aliases = await loadDeprecatedAliases(makeConfig(null));
    expect(aliases).toEqual([]);
  });

  it('loads from sibling tokens.deprecated.json next to tokensPath', async () => {
    writeFileSync(
      join(tokensDir, 'tokens.deprecated.json'),
      JSON.stringify({
        schemaVersion: 1,
        aliases: [R8_ALIAS],
      }),
    );
    const aliases = await loadDeprecatedAliases(makeConfig());
    expect(aliases).toHaveLength(1);
    expect(aliases[0]?.alias).toBe('--hx-color-border-on-dark-default');
    expect(aliases[0]?.replacedBy).toBe('--hx-color-surface-on-dark-overlay-default');
  });

  it('throws on malformed JSON', async () => {
    writeFileSync(join(tokensDir, 'tokens.deprecated.json'), 'not json');
    await expect(loadDeprecatedAliases(makeConfig())).rejects.toThrow(/JSON/);
  });

  it('throws on schema mismatch', async () => {
    writeFileSync(
      join(tokensDir, 'tokens.deprecated.json'),
      JSON.stringify({ schemaVersion: 1, aliases: [{ alias: 'x' }] }),
    );
    await expect(loadDeprecatedAliases(makeConfig())).rejects.toThrow(/schema/);
  });
});

// ─── verifyTokenInheritance — defect-class coverage ────────────────────────

describe('verifyTokenInheritance — defect class 01 (deprecated alias)', () => {
  it('flags subclass that uses --hx-color-border-on-dark-default with R8 provenance', () => {
    const result = verifyTokenInheritance({
      decl: buttonDecl({
        cssProperties: [
          {
            name: '--hx-color-border-on-dark-default',
            description: 'inverted hover background',
          },
        ],
      }),
      aliases: [R8_ALIAS],
      tokens: colorTokens(),
    });
    const aliasFinding = result.findings.find((f) => f.classId === '01-token-deprecated-alias');
    expect(aliasFinding).toBeDefined();
    expect(aliasFinding?.severity).toBe('P2');
    expect(aliasFinding?.body).toContain('--hx-color-surface-on-dark-overlay-default');
    expect(aliasFinding?.body).toContain('R8');
    expect(aliasFinding?.body).toContain('2435cbfe5');
    expect(aliasFinding?.body).toContain('4.0.0');
  });

  it('also emits 14-cssprop-deprecation-drift for deprecated cssprops in CEM', () => {
    const result = verifyTokenInheritance({
      decl: buttonDecl({
        cssProperties: [{ name: '--hx-color-border-on-dark-default', description: '' }],
      }),
      aliases: [R8_ALIAS],
      tokens: colorTokens(),
    });
    const driftFinding = result.findings.find((f) => f.classId === '14-cssprop-deprecation-drift');
    expect(driftFinding).toBeDefined();
    expect(driftFinding?.body).toContain('@deprecated');
  });

  it('does not flag canonical token usage', () => {
    const result = verifyTokenInheritance({
      decl: buttonDecl({
        cssProperties: [{ name: '--hx-color-action-primary-bg', description: 'primary bg' }],
      }),
      aliases: [R8_ALIAS],
      tokens: colorTokens(),
    });
    expect(result.findings).toHaveLength(0);
  });
});

describe('verifyTokenInheritance — defect class 02 (cascade gap)', () => {
  it('flags missing high-contrast overlay as P1', () => {
    const result = verifyTokenInheritance({
      decl: buttonDecl({
        cssProperties: [{ name: '--hx-color-action-primary-bg', description: 'primary bg' }],
      }),
      aliases: [],
      tokens: colorTokens(),
      overlays: {
        dark: new Set(['--hx-color-action-primary-bg']),
        highContrast: new Set(),
      },
    });
    const cascadeFinding = result.findings.find((f) => f.classId === '02-token-cascade-gap');
    expect(cascadeFinding).toBeDefined();
    expect(cascadeFinding?.severity).toBe('P1');
    expect(cascadeFinding?.title).toContain('high-contrast');
  });

  it('flags missing dark overlay as P2', () => {
    const result = verifyTokenInheritance({
      decl: buttonDecl({
        cssProperties: [{ name: '--hx-color-action-primary-bg', description: 'primary bg' }],
      }),
      aliases: [],
      tokens: colorTokens(),
      overlays: {
        dark: new Set(),
        highContrast: new Set(['--hx-color-action-primary-bg']),
      },
    });
    const cascadeFinding = result.findings.find((f) => f.classId === '02-token-cascade-gap');
    expect(cascadeFinding).toBeDefined();
    expect(cascadeFinding?.severity).toBe('P2');
    expect(cascadeFinding?.title).toContain('dark');
  });

  it('does not flag when no overlays are supplied', () => {
    const result = verifyTokenInheritance({
      decl: buttonDecl({
        cssProperties: [{ name: '--hx-color-action-primary-bg', description: 'primary bg' }],
      }),
      aliases: [],
      tokens: colorTokens(),
    });
    expect(result.findings.filter((f) => f.classId === '02-token-cascade-gap')).toEqual([]);
  });
});

describe('verifyTokenInheritance — defect class 03 (color literal)', () => {
  it('flags raw hex literals when color tokens exist', () => {
    const result = verifyTokenInheritance({
      decl: buttonDecl(),
      aliases: [],
      tokens: colorTokens(),
      cssSources: [`.figgy-button { color: #2563eb; background: rgba(0, 0, 0, 0.5); }`],
    });
    const literalFindings = result.findings.filter((f) => f.classId === '03-token-color-literal');
    expect(literalFindings.length).toBeGreaterThanOrEqual(2);
    expect(literalFindings.some((f) => f.title.includes('#2563eb'))).toBe(true);
    expect(literalFindings.some((f) => f.title.includes('rgba'))).toBe(true);
  });

  it('does not flag when no color tokens exist (heuristic noise control)', () => {
    const result = verifyTokenInheritance({
      decl: buttonDecl(),
      aliases: [],
      tokens: [],
      cssSources: [`.figgy-button { color: #2563eb; }`],
    });
    expect(result.findings.filter((f) => f.classId === '03-token-color-literal')).toEqual([]);
  });

  it('ignores literals inside :root token-definition blocks', () => {
    const result = verifyTokenInheritance({
      decl: buttonDecl(),
      aliases: [],
      tokens: colorTokens(),
      cssSources: [`:root { --hx-color-action-primary-bg: #2563eb; }`],
    });
    expect(result.findings.filter((f) => f.classId === '03-token-color-literal')).toEqual([]);
  });
});
