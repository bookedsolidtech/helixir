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

let child: ChildProcess;
const messageQueue: Record<string, unknown>[] = [];
const pendingResolvers: Array<(msg: Record<string, unknown>) => void> = [];
let requestId = 0;

function setupServer(): void {
  child = spawn('node', [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
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
      // ignore non-JSON output (e.g. debug prints to stdout)
    }
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

function recv(timeoutMs = 5000): Promise<Record<string, unknown>> {
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

describe('MCP server integration', () => {
  beforeAll(() => {
    if (!existsSync(SERVER_PATH)) {
      throw new Error(`Server binary not found at ${SERVER_PATH}. Run 'npm run build' first.`);
    }
    setupServer();
  });

  afterAll(() => {
    child?.kill('SIGTERM');
  });

  describe('initialize handshake', () => {
    it('responds to initialize with server info and capabilities', async () => {
      const id = sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '0.0.1' },
      });

      const response = await recv();

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: expect.any(String),
          serverInfo: { name: 'wc-mcp', version: '0.1.0' },
          capabilities: expect.any(Object),
        },
      });
    });

    it('accepts the initialized notification without crashing', async () => {
      // Notification has no id and expects no response.
      // We verify the server stays alive by sending a subsequent request.
      sendNotification('notifications/initialized');

      // Ping with a list-tools request to confirm the server is still responsive.
      const id = sendRequest('tools/list', {});
      const response = await recv();
      expect(response).toMatchObject({ jsonrpc: '2.0', id });
    });
  });

  describe('tools/list', () => {
    it('returns a result object containing a tools array', async () => {
      const id = sendRequest('tools/list', {});
      const response = await recv();

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id,
        result: {
          tools: expect.any(Array),
        },
      });
    });

    it('returns an empty tools array when no tools are registered', async () => {
      sendRequest('tools/list', {});
      const response = await recv();

      const result = response.result as { tools: unknown[] };
      expect(result.tools).toHaveLength(0);
    });
  });

  describe('tools/call', () => {
    it('returns a JSON-RPC error for an unknown tool name', async () => {
      const id = sendRequest('tools/call', {
        name: 'nonexistent_tool',
        arguments: {},
      });

      const response = await recv();

      expect(response).toMatchObject({ jsonrpc: '2.0', id });

      // The SDK may surface the error as a JSON-RPC error object or as a
      // tool result with isError: true — accept either shape.
      const hasRpcError = 'error' in response;
      const hasToolError =
        typeof response.result === 'object' &&
        response.result !== null &&
        (response.result as Record<string, unknown>).isError === true;

      expect(hasRpcError || hasToolError).toBe(true);
    });

    it('returns an error for a tool call with fixture-shaped arguments', async () => {
      const id = sendRequest('tools/call', {
        name: 'get_component_api',
        arguments: { tagName: 'my-button' },
      });

      const response = await recv();

      expect(response).toMatchObject({ jsonrpc: '2.0', id });

      const hasRpcError = 'error' in response;
      const hasToolError =
        typeof response.result === 'object' &&
        response.result !== null &&
        (response.result as Record<string, unknown>).isError === true;

      expect(hasRpcError || hasToolError).toBe(true);
    });
  });
});
