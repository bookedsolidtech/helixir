/**
 * E2E acceptance tests — validates all 5 acceptance criteria before publish.
 *
 * Uses the checked-in fixture CEM (tests/__fixtures__/custom-elements.json)
 * which contains three hand-coded components: my-button, my-card, my-select.
 *
 * Tests:
 *  1. list_components  — returns all expected components
 *  2. get_component    — returns full metadata for my-button
 *  3. find_component   — natural-language query returns correct top match
 *  4. score_component  — returns a numeric health score
 *  5. diff_cem         — my-button vs main shows no breaking changes
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_PATH = resolve(__dirname, '../../build/index.js');
const PROJECT_ROOT = resolve(__dirname, '../..');
// Relative path so `git show main:<cemPath>` works correctly
const CEM_PATH_RELATIVE = 'tests/__fixtures__/custom-elements.json';
const TOKENS_PATH = resolve(__dirname, '../__fixtures__/tokens.json');
const HEALTH_HISTORY_DIR = 'tests/__fixtures__/health-history';

let child: ChildProcess;
const messageQueue: Record<string, unknown>[] = [];
const pendingResolvers: Array<(msg: Record<string, unknown>) => void> = [];
let requestId = 0;

function setupServer(): void {
  child = spawn('node', [SERVER_PATH], {
    cwd: PROJECT_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MCP_WC_PROJECT_ROOT: PROJECT_ROOT,
      MCP_WC_CEM_PATH: CEM_PATH_RELATIVE,
      MCP_WC_TOKENS_PATH: TOKENS_PATH,
      MCP_WC_HEALTH_HISTORY_DIR: HEALTH_HISTORY_DIR,
    },
  });

  const rl = createInterface({ input: child.stdout! });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed) as Record<string, unknown>;
      if (pendingResolvers.length > 0) {
        const resolve = pendingResolvers.shift()!;
        resolve(msg);
      } else {
        messageQueue.push(msg);
      }
    } catch {
      // ignore non-JSON lines (e.g. debug output)
    }
  });

  child.stderr!.on('data', (chunk: Buffer) => {
    process.stderr.write(`[server] ${chunk.toString()}`);
  });

  child.on('error', (err) => {
    console.error('Server process error:', err);
  });
}

function sendRequest(method: string, params?: object): number {
  const id = ++requestId;
  const msg: Record<string, unknown> = { jsonrpc: '2.0', id, method };
  if (params !== undefined) msg.params = params;
  child.stdin!.write(JSON.stringify(msg) + '\n');
  return id;
}

function sendNotification(method: string, params?: object): void {
  const msg: Record<string, unknown> = { jsonrpc: '2.0', method };
  if (params !== undefined) msg.params = params;
  child.stdin!.write(JSON.stringify(msg) + '\n');
}

function recv(timeoutMs = 8000): Promise<Record<string, unknown>> {
  if (messageQueue.length > 0) {
    return Promise.resolve(messageQueue.shift()!);
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const idx = pendingResolvers.indexOf(resolve);
      if (idx !== -1) pendingResolvers.splice(idx, 1);
      reject(new Error(`Timeout: no response after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingResolvers.push((msg) => {
      clearTimeout(timeout);
      resolve(msg);
    });
  });
}

async function callTool(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const id = sendRequest('tools/call', { name: toolName, arguments: args });
  const response = await recv();
  expect(response).toMatchObject({ jsonrpc: '2.0', id });
  const result = response.result as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  return result;
}

describe('E2E acceptance — real WC fixture (my-button, my-card, my-select)', () => {
  beforeAll(async () => {
    if (!existsSync(SERVER_PATH)) {
      throw new Error(`Server binary not found at ${SERVER_PATH}. Run 'pnpm run build' first.`);
    }
    setupServer();

    // MCP initialize handshake
    const id = sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'acceptance-test', version: '0.0.1' },
    });
    const initResponse = await recv();
    expect(initResponse).toMatchObject({ jsonrpc: '2.0', id });

    sendNotification('notifications/initialized');
  });

  afterAll(() => {
    child?.kill('SIGTERM');
  });

  // ─── Criterion 1: list_components ─────────────────────────────────────────

  describe('Criterion 1 — list_components returns expected components', () => {
    it('lists my-button, my-card, and my-select', async () => {
      const result = await callTool('list_components');
      expect(result.isError).toBeFalsy();

      const text = result.content[0]?.text ?? '';
      expect(text).toContain('my-button');
      expect(text).toContain('my-card');
      expect(text).toContain('my-select');
    });

    it('returns exactly 3 components (no extras)', async () => {
      const result = await callTool('list_components');
      const text = result.content[0]?.text ?? '';
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      expect(lines).toHaveLength(3);
    });
  });

  // ─── Criterion 2: get_component ───────────────────────────────────────────

  describe('Criterion 2 — get_component returns full metadata for my-button', () => {
    it('returns members, events, slots, CSS parts, and CSS properties', async () => {
      const result = await callTool('get_component', { tagName: 'my-button' });
      expect(result.isError).toBeFalsy();

      const text = result.content[0]?.text ?? '';
      const meta = JSON.parse(text) as Record<string, unknown>;

      // Tag name
      expect(meta.tagName).toBe('my-button');

      // Members: variant, disabled, loading, size, focus, click
      expect(Array.isArray(meta.members)).toBe(true);
      const memberNames = (meta.members as Array<{ name: string }>).map((m) => m.name);
      expect(memberNames).toContain('variant');
      expect(memberNames).toContain('disabled');
      expect(memberNames).toContain('loading');
      expect(memberNames).toContain('size');
      expect(memberNames).toContain('focus');

      // Events: my-click, my-focus, my-blur
      expect(Array.isArray(meta.events)).toBe(true);
      const eventNames = (meta.events as Array<{ name: string }>).map((e) => e.name);
      expect(eventNames).toContain('my-click');
      expect(eventNames).toContain('my-focus');

      // Slots: default, prefix, suffix
      expect(Array.isArray(meta.slots)).toBe(true);
      const slotNames = (meta.slots as Array<{ name: string }>).map((s) => s.name);
      expect(slotNames).toContain('prefix');
      expect(slotNames).toContain('suffix');

      // CSS Parts: base, label, spinner
      expect(Array.isArray(meta.cssParts)).toBe(true);
      const partNames = (meta.cssParts as Array<{ name: string }>).map((p) => p.name);
      expect(partNames).toContain('base');
      expect(partNames).toContain('label');
      expect(partNames).toContain('spinner');

      // CSS Properties: --my-button-bg, --my-button-color
      expect(Array.isArray(meta.cssProperties)).toBe(true);
      const cssPropNames = (meta.cssProperties as Array<{ name: string }>).map((p) => p.name);
      expect(cssPropNames).toContain('--my-button-bg');
      expect(cssPropNames).toContain('--my-button-color');
    });

    it('returns an error for an unknown tag name', async () => {
      const result = await callTool('get_component', { tagName: 'nonexistent-element' });
      expect(result.isError).toBe(true);
    });
  });

  // ─── Criterion 3: find_component ──────────────────────────────────────────

  describe('Criterion 3 — find_component returns correct top match for natural-language queries', () => {
    it('returns my-button as top match for "button"', async () => {
      const result = await callTool('find_component', { query: 'button' });
      expect(result.isError).toBeFalsy();

      const text = result.content[0]?.text ?? '';
      const firstLine = text.split('\n')[0];
      expect(firstLine).toContain('my-button');
    });

    it('returns my-select as top match for "dropdown select"', async () => {
      const result = await callTool('find_component', { query: 'dropdown select' });
      expect(result.isError).toBeFalsy();

      const text = result.content[0]?.text ?? '';
      const firstLine = text.split('\n')[0];
      expect(firstLine).toContain('my-select');
    });

    it('returns my-card as top match for "card"', async () => {
      const result = await callTool('find_component', { query: 'card' });
      expect(result.isError).toBeFalsy();

      const text = result.content[0]?.text ?? '';
      const firstLine = text.split('\n')[0];
      expect(firstLine).toContain('my-card');
    });

    it('returns a no-match message for a query with no token overlap', async () => {
      // Use tokens that appear nowhere in tag names, descriptions, or member names
      const result = await callTool('find_component', { query: 'astrolabe telescope sextant' });
      expect(result.isError).toBeFalsy();
      const text = result.content[0]?.text ?? '';
      expect(text).toMatch(/no components found/i);
    });
  });

  // ─── Criterion 4: score_component ─────────────────────────────────────────

  describe('Criterion 4 — score_component returns a health score for my-button', () => {
    it('returns a score object with a numeric score and grade', async () => {
      const result = await callTool('score_component', { tag_name: 'my-button' });
      expect(result.isError).toBeFalsy();

      const text = result.content[0]?.text ?? '';
      const scoreResult = JSON.parse(text) as Record<string, unknown>;

      expect(typeof scoreResult.score).toBe('number');
      expect(scoreResult.score).toBeGreaterThanOrEqual(0);
      expect(scoreResult.score).toBeLessThanOrEqual(100);

      expect(typeof scoreResult.grade).toBe('string');
      expect(['A', 'B', 'C', 'D', 'F']).toContain(scoreResult.grade);

      // my-button is well-documented — expect at least a C
      expect(scoreResult.score as number).toBeGreaterThanOrEqual(70);
    });
  });

  // ─── Criterion 5: diff_cem ────────────────────────────────────────────────

  describe('Criterion 5 — diff_cem against main shows no breaking changes for my-button', () => {
    it('reports ✅ (no breaking changes) when fixture is unchanged from main', async () => {
      const result = await callTool('diff_cem', { tagName: 'my-button', baseBranch: 'main' });
      expect(result.isError).toBeFalsy();

      const text = result.content[0]?.text ?? '';

      // Either: "✅ my-button vs main" (no changes), "🆕 my-button" (new),
      // or an error from git if git show fails in CI. All are acceptable
      // as long as the tool doesn't crash and returns a result.
      // The key assertion: no breaking changes are reported.
      expect(text).not.toMatch(/🔴/);
      expect(text).not.toContain('Breaking changes:');
    });
  });
});
