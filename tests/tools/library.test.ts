import { describe, it, expect, beforeEach } from 'vitest';
import {
  LIBRARY_TOOL_DEFINITIONS,
  handleLibraryCall,
  isLibraryTool,
} from '../../packages/core/src/tools/library.js';
import { loadLibrary, resetCemStore } from '../../packages/core/src/handlers/cem.js';
import type { Cem } from '../../packages/core/src/handlers/cem.js';
import type { McpWcConfig } from '../../packages/core/src/config.js';

const MOCK_CEM: Cem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'src/button.ts',
      declarations: [
        {
          kind: 'class',
          name: 'MyButton',
          tagName: 'my-button',
          description: 'A button',
        },
      ],
    },
  ],
};

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: '/tmp/test',
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    watch: false,
  };
}

describe('LIBRARY_TOOL_DEFINITIONS', () => {
  it('exports exactly 3 tool definitions', () => {
    expect(LIBRARY_TOOL_DEFINITIONS).toHaveLength(3);
  });

  it('defines load_library, list_libraries, unload_library', () => {
    const names = LIBRARY_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('load_library');
    expect(names).toContain('list_libraries');
    expect(names).toContain('unload_library');
  });
});

describe('isLibraryTool', () => {
  it('returns true for library tool names', () => {
    expect(isLibraryTool('load_library')).toBe(true);
    expect(isLibraryTool('list_libraries')).toBe(true);
    expect(isLibraryTool('unload_library')).toBe(true);
  });

  it('returns false for non-library tool names', () => {
    expect(isLibraryTool('list_components')).toBe(false);
    expect(isLibraryTool('get_component')).toBe(false);
  });
});

describe('handleLibraryCall', () => {
  const config = makeConfig();

  beforeEach(() => {
    resetCemStore();
    loadLibrary('default', MOCK_CEM, 'config');
  });

  describe('list_libraries', () => {
    it('returns loaded libraries', async () => {
      const result = await handleLibraryCall('list_libraries', {}, config);
      expect(result.isError).toBeFalsy();
      const content = result.content[0];
      expect(content.type).toBe('text');
      const parsed = JSON.parse((content as { text: string }).text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].libraryId).toBe('default');
    });
  });

  describe('unload_library', () => {
    it('refuses to unload default', async () => {
      const result = await handleLibraryCall('unload_library', { libraryId: 'default' }, config);
      expect(result.isError).toBe(true);
    });

    it('returns error for nonexistent library', async () => {
      const result = await handleLibraryCall(
        'unload_library',
        { libraryId: 'nonexistent' },
        config,
      );
      expect(result.isError).toBe(true);
    });
  });

  describe('load_library', () => {
    it('rejects overwriting default', async () => {
      const result = await handleLibraryCall(
        'load_library',
        { libraryId: 'default', cemPath: 'some/path.json' },
        config,
      );
      expect(result.isError).toBe(true);
    });

    it('requires cemPath or packageName', async () => {
      const result = await handleLibraryCall('load_library', { libraryId: 'test' }, config);
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('cemPath');
      expect(text).toContain('packageName');
    });
  });
});
