#!/usr/bin/env node
/**
 * self-audit.mjs
 *
 * Runs helixir against itself, collects the tool output, uses Claude to identify
 * gaps, writes JSONL + markdown to .automaker/self-review/, and creates board
 * feature stubs for every gap discovered.
 *
 * Usage:
 *   node scripts/self-audit.mjs [--skip-build] [--no-create-tickets]
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — required for Claude gap analysis step
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TODAY = new Date().toISOString().split('T')[0];
const SELF_REVIEW_DIR = resolve(ROOT, '.automaker/self-review');
const FEATURES_DIR = resolve(ROOT, '.automaker/features');
const CEM_PATH = resolve(ROOT, 'custom-elements.json');
const BUILD_INDEX = resolve(ROOT, 'build/index.js');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const SKIP_BUILD = process.argv.includes('--skip-build');
const NO_TICKETS = process.argv.includes('--no-create-tickets');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(`[self-audit] ${msg}\n`);
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

function generateFeatureId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `feature-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Step 1 — Ensure CEM exists
// ---------------------------------------------------------------------------

function ensureCem() {
  if (existsSync(CEM_PATH)) {
    log(`CEM found at ${CEM_PATH}`);
    return;
  }

  log('No CEM found — running @custom-elements-manifest/analyzer …');
  try {
    execSync('npx --yes @custom-elements-manifest/analyzer@latest analyze --litelement --quiet', {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch {
    log('Analyzer failed or found no components — writing minimal empty CEM');
    const minimalCem = {
      schemaVersion: '1.0.0',
      readme: '',
      modules: [],
    };
    writeFileSync(CEM_PATH, JSON.stringify(minimalCem, null, 2));
  }

  if (!existsSync(CEM_PATH)) {
    const minimalCem = {
      schemaVersion: '1.0.0',
      readme: '',
      modules: [],
    };
    writeFileSync(CEM_PATH, JSON.stringify(minimalCem, null, 2));
    log('Wrote minimal empty CEM (no web components in this project)');
  }
}

// ---------------------------------------------------------------------------
// Step 2 — Build the server
// ---------------------------------------------------------------------------

function buildServer() {
  if (SKIP_BUILD) {
    log('--skip-build: skipping pnpm build');
    return;
  }
  log('Building helixir …');
  execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });
  log('Build complete');
}

// ---------------------------------------------------------------------------
// Step 3 — Run self-audit via MCP client (dynamic import to stay ESM)
// ---------------------------------------------------------------------------

async function runMcpAudit() {
  log('Starting helixir server for self-audit …');

  // Dynamically import the MCP SDK (it's an ESM package in node_modules)
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [BUILD_INDEX],
    env: {
      ...process.env,
      MCP_WC_CEM_PATH: CEM_PATH,
      MCP_WC_PROJECT_ROOT: ROOT,
    },
  });

  const client = new Client({ name: 'self-audit', version: '1.0.0' });

  const auditResults = {
    tools_available: [],
    tool_calls: [],
    errors: [],
  };

  try {
    await client.connect(transport);
    log('Connected to server');

    // --- list_tools ---
    const toolsResponse = await client.listTools();
    auditResults.tools_available = (toolsResponse.tools || []).map((t) => t.name);
    log(`Tools available: ${auditResults.tools_available.join(', ')}`);

    // Read the CEM to find component names for per-component calls
    let componentNames = [];
    if (existsSync(CEM_PATH)) {
      try {
        const cemRaw = JSON.parse(readFileSync(CEM_PATH, 'utf-8'));
        componentNames = (cemRaw.modules || [])
          .flatMap((m) => m.declarations || [])
          .filter((d) => d.tagName)
          .map((d) => d.tagName);
      } catch {
        // ignore parse errors
      }
    }

    // Helper to safely call a tool
    async function callTool(toolName, args) {
      if (!auditResults.tools_available.includes(toolName)) {
        return { error: `tool not available: ${toolName}` };
      }
      try {
        const result = await client.callTool({ name: toolName, arguments: args });
        return result;
      } catch (err) {
        return { error: String(err) };
      }
    }

    // --- list_components ---
    const listResult = await callTool('list_components', {});
    auditResults.tool_calls.push({ tool: 'list_components', args: {}, result: listResult });

    // --- get_library_summary ---
    const summaryResult = await callTool('get_library_summary', {});
    auditResults.tool_calls.push({
      tool: 'get_library_summary',
      args: {},
      result: summaryResult,
    });

    // --- detect_framework ---
    const frameworkResult = await callTool('detect_framework', {});
    auditResults.tool_calls.push({
      tool: 'detect_framework',
      args: {},
      result: frameworkResult,
    });

    // --- check_breaking_changes ---
    const breakingResult = await callTool('check_breaking_changes', { branch: 'main' });
    auditResults.tool_calls.push({
      tool: 'check_breaking_changes',
      args: { branch: 'main' },
      result: breakingResult,
    });

    // --- validate_cem ---
    const validateResult = await callTool('validate_cem', {});
    auditResults.tool_calls.push({ tool: 'validate_cem', args: {}, result: validateResult });

    // --- per-component calls ---
    for (const tagName of componentNames.slice(0, 20)) {
      // cap at 20 to avoid runaway
      const getResult = await callTool('get_component', { tagName });
      auditResults.tool_calls.push({
        tool: 'get_component',
        args: { tagName },
        result: getResult,
      });

      const scoreResult = await callTool('score_component', { tagName });
      auditResults.tool_calls.push({
        tool: 'score_component',
        args: { tagName },
        result: scoreResult,
      });

      const validateCompResult = await callTool('validate_usage', { tagName });
      auditResults.tool_calls.push({
        tool: 'validate_usage',
        args: { tagName },
        result: validateCompResult,
      });
    }

    log(`Completed ${auditResults.tool_calls.length} tool calls`);
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }

  return auditResults;
}

// ---------------------------------------------------------------------------
// Step 4 — Gap analysis via Claude API
// ---------------------------------------------------------------------------

async function runGapAnalysis(auditResults) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log('ANTHROPIC_API_KEY not set — skipping Claude gap analysis, writing placeholder');
    return [
      {
        title: 'Gap analysis skipped — ANTHROPIC_API_KEY not set',
        description: 'Re-run with ANTHROPIC_API_KEY set to enable full Claude gap analysis.',
        complexity: 'small',
        priority: 4,
      },
    ];
  }

  log('Running Claude gap analysis …');

  const auditSummary = JSON.stringify(auditResults, null, 2);

  const prompt = `You are a ruthless VP of Engineering reviewing an MCP server called helixir.
This server provides AI agents with introspection capabilities for web component libraries
via the Model Context Protocol.

Below is the output of a self-audit: tool calls made to the server and their responses.

Based on this self-audit output, identify every gap, weakness, missing feature, and quality
failure. Consider: missing error handling, incomplete tool responses, schema issues, poor
documentation, missing tools that would be valuable, performance concerns, and developer
experience problems.

For each gap, produce a JSON object on its own line with keys:
- title (string, concise imperative)
- description (string, 1-2 sentences explaining the gap and why it matters)
- complexity ("small" | "medium" | "large" | "architectural")
- priority (1 = critical, 2 = high, 3 = medium, 4 = low)

Output ONLY valid JSONL — one JSON object per line, no markdown, no commentary, no code fences.
If you find no gaps, output a single line: {"title":"No gaps found","description":"Self-audit passed all checks.","complexity":"small","priority":4}

SELF-AUDIT OUTPUT:
${auditSummary.slice(0, 80000)}`; // truncate to stay within context

  // Use native fetch (Node 18+) to call Claude API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    log(`Claude API error: ${response.status} ${errText}`);
    return [
      {
        title: `Claude API error: ${response.status}`,
        description: errText.slice(0, 200),
        complexity: 'small',
        priority: 4,
      },
    ];
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || '';
  log(`Claude responded with ${rawText.length} chars`);

  // Parse JSONL
  const gaps = [];
  for (const line of rawText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj.title === 'string') {
        gaps.push(obj);
      }
    } catch {
      // skip malformed lines
    }
  }

  log(`Parsed ${gaps.length} gaps from Claude response`);
  return gaps;
}

// ---------------------------------------------------------------------------
// Step 5 — Write output files
// ---------------------------------------------------------------------------

function writeOutputFiles(auditResults, gaps) {
  mkdirSync(SELF_REVIEW_DIR, { recursive: true });

  // Write JSONL
  const jsonlPath = resolve(SELF_REVIEW_DIR, `gap-tickets-${TODAY}.jsonl`);
  const jsonlContent = gaps.map((g) => JSON.stringify(g)).join('\n') + '\n';
  writeFileSync(jsonlPath, jsonlContent);
  log(`Wrote JSONL: ${jsonlPath}`);

  // Write markdown summary
  const summaryPath = resolve(SELF_REVIEW_DIR, `summary-${TODAY}.md`);
  const toolsSection = auditResults.tools_available.length
    ? auditResults.tools_available.map((t) => `- \`${t}\``).join('\n')
    : '_None discovered_';

  const callsSection = auditResults.tool_calls
    .map((c) => {
      const resultPreview = JSON.stringify(c.result).slice(0, 200);
      return `### \`${c.tool}\`\n**Args:** \`${JSON.stringify(c.args)}\`\n\n**Result:** \`${resultPreview}${resultPreview.length === 200 ? '…' : ''}\``;
    })
    .join('\n\n');

  const gapsSection =
    gaps.length === 0
      ? '_No gaps identified._'
      : gaps
          .map(
            (g, i) =>
              `### ${i + 1}. ${g.title}\n**Priority:** ${g.priority} | **Complexity:** ${g.complexity}\n\n${g.description}`,
          )
          .join('\n\n');

  const summaryContent = `# HELiXiR Self-Audit — ${TODAY}

## Tools Available (${auditResults.tools_available.length})

${toolsSection}

## Tool Call Results

${callsSection || '_No tool calls made_'}

## Gaps Identified (${gaps.length})

${gapsSection}
`;

  writeFileSync(summaryPath, summaryContent);
  log(`Wrote summary: ${summaryPath}`);

  return { jsonlPath, summaryPath };
}

// ---------------------------------------------------------------------------
// Step 6 — Create board feature stubs
// ---------------------------------------------------------------------------

function createFeatureTickets(gaps, summaryPath) {
  if (NO_TICKETS) {
    log('--no-create-tickets: skipping feature creation');
    return [];
  }

  mkdirSync(FEATURES_DIR, { recursive: true });

  const createdIds = [];

  for (const gap of gaps) {
    if (!gap.title || gap.title === 'No gaps found') continue;

    const id = generateFeatureId();
    const branchName = `feature/${slugify(gap.title)}`;

    const feature = {
      category: 'Self-Audit',
      title: gap.title,
      description: gap.description || '',
      status: 'backlog',
      complexity: gap.complexity || 'medium',
      priority: typeof gap.priority === 'number' ? gap.priority : 3,
      source: 'self-audit',
      id,
      branchName,
      createdAt: new Date().toISOString(),
      tags: ['self-audit', TODAY],
    };

    const featureDir = resolve(FEATURES_DIR, id);
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(resolve(featureDir, 'feature.json'), JSON.stringify(feature, null, 2));

    createdIds.push(id);
    log(`Created feature: ${id} — "${gap.title}"`);
  }

  // Append created IDs to the summary file
  if (createdIds.length > 0) {
    const appendText = `\n## Features Created on Board\n\n${createdIds.map((id) => `- \`${id}\``).join('\n')}\n`;
    const existing = readFileSync(summaryPath, 'utf-8');
    writeFileSync(summaryPath, existing + appendText);
  }

  log(`Created ${createdIds.length} board features`);
  return createdIds;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log(`helixir self-audit — ${TODAY}`);
  log(`Project root: ${ROOT}`);

  // Step 1 — CEM
  ensureCem();

  // Step 2 — Build
  buildServer();

  // Verify build output exists
  if (!existsSync(BUILD_INDEX)) {
    log(`ERROR: Build output not found at ${BUILD_INDEX}`);
    process.exit(1);
  }

  // Step 3 — MCP audit
  let auditResults;
  try {
    auditResults = await runMcpAudit();
  } catch (err) {
    log(`ERROR running MCP audit: ${err}`);
    auditResults = { tools_available: [], tool_calls: [], errors: [String(err)] };
  }

  // Step 4 — Gap analysis
  const gaps = await runGapAnalysis(auditResults);

  // Step 5 — Write output
  const { jsonlPath, summaryPath } = writeOutputFiles(auditResults, gaps);

  // Step 6 — Create tickets
  const createdIds = createFeatureTickets(gaps, summaryPath);

  // Final report
  log('');
  log('=== Self-Audit Complete ===');
  log(`JSONL: ${jsonlPath}`);
  log(`Summary: ${summaryPath}`);
  log(`Gaps found: ${gaps.length}`);
  log(`Features created: ${createdIds.length}`);

  if (gaps.length === 0) {
    log('No gaps found — system is clean');
  } else if (createdIds.length < 3) {
    log(
      `WARNING: Fewer than 3 features created (${createdIds.length}). Check that gaps had valid titles.`,
    );
  }
}

main().catch((err) => {
  process.stderr.write(`[self-audit] FATAL: ${err}\n`);
  process.exit(1);
});
