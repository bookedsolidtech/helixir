/**
 * M3 Codex Audit Pipeline tests
 *
 * Covers:
 *   - Contract-surface determinism (key-order invariant, normalized fields)
 *   - Cache hit / miss behavior (surface change forces re-run)
 *   - Runner injection (tests don't require codex on PATH)
 *   - Output schema (AuditEntry written to disk, index updated)
 *   - Defect-corpus class-id reference round-tripping
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  extractContractSurface,
  hashContractSurface,
} from '../../packages/core/src/handlers/contract-surface.js';
import {
  readCachedAudit,
  writeAudit,
  listAuditedSurfaces,
  listAuditedComponents,
} from '../../packages/core/src/handlers/audit-cache.js';
import type { AuditEntry } from '../../packages/core/src/handlers/audit-cache.js';
import {
  auditComponentWithCodex,
  parseCodexFindings,
  renderAuditPrompt,
} from '../../packages/core/src/handlers/codex-audit.js';
import type {
  CodexRunner,
  CodexRunnerInput,
  CodexRunnerOutput,
} from '../../packages/core/src/handlers/codex-audit.js';
import type { Cem, CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeButtonDecl(overrides: Partial<CemDeclaration> = {}): CemDeclaration {
  return {
    kind: 'class',
    name: 'HxButton',
    tagName: 'hx-button',
    description: 'A button.',
    members: [
      {
        kind: 'field',
        name: 'variant',
        type: { text: 'string' },
        description: 'Variant property',
        attribute: 'variant',
      },
      {
        kind: 'field',
        name: 'disabled',
        type: { text: 'boolean' },
        description: 'Disabled state',
        attribute: 'disabled',
      },
    ],
    events: [{ name: 'hx-click', type: { text: 'CustomEvent' }, description: 'Click event' }],
    slots: [{ name: '', description: 'Default slot' }],
    cssParts: [{ name: 'base', description: 'Root part' }],
    cssProperties: [{ name: '--hx-button-bg', description: 'Background color' }],
    ...overrides,
  } as CemDeclaration;
}

function makeButtonCem(decl: CemDeclaration = makeButtonDecl()): Cem {
  return {
    schemaVersion: '1.0.0',
    modules: [{ kind: 'javascript-module', path: 'src/hx-button.ts', declarations: [decl] }],
  } as Cem;
}

function makeConfig(projectRoot: string): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot,
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

// ─── Contract surface ───────────────────────────────────────────────────────

describe('extractContractSurface', () => {
  it('returns the public attribute set in alphabetical order', () => {
    const surface = extractContractSurface(makeButtonDecl());
    expect(surface.attributes.map((a) => a.name)).toEqual(['disabled', 'variant']);
  });

  it('strips private members by leading-underscore / hash convention', () => {
    const decl = makeButtonDecl({
      members: [
        {
          kind: 'field',
          name: 'variant',
          type: { text: 'string' },
          description: 'public',
        },
        {
          kind: 'field',
          name: '_internal',
          type: { text: 'string' },
          description: 'private by convention',
        },
        {
          kind: 'field',
          name: '#secret',
          type: { text: 'string' },
          description: 'private (hash prefix)',
        },
      ],
    });
    const surface = extractContractSurface(decl);
    expect(surface.members.map((m) => m.name)).toEqual(['variant']);
  });

  it('normalizes empty / whitespace descriptions to trimmed strings', () => {
    const decl = makeButtonDecl({
      slots: [
        { name: '', description: '   ' },
        { name: 'icon', description: 'icon slot' },
      ],
    });
    const surface = extractContractSurface(decl);
    const defaultSlot = surface.slots.find((s) => s.name === '');
    expect(defaultSlot?.description).toBe('');
  });

  it('extracts mixin names and superclass when present', () => {
    const decl = makeButtonDecl({
      superclass: { name: 'BookedSolidElement', package: '@bookedsolid/base' },
      mixins: [{ name: 'FormAssociatedMixin' }, { name: 'A11yMixin' }],
    });
    const surface = extractContractSurface(decl);
    expect(surface.superclassName).toBe('BookedSolidElement');
    expect(surface.mixinNames).toEqual(['A11yMixin', 'FormAssociatedMixin']);
  });
});

describe('hashContractSurface', () => {
  it('produces the same hash regardless of CEM source key order', () => {
    // Two CEMs that differ only in member order on the same logical decl
    // must hash identically — that's the cache-stability guarantee.
    const declA = makeButtonDecl({
      members: [
        {
          kind: 'field',
          name: 'variant',
          type: { text: 'string' },
          description: 'Variant',
          attribute: 'variant',
        },
        {
          kind: 'field',
          name: 'disabled',
          type: { text: 'boolean' },
          description: 'Disabled',
          attribute: 'disabled',
        },
      ],
    });
    const declB = makeButtonDecl({
      members: [
        {
          kind: 'field',
          name: 'disabled',
          type: { text: 'boolean' },
          description: 'Disabled',
          attribute: 'disabled',
        },
        {
          kind: 'field',
          name: 'variant',
          type: { text: 'string' },
          description: 'Variant',
          attribute: 'variant',
        },
      ],
    });
    expect(hashContractSurface(extractContractSurface(declA))).toBe(
      hashContractSurface(extractContractSurface(declB)),
    );
  });

  it('produces a different hash when the public surface changes', () => {
    const a = hashContractSurface(extractContractSurface(makeButtonDecl()));
    const b = hashContractSurface(
      extractContractSurface(
        makeButtonDecl({
          members: [
            {
              kind: 'field',
              name: 'variant',
              type: { text: 'string' },
              description: 'Variant',
              attribute: 'variant',
            },
            {
              kind: 'field',
              name: 'disabled',
              type: { text: 'boolean' },
              description: 'Disabled',
              attribute: 'disabled',
            },
            // Added one attribute → surface changed → hash must change.
            {
              kind: 'field',
              name: 'loading',
              type: { text: 'boolean' },
              description: 'Loading state',
              attribute: 'loading',
            },
          ],
        }),
      ),
    );
    expect(a).not.toBe(b);
  });

  it('ignores private member additions (they are stripped from surface)', () => {
    const a = hashContractSurface(extractContractSurface(makeButtonDecl()));
    const b = hashContractSurface(
      extractContractSurface(
        makeButtonDecl({
          members: [
            // All the original public members preserved verbatim.
            {
              kind: 'field',
              name: 'variant',
              type: { text: 'string' },
              description: 'Variant property',
              attribute: 'variant',
            },
            {
              kind: 'field',
              name: 'disabled',
              type: { text: 'boolean' },
              description: 'Disabled state',
              attribute: 'disabled',
            },
            // Plus a private member — must not affect hash.
            {
              kind: 'field',
              name: '_state',
              type: { text: 'unknown' },
              description: 'internal',
            },
          ],
        }),
      ),
    );
    expect(a).toBe(b);
  });
});

// ─── Cache ──────────────────────────────────────────────────────────────────

describe('audit-cache', () => {
  let auditsRoot: string;

  beforeEach(() => {
    auditsRoot = mkdtempSync(join(tmpdir(), 'helixir-m3-cache-'));
  });
  afterEach(() => {
    rmSync(auditsRoot, { recursive: true, force: true });
  });

  function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
    return {
      schemaVersion: 1,
      tagName: 'hx-button',
      surfaceHash: 'abc123',
      generatedAt: '2026-05-03T10:00:00.000Z',
      verdict: 'pass',
      findings: [],
      source: 'codex',
      ...overrides,
    };
  }

  it('returns null on cache miss', () => {
    expect(readCachedAudit(auditsRoot, 'hx-button', 'abc123')).toBeNull();
  });

  it('writes and reads back an audit entry by surface hash', () => {
    writeAudit(auditsRoot, entry());
    const read = readCachedAudit(auditsRoot, 'hx-button', 'abc123');
    expect(read).not.toBeNull();
    expect(read?.tagName).toBe('hx-button');
    expect(read?.source).toBe('cached');
  });

  it('writes both .json and .md artifacts on disk', () => {
    writeAudit(auditsRoot, entry());
    const dir = join(auditsRoot, 'hx-button');
    const files = readdirSync(dir) as string[];
    expect(files.some((f) => f.endsWith('.json') && f !== 'index.json')).toBe(true);
    expect(files.some((f) => f.endsWith('.md'))).toBe(true);
    expect(files).toContain('index.json');
  });

  it('treats a different surface hash as a cache miss', () => {
    writeAudit(auditsRoot, entry({ surfaceHash: 'old-hash' }));
    expect(readCachedAudit(auditsRoot, 'hx-button', 'new-hash')).toBeNull();
  });

  it('lists audited surfaces and components', () => {
    writeAudit(auditsRoot, entry({ surfaceHash: 'h1' }));
    writeAudit(auditsRoot, entry({ surfaceHash: 'h2' }));
    writeAudit(auditsRoot, entry({ tagName: 'hx-card', surfaceHash: 'h3' }));

    expect(listAuditedSurfaces(auditsRoot, 'hx-button').sort()).toEqual(['h1', 'h2']);
    expect(listAuditedComponents(auditsRoot)).toEqual(['hx-button', 'hx-card']);
  });

  it('rejects content-addressed mismatch (hand-edited audit file)', () => {
    writeAudit(auditsRoot, entry({ surfaceHash: 'h1' }));
    // Tamper with the on-disk file: stored hash no longer matches.
    const dir = join(auditsRoot, 'hx-button');
    const files = (readdirSync(dir) as string[]).filter(
      (f) => f.endsWith('.json') && f !== 'index.json',
    );
    expect(files).toHaveLength(1);
    const tamperedPath = join(dir, files[0] as string);
    const data = JSON.parse(readFileSync(tamperedPath, 'utf-8')) as AuditEntry;
    data.surfaceHash = 'tampered';
    writeFileSync(tamperedPath, JSON.stringify(data));

    // Cache lookup with the original hash now misses (content-address mismatch).
    expect(readCachedAudit(auditsRoot, 'hx-button', 'h1')).toBeNull();
  });
});

// ─── Pipeline orchestration ─────────────────────────────────────────────────

describe('auditComponentWithCodex', () => {
  let projectRoot: string;
  // Project-relative auditsRoot — the handler enforces containment
  // and rejects absolute paths per codex round-32 P1.
  const auditsRoot = 'audits';
  let auditsRootAbs: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'helixir-m3-pipe-'));
    auditsRootAbs = join(projectRoot, 'audits');
  });
  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('throws NOT_FOUND when the tag is missing from the CEM', async () => {
    await expect(
      auditComponentWithCodex(makeConfig(projectRoot), 'hx-missing', makeButtonCem(), {
        runCodex: async () => ({ verdict: 'pass', findings: [] }),
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('runs the injected codex runner when no cache exists', async () => {
    let calls = 0;
    const runner: CodexRunner = async () => {
      calls++;
      return {
        verdict: 'concerns',
        findings: [
          {
            severity: 'P2',
            classId: '01-token-deprecated-alias',
            title: 'Test finding',
            body: 'body',
            file: null,
            line: null,
          },
        ],
      };
    };
    const result = await auditComponentWithCodex(
      makeConfig(projectRoot),
      'hx-button',
      makeButtonCem(),
      { runCodex: runner, auditsRoot },
    );
    expect(calls).toBe(1);
    expect(result.cacheHit).toBe(false);
    expect(result.entry.findings).toHaveLength(1);
    expect(result.entry.findings[0]?.classId).toBe('01-token-deprecated-alias');
  });

  it('returns the cached result on second invocation with same surface', async () => {
    let calls = 0;
    const runner: CodexRunner = async () => {
      calls++;
      return { verdict: 'pass', findings: [] };
    };
    const cfg = makeConfig(projectRoot);
    const cem = makeButtonCem();
    const first = await auditComponentWithCodex(cfg, 'hx-button', cem, {
      runCodex: runner,
      auditsRoot,
    });
    const second = await auditComponentWithCodex(cfg, 'hx-button', cem, {
      runCodex: runner,
      auditsRoot,
    });
    expect(calls).toBe(1);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.entry.surfaceHash).toBe(first.entry.surfaceHash);
  });

  it('forces a fresh run when force: true', async () => {
    let calls = 0;
    const runner: CodexRunner = async () => {
      calls++;
      return { verdict: 'pass', findings: [] };
    };
    const cfg = makeConfig(projectRoot);
    const cem = makeButtonCem();
    await auditComponentWithCodex(cfg, 'hx-button', cem, { runCodex: runner, auditsRoot });
    await auditComponentWithCodex(cfg, 'hx-button', cem, {
      runCodex: runner,
      auditsRoot,
      force: true,
    });
    expect(calls).toBe(2);
  });

  it('re-runs codex when the contract surface changes', async () => {
    let calls = 0;
    const runner: CodexRunner = async () => {
      calls++;
      return { verdict: 'pass', findings: [] };
    };
    const cfg = makeConfig(projectRoot);
    const cem1 = makeButtonCem();
    await auditComponentWithCodex(cfg, 'hx-button', cem1, { runCodex: runner, auditsRoot });

    // Change the public surface — different hash → cache miss.
    const cem2 = makeButtonCem(
      makeButtonDecl({
        members: [
          {
            kind: 'field',
            name: 'variant',
            type: { text: 'string' },
            description: 'Variant',
            attribute: 'variant',
          },
          {
            kind: 'field',
            name: 'disabled',
            type: { text: 'boolean' },
            description: 'Disabled',
            attribute: 'disabled',
          },
          {
            kind: 'field',
            name: 'loading',
            type: { text: 'boolean' },
            description: 'Loading',
            attribute: 'loading',
          },
        ],
      }),
    );
    const second = await auditComponentWithCodex(cfg, 'hx-button', cem2, {
      runCodex: runner,
      auditsRoot,
    });
    expect(calls).toBe(2);
    expect(second.cacheHit).toBe(false);
  });

  it('writes audit entries the cache can later read', async () => {
    const cfg = makeConfig(projectRoot);
    const cem = makeButtonCem();
    const runner: CodexRunner = async (input: CodexRunnerInput): Promise<CodexRunnerOutput> => ({
      verdict: 'pass',
      findings: [],
      reviewText: `audited ${input.tagName}`,
    });
    const result = await auditComponentWithCodex(cfg, 'hx-button', cem, {
      runCodex: runner,
      auditsRoot,
    });
    // Direct on-disk verification uses the absolute resolved path.
    expect(existsSync(join(auditsRootAbs, 'hx-button', 'index.json'))).toBe(true);
    const read = readCachedAudit(auditsRootAbs, 'hx-button', result.entry.surfaceHash);
    expect(read?.reviewText).toBe('audited hx-button');
  });
});

// ─── Prompt rendering ───────────────────────────────────────────────────────

describe('renderAuditPrompt', () => {
  it('includes the contract surface as canonical JSON', () => {
    const surface = extractContractSurface(makeButtonDecl());
    const prompt = renderAuditPrompt(surface);
    expect(prompt).toContain('hx-button');
    expect(prompt).toContain('"hx-click"');
    expect(prompt).toContain('## Defect classes to evaluate');
    expect(prompt).toContain('## Output schema');
  });

  it('declares the verdict rules so codex stays consistent across runs', () => {
    const prompt = renderAuditPrompt(extractContractSurface(makeButtonDecl()));
    expect(prompt).toContain('`pass`');
    expect(prompt).toContain('`concerns`');
    expect(prompt).toContain('`blocking`');
  });
});

// ─── Codex output parser ────────────────────────────────────────────────────

describe('parseCodexFindings', () => {
  it('derives the verdict from the parsed findings (codex round-29 P2)', () => {
    // Codex sometimes ships P1 findings alongside `verdict: 'pass'`.
    // Pinned per round-29: trust the findings, not the verdict claim.
    // P1 finding → blocking, regardless of what codex's verdict said.
    const parsed = parseCodexFindings({
      verdict: 'pass', // contradicts the P1 below
      findings: [
        {
          severity: 'P1',
          classId: '05-aria-regression',
          title: 'ARIA dropped',
          body: 'subclass moves role',
          file: 'src/x.ts',
          line: 42,
        },
      ],
      reviewText: 'short summary',
    });
    expect(parsed.verdict).toBe('blocking');
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]?.classId).toBe('05-aria-regression');
    expect(parsed.reviewText).toBe('short summary');
  });

  it('returns pass when there are zero findings', () => {
    const parsed = parseCodexFindings({ verdict: 'pass', findings: [] });
    expect(parsed.verdict).toBe('pass');
  });

  it('returns concerns for P2 / P3 findings only', () => {
    const parsed = parseCodexFindings({
      verdict: 'pass',
      findings: [{ severity: 'P2', title: 'x', body: 'y' }],
    });
    expect(parsed.verdict).toBe('concerns');
  });

  it('defaults invalid severities to P3', () => {
    const parsed = parseCodexFindings({
      verdict: 'maybe',
      findings: [{ severity: 'critical', title: 'x', body: 'y' }],
    });
    // P3 finding → concerns verdict.
    expect(parsed.verdict).toBe('concerns');
    expect(parsed.findings[0]?.severity).toBe('P3');
  });

  it('throws on non-object input', () => {
    expect(() => parseCodexFindings(null)).toThrow();
    expect(() => parseCodexFindings('not an object')).toThrow();
  });
});
