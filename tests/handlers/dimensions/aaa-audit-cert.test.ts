import { describe, it, expect } from 'vitest';
import { scoreAaaAuditSelfCertification } from '../../../packages/core/src/handlers/dimensions/aaa-audit-cert.js';
import { bareDecl, buildEvidence } from './_fixture-helpers.js';

const NINE_SC = [
  '1.4.6',
  '1.4.11',
  '2.1.3',
  '2.3.3',
  '2.4.7',
  '2.4.11',
  '2.4.13',
  '2.5.5',
  '3.2.5',
];

const supportedSnapshot = () => ({
  certified: true,
  criteria: NINE_SC,
  perCriterion: Object.fromEntries(NINE_SC.map((sc) => [sc, { verdict: 'Supports' as const }])),
});

describe('scoreAaaAuditSelfCertification', () => {
  it('returns 100/verified when audit md path fresh AND cert verified', () => {
    const decl = bareDecl('hx-good');
    const ev = buildEvidence(decl, {
      verdictSnapshot: supportedSnapshot(),
      auditMdPath: '/abs/path/AAA-AUDIT.md',
      auditMdFresh: true,
    });
    const result = scoreAaaAuditSelfCertification(decl, ev);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('verified');
    expect(result.notes).toContain('aaa-cert-fresh-and-supported');
  });

  it('returns 50/verified when audit md is stale', () => {
    const decl = bareDecl('hx-stale');
    const ev = buildEvidence(decl, {
      verdictSnapshot: supportedSnapshot(),
      auditMdPath: '/abs/path/AAA-AUDIT.md',
      auditMdFresh: false,
    });
    const result = scoreAaaAuditSelfCertification(decl, ev);
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('verified');
    expect(result.notes).toContain('aaa-audit-md-stale');
  });

  it('returns 50/heuristic when cert claimed but no audit md sidecar', () => {
    const decl = bareDecl('hx-noaudit');
    const ev = buildEvidence(decl, { verdictSnapshot: supportedSnapshot() });
    const result = scoreAaaAuditSelfCertification(decl, ev);
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('heuristic');
    expect(result.notes).toContain('cert-claimed-without-audit-md-sidecar');
  });

  it('returns 0/untested with no evidence — informational only', () => {
    const decl = bareDecl('x-nothing');
    const ev = buildEvidence(decl);
    const result = scoreAaaAuditSelfCertification(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('untested');
    expect(result.measured).toBe(false);
  });

  it('returns 50/heuristic when audit md present + fresh but no cert claim', () => {
    const decl = bareDecl('x-audit-only');
    const ev = buildEvidence(decl, {
      auditMdPath: '/abs/path/AAA-AUDIT.md',
      auditMdFresh: true,
    });
    const result = scoreAaaAuditSelfCertification(decl, ev);
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('heuristic');
    expect(result.notes).toContain('audit-md-present-but-no-cert-claim');
  });

  it('treats verdictSnapshot.certified=false as no-cert (falls to other branches)', () => {
    const decl = bareDecl('hx-uncertified');
    const ev = buildEvidence(decl, {
      verdictSnapshot: { certified: false, criteria: [], perCriterion: {} },
    });
    const result = scoreAaaAuditSelfCertification(decl, ev);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('untested');
  });

  it('empty string auditMdPath is treated as absent', () => {
    const decl = bareDecl('x-empty');
    const ev = buildEvidence(decl, {
      verdictSnapshot: supportedSnapshot(),
      auditMdPath: '',
      auditMdFresh: true,
    });
    const result = scoreAaaAuditSelfCertification(decl, ev);
    // empty path is treated as no audit; cert is true → 50/heuristic
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('heuristic');
    expect(result.notes).toContain('cert-claimed-without-audit-md-sidecar');
  });

  it('audit md path present but freshness undefined → treated as not fresh', () => {
    const decl = bareDecl('hx-no-fresh');
    const ev = buildEvidence(decl, {
      verdictSnapshot: supportedSnapshot(),
      auditMdPath: '/abs/path/AAA-AUDIT.md',
    });
    const result = scoreAaaAuditSelfCertification(decl, ev);
    expect(result.score).toBe(50);
    expect(result.notes).toContain('aaa-audit-md-stale');
  });

  it('measured:true on all paths except the trailing untested branch', () => {
    const decl = bareDecl('x-paths');
    const r1 = scoreAaaAuditSelfCertification(
      decl,
      buildEvidence(decl, {
        verdictSnapshot: supportedSnapshot(),
        auditMdPath: '/x.md',
        auditMdFresh: true,
      }),
    );
    const r2 = scoreAaaAuditSelfCertification(
      decl,
      buildEvidence(decl, { verdictSnapshot: supportedSnapshot() }),
    );
    expect(r1.measured).toBe(true);
    expect(r2.measured).toBe(true);
    expect(scoreAaaAuditSelfCertification(decl, buildEvidence(decl)).measured).toBe(false);
  });
});
