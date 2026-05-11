import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { utimesSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import {
  detectHelixAaaEvidence,
  _resetHelixAaaEvidenceCache,
  type HelixAaaEvidence,
} from '../../../packages/core/src/handlers/evidence/helix-aaa-evidence.js';
import type { CemDeclaration } from '../../../packages/core/src/handlers/cem.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, '../../__fixtures__/helix-aaa');
const LIB_GOOD = resolve(FIXTURES, 'lib-good');
const LIB_BARE = resolve(FIXTURES, 'lib-bare');

function makeDecl(
  overrides: Partial<CemDeclaration> & { helixMeta?: unknown } = {},
): CemDeclaration {
  return {
    kind: 'class',
    name: 'HxButton',
    tagName: 'hx-button',
    ...overrides,
  } as CemDeclaration;
}

describe('detectHelixAaaEvidence', () => {
  beforeEach(() => {
    _resetHelixAaaEvidenceCache();
  });

  it('returns a minimal evidence object when no helixMeta and no libraryRoot', () => {
    const decl = makeDecl();
    const result = detectHelixAaaEvidence(decl);
    expect(result).toEqual({});
  });

  it('returns helixMeta when present but skips verdictSnapshot without libraryRoot', () => {
    const decl = makeDecl({
      helixMeta: {
        aaa: {
          certified: true,
          certifiedDate: '2026-05-08',
          criteria: ['1.4.9', '2.1.3'],
          auditUrl: 'src/components/hx-button/AAA-AUDIT.md',
        },
        keyboardContract: { activate: ['Enter', 'Space'], disabledSuppresses: true },
        ariaPattern: 'button',
        priorityTier: 'P0',
        stability: 'stable',
      },
    });
    const result = detectHelixAaaEvidence(decl);
    expect(result.helixMeta?.aaa?.certified).toBe(true);
    expect(result.helixMeta?.ariaPattern).toBe('button');
    expect(result.helixMeta?.keyboardContract?.disabledSuppresses).toBe(true);
    expect(result.verdictSnapshot).toBeUndefined();
    expect(result.sourceChecks).toBeUndefined();
  });

  it('returns full evidence including verdictSnapshot when libraryRoot present', () => {
    const decl = makeDecl({
      helixMeta: {
        aaa: {
          certified: true,
          certifiedDate: '2026-05-08',
          criteria: [],
          auditUrl: 'AAA-AUDIT.md',
        },
      },
    });
    const result = detectHelixAaaEvidence(decl, LIB_GOOD);
    expect(result.verdictSnapshot).toBeDefined();
    expect(result.verdictSnapshot?.certifiedDate).toBe('2026-05-08');
    expect(result.verdictSnapshot?.auditUrl).toBe('AAA-AUDIT.md');
    expect(result.sourceChecks).toBeDefined();
  });

  it('derives certified=true when ≥9 SCs have verdict=Supports', () => {
    const decl = makeDecl();
    const result = detectHelixAaaEvidence(decl, LIB_GOOD);
    expect(result.verdictSnapshot?.certified).toBe(true);
    expect(result.verdictSnapshot?.criteria.length).toBeGreaterThanOrEqual(9);
  });

  it('derives certified=false when fewer than 9 SCs support; excludes Not Applicable and Partially Supports from criteria', () => {
    // Build a one-off library with the verdicts-mixed.json shape inline.
    // We use the lib-bare tree (has hx-bare) and inject a verdicts file
    // tagged for `hx-bare` carrying the mixed verdicts.
    const verdictsPath = resolve(LIB_BARE, 'packages/hx-library/aaa-verdicts.json');
    writeFileSync(
      verdictsPath,
      JSON.stringify({
        components: {
          'hx-bare': {
            '1.4.9': { verdict: 'Supports' },
            '2.1.3': { verdict: 'Supports' },
            '2.3.3': { verdict: 'Not Applicable' },
            '3.2.5': { verdict: 'Not Applicable' },
            '3.3.6': { verdict: 'Not Applicable' },
            'forced-colors': { verdict: 'Not Applicable' },
            'apg-keyboard': { verdict: 'Partially Supports' },
            '1.4.6': { verdict: 'Partially Supports' },
            '2.4.12': { verdict: 'Partially Supports' },
            '2.4.13': { verdict: 'Does Not Support' },
            '2.5.5': { verdict: 'Supports' },
          },
        },
      }),
      'utf-8',
    );
    _resetHelixAaaEvidenceCache();

    const decl = makeDecl({ name: 'HxBare', tagName: 'hx-bare' });
    const result = detectHelixAaaEvidence(decl, LIB_BARE);
    expect(result.verdictSnapshot?.certified).toBe(false);
    // 3 Supports total: 1.4.9, 2.1.3, 2.5.5
    expect(result.verdictSnapshot?.criteria).toEqual(
      expect.arrayContaining(['1.4.9', '2.1.3', '2.5.5']),
    );
    expect(result.verdictSnapshot?.criteria.length).toBe(3);
    // Verify Not Applicable + Partially + Does Not Support are NOT in criteria
    expect(result.verdictSnapshot?.criteria).not.toContain('2.3.3');
    expect(result.verdictSnapshot?.criteria).not.toContain('3.2.5');
    expect(result.verdictSnapshot?.criteria).not.toContain('apg-keyboard');
    expect(result.verdictSnapshot?.criteria).not.toContain('2.4.13');
    // perCriterion preserves the raw per-SC map
    expect(result.verdictSnapshot?.perCriterion['2.3.3']?.verdict).toBe('Not Applicable');
    expect(result.verdictSnapshot?.perCriterion['2.4.13']?.verdict).toBe('Does Not Support');
  });

  it('source-check regexes match the helix-button fixture (form-associated + 2px focus-visible)', () => {
    const decl = makeDecl();
    const result = detectHelixAaaEvidence(decl, LIB_GOOD);
    expect(result.sourceChecks).toBeDefined();
    expect(result.sourceChecks?.hasStaticFormAssociated).toBe(true);
    expect(result.sourceChecks?.hasAttachInternals).toBe(true);
    expect(result.sourceChecks?.hasSetValidityCall).toBe(true);
    expect(result.sourceChecks?.hasFocusVisibleRule).toBe(true);
    expect(result.sourceChecks?.has2pxOutlineRule).toBe(true);
    expect(result.sourceChecks?.hasForcedColorsBlock).toBe(true);
  });

  it('accepts `static override formAssociated = true` (override keyword)', () => {
    // The fixture uses exactly this form. Reconfirms the regex does not require
    // the absence of the `override` modifier (helix-overclaim defect class).
    const decl = makeDecl();
    const result = detectHelixAaaEvidence(decl, LIB_GOOD);
    expect(result.sourceChecks?.hasStaticFormAssociated).toBe(true);
  });

  it('returns sourceChecks with false values for hx-bare fixture (no contract surface)', () => {
    const decl = makeDecl({ name: 'HxBare', tagName: 'hx-bare' });
    const result = detectHelixAaaEvidence(decl, LIB_BARE);
    expect(result.sourceChecks).toBeDefined();
    expect(result.sourceChecks?.hasStaticFormAssociated).toBe(false);
    expect(result.sourceChecks?.hasAttachInternals).toBe(false);
    expect(result.sourceChecks?.hasSetValidityCall).toBe(false);
    expect(result.sourceChecks?.hasFocusVisibleRule).toBe(false);
    expect(result.sourceChecks?.has2pxOutlineRule).toBe(false);
    expect(result.sourceChecks?.hasForcedColorsBlock).toBe(false);
  });

  it('returns sourceChecks=undefined when libraryRoot points at a tree without the component', () => {
    const decl = makeDecl({ tagName: 'hx-nonexistent' });
    const result = detectHelixAaaEvidence(decl, LIB_GOOD);
    expect(result.sourceChecks).toBeUndefined();
  });

  it('AAA-AUDIT.md mtime check: fresh audit → auditMdFresh=true', () => {
    const compDir = resolve(LIB_GOOD, 'packages/hx-library/src/components/hx-button');
    const sourcePath = resolve(compDir, 'hx-button.ts');
    const auditPath = resolve(compDir, 'AAA-AUDIT.md');
    if (!existsSync(auditPath)) {
      writeFileSync(auditPath, '# AAA Audit\n', 'utf-8');
    }
    // Force audit mtime to be newer than the source mtime.
    const past = new Date(Date.now() - 60_000);
    const now = new Date();
    utimesSync(sourcePath, past, past);
    utimesSync(auditPath, now, now);
    _resetHelixAaaEvidenceCache();

    const result = detectHelixAaaEvidence(makeDecl(), LIB_GOOD);
    expect(result.auditMdPath).toBe(auditPath);
    expect(result.auditMdFresh).toBe(true);
  });

  it('AAA-AUDIT.md mtime check: stale audit → auditMdFresh=false', () => {
    const compDir = resolve(LIB_GOOD, 'packages/hx-library/src/components/hx-button');
    const sourcePath = resolve(compDir, 'hx-button.ts');
    const auditPath = resolve(compDir, 'AAA-AUDIT.md');
    if (!existsSync(auditPath)) {
      writeFileSync(auditPath, '# AAA Audit\n', 'utf-8');
    }
    // Force source to be newer than audit.
    const past = new Date(Date.now() - 60_000);
    const now = new Date();
    utimesSync(auditPath, past, past);
    utimesSync(sourcePath, now, now);
    _resetHelixAaaEvidenceCache();

    const result = detectHelixAaaEvidence(makeDecl(), LIB_GOOD);
    expect(result.auditMdPath).toBe(auditPath);
    expect(result.auditMdFresh).toBe(false);
  });

  it('rejects malformed helixMeta gracefully (no crash, no helixMeta in result)', () => {
    // Missing the required `disabledSuppresses` field on keyboardContract.
    const decl = makeDecl({
      helixMeta: {
        keyboardContract: { activate: ['Enter'] },
      },
    });
    const result = detectHelixAaaEvidence(decl);
    expect(result.helixMeta).toBeUndefined();
  });

  it('handles missing tagName by skipping all libraryRoot-dependent work', () => {
    const decl = makeDecl({ tagName: undefined });
    const result = detectHelixAaaEvidence(decl, LIB_GOOD);
    expect(result.verdictSnapshot).toBeUndefined();
    expect(result.sourceChecks).toBeUndefined();
    expect(result.auditMdPath).toBeUndefined();
  });

  it('exports a HelixAaaEvidence type matching the documented contract', () => {
    // Type-only assertion — failing compilation here would surface a contract drift.
    const _evidence: HelixAaaEvidence = {
      helixMeta: {
        aaa: { certified: true, criteria: ['1.4.9'] },
        keyboardContract: { disabledSuppresses: true },
        priorityTier: 'P0',
        stability: 'stable',
      },
      verdictSnapshot: {
        certified: true,
        criteria: ['1.4.9'],
        perCriterion: { '1.4.9': { verdict: 'Supports' } },
      },
      sourceChecks: {
        hasStaticFormAssociated: true,
        hasAttachInternals: true,
        hasSetValidityCall: true,
        hasFocusVisibleRule: true,
        has2pxOutlineRule: true,
        hasForcedColorsBlock: true,
      },
      auditMdPath: '/abs/path/AAA-AUDIT.md',
      auditMdFresh: true,
    };
    expect(_evidence.verdictSnapshot?.criteria.length).toBe(1);
  });
});

// Touch unused imports so vitest doesn't flag them.
void mkdirSync;
