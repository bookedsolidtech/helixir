/**
 * Minimal smoke tests for tool dispatcher modules that were not otherwise covered.
 * Each dispatcher exports an `isTool` guard and a `handleTool` dispatch function.
 * These tests cover the basic paths: unknown tool → error, guard returns correct boolean.
 */
import { describe, it, expect, vi } from 'vitest';
import { isCdnTool, handleCdnCall } from '../../packages/core/src/tools/cdn.js';
import { isFrameworkTool, handleFrameworkCall } from '../../packages/core/src/tools/framework.js';
import { isValidateTool, handleValidateCall } from '../../packages/core/src/tools/validate.js';
import { isTokenTool } from '../../packages/core/src/tools/tokens.js';
import { isTypeScriptTool } from '../../packages/core/src/tools/typescript.js';
import { isBundleTool, handleBundleCall } from '../../packages/core/src/tools/bundle.js';
import {
  isCompositionTool,
  handleCompositionCall,
} from '../../packages/core/src/tools/composition.js';
import { isStoryTool, handleStoryCall } from '../../packages/core/src/tools/story.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';

const FAKE_CONFIG: McpWcConfig = {
  cemPath: 'custom-elements.json',
  projectRoot: '/fake/project',
  componentPrefix: '',
  healthHistoryDir: '.mcp-wc/health',
  tsconfigPath: 'tsconfig.json',
  tokensPath: null,
  cdnBase: null,
  watch: false,
};

const FAKE_CEM: Cem = { schemaVersion: '1.0.0', modules: [] };

// ---------------------------------------------------------------------------
// CDN tool dispatcher
// ---------------------------------------------------------------------------

describe('isCdnTool', () => {
  it('returns true for resolve_cdn_cem', () => {
    expect(isCdnTool('resolve_cdn_cem')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isCdnTool('get_design_tokens')).toBe(false);
    expect(isCdnTool('')).toBe(false);
  });
});

describe('handleCdnCall — unknown tool', () => {
  it('returns error for unknown tool name', async () => {
    const result = await handleCdnCall('nonexistent_tool', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown CDN tool');
  });

  it('returns error for missing required args', async () => {
    const result = await handleCdnCall('resolve_cdn_cem', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Framework tool dispatcher
// ---------------------------------------------------------------------------

vi.mock('../../packages/core/src/handlers/framework.js', () => ({
  detectFramework: vi.fn(() => ({ formatted: 'Lit v3.0.0' })),
}));

describe('isFrameworkTool', () => {
  it('returns true for detect_framework', () => {
    expect(isFrameworkTool('detect_framework')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isFrameworkTool('score_component')).toBe(false);
    expect(isFrameworkTool('')).toBe(false);
  });
});

describe('handleFrameworkCall', () => {
  it('returns success for detect_framework', async () => {
    const result = await handleFrameworkCall('detect_framework', {}, FAKE_CONFIG);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Lit');
  });

  it('returns error for unknown tool name', async () => {
    const result = await handleFrameworkCall('nonexistent', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown framework tool');
  });
});

// ---------------------------------------------------------------------------
// Validate tool dispatcher
// ---------------------------------------------------------------------------

vi.mock('../../packages/core/src/handlers/validate.js', () => ({
  validateUsage: vi.fn(() => ({ formatted: 'No issues found.' })),
}));

describe('isValidateTool', () => {
  it('returns true for validate_usage', () => {
    expect(isValidateTool('validate_usage')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isValidateTool('get_component')).toBe(false);
    expect(isValidateTool('')).toBe(false);
  });
});

describe('handleValidateCall', () => {
  it('returns success for validate_usage', () => {
    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'my-button', html: '<my-button></my-button>' },
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No issues found');
  });

  it('returns error for unknown tool name', () => {
    const result = handleValidateCall('nonexistent', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown validate tool');
  });

  it('returns error for missing required args', () => {
    const result = handleValidateCall('validate_usage', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });

  it('returns error when html exceeds 50,000 characters', () => {
    const result = handleValidateCall(
      'validate_usage',
      { tagName: 'my-button', html: 'x'.repeat(50_001) },
      FAKE_CEM,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('50,000');
  });
});

// ---------------------------------------------------------------------------
// Token and TypeScript tool guards (isTokenTool / isTypeScriptTool)
// ---------------------------------------------------------------------------

describe('isTokenTool', () => {
  it('returns true for get_design_tokens', () => {
    expect(isTokenTool('get_design_tokens')).toBe(true);
  });

  it('returns true for find_token', () => {
    expect(isTokenTool('find_token')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isTokenTool('score_component')).toBe(false);
    expect(isTokenTool('')).toBe(false);
  });
});

describe('isTypeScriptTool', () => {
  it('returns true for get_file_diagnostics', () => {
    expect(isTypeScriptTool('get_file_diagnostics')).toBe(true);
  });

  it('returns true for get_project_diagnostics', () => {
    expect(isTypeScriptTool('get_project_diagnostics')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isTypeScriptTool('list_components')).toBe(false);
    expect(isTypeScriptTool('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bundle tool dispatcher
// ---------------------------------------------------------------------------

vi.mock('../../packages/core/src/handlers/bundle.js', () => ({
  estimateBundleSize: vi.fn(async () => ({
    tagName: 'sl-button',
    package: '@shoelace-style/shoelace',
    version: '2.0.0',
    estimates: { component: { gzip: 5000, minified: 12000 }, full_package: null },
    formatted: 'Estimated bundle size: 5 kB gzip',
  })),
}));

describe('isBundleTool', () => {
  it('returns true for estimate_bundle_size', () => {
    expect(isBundleTool('estimate_bundle_size')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isBundleTool('resolve_cdn_cem')).toBe(false);
    expect(isBundleTool('')).toBe(false);
  });
});

describe('handleBundleCall', () => {
  it('returns success for estimate_bundle_size', async () => {
    const result = await handleBundleCall(
      'estimate_bundle_size',
      { tagName: 'sl-button' },
      FAKE_CONFIG,
    );
    expect(result.isError).toBeFalsy();
  });

  it('returns error for unknown tool name', async () => {
    const result = await handleBundleCall('nonexistent_tool', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Unknown bundle tool');
  });

  it('returns error for missing required args', async () => {
    const result = await handleBundleCall('estimate_bundle_size', {}, FAKE_CONFIG);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Composition tool dispatcher
// ---------------------------------------------------------------------------

vi.mock('../../packages/core/src/handlers/composition.js', () => ({
  getCompositionExample: vi.fn(() => ({
    components: ['my-card', 'my-button'],
    html: '<my-card><my-button slot="footer">Submit</my-button></my-card>',
  })),
}));

describe('isCompositionTool', () => {
  it('returns true for get_composition_example', () => {
    expect(isCompositionTool('get_composition_example')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isCompositionTool('list_components')).toBe(false);
    expect(isCompositionTool('')).toBe(false);
  });
});

describe('handleCompositionCall', () => {
  it('returns success for get_composition_example', () => {
    const result = handleCompositionCall(
      'get_composition_example',
      { tagNames: ['my-card', 'my-button'] },
      FAKE_CEM,
    );
    expect(result.isError).toBeFalsy();
  });

  it('returns error for unknown tool name', () => {
    const result = handleCompositionCall('nonexistent_tool', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Unknown composition tool');
  });

  it('returns error for missing required args', () => {
    const result = handleCompositionCall('get_composition_example', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });

  it('returns error for empty tag_names array', () => {
    const result = handleCompositionCall('get_composition_example', { tagNames: [] }, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Story tool dispatcher
// ---------------------------------------------------------------------------

vi.mock('../../packages/core/src/handlers/story.js', () => ({
  generateStory: vi.fn(() => "import type { Meta, StoryObj } from '@storybook/web-components';"),
}));

const FAKE_CEM_WITH_COMPONENT: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class',
          name: 'MyButton',
          tagName: 'my-button',
        },
      ],
    },
  ],
};

describe('isStoryTool', () => {
  it('returns true for generate_story', () => {
    expect(isStoryTool('generate_story')).toBe(true);
  });

  it('returns false for unknown tool', () => {
    expect(isStoryTool('list_components')).toBe(false);
    expect(isStoryTool('')).toBe(false);
  });
});

describe('handleStoryCall', () => {
  it('returns success for generate_story with known component', async () => {
    const result = await handleStoryCall(
      'generate_story',
      { tagName: 'my-button' },
      FAKE_CEM_WITH_COMPONENT,
    );
    expect(result.isError).toBeFalsy();
  });

  it('returns error when component is not in CEM', async () => {
    const result = await handleStoryCall('generate_story', { tagName: 'unknown-tag' }, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('not found in CEM');
  });

  it('returns error for unknown tool name', async () => {
    const result = await handleStoryCall('nonexistent_tool', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Unknown story tool');
  });

  it('returns error for missing required args', async () => {
    const result = await handleStoryCall('generate_story', {}, FAKE_CEM);
    expect(result.isError).toBe(true);
  });
});
