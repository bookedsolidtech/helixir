/**
 * Error handling consistency tests: verifies that every tool dispatcher
 * returns structured error responses { content: [{ type: 'text' }], isError: true }
 * when it encounters an error — and never throws.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { McpWcConfig } from '../../packages/core/src/config.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

// --- Mocks ---

vi.mock('../../packages/core/src/handlers/cem.js', async () => {
  const actual = await vi.importActual<typeof import('../../packages/core/src/handlers/cem.js')>(
    '../../packages/core/src/handlers/cem.js',
  );
  return {
    ...actual,
    listAllComponents: vi.fn(),
    parseCem: vi.fn(),
    listAllEvents: vi.fn(),
    listAllSlots: vi.fn(),
    listAllCssParts: vi.fn(),
    diffCem: vi.fn(),
    validateCompleteness: vi.fn(),
  };
});

vi.mock('../../packages/core/src/handlers/health.js', () => ({
  scoreComponent: vi.fn(),
  scoreAllComponents: vi.fn(),
  getHealthTrend: vi.fn(),
  getHealthDiff: vi.fn(),
  scoreCemFallback: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/tokens.js', () => ({
  getDesignTokens: vi.fn(),
  findToken: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/typescript.js', () => ({
  getFileDiagnostics: vi.fn(),
  getProjectDiagnostics: vi.fn(),
  isTypescriptAvailable: vi.fn().mockReturnValue(true),
  requireTs: vi.fn(),
}));

vi.mock('../../packages/core/src/handlers/accessibility.js', () => ({
  analyzeAccessibility: vi.fn(),
  analyzeAllAccessibility: vi.fn(),
}));

import { handleDiscoveryCall, isDiscoveryTool } from '../../packages/core/src/tools/discovery.js';
import { handleHealthCall, isHealthTool } from '../../packages/core/src/tools/health.js';
import { handleSafetyCall, isSafetyTool } from '../../packages/core/src/tools/safety.js';
import { handleComponentCall, isComponentTool } from '../../packages/core/src/tools/component.js';
import { handleTokenCall, isTokenTool } from '../../packages/core/src/tools/tokens.js';
import {
  handleTypeScriptCall,
  isTypeScriptTool,
} from '../../packages/core/src/tools/typescript.js';
import { handleCdnCall, isCdnTool } from '../../packages/core/src/tools/cdn.js';
import { handleFrameworkCall, isFrameworkTool } from '../../packages/core/src/tools/framework.js';
import { handleValidateCall, isValidateTool } from '../../packages/core/src/tools/validate.js';

import { listAllComponents, parseCem, diffCem } from '../../packages/core/src/handlers/cem.js';
import { scoreComponent, scoreAllComponents } from '../../packages/core/src/handlers/health.js';
import { getDesignTokens } from '../../packages/core/src/handlers/tokens.js';
import { getFileDiagnostics } from '../../packages/core/src/handlers/typescript.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: FIXTURES_DIR,
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: 'tokens.json',
    cdnBase: null,
    watch: false,
  };
}

const FAKE_CEM = { schemaVersion: '1.0.0', modules: [] } as Cem;

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function assertErrorResponse(result: MCPToolResult) {
  expect(result).toBeDefined();
  expect(result.isError).toBe(true);
  expect(Array.isArray(result.content)).toBe(true);
  expect(result.content.length).toBeGreaterThan(0);
  expect(result.content[0]!.type).toBe('text');
  expect(typeof result.content[0]!.text).toBe('string');
}

// ---------------------------------------------------------------------------
// Discovery tools — error responses
// ---------------------------------------------------------------------------

describe('Discovery tools: error response format', () => {
  it('unknown tool returns structured error', async () => {
    const result = await handleDiscoveryCall(
      'nonexistent_tool',
      {},
      makeConfig(),
      FAKE_CEM,
      Date.now(),
    );
    assertErrorResponse(result);
  });

  it('find_component without query arg returns structured error', async () => {
    const result = await handleDiscoveryCall(
      'find_component',
      {},
      makeConfig(),
      FAKE_CEM,
      Date.now(),
    );
    assertErrorResponse(result);
  });

  it('list_components handler error returns structured error', async () => {
    vi.mocked(listAllComponents).mockImplementation(() => {
      throw new Error('boom');
    });
    const result = await handleDiscoveryCall(
      'list_components',
      {},
      makeConfig(),
      FAKE_CEM,
      Date.now(),
    );
    assertErrorResponse(result);
  });
});

// ---------------------------------------------------------------------------
// Health tools — error responses
// ---------------------------------------------------------------------------

describe('Health tools: error response format', () => {
  it('unknown tool returns structured error', async () => {
    const result = await handleHealthCall('nonexistent_health_tool', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });

  it('score_component without tag_name returns structured error', async () => {
    const result = await handleHealthCall('score_component', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });

  it('get_health_trend without tag_name returns structured error', async () => {
    const result = await handleHealthCall('get_health_trend', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });

  it('get_health_diff without tag_name returns structured error', async () => {
    const result = await handleHealthCall('get_health_diff', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });

  it('score_component handler error returns structured error', async () => {
    vi.mocked(scoreComponent).mockRejectedValue(new Error('handler boom'));
    const result = await handleHealthCall(
      'score_component',
      { tagName: 'my-button' },
      makeConfig(),
      FAKE_CEM,
    );
    assertErrorResponse(result);
  });

  it('score_all_components handler error returns structured error', async () => {
    vi.mocked(scoreAllComponents).mockRejectedValue(new Error('boom'));
    const result = await handleHealthCall('score_all_components', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });
});

// ---------------------------------------------------------------------------
// Safety tools — error responses
// ---------------------------------------------------------------------------

describe('Safety tools: error response format', () => {
  it('unknown tool returns structured error', async () => {
    const result = await handleSafetyCall('nonexistent_safety_tool', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });

  it('diff_cem without required args returns structured error', async () => {
    const result = await handleSafetyCall('diff_cem', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });

  it('diff_cem handler error returns structured error', async () => {
    vi.mocked(diffCem).mockRejectedValue(new Error('git failure'));
    const result = await handleSafetyCall(
      'diff_cem',
      { tagName: 'my-button', baseBranch: 'main' },
      makeConfig(),
      FAKE_CEM,
    );
    assertErrorResponse(result);
  });

  it('check_breaking_changes handler error returns structured error', async () => {
    vi.mocked(listAllComponents).mockImplementation(() => {
      throw new Error('boom');
    });
    const result = await handleSafetyCall(
      'check_breaking_changes',
      { baseBranch: 'main' },
      makeConfig(),
      FAKE_CEM,
    );
    assertErrorResponse(result);
  });
});

// ---------------------------------------------------------------------------
// Component tools — error responses
// ---------------------------------------------------------------------------

describe('Component tools: error response format', () => {
  it('unknown tool returns structured error', async () => {
    const result = await handleComponentCall(
      'nonexistent_component_tool',
      {},
      makeConfig(),
      FAKE_CEM,
    );
    assertErrorResponse(result);
  });

  it('get_component without tagName returns structured error', async () => {
    const result = await handleComponentCall('get_component', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });

  it('get_component handler error returns structured error', async () => {
    vi.mocked(parseCem).mockImplementation(() => {
      throw new Error('not found');
    });
    const result = await handleComponentCall(
      'get_component',
      { tagName: 'my-button' },
      makeConfig(),
      FAKE_CEM,
    );
    assertErrorResponse(result);
  });

  it('validate_cem without tagName returns structured error', async () => {
    const result = await handleComponentCall('validate_cem', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });

  it('suggest_usage without tagName returns structured error', async () => {
    const result = await handleComponentCall('suggest_usage', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });

  it('get_component_narrative without tagName returns structured error', async () => {
    const result = await handleComponentCall('get_component_narrative', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });

  it('generate_story without tagName returns structured error', async () => {
    const result = await handleComponentCall('generate_story', {}, makeConfig(), FAKE_CEM);
    assertErrorResponse(result);
  });
});

// ---------------------------------------------------------------------------
// Token tools — error responses
// ---------------------------------------------------------------------------

describe('Token tools: error response format', () => {
  it('unknown tool returns structured error', async () => {
    const result = await handleTokenCall('nonexistent_token_tool', {}, makeConfig());
    assertErrorResponse(result);
  });

  it('find_token without query returns structured error', async () => {
    const result = await handleTokenCall('find_token', {}, makeConfig());
    assertErrorResponse(result);
  });

  it('get_design_tokens handler error returns structured error', async () => {
    vi.mocked(getDesignTokens).mockImplementation(() => {
      throw new Error('file missing');
    });
    const result = await handleTokenCall('get_design_tokens', {}, makeConfig());
    assertErrorResponse(result);
  });
});

// ---------------------------------------------------------------------------
// TypeScript tools — error responses
// ---------------------------------------------------------------------------

describe('TypeScript tools: error response format', () => {
  it('unknown tool returns structured error', () => {
    const result = handleTypeScriptCall('nonexistent_ts_tool', {}, makeConfig());
    assertErrorResponse(result);
  });

  it('get_file_diagnostics without filePath returns structured error', () => {
    const result = handleTypeScriptCall('get_file_diagnostics', {}, makeConfig());
    assertErrorResponse(result);
  });

  it('get_file_diagnostics handler error returns structured error', () => {
    vi.mocked(getFileDiagnostics).mockImplementation(() => {
      throw new Error('ts compile failed');
    });
    const result = handleTypeScriptCall(
      'get_file_diagnostics',
      { filePath: 'src/foo.ts' },
      makeConfig(),
    );
    assertErrorResponse(result);
  });
});

// ---------------------------------------------------------------------------
// CDN tools — error responses
// ---------------------------------------------------------------------------

describe('CDN tools: error response format', () => {
  it('unknown tool returns structured error', async () => {
    const result = await handleCdnCall('nonexistent_cdn_tool', {}, makeConfig());
    assertErrorResponse(result);
  });

  it('resolve_cdn_cem without package returns structured error', async () => {
    const result = await handleCdnCall('resolve_cdn_cem', {}, makeConfig());
    assertErrorResponse(result);
  });
});

// ---------------------------------------------------------------------------
// Framework tools — error responses
// ---------------------------------------------------------------------------

describe('Framework tools: error response format', () => {
  it('unknown tool returns structured error', async () => {
    const result = await handleFrameworkCall('nonexistent_framework_tool', {}, makeConfig());
    assertErrorResponse(result);
  });
});

// ---------------------------------------------------------------------------
// Validate tools — error responses
// ---------------------------------------------------------------------------

describe('Validate tools: error response format', () => {
  it('unknown tool returns structured error', async () => {
    const result = await handleValidateCall('nonexistent_validate_tool', {}, FAKE_CEM);
    assertErrorResponse(result);
  });

  it('validate_usage without required args returns structured error', async () => {
    const result = await handleValidateCall('validate_usage', {}, FAKE_CEM);
    assertErrorResponse(result);
  });

  it('validate_usage with only tagName returns structured error', async () => {
    const result = await handleValidateCall('validate_usage', { tagName: 'my-button' }, FAKE_CEM);
    assertErrorResponse(result);
  });
});

// ---------------------------------------------------------------------------
// isTool guards — verify all 9 tool groups
// ---------------------------------------------------------------------------

describe('isTool guards: every group returns false for unknown names', () => {
  const guards = [
    { name: 'isDiscoveryTool', fn: isDiscoveryTool },
    { name: 'isHealthTool', fn: isHealthTool },
    { name: 'isSafetyTool', fn: isSafetyTool },
    { name: 'isComponentTool', fn: isComponentTool },
    { name: 'isTokenTool', fn: isTokenTool },
    { name: 'isTypeScriptTool', fn: isTypeScriptTool },
    { name: 'isCdnTool', fn: isCdnTool },
    { name: 'isFrameworkTool', fn: isFrameworkTool },
    { name: 'isValidateTool', fn: isValidateTool },
  ];

  for (const { name, fn } of guards) {
    it(`${name} returns false for "totally_fake_tool"`, () => {
      expect(fn('totally_fake_tool')).toBe(false);
    });

    it(`${name} returns false for empty string`, () => {
      expect(fn('')).toBe(false);
    });
  }
});
