/**
 * Per-component Codex Audit Pipeline (M3)
 *
 * Orchestrates a structured codex review against a single component's
 * contract surface. Produces a deterministic audit verdict (or returns
 * the cached one when the surface hasn't changed).
 *
 * Pipeline:
 *   1. Find the component's CemDeclaration in the loaded CEM.
 *   2. Extract its contract surface (extractContractSurface).
 *   3. Hash the surface — that's the cache key.
 *   4. Read the cache. Hit → return cached entry, exit < 2s. Miss → continue.
 *   5. Render the codex prompt: surface + relevant defect-corpus
 *      references + helix R-round patterns.
 *   6. Invoke codex via the shared codex bridge (or accept an injected
 *      `runCodex` function for tests + non-codex CI environments).
 *   7. Parse codex output into AuditEntry.
 *   8. writeAudit → cache it for next run.
 *   9. Return the AuditEntry.
 *
 * The codex invocation is injected so:
 *   - Tests use a deterministic stub.
 *   - Environments without codex on PATH can supply their own runner
 *     (e.g. a hosted-codex HTTP wrapper).
 *   - The default runner shells out to `codex exec review --json`,
 *     same shape rea's push-gate uses.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { McpWcConfig } from '../config.js';
import type { Cem, CemDeclaration } from './cem.js';
import { CemSchema } from './cem.js';
import { extractContractSurface, hashContractSurface } from './contract-surface.js';
import type { ContractSurface } from './contract-surface.js';
import {
  readCachedAudit,
  writeAudit,
  type AuditEntry,
  type AuditFinding,
  type AuditSeverity,
  type AuditVerdict,
} from './audit-cache.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

// ─── Public types ───────────────────────────────────────────────────────────

export interface AuditComponentOptions {
  /**
   * Override the audits-output root. Defaults to `<projectRoot>/audits/`.
   * Useful for tests and for repos that prefer a different layout.
   */
  auditsRoot?: string;
  /**
   * If true, ignore the cache and force a fresh codex run. The result
   * is still written back to the cache.
   */
  force?: boolean;
  /**
   * Inject a codex runner for tests / non-codex environments. When
   * omitted, the default `runCodexExec` shells out to the codex CLI.
   */
  runCodex?: CodexRunner;
}

export interface AuditComponentResult {
  entry: AuditEntry;
  cacheHit: boolean;
}

/**
 * Function that takes a structured prompt + context and returns codex's
 * verdict + findings. Returning a Promise keeps both shell-out and
 * remote-API runners possible.
 */
export type CodexRunner = (input: CodexRunnerInput) => Promise<CodexRunnerOutput>;

export interface CodexRunnerInput {
  tagName: string;
  surface: ContractSurface;
  /** Pre-rendered prompt text, ready for codex. */
  prompt: string;
}

export interface CodexRunnerOutput {
  verdict: AuditVerdict;
  findings: AuditFinding[];
  reviewText?: string;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run (or cache-hit) a per-component codex audit.
 *
 * Returns `cacheHit: true` when the prior audit was reused. Cached
 * audits return in milliseconds; fresh codex runs take seconds.
 */
export async function auditComponentWithCodex(
  config: McpWcConfig,
  tagName: string,
  cemOrPath: Cem | undefined,
  options: AuditComponentOptions = {},
): Promise<AuditComponentResult> {
  const cem = cemOrPath ?? (await loadCemFromConfig(config));
  const decl = findComponentDecl(cem, tagName);
  if (decl === null) {
    throw new MCPError(`Component "${tagName}" not found in CEM.`, ErrorCategory.NOT_FOUND);
  }

  const surface = extractContractSurface(decl);
  const surfaceHash = hashContractSurface(surface);
  const auditsRoot = resolve(config.projectRoot, options.auditsRoot ?? 'audits');

  if (!options.force) {
    const cached = readCachedAudit(auditsRoot, tagName, surfaceHash);
    if (cached !== null) {
      return { entry: cached, cacheHit: true };
    }
  }

  const prompt = renderAuditPrompt(surface);
  const runner = options.runCodex ?? defaultCodexRunner;
  const codexResult = await runner({ tagName, surface, prompt });

  // Detect fallback runs (codex CLI missing or output unparseable).
  // The fallback emits a single P3 finding with `classId: null` and
  // `title` starting with "Codex audit unavailable". Skip the cache
  // write for these so a later real codex run isn't blocked by the
  // poisoned-cache hit. Codex round-27 P2.
  const isFallback =
    codexResult.findings.length === 1 &&
    codexResult.findings[0]?.classId === null &&
    /^Codex audit unavailable/.test(codexResult.findings[0]?.title ?? '');

  const entry: AuditEntry = {
    schemaVersion: 1,
    tagName,
    surfaceHash,
    generatedAt: new Date().toISOString(),
    verdict: codexResult.verdict,
    findings: codexResult.findings,
    source: isFallback ? 'manual' : 'codex',
    ...(codexResult.reviewText !== undefined ? { reviewText: codexResult.reviewText } : {}),
  };

  // Only write to the cache for real audits — fallbacks return the
  // result inline so consumers see the warning, but the next call
  // (after codex install) gets a fresh attempt instead of hitting
  // the poisoned cache.
  if (!isFallback) {
    writeAudit(auditsRoot, entry);
  }

  return { entry, cacheHit: false };
}

// ─── Prompt rendering ───────────────────────────────────────────────────────

/**
 * Render the structured codex prompt for one component. Pinned format
 * so codex sees a consistent prompt across runs (reduces flip risk —
 * see the rea push-gate runbook on codex non-determinism).
 */
export function renderAuditPrompt(surface: ContractSurface): string {
  const lines: string[] = [];
  lines.push(`# Per-component audit — ${surface.tagName}`);
  lines.push('');
  lines.push(
    'You are auditing one helix-pattern web component for defects across the helix R12-R32 patterns. Limit your review to the contract surface below — do not invent issues outside it.',
  );
  lines.push('');
  lines.push('## Defect classes to evaluate');
  lines.push(
    'Refer to the helix defect-class corpus at `bst-cto-kb/Projects/HELiXiR/Audits/defect-corpus/` (classes 01–14). For each defect class that applies to this component, return a finding with the class id (e.g. `05-aria-regression`).',
  );
  lines.push('');
  lines.push('## Verdict rules');
  lines.push('- `pass` when no findings P1 or P2 are present.');
  lines.push('- `concerns` when P2/P3 findings exist but no P1.');
  lines.push('- `blocking` when at least one P1 finding exists.');
  lines.push('');
  lines.push('## Contract surface (canonical JSON)');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(surface, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Output schema (strict JSON)');
  lines.push('Return ONLY a JSON object with this shape:');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        verdict: 'pass | concerns | blocking',
        reviewText: 'optional short summary',
        findings: [
          {
            severity: 'P1 | P2 | P3',
            classId: '05-aria-regression | null',
            title: 'short title',
            body: 'detailed finding body',
            file: 'optional source path',
            line: 'optional line number (integer) or null',
          },
        ],
      },
      null,
      2,
    ),
  );
  lines.push('```');
  return lines.join('\n');
}

// ─── Default codex runner (shell-out) ───────────────────────────────────────

/**
 * Default codex runner — shells out to `codex exec review --json` and
 * pipes the prompt over stdin. Same invocation shape rea uses for the
 * push-gate. When the codex CLI isn't on PATH or returns a non-zero
 * exit, falls back to a `concerns`-verdict result with a single
 * self-flagging finding so consumers get a usable cache entry instead
 * of the entire MCP call erroring out.
 */
const defaultCodexRunner: CodexRunner = async (input) => {
  const { spawn } = await import('node:child_process');
  return new Promise((resolveRun) => {
    let stdout = '';
    let stderr = '';
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn('codex', ['exec', 'review', '--json'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30 * 60 * 1000,
      });
    } catch (err) {
      resolveRun(fallbackResult(`codex CLI not available: ${String(err)}`));
      return;
    }
    proc.on('error', (err) => {
      resolveRun(fallbackResult(`codex CLI not available: ${String(err)}`));
    });
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        resolveRun(fallbackResult(`codex exit ${String(code)}: ${stderr.slice(0, 200)}`));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stdout);
        resolveRun(parseCodexFindings(parsed));
      } catch (err) {
        resolveRun(fallbackResult(`codex output unparseable: ${String(err)}`));
      }
    });
    proc.stdin?.write(input.prompt);
    proc.stdin?.end();
  });
};

function fallbackResult(reason: string): CodexRunnerOutput {
  return {
    verdict: 'concerns',
    findings: [
      {
        severity: 'P3',
        classId: null,
        title: 'Codex audit unavailable — fallback result emitted',
        body: `The default codex runner could not produce a verdict. Reason: ${reason}\n\nInstall the codex CLI (\`npm i -g @openai/codex\`) or inject a custom runner via \`runCodex\` to enable real audits. The fallback unblocks downstream consumers but does NOT represent a real adversarial review.`,
        file: null,
        line: null,
      },
    ],
    reviewText: `Fallback (no real audit performed): ${reason}`,
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

async function loadCemFromConfig(config: McpWcConfig): Promise<Cem> {
  const cemAbsPath = resolve(config.projectRoot, config.cemPath);
  if (!existsSync(cemAbsPath)) {
    throw new MCPError(
      `CEM not found at ${cemAbsPath}. Configure cemPath or set MCP_WC_CEM_PATH.`,
      ErrorCategory.NOT_FOUND,
    );
  }
  const raw = await readFile(cemAbsPath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  return CemSchema.parse(parsed);
}

function findComponentDecl(cem: Cem, tagName: string): CemDeclaration | null {
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) return decl;
    }
  }
  return null;
}

/**
 * Parses codex JSON output into AuditFinding[] with severity normalization.
 * Exposed so injected runners can re-use the parser instead of
 * re-implementing it.
 */
export function parseCodexFindings(raw: unknown): {
  verdict: AuditVerdict;
  findings: AuditFinding[];
  reviewText?: string;
} {
  if (typeof raw !== 'object' || raw === null) {
    throw new MCPError('Codex returned non-object output.', ErrorCategory.VALIDATION);
  }
  const obj = raw as Record<string, unknown>;
  const verdictRaw = obj['verdict'];
  const verdict: AuditVerdict =
    verdictRaw === 'pass' || verdictRaw === 'concerns' || verdictRaw === 'blocking'
      ? verdictRaw
      : 'concerns';
  const findingsRaw = Array.isArray(obj['findings']) ? obj['findings'] : [];
  const findings: AuditFinding[] = [];
  for (const f of findingsRaw) {
    if (typeof f !== 'object' || f === null) continue;
    const fo = f as Record<string, unknown>;
    const sev = fo['severity'];
    const severity: AuditSeverity = sev === 'P1' || sev === 'P2' || sev === 'P3' ? sev : 'P3';
    findings.push({
      severity,
      classId: typeof fo['classId'] === 'string' ? (fo['classId'] as string) : null,
      title: typeof fo['title'] === 'string' ? (fo['title'] as string) : '(untitled finding)',
      body: typeof fo['body'] === 'string' ? (fo['body'] as string) : '',
      file: typeof fo['file'] === 'string' ? (fo['file'] as string) : null,
      line: typeof fo['line'] === 'number' ? (fo['line'] as number) : null,
    });
  }
  const reviewText =
    typeof obj['reviewText'] === 'string' ? (obj['reviewText'] as string) : undefined;
  return reviewText !== undefined ? { verdict, findings, reviewText } : { verdict, findings };
}
