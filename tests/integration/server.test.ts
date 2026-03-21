import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_PATH = resolve(__dirname, '../../build/src/index.js');
const FIXTURE_CEM = resolve(__dirname, '../__fixtures__/custom-elements.json');
const FIXTURE_TOKENS = resolve(__dirname, '../__fixtures__/tokens.json');

const SERVER_AVAILABLE = existsSync(SERVER_PATH);

let child: ChildProcess;
const messageQueue: Record<string, unknown>[] = [];
const pendingResolvers: Array<(msg: Record<string, unknown>) => void> = [];
let requestId = 0;

function setupServer(): void {
  child = spawn('node', [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MCP_WC_CEM_PATH: FIXTURE_CEM,
      MCP_WC_TOKENS_PATH: FIXTURE_TOKENS,
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

describe.skipIf(!SERVER_AVAILABLE)('MCP server integration (with tokensPath configured)', () => {
  beforeAll(() => {
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
          serverInfo: { name: 'helixir', version: '0.4.0' },
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

    it('returns all expected tool names (66 core + 2 token when configured)', async () => {
      sendRequest('tools/list', {});
      const response = await recv();

      const result = response.result as { tools: Array<{ name: string }> };
      const toolNames = result.tools.map((t) => t.name);

      const coreTools = [
        // discovery
        'list_components',
        'find_component',
        'get_library_summary',
        'list_events',
        'list_slots',
        'list_css_parts',
        'list_components_by_category',
        // component
        'get_component',
        'validate_cem',
        'suggest_usage',
        'generate_import',
        'get_component_narrative',
        'get_prop_constraints',
        'find_components_by_token',
        'find_components_using_token',
        // composition
        'get_composition_example',
        // safety
        'diff_cem',
        'check_breaking_changes',
        // health
        'score_component',
        'score_all_components',
        'get_health_trend',
        'get_health_diff',
        'analyze_accessibility',
        'get_health_summary',
        'audit_library',
        // framework
        'detect_framework',
        // validate
        'validate_usage',
        // bundle
        'estimate_bundle_size',
        // cdn
        'resolve_cdn_cem',
        // story
        'generate_story',
        // component (dependency graph)
        'get_component_dependencies',
        // benchmark
        'benchmark_libraries',
        // library management
        'load_library',
        'list_libraries',
        'unload_library',
        // typescript
        'get_file_diagnostics',
        'get_project_diagnostics',
        // type generation
        'generate_types',
        // styling
        'diagnose_styling',
        'check_shadow_dom_usage',
        'check_html_usage',
        'check_event_usage',
        'get_component_quick_ref',
        'detect_theme_support',
        'check_component_imports',
        'check_slot_children',
        'check_attribute_conflicts',
        'check_a11y_usage',
        'check_css_vars',
        'validate_component_code',
        'check_token_fallbacks',
        'check_composition',
        'check_method_calls',
        'check_theme_compatibility',
        'recommend_checks',
        'suggest_fix',
        'check_css_specificity',
        'check_layout_patterns',
        'check_css_scope',
        'check_css_shorthand',
        'check_color_contrast',
        'check_transition_animation',
        'check_shadow_dom_js',
      ];
      const tokenTools = ['get_design_tokens', 'find_token'];
      const expectedTools = [...coreTools, ...tokenTools];

      for (const name of expectedTools) {
        expect(toolNames, `expected tool "${name}" to be present`).toContain(name);
      }
      expect(result.tools).toHaveLength(expectedTools.length);
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

    it('returns a successful result for list_components with fixture CEM', async () => {
      const id = sendRequest('tools/call', {
        name: 'list_components',
        arguments: {},
      });

      const response = await recv();

      expect(response).toMatchObject({ jsonrpc: '2.0', id });

      const result = response.result as Record<string, unknown>;
      expect(result.isError).not.toBe(true);
      expect(Array.isArray(result.content)).toBe(true);
      const text = (result.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('');
      // The fixture CEM has my-button among its components
      expect(text).toContain('my-button');
    });

    it('returns a validation error for find_component called without required query argument', async () => {
      const id = sendRequest('tools/call', {
        name: 'find_component',
        arguments: {},
      });

      const response = await recv();

      expect(response).toMatchObject({ jsonrpc: '2.0', id });

      const hasRpcError = 'error' in response;
      const toolResult =
        typeof response.result === 'object' && response.result !== null
          ? (response.result as Record<string, unknown>)
          : null;
      const hasToolError = toolResult?.isError === true;

      expect(hasRpcError || hasToolError).toBe(true);
    });
  });

  describe('CEM in-memory cache', () => {
    it('returns consistent results across repeated list_components calls', async () => {
      const id1 = sendRequest('tools/call', { name: 'list_components', arguments: {} });
      const r1 = await recv();
      const id2 = sendRequest('tools/call', { name: 'list_components', arguments: {} });
      const r2 = await recv();
      const id3 = sendRequest('tools/call', { name: 'list_components', arguments: {} });
      const r3 = await recv();

      expect(r1.id).toBe(id1);
      expect(r2.id).toBe(id2);
      expect(r3.id).toBe(id3);

      const text1 =
        ((r1.result as Record<string, unknown>)?.content as Array<{ text?: string }>)?.[0]?.text ??
        '';
      const text2 =
        ((r2.result as Record<string, unknown>)?.content as Array<{ text?: string }>)?.[0]?.text ??
        '';
      const text3 =
        ((r3.result as Record<string, unknown>)?.content as Array<{ text?: string }>)?.[0]?.text ??
        '';

      expect(text1).toBe(text2);
      expect(text2).toBe(text3);
    });

    it('get_library_summary includes a cacheAge field matching /^\\d+s$/', async () => {
      const id = sendRequest('tools/call', { name: 'get_library_summary', arguments: {} });
      const response = await recv();

      expect(response.id).toBe(id);
      const content =
        ((response.result as Record<string, unknown>)?.content as Array<{ text?: string }>)?.[0]
          ?.text ?? '';
      const parsed = JSON.parse(content) as Record<string, unknown>;
      expect(parsed).toHaveProperty('cacheAge');
      expect(typeof parsed.cacheAge).toBe('string');
      expect(parsed.cacheAge).toMatch(/^\d+s$/);
    });
  });
});

describe.skipIf(!SERVER_AVAILABLE)('MCP server integration (without tokensPath configured)', () => {
  let noTokensChild: ChildProcess;
  const noTokensQueue: Record<string, unknown>[] = [];
  const noTokensResolvers: Array<(msg: Record<string, unknown>) => void> = [];
  let noTokensRequestId = 0;

  function sendNoTokensRequest(method: string, params?: object): number {
    const id = ++noTokensRequestId;
    const msg: Record<string, unknown> = { jsonrpc: '2.0', id, method };
    if (params !== undefined) msg.params = params;
    noTokensChild.stdin!.write(JSON.stringify(msg) + '\n');
    return id;
  }

  function recvNoTokens(timeoutMs = 5000): Promise<Record<string, unknown>> {
    if (noTokensQueue.length > 0) {
      return Promise.resolve(noTokensQueue.shift()!);
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = noTokensResolvers.indexOf(resolve);
        if (idx !== -1) noTokensResolvers.splice(idx, 1);
        reject(new Error(`Timeout: no response after ${timeoutMs}ms`));
      }, timeoutMs);

      noTokensResolvers.push((msg) => {
        clearTimeout(timeout);
        resolve(msg);
      });
    });
  }

  beforeAll(async () => {
    noTokensChild = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MCP_WC_CEM_PATH: FIXTURE_CEM,
        // Deliberately omit MCP_WC_TOKENS_PATH
      },
    });

    const rl = createInterface({ input: noTokensChild.stdout! });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as Record<string, unknown>;
        if (noTokensResolvers.length > 0) {
          const resolve = noTokensResolvers.shift()!;
          resolve(msg);
        } else {
          noTokensQueue.push(msg);
        }
      } catch {
        // ignore non-JSON output
      }
    });

    // Initialize the server before tests run
    sendNoTokensRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '0.0.1' },
    });
    await recvNoTokens();
  });

  afterAll(() => {
    noTokensChild?.kill('SIGTERM');
  });

  describe('tools/list without tokensPath', () => {
    it('DOES include token tools even when tokensPath is not configured', async () => {
      const id = sendNoTokensRequest('tools/list', {});
      const response = await recvNoTokens();

      expect(response).toMatchObject({ jsonrpc: '2.0', id });
      const result = response.result as { tools: Array<{ name: string }> };
      const toolNames = result.tools.map((t) => t.name);

      // Token tools are always registered; they return an error at call time
      expect(toolNames).toContain('get_design_tokens');
      expect(toolNames).toContain('find_token');
    });
  });

  describe('tools/call without tokensPath', () => {
    it('returns a clear error when get_design_tokens is called without tokensPath', async () => {
      const id = sendNoTokensRequest('tools/call', {
        name: 'get_design_tokens',
        arguments: {},
      });
      const response = await recvNoTokens();

      expect(response).toMatchObject({ jsonrpc: '2.0', id });

      // The error may surface as a JSON-RPC error or a tool result with isError: true
      const hasRpcError = 'error' in response;
      const toolResult =
        typeof response.result === 'object' && response.result !== null
          ? (response.result as Record<string, unknown>)
          : null;
      const hasToolError = toolResult?.isError === true;

      expect(hasRpcError || hasToolError).toBe(true);

      if (hasToolError && Array.isArray(toolResult?.content)) {
        const text = (toolResult.content as Array<{ text?: string }>)
          .map((c) => c.text ?? '')
          .join('');
        expect(text).toMatch(/tokensPath/);
      }
    });

    it('returns a clear error when find_token is called without tokensPath', async () => {
      const id = sendNoTokensRequest('tools/call', {
        name: 'find_token',
        arguments: { query: 'color' },
      });
      const response = await recvNoTokens();

      expect(response).toMatchObject({ jsonrpc: '2.0', id });

      const hasRpcError = 'error' in response;
      const toolResult =
        typeof response.result === 'object' && response.result !== null
          ? (response.result as Record<string, unknown>)
          : null;
      const hasToolError = toolResult?.isError === true;

      expect(hasRpcError || hasToolError).toBe(true);

      if (hasToolError && Array.isArray(toolResult?.content)) {
        const text = (toolResult.content as Array<{ text?: string }>)
          .map((c) => c.text ?? '')
          .join('');
        expect(text).toMatch(/tokensPath/);
      }
    });
  });
});
