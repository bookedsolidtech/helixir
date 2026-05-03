import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComponentHealth {
  name: string;
  score: number;
  grade: string;
  details?: Record<string, unknown>;
}

interface HealthOutput {
  components: ComponentHealth[];
  summary?: {
    average: number;
    passing: number;
    failing: number;
  };
}

interface BreakingChange {
  component: string;
  type: string;
  description: string;
  severity: 'breaking' | 'minor';
}

interface DiffOutput {
  breaking: BreakingChange[];
  minor: BreakingChange[];
  added: string[];
  removed: string[];
  /**
   * Components for which the base CEM could not be loaded — diff
   * cannot be computed. Treat as not-yet-checked, NOT as clean.
   * Codex round-58 P1.
   */
  indeterminate?: Array<{ tag: string; baseUnavailableReason: string | null }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInput(name: string, fallback?: string): string {
  const val = core.getInput(name);
  return val || fallback || '';
}

function getBooleanInput(name: string, fallback = false): boolean {
  const val = core.getInput(name).toLowerCase();
  if (val === 'true') return true;
  if (val === 'false') return false;
  return fallback;
}

async function runCli(
  args: string[],
  silent = false,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let stdout = '';
  let stderr = '';

  const exitCode = await exec.exec('npx', ['helixir', ...args], {
    silent,
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
      stderr: (data: Buffer) => {
        stderr += data.toString();
      },
    },
  });

  if (!silent && stderr) {
    core.debug(`helixir stderr: ${stderr}`);
  }

  return { stdout, stderr, exitCode };
}

function parseJsonSafe<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ─── Comment builders ─────────────────────────────────────────────────────────

function buildHealthTable(components: ComponentHealth[], threshold: number): string {
  const rows = components
    .map((c) => {
      const icon = c.score >= threshold ? '✅' : '❌';
      const bar = buildSparkbar(c.score);
      return `| ${icon} | \`${c.name}\` | ${c.score} | ${c.grade} | ${bar} |`;
    })
    .join('\n');

  return `| | Component | Score | Grade | Health |\n|---|---|---|---|---|\n${rows}`;
}

function buildSparkbar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function buildBreakingChangesSection(diff: DiffOutput): string {
  // Defensive: the multi-component CLI shape (`{breaking, indeterminate}`)
  // omits `minor` / `added` / `removed`, so default each array. Codex
  // round-59 P2 — without this, the comment builder threw TypeError
  // on `diff.minor.length`.
  const breaking = diff.breaking ?? [];
  const minor = diff.minor ?? [];
  const indeterminate = diff.indeterminate ?? [];

  if (breaking.length === 0 && minor.length === 0 && indeterminate.length === 0) {
    return '### Breaking Changes\n\n✅ No breaking changes detected.';
  }

  const lines: string[] = ['### Breaking Changes'];

  if (breaking.length > 0) {
    lines.push('\n**🚨 Breaking:**');
    breaking.forEach((c) => {
      // Tolerate both shapes:
      //  - rich BreakingChange { component, description, type }
      //  - CLI multi-tag { tag, change }
      const anyC = c as unknown as {
        component?: string;
        description?: string;
        type?: string;
        tag?: string;
        change?: string;
      };
      const name = anyC.component ?? anyC.tag ?? '<unknown>';
      const desc = anyC.description ?? anyC.change ?? '';
      const tag = anyC.type ?? '';
      lines.push(`- \`${name}\`: ${desc}${tag ? ` *(${tag})*` : ''}`);
    });
  }

  if (minor.length > 0) {
    lines.push('\n**⚠️ Minor:**');
    minor.forEach((c) => {
      lines.push(`- \`${c.component}\`: ${c.description} *(${c.type})*`);
    });
  }

  if (indeterminate.length > 0) {
    lines.push(
      '\n**❓ Indeterminate (base CEM unavailable — treat as not-yet-checked, NOT as clean):**',
    );
    indeterminate.forEach((c) => {
      lines.push(`- \`${c.tag}\`: ${c.baseUnavailableReason ?? '<no reason given>'}`);
    });
  }

  return lines.join('\n');
}

function buildComment(
  healthData: HealthOutput | null,
  diffData: DiffOutput | null,
  checks: string[],
  threshold: number,
): string {
  const sections: string[] = ['## 🔍 helixir Quality Gate Report'];

  if (checks.includes('health') && healthData) {
    const { components } = healthData;
    const avg = components.length
      ? Math.round(components.reduce((s, c) => s + c.score, 0) / components.length)
      : 0;
    const failing = components.filter((c) => c.score < threshold).length;
    const statusIcon = failing === 0 ? '✅' : '❌';

    sections.push(
      `### ${statusIcon} Health Scores (threshold: ${threshold})\n\n` +
        `**Average: ${avg}** | Passing: ${components.length - failing} | Failing: ${failing}\n\n` +
        buildHealthTable(components, threshold),
    );
  }

  if (checks.includes('breaking-changes') && diffData) {
    sections.push(buildBreakingChangesSection(diffData));
  }

  if (checks.includes('accessibility') && healthData) {
    const a11yComponents = healthData.components.filter(
      (c) => c.details && 'accessibility' in c.details,
    );
    if (a11yComponents.length > 0) {
      sections.push('### ♿ Accessibility');
      const rows = a11yComponents
        .map((c) => {
          const a11y = c.details?.['accessibility'] as { grade?: string } | undefined;
          return `| \`${c.name}\` | ${a11y?.grade ?? 'N/A'} |`;
        })
        .join('\n');
      sections.push(`| Component | A11y Grade |\n|---|---|\n${rows}`);
    }
  }

  sections.push(
    `\n---\n*Generated by [helixir](https://github.com/bookedsolidtech/helixir) · ${new Date().toISOString()}*`,
  );

  return sections.join('\n\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  try {
    const checksRaw = getInput('checks', 'health,breaking-changes,accessibility');
    const checks = checksRaw
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const threshold = parseInt(getInput('health-threshold', '70'), 10);
    const failOnBreaking = getBooleanInput('fail-on-breaking', true);
    const failOnWarning = getBooleanInput('fail-on-warning', false);
    const postComment = getBooleanInput('comment', true);
    const configPath = getInput('config-path', '');

    core.info(`Running helixir quality gates: ${checks.join(', ')}`);
    core.info(`Health threshold: ${threshold}, Fail on breaking: ${failOnBreaking}`);

    const baseArgs = configPath ? ['--config', configPath] : [];

    // ── Health check ─────────────────────────────────────────────────────────
    let healthData: HealthOutput | null = null;
    if (checks.includes('health') || checks.includes('accessibility')) {
      const { stdout, exitCode } = await runCli(
        ['health', '--ci', '--format', 'json', ...baseArgs],
        true,
      );

      if (exitCode === 0 && stdout) {
        healthData = parseJsonSafe<HealthOutput>(stdout);
        if (!healthData) {
          core.warning('Could not parse health output as JSON');
        }
      } else {
        core.warning(`helixir health exited with code ${exitCode}`);
      }
    }

    // ── Breaking changes diff ─────────────────────────────────────────────────
    let diffData: DiffOutput | null = null;
    let diffParseFailed = false;
    if (checks.includes('breaking-changes')) {
      const baseRef = process.env['GITHUB_BASE_REF'] ?? '';
      if (!baseRef) {
        core.warning('GITHUB_BASE_REF not set — skipping breaking-changes check');
      } else {
        const { stdout, exitCode } = await runCli(
          ['diff', '--base', baseRef, '--ci', '--format', 'json', ...baseArgs],
          true,
        );

        // Parse JSON regardless of exit code. The CLI 0.6+ stdout is
        // `{ schemaVersion, breaking, indeterminate }`. Older CLIs
        // emitted either a top-level array (legacy ≤0.4) or
        // `{ breaking, indeterminate }` (transitional 0.5). Normalize
        // all three into the action's DiffOutput. Codex round-58 P1 /
        // round-63 P1 / round-69 P1.
        diffParseFailed = false;
        if (stdout) {
          const parsed = parseJsonSafe<unknown>(stdout);
          if (parsed === null) {
            diffParseFailed = true;
            core.warning(
              `Could not parse diff output as JSON (exit code ${exitCode}). Treating as failure to avoid silent pass.`,
            );
          } else if (Array.isArray(parsed)) {
            // Legacy shape: top-level array of breaking changes.
            diffData = {
              breaking: parsed as BreakingChange[],
              minor: [],
              added: [],
              removed: [],
              indeterminate: [],
            };
          } else if (typeof parsed === 'object') {
            const obj = parsed as DiffOutput;
            diffData = {
              ...obj,
              indeterminate: obj.indeterminate ?? [],
            };
          } else {
            diffParseFailed = true;
            core.warning(
              `helixir diff JSON was neither array nor object (exit code ${exitCode}). Treating as failure.`,
            );
          }
        } else if (exitCode !== 0) {
          diffParseFailed = true;
          core.warning(
            `helixir diff exited with code ${exitCode} with no stdout — treating as failure.`,
          );
        }
      }
    }

    // ── Set outputs ───────────────────────────────────────────────────────────
    const components = healthData?.components ?? [];
    const failingComponents = components.filter((c) => c.score < threshold);
    const hasBreaking = (diffData?.breaking ?? []).length > 0;
    const hasWarnings = (diffData?.minor ?? []).length > 0;
    const hasIndeterminate = (diffData?.indeterminate ?? []).length > 0;

    const avgScore = components.length
      ? Math.round(components.reduce((s, c) => s + c.score, 0) / components.length)
      : -1;

    core.setOutput('health-score', avgScore >= 0 ? String(avgScore) : '');
    core.setOutput('failing-components', String(failingComponents.length));
    core.setOutput('breaking-changes-count', String((diffData?.breaking ?? []).length));
    core.setOutput('indeterminate-diffs-count', String((diffData?.indeterminate ?? []).length));
    if (hasIndeterminate) {
      core.warning(
        `${(diffData?.indeterminate ?? []).length} component(s) returned INDETERMINATE diffs — base CEM unavailable. Treating as quality-gate failure.`,
      );
    }
    core.setOutput(
      'passed',
      String(
        failingComponents.length === 0 &&
          (!failOnBreaking || !hasBreaking) &&
          (!failOnWarning || !hasWarnings) &&
          // Indeterminate diffs are never a pass — silence is not safety.
          // Codex round-58 P1.
          !hasIndeterminate &&
          // Diff parse failure is also never a pass — the check never
          // ran. Without this, downstream workflows reading
          // steps.helixir.outputs.passed see "true" while setFailed
          // separately fails the job. Codex round-62 P1.
          !diffParseFailed,
      ),
    );

    // ── Post PR comment ───────────────────────────────────────────────────────
    if (postComment && github.context.eventName === 'pull_request') {
      const token = process.env['GITHUB_TOKEN'];
      if (!token) {
        core.warning('GITHUB_TOKEN not set — skipping PR comment');
      } else {
        const octokit = github.getOctokit(token);
        const { owner, repo } = github.context.repo;
        const prNumber = github.context.payload.pull_request?.number;

        if (prNumber) {
          const body = buildComment(healthData, diffData, checks, threshold);

          // Find and update existing comment if present
          const { data: comments } = await octokit.rest.issues.listComments({
            owner,
            repo,
            issue_number: prNumber,
          });

          const existing = comments.find((c) => c.body?.includes('helixir Quality Gate Report'));

          if (existing) {
            await octokit.rest.issues.updateComment({
              owner,
              repo,
              comment_id: existing.id,
              body,
            });
            core.info('Updated existing PR comment');
          } else {
            await octokit.rest.issues.createComment({
              owner,
              repo,
              issue_number: prNumber,
              body,
            });
            core.info('Posted PR comment');
          }
        }
      }
    }

    // ── Fail check if thresholds exceeded ────────────────────────────────────
    if (failingComponents.length > 0) {
      const names = failingComponents.map((c) => c.name).join(', ');
      core.setFailed(
        `Health check failed: ${failingComponents.length} component(s) below threshold ${threshold}: ${names}`,
      );
      return;
    }

    if (failOnBreaking && hasBreaking) {
      const count = diffData?.breaking?.length ?? 0;
      core.setFailed(`Breaking changes detected: ${count} breaking change(s) found`);
      return;
    }

    if (failOnWarning && hasWarnings) {
      const count = diffData?.minor?.length ?? 0;
      core.setFailed(`Warning-level changes detected: ${count} minor change(s) found`);
      return;
    }

    // Diff couldn't be parsed at all (CLI exited non-zero with no
    // usable JSON, e.g. invalid config or git access failure). The
    // breaking-change check never completed — fail closed rather
    // than letting the workflow go green on empty data. Codex
    // round-61 P2.
    if (diffParseFailed) {
      core.setFailed(
        'helixir diff did not produce parseable JSON; breaking-change check did not complete. Failing closed.',
      );
      return;
    }

    // Indeterminate diffs are a hard quality-gate failure — silence is
    // not safety. Must run after the other fail-conditions and outside
    // the PR-comment block, otherwise non-PR events / comment:false
    // configs would leave the workflow green despite the indeterminate
    // state. Codex round-59 P2.
    if (hasIndeterminate) {
      const count = diffData?.indeterminate?.length ?? 0;
      core.setFailed(
        `Diff INDETERMINATE for ${count} component(s) — base CEM unavailable. Treating as quality-gate failure (silence is not safety).`,
      );
      return;
    }

    core.info('All quality gates passed ✅');
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
