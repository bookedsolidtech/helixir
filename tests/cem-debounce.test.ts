/**
 * Tests that requests during the CEM watcher debounce window succeed when the
 * cache is still valid (i.e., cemReloading is NOT set until the debounce fires).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_PATH = resolve(__dirname, '../build/src/index.js');
const FIXTURE_CEM = resolve(__dirname, './__fixtures__/custom-elements.json');

describe('CEM debounce window', () => {
  let child: ChildProcess;
  let tmpDir: string;
  let cemPath: string;
  const messageQueue: Record<string, unknown>[] = [];
  const pendingResolvers: Array<(msg: Record<string, unknown>) => void> = [];
  let requestId = 0;

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
    if (messageQueue.length > 0) return Promise.resolve(messageQueue.shift()!);
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

  beforeAll(async () => {
    if (!existsSync(SERVER_PATH)) {
      throw new Error(`Server binary not found at ${SERVER_PATH}. Run 'pnpm run build' first.`);
    }

    tmpDir = mkdtempSync(join(tmpdir(), 'helixir-debounce-'));
    cemPath = join(tmpDir, 'custom-elements.json');
    copyFileSync(FIXTURE_CEM, cemPath);

    child = spawn('node', [SERVER_PATH, '--watch'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MCP_WC_PROJECT_ROOT: tmpDir,
        MCP_WC_CEM_PATH: 'custom-elements.json', // relative to PROJECT_ROOT
      },
    });

    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as Record<string, unknown>;
        if (pendingResolvers.length > 0) {
          pendingResolvers.shift()!(msg);
        } else {
          messageQueue.push(msg);
        }
      } catch {
        /* skip non-JSON */
      }
    });

    child.on('error', (err) => console.error('Server error:', err));

    // MCP initialize handshake
    const initId = sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'debounce-test', version: '0.0.0' },
      capabilities: {},
    });
    await recv(); // initialize response
    sendNotification('notifications/initialized');
    void initId;
  });

  afterAll(() => {
    child?.kill();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('requests during debounce window succeed when cache is valid', async () => {
    // Verify baseline: a normal tool call succeeds
    const baselineId = sendRequest('tools/call', { name: 'list_components', arguments: {} });
    const baselineResp = await recv();
    expect(baselineResp.id).toBe(baselineId);
    const baselineResult = baselineResp.result as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(baselineResult.isError).toBeFalsy();

    // Trigger a file-change event to start the debounce timer (100ms delay)
    writeFileSync(cemPath, readFileSync(FIXTURE_CEM, 'utf-8'));

    // Immediately send a tool call — this arrives DURING the debounce window,
    // BEFORE the 100ms setTimeout fires and sets cemReloading = true.
    // With the fix, cemReloading is still false here, so the request should succeed.
    const debounceId = sendRequest('tools/call', { name: 'list_components', arguments: {} });
    const debounceResp = await recv(3000);

    expect(debounceResp.id).toBe(debounceId);
    const result = debounceResp.result as { content: Array<{ text: string }>; isError?: boolean };

    // Should NOT be rejected as "still initializing"
    expect(result.isError).toBeFalsy();
    const text = result.content.map((c) => c.text).join('');
    expect(text).not.toContain('server is still initializing');
    expect(text).not.toContain('CEM not yet loaded');
  }, 15000);
});
