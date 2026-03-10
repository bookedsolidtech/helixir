import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../../packages/core/src/config.js';
import { CemSchema } from '../../packages/core/src/handlers/cem.js';
import type { Cem, CemDeclaration } from '../../packages/core/src/handlers/cem.js';
import { parseCem, diffCem, listAllComponents } from '../../packages/core/src/handlers/cem.js';
import { analyzeAccessibility } from '../../packages/core/src/handlers/accessibility.js';
import {
  scoreComponent,
  scoreAllComponents,
  getHealthTrend,
} from '../../packages/core/src/handlers/health.js';
import type { ComponentHealth } from '../../packages/core/src/handlers/health.js';
import { generateMigrationGuide } from '../../packages/core/src/handlers/migration.js';
import { suggestUsage } from '../../packages/core/src/handlers/suggest.js';
import { estimateBundleSize } from '../../packages/core/src/handlers/bundle.js';
import { getDesignTokens, findToken } from '../../packages/core/src/handlers/tokens.js';
import type { DesignToken } from '../../packages/core/src/handlers/tokens.js';
import { compareLibraries } from '../../packages/core/src/handlers/compare.js';
import { benchmarkLibraries } from '../../packages/core/src/handlers/benchmark.js';
import { validateUsage } from '../../packages/core/src/handlers/validate.js';
import { resolveCdnCem } from '../../packages/core/src/handlers/cdn.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type OutputFormat = 'table' | 'json' | 'markdown';

interface CliOptions {
  format: OutputFormat;
  ci: boolean;
  threshold: number;
  base: string;
  html: string | undefined;
  registry: 'jsdelivr' | 'unpkg';
  config: string | undefined;
  trend: boolean;
  help: boolean;
}

// ─── Table formatter (zero deps) ─────────────────────────────────────────────

export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-');
  const header = headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join(' | ');
  const body = rows.map((r) => r.map((c, i) => (c ?? '').padEnd(widths[i] ?? 0)).join(' | '));
  return [header, sep, ...body].join('\n');
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function output(data: unknown, format: OutputFormat, tableOrMarkdown?: string): void {
  if (format === 'json') {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else if (tableOrMarkdown) {
    process.stdout.write(tableOrMarkdown + '\n');
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

// ─── CEM loader ───────────────────────────────────────────────────────────────

function loadCem(cemPath: string, projectRoot: string): Cem {
  const absPath = resolve(projectRoot, cemPath);
  if (!existsSync(absPath)) {
    process.stderr.write(`Error: CEM file not found at ${absPath}\n`);
    process.exit(1);
  }
  const raw = readFileSync(absPath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  const result = CemSchema.safeParse(parsed);
  if (!result.success) {
    process.stderr.write(`Error: Invalid CEM file: ${result.error.message}\n`);
    process.exit(1);
  }
  return result.data;
}

function getAllDeclarations(cem: Cem): CemDeclaration[] {
  return cem.modules.flatMap((m) => m.declarations ?? []);
}

// ─── Help text ────────────────────────────────────────────────────────────────

const HELP_TEXT = `helixir — Web Component tooling CLI

Usage: helixir <subcommand> [options]

Subcommands:
  analyze [tag]               Analyze a component (or list all) from CEM
  health [tag]                Show health scores for component(s)
  health --trend <tag>        Show health trend over time
  diff [tag] [--base branch]  Show breaking changes vs base branch
  migrate <tag> [--base]      Generate migration guide
  suggest <tag>               Generate usage examples
  bundle <tag>                Estimate bundle size
  tokens [query]              List or search design tokens
  compare <cemA> <cemB>       Compare two CEM libraries
  benchmark <cem...>          Benchmark CEM libraries
  validate <tag> --html "..."  Validate HTML usage
  cdn <pkg> [version] [--registry]  Resolve CDN CEM for a package
  serve                       Start MCP server (stdio)
  init                        Interactive setup wizard

Options:
  --format json|table|markdown  Output format (default: table in TTY, json in pipes)
  --ci                          CI mode — non-zero exit on failures
  --threshold <n>               Health threshold for CI mode (default: 70)
  --base <branch>               Base branch for diff/migrate (default: main)
  --html "<snippet>"            HTML snippet for validate command
  --registry jsdelivr|unpkg     CDN registry (default: jsdelivr)
  --config <path>               Config file path override
  --trend                       Show health trend (with health command)
  -h, --help                    Show this help

Exit codes:
  0  Success
  1  Error
  2  Breaking changes detected (diff --ci) or health below threshold (health --ci)
`;

// ─── Subcommand handlers ──────────────────────────────────────────────────────

async function cmdAnalyze(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();
  const cem = loadCem(config.cemPath, config.projectRoot);
  const tag = args[0];

  if (tag) {
    const meta = parseCem(tag, cem);
    const decl = getAllDeclarations(cem).find((d) => d.tagName === tag);
    const accessibility = decl ? analyzeAccessibility(decl) : null;

    if (opts.format === 'json') {
      output({ metadata: meta, accessibility }, 'json');
    } else {
      const rows: string[][] = [
        ['tag', tag],
        ['name', meta.name],
        ['properties', String(meta.members.filter((m) => m.kind === 'field').length)],
        ['events', String(meta.events.length)],
        ['slots', String(meta.slots.length)],
        ['css parts', String(meta.cssParts.length)],
      ];
      if (accessibility) {
        rows.push(['aria role', accessibility.dimensions.hasAriaRole.passed ? 'yes' : 'none']);
        rows.push([
          'keyboard navigable',
          String(accessibility.dimensions.hasKeyboardEvents.passed),
        ]);
      }
      output(null, opts.format, formatTable(['Field', 'Value'], rows));
    }
  } else {
    const tags = listAllComponents(cem);
    if (opts.format === 'json') {
      output(tags, 'json');
    } else {
      output(
        null,
        opts.format,
        formatTable(
          ['Component'],
          tags.map((t) => [t]),
        ),
      );
    }
  }
}

async function cmdHealth(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();

  if (opts.trend) {
    const tag = args[0];
    if (!tag) {
      process.stderr.write('Error: --trend requires a tag name\n');
      process.exit(1);
    }
    const trend = await getHealthTrend(config, tag);
    if (opts.format === 'json') {
      output(trend, 'json');
    } else {
      const rows = trend.dataPoints.map((dp) => [dp.date, String(dp.score), dp.grade]);
      const table = formatTable(['Date', 'Score', 'Grade'], rows);
      const change =
        trend.changePercent > 0 ? `+${trend.changePercent}` : String(trend.changePercent);
      output(null, opts.format, `${table}\nTrend: ${trend.trend} (${change}%)`);
    }
    return;
  }

  const cem = loadCem(config.cemPath, config.projectRoot);
  const tag = args[0];
  let scores: ComponentHealth[];

  if (tag) {
    const decl = getAllDeclarations(cem).find((d) => d.tagName === tag);
    scores = [await scoreComponent(config, tag, decl)];
  } else {
    const decls = getAllDeclarations(cem).filter((d) => d.tagName !== undefined);
    scores = await scoreAllComponents(config, decls);
  }

  if (opts.format === 'json') {
    output(scores, 'json');
  } else {
    const rows = scores.map((s) => [s.tagName, String(s.score), s.grade, s.issues.join('; ')]);
    output(null, opts.format, formatTable(['Component', 'Score', 'Grade', 'Issues'], rows));
  }

  if (opts.ci) {
    const failing = scores.filter((s) => s.score < opts.threshold);
    if (failing.length > 0) {
      process.stderr.write(
        `CI: ${failing.length} component(s) below threshold ${opts.threshold}\n`,
      );
      process.exit(2);
    }
  }
}

async function cmdDiff(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();
  const cem = loadCem(config.cemPath, config.projectRoot);
  const tag = args[0];

  if (!tag) {
    const tags = listAllComponents(cem);
    const results = await Promise.all(tags.map((t) => diffCem(t, opts.base, config, cem)));

    const allBreaking = results.flatMap((r, i) =>
      r.breaking.map((b) => ({ tag: tags[i] as string, change: b })),
    );

    if (opts.format === 'json') {
      output(allBreaking, 'json');
    } else if (allBreaking.length === 0) {
      process.stdout.write('No breaking changes detected.\n');
    } else {
      output(
        null,
        opts.format,
        formatTable(
          ['Component', 'Breaking Change'],
          allBreaking.map((r) => [r.tag, r.change]),
        ),
      );
    }

    if (opts.ci && allBreaking.length > 0) {
      process.exit(2);
    }
    return;
  }

  const diff = await diffCem(tag, opts.base, config, cem);

  if (opts.format === 'json') {
    output(diff, 'json');
  } else if (diff.breaking.length === 0 && diff.additions.length === 0) {
    process.stdout.write(`No changes detected for <${tag}> vs ${opts.base}.\n`);
  } else {
    const rows = [
      ...diff.breaking.map((b) => ['BREAKING', b]),
      ...diff.additions.map((a) => ['added', a]),
    ];
    output(null, opts.format, formatTable(['Type', 'Change'], rows));
  }

  if (opts.ci && diff.breaking.length > 0) {
    process.exit(2);
  }
}

async function cmdMigrate(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();
  const cem = loadCem(config.cemPath, config.projectRoot);
  const tag = args[0];

  if (!tag) {
    process.stderr.write('Error: migrate requires a tag name\n');
    process.exit(1);
  }

  const guide = await generateMigrationGuide(tag, opts.base, config, cem);

  if (opts.format === 'json') {
    output(guide, 'json');
  } else {
    output(null, opts.format, guide.markdown);
  }
}

async function cmdSuggest(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();
  const cem = loadCem(config.cemPath, config.projectRoot);
  const tag = args[0];

  if (!tag) {
    process.stderr.write('Error: suggest requires a tag name\n');
    process.exit(1);
  }

  const result = await suggestUsage(tag, config, cem);

  if (opts.format === 'json') {
    output(result, 'json');
  } else {
    const sections: string[] = [`HTML:\n${result.htmlSnippet}`];
    if (result.frameworkSnippet) {
      sections.push(`${result.framework ?? 'Framework'}:\n${result.frameworkSnippet}`);
    }
    output(null, opts.format, sections.join('\n\n'));
  }
}

async function cmdBundle(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();
  const tag = args[0];

  if (!tag) {
    process.stderr.write('Error: bundle requires a tag name\n');
    process.exit(1);
  }

  const result = await estimateBundleSize(tag, config);
  const fp = result.estimates.full_package;

  if (opts.format === 'json') {
    output(result, 'json');
  } else {
    const rows: string[][] = [
      ['component', result.component],
      ['package', result.package],
      ['version', result.version],
      ['source', result.source],
      ['gzip (bytes)', fp ? String(fp.gzipped) : 'N/A'],
      ['minified (bytes)', fp ? String(fp.minified) : 'N/A'],
      ['cached', String(result.cached)],
    ];
    if (result.note) rows.push(['note', result.note]);
    output(null, opts.format, formatTable(['Field', 'Value'], rows));
  }
}

async function cmdTokens(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();
  const query = args[0];

  let tokens: DesignToken[];
  if (query) {
    tokens = await findToken(config, query);
  } else {
    tokens = await getDesignTokens(config);
  }

  if (opts.format === 'json') {
    output(tokens, 'json');
  } else {
    const rows = tokens.map((t) => [t.name, String(t.value), t.category, t.description ?? '']);
    output(null, opts.format, formatTable(['Name', 'Value', 'Category', 'Description'], rows));
  }
}

async function cmdCompare(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();
  const cemA = args[0];
  const cemB = args[1];

  if (!cemA || !cemB) {
    process.stderr.write('Error: compare requires two CEM paths\n');
    process.exit(1);
  }

  const result = await compareLibraries({ cemPathA: cemA, cemPathB: cemB }, config);

  if (opts.format === 'json') {
    output(result, 'json');
  } else {
    const rows: string[][] = [
      ['label A', result.labelA],
      ['label B', result.labelB],
      ['components A', String(result.countA)],
      ['components B', String(result.countB)],
      ['in both', String(result.inBoth.length)],
      ['only in A', String(result.onlyInA.length)],
      ['only in B', String(result.onlyInB.length)],
      ['verdict', result.verdict],
    ];
    output(null, opts.format, formatTable(['Metric', 'Value'], rows));
  }
}

async function cmdBenchmark(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();

  if (args.length === 0) {
    process.stderr.write('Error: benchmark requires at least one CEM path\n');
    process.exit(1);
  }

  const libraries = args.map((p) => ({ label: p, cemPath: p }));
  const result = await benchmarkLibraries(libraries, config);

  if (opts.format === 'json') {
    output(result.scores, 'json');
  } else {
    output(null, opts.format, result.formatted);
  }
}

async function cmdValidate(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();
  const tag = args[0];

  if (!tag) {
    process.stderr.write('Error: validate requires a tag name\n');
    process.exit(1);
  }
  if (!opts.html) {
    process.stderr.write('Error: validate requires --html "<snippet>"\n');
    process.exit(1);
  }

  const cem = loadCem(config.cemPath, config.projectRoot);
  const result = validateUsage(tag, opts.html, cem);

  if (opts.format === 'json') {
    output(result, 'json');
  } else if (result.issues.length === 0) {
    process.stdout.write('Validation passed — no issues found.\n');
  } else {
    const rows = result.issues.map((i) => [i.level, i.message]);
    output(null, opts.format, formatTable(['Level', 'Message'], rows));
  }
}

async function cmdCdn(args: string[], opts: CliOptions): Promise<void> {
  const config = loadConfig();
  const pkg = args[0];

  if (!pkg) {
    process.stderr.write('Error: cdn requires a package name\n');
    process.exit(1);
  }

  const version = args[1] ?? 'latest';
  const result = await resolveCdnCem(pkg, version, opts.registry, config);

  if (opts.format === 'json') {
    output(result, 'json');
  } else {
    const rows: string[][] = [
      ['package', pkg],
      ['version', version],
      ['registry', opts.registry],
      ['component count', String(result.componentCount)],
      ['registered', String(result.registered)],
    ];
    if (result.cachePath) rows.push(['cache path', result.cachePath]);
    output(null, opts.format, formatTable(['Field', 'Value'], rows));
  }
}

// ─── Main CLI entry point ─────────────────────────────────────────────────────

export async function runCli(): Promise<void> {
  let values: {
    format?: string;
    ci?: boolean;
    threshold?: string;
    base?: string;
    html?: string;
    registry?: string;
    config?: string;
    trend?: boolean;
    help?: boolean;
  };
  let positionals: string[];

  try {
    const result = parseArgs({
      args: process.argv.slice(2),
      options: {
        format: { type: 'string' },
        ci: { type: 'boolean' },
        threshold: { type: 'string' },
        base: { type: 'string' },
        html: { type: 'string' },
        registry: { type: 'string' },
        config: { type: 'string' },
        trend: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    });
    values = result.values;
    positionals = result.positionals;
  } catch (err) {
    process.stderr.write(`Error: ${String(err)}\n`);
    process.exit(1);
  }

  const isTTY = Boolean(process.stdout.isTTY);
  const rawFormat = values.format ?? (isTTY ? 'table' : 'json');
  const validFormats = ['table', 'json', 'markdown'] as const;
  const format: OutputFormat = (validFormats as readonly string[]).includes(rawFormat)
    ? (rawFormat as OutputFormat)
    : 'table';

  const opts: CliOptions = {
    format,
    ci: values.ci ?? false,
    threshold: parseInt(values.threshold ?? '70', 10),
    base: values.base ?? 'main',
    html: values.html,
    registry: values.registry === 'unpkg' ? 'unpkg' : 'jsdelivr',
    config: values.config,
    trend: values.trend ?? false,
    help: values.help ?? false,
  };

  if (opts.help && positionals.length === 0) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  // Override project root if --config provided
  if (opts.config) {
    process.env['MCP_WC_PROJECT_ROOT'] = resolve(process.cwd(), opts.config, '..');
  }

  const [subcommand, ...args] = positionals;

  if (!subcommand || subcommand === 'help') {
    process.stdout.write(HELP_TEXT);
    return;
  }

  try {
    switch (subcommand) {
      case 'analyze':
        await cmdAnalyze(args, opts);
        break;
      case 'health':
        await cmdHealth(args, opts);
        break;
      case 'diff':
        await cmdDiff(args, opts);
        break;
      case 'migrate':
        await cmdMigrate(args, opts);
        break;
      case 'suggest':
        await cmdSuggest(args, opts);
        break;
      case 'bundle':
        await cmdBundle(args, opts);
        break;
      case 'tokens':
        await cmdTokens(args, opts);
        break;
      case 'compare':
        await cmdCompare(args, opts);
        break;
      case 'benchmark':
        await cmdBenchmark(args, opts);
        break;
      case 'validate':
        await cmdValidate(args, opts);
        break;
      case 'cdn':
        await cmdCdn(args, opts);
        break;
      case 'init':
        await runInit();
        break;
      default:
        process.stderr.write(`Unknown subcommand: ${subcommand}\n\n`);
        process.stdout.write(HELP_TEXT);
        process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`Error: ${String(err)}\n`);
    process.exit(1);
  }
}

// ─── Init wizard (kept from original) ────────────────────────────────────────

// --- Framework detection ---

interface Framework {
  name: string;
  packages: string[];
}

const FRAMEWORKS: Framework[] = [
  { name: 'Lit 3.x', packages: ['lit'] },
  { name: 'Stencil', packages: ['@stencil/core'] },
  { name: 'Shoelace', packages: ['@shoelace-style/shoelace'] },
  { name: 'FAST Element', packages: ['@microsoft/fast-element'] },
  { name: 'Haunted', packages: ['haunted'] },
  { name: 'Hybrids', packages: ['hybrids'] },
  { name: 'Catalyst', packages: ['@github/catalyst'] },
];

function detectFramework(projectRoot: string): string | null {
  const pkgPath = resolve(projectRoot, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    const deps: Record<string, string> = {
      ...((pkg['dependencies'] as Record<string, string>) ?? {}),
      ...((pkg['devDependencies'] as Record<string, string>) ?? {}),
      ...((pkg['peerDependencies'] as Record<string, string>) ?? {}),
    };
    for (const fw of FRAMEWORKS) {
      if (fw.packages.some((p) => p in deps)) return fw.name;
    }
    return null;
  } catch {
    return null;
  }
}

// --- CEM auto-discovery ---

const CEM_CANDIDATES = [
  'custom-elements.json',
  'dist/custom-elements.json',
  'dist/custom-elements-manifest.json',
  'custom-elements-manifest.json',
  '.storybook/custom-elements.json',
];

function discoverCem(projectRoot: string): string | null {
  for (const candidate of CEM_CANDIDATES) {
    if (existsSync(resolve(projectRoot, candidate))) return candidate;
  }
  return null;
}

// --- Init flow ---

export async function runInit(projectRoot: string = process.cwd()): Promise<void> {
  const isTTY = Boolean(process.stdin.isTTY);

  // For non-TTY (piped) input, read all stdin upfront to avoid readline
  // race conditions where both newlines are consumed before the second
  // question() callback is registered.
  const inputLines: string[] = [];
  let lineIdx = 0;

  if (!isTTY) {
    await new Promise<void>((res) => {
      let buf = '';
      process.stdin.on('data', (chunk: Buffer | string) => {
        buf += chunk.toString();
      });
      process.stdin.on('end', () => {
        inputLines.push(...buf.split('\n'));
        res();
      });
      process.stdin.resume();
    });
  }

  const rl = isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;

  async function prompt(question: string): Promise<string> {
    if (!isTTY) {
      const answer = inputLines[lineIdx++] ?? '';
      // Echo question + answer so output matches interactive appearance
      process.stdout.write(question + answer + '\n');
      return answer;
    }
    if (rl === null) return '';
    return new Promise((res) => rl.question(question, res));
  }

  try {
    // Step 1: Detect framework
    const framework = detectFramework(projectRoot);
    if (framework) {
      process.stdout.write(`\u2713 Detected: ${framework} (found in package.json)\n`);
    } else {
      process.stdout.write('  No known framework detected in package.json\n');
    }

    // Step 2: Auto-discover CEM
    const discovered = discoverCem(projectRoot);
    let cemPath: string;

    if (discovered) {
      const answer = await prompt(`\u2713 Found CEM: ${discovered}. Use this? [Y/n] `);
      const use = answer.trim() === '' || /^y/i.test(answer.trim());
      if (use) {
        cemPath = discovered;
      } else {
        const custom = await prompt('  Enter CEM path: ');
        cemPath = custom.trim() || 'custom-elements.json';
      }
    } else {
      const custom = await prompt(
        '  CEM not auto-detected. Enter path (default: custom-elements.json): ',
      );
      cemPath = custom.trim() || 'custom-elements.json';
    }

    // Step 3: Ask about design tokens
    const tokensAnswer = await prompt(
      '  Do you have a design tokens file? (e.g. tokens.json) [path or skip]: ',
    );
    const tokensPath = tokensAnswer.trim() || null;

    // Step 4: Write mcpwc.config.json
    const configObj = {
      cemPath,
      componentPrefix: '',
      healthHistoryDir: '.mcp-wc/health',
      tsconfigPath: 'tsconfig.json',
      tokensPath,
    };

    const configPath = resolve(projectRoot, 'mcpwc.config.json');
    writeFileSync(configPath, JSON.stringify(configObj, null, 2) + '\n');
    process.stdout.write(`\u2713 Written: mcpwc.config.json\n`);

    // Step 5: Print copy-paste snippets
    const snippet = {
      mcpServers: {
        helixir: {
          command: 'npx',
          args: ['helixir'],
          cwd: projectRoot,
        },
      },
    };

    const snippetJson = JSON.stringify(snippet, null, 2);

    const platform = process.platform;
    let claudeConfigPath: string;
    if (platform === 'darwin') {
      claudeConfigPath = '~/Library/Application Support/Claude/claude_desktop_config.json';
    } else if (platform === 'win32') {
      claudeConfigPath = '%APPDATA%\\Claude\\claude_desktop_config.json';
    } else {
      claudeConfigPath = '~/.config/Claude/claude_desktop_config.json';
    }

    process.stdout.write(`
Add this to your Claude Desktop config (${claudeConfigPath}):

${snippetJson}

For Cursor (~/.cursor/mcp.json) or VS Code (.vscode/mcp.json), use the same snippet.
`);
  } finally {
    rl?.close();
  }
}
