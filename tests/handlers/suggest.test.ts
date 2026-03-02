import { describe, it, expect, vi, afterEach } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { suggestUsage, generateImport } from '../../src/handlers/suggest.js';
import { MCPError } from '../../src/shared/error-handling.js';
import type { McpWcConfig } from '../../src/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

function makeConfig(): McpWcConfig {
  return {
    cemPath: 'custom-elements.json',
    projectRoot: FIXTURES_DIR,
    componentPrefix: '',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// suggestUsage — component with variants (my-button)
// ---------------------------------------------------------------------------

describe('suggestUsage — component with variants (my-button)', () => {
  it('returns the correct tagName', async () => {
    const result = await suggestUsage('my-button', makeConfig());
    expect(result.tagName).toBe('my-button');
  });

  it('detects variant options for the variant attribute', async () => {
    const result = await suggestUsage('my-button', makeConfig());
    expect(result.variantOptions['variant']).toEqual(['primary', 'secondary', 'danger']);
  });

  it('detects variant options for the size attribute', async () => {
    const result = await suggestUsage('my-button', makeConfig());
    expect(result.variantOptions['size']).toEqual(['sm', 'md', 'lg']);
  });

  it('includes the first variant option in the HTML snippet', async () => {
    const result = await suggestUsage('my-button', makeConfig());
    expect(result.htmlSnippet).toContain('variant="primary"');
  });

  it('includes size with its first option in the HTML snippet', async () => {
    const result = await suggestUsage('my-button', makeConfig());
    expect(result.htmlSnippet).toContain('size="sm"');
  });

  it('includes valid opening and closing tags in the HTML snippet', async () => {
    const result = await suggestUsage('my-button', makeConfig());
    expect(result.htmlSnippet).toContain('<my-button');
    expect(result.htmlSnippet).toContain('</my-button>');
  });

  it('returns a variantOptions object with at least two entries', async () => {
    const result = await suggestUsage('my-button', makeConfig());
    expect(Object.keys(result.variantOptions).length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// suggestUsage — component with no required attributes (my-button)
// ---------------------------------------------------------------------------

describe('suggestUsage — component with no required attributes (my-button)', () => {
  it('returns an empty requiredAttributes array', async () => {
    // my-button: variant and size are string literal unions (optional), disabled and loading are boolean (optional)
    const result = await suggestUsage('my-button', makeConfig());
    expect(result.requiredAttributes).toHaveLength(0);
  });

  it('lists all field names in optionalAttributes', async () => {
    const result = await suggestUsage('my-button', makeConfig());
    expect(result.optionalAttributes).toContain('variant');
    expect(result.optionalAttributes).toContain('disabled');
    expect(result.optionalAttributes).toContain('loading');
    expect(result.optionalAttributes).toContain('size');
  });

  it('does not include boolean attributes in the HTML snippet', async () => {
    const result = await suggestUsage('my-button', makeConfig());
    // disabled and loading are boolean attrs — they should not appear as attr="..."
    expect(result.htmlSnippet).not.toContain('disabled=');
    expect(result.htmlSnippet).not.toContain('loading=');
  });
});

// ---------------------------------------------------------------------------
// suggestUsage — component with slots (my-card)
// ---------------------------------------------------------------------------

describe('suggestUsage — component with slots (my-card)', () => {
  it('returns slots array with the correct slot names', async () => {
    const result = await suggestUsage('my-card', makeConfig());
    const slotNames = result.slots.map((s) => s.name);
    expect(slotNames).toContain('');
    expect(slotNames).toContain('header');
    expect(slotNames).toContain('footer');
    expect(slotNames).toContain('media');
  });

  it('includes named slot references in the HTML snippet', async () => {
    const result = await suggestUsage('my-card', makeConfig());
    expect(result.htmlSnippet).toContain('slot="header"');
    expect(result.htmlSnippet).toContain('slot="footer"');
    expect(result.htmlSnippet).toContain('slot="media"');
  });

  it('includes a default slot comment in the HTML snippet', async () => {
    const result = await suggestUsage('my-card', makeConfig());
    expect(result.htmlSnippet).toContain('<!--');
  });

  it('returns slot objects with name and description fields', async () => {
    const result = await suggestUsage('my-card', makeConfig());
    for (const slot of result.slots) {
      expect(typeof slot.name).toBe('string');
      expect(typeof slot.description).toBe('string');
    }
  });

  it('my-card HTML snippet contains the opening and closing tag', async () => {
    const result = await suggestUsage('my-card', makeConfig());
    expect(result.htmlSnippet).toContain('<my-card');
    expect(result.htmlSnippet).toContain('</my-card>');
  });
});

// ---------------------------------------------------------------------------
// generateImport — both export patterns
// ---------------------------------------------------------------------------

describe('generateImport', () => {
  it('returns a sideEffectImport string for my-button', async () => {
    const result = await generateImport('my-button', makeConfig());
    expect(typeof result.sideEffectImport).toBe('string');
    expect(result.sideEffectImport.length).toBeGreaterThan(0);
  });

  it('returns a namedImport string for my-button', async () => {
    const result = await generateImport('my-button', makeConfig());
    expect(typeof result.namedImport).toBe('string');
    expect(result.namedImport.length).toBeGreaterThan(0);
  });

  it('side-effect import uses bare import without braces (my-button)', async () => {
    const result = await generateImport('my-button', makeConfig());
    expect(result.sideEffectImport).toMatch(/^import '/);
    expect(result.sideEffectImport).not.toContain('{');
  });

  it('named import uses the class name in braces (my-button)', async () => {
    const result = await generateImport('my-button', makeConfig());
    expect(result.namedImport).toContain('{ MyButton }');
  });

  it('import path includes the CEM module path for my-button', async () => {
    const result = await generateImport('my-button', makeConfig());
    expect(result.modulePath).toBe('src/components/my-button.js');
    expect(result.sideEffectImport).toContain('src/components/my-button.js');
    expect(result.namedImport).toContain('src/components/my-button.js');
  });

  it('import path uses the package name from package.json', async () => {
    const result = await generateImport('my-button', makeConfig());
    expect(result.packageName).toBe('my-component-lib');
    expect(result.sideEffectImport).toContain('my-component-lib/');
    expect(result.namedImport).toContain('my-component-lib/');
  });

  it('works for my-card — named import contains MyCard', async () => {
    const result = await generateImport('my-card', makeConfig());
    expect(result.namedImport).toContain('{ MyCard }');
  });

  it('works for my-card — side-effect import is correct', async () => {
    const result = await generateImport('my-card', makeConfig());
    expect(result.sideEffectImport).toContain('src/components/my-card.js');
    expect(result.sideEffectImport).not.toContain('{');
  });

  it('works for my-select — returns the correct module path', async () => {
    const result = await generateImport('my-select', makeConfig());
    expect(result.modulePath).toBe('src/components/my-select.js');
    expect(result.namedImport).toContain('{ MySelect }');
  });
});

// ---------------------------------------------------------------------------
// Shoelace fixture — suggestUsage with shoelace-custom-elements.json
// ---------------------------------------------------------------------------

function makeShoelaceConfig(overrides: Partial<McpWcConfig> = {}): McpWcConfig {
  return {
    cemPath: 'shoelace-custom-elements.json',
    projectRoot: FIXTURES_DIR,
    componentPrefix: 'sl-',
    healthHistoryDir: '.mcp-wc/health',
    tsconfigPath: 'tsconfig.json',
    tokensPath: null,
    cdnBase: null,
    ...overrides,
  };
}

describe('suggestUsage — Shoelace sl-button', () => {
  it('returns correct tagName', async () => {
    const result = await suggestUsage('sl-button', makeShoelaceConfig());
    expect(result.tagName).toBe('sl-button');
  });

  it('detects variant options for the variant attribute', async () => {
    const result = await suggestUsage('sl-button', makeShoelaceConfig());
    expect(result.variantOptions['variant']).toContain('primary');
    expect(result.variantOptions['variant']).toContain('default');
  });

  it('detects variant options for the size attribute', async () => {
    const result = await suggestUsage('sl-button', makeShoelaceConfig());
    expect(result.variantOptions['size']).toEqual(['small', 'medium', 'large']);
  });

  it('includes slots in the result', async () => {
    const result = await suggestUsage('sl-button', makeShoelaceConfig());
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots.some((s) => s.name === 'prefix')).toBe(true);
  });

  it('does not include notes for sl-button', async () => {
    const result = await suggestUsage('sl-button', makeShoelaceConfig());
    expect(result.notes).toBeUndefined();
  });
});

describe('suggestUsage — Shoelace sl-icon awareness', () => {
  it('includes a notes array for sl-icon', async () => {
    const result = await suggestUsage('sl-icon', makeShoelaceConfig());
    expect(result.notes).toBeDefined();
    expect(result.notes!.length).toBeGreaterThan(0);
  });

  it('notes mention Bootstrap Icons', async () => {
    const result = await suggestUsage('sl-icon', makeShoelaceConfig());
    expect(result.notes![0]).toContain('Bootstrap Icons');
  });

  it('notes mention the name attribute', async () => {
    const result = await suggestUsage('sl-icon', makeShoelaceConfig());
    expect(result.notes![0]).toContain('"name"');
  });
});

// ---------------------------------------------------------------------------
// suggestUsage — framework snippets
// ---------------------------------------------------------------------------

describe('suggestUsage — framework snippets', () => {
  it('returns frameworkSnippet when framework="react" is explicitly set', async () => {
    const result = await suggestUsage('my-button', makeConfig(), undefined, { framework: 'react' });
    expect(result.framework).toBe('react');
    expect(result.frameworkSnippet).toBeDefined();
    expect(result.frameworkSnippet).toContain('function MyComponent');
    expect(result.frameworkSnippet).toContain('my-button');
  });

  it('react snippet converts HTML comments to JSX comments', async () => {
    const result = await suggestUsage('my-card', makeConfig(), undefined, { framework: 'react' });
    expect(result.frameworkSnippet).toContain('{/* ');
    expect(result.frameworkSnippet).not.toContain('<!-- ');
  });

  it('returns frameworkSnippet when framework="vue" is explicitly set', async () => {
    const result = await suggestUsage('my-button', makeConfig(), undefined, { framework: 'vue' });
    expect(result.framework).toBe('vue');
    expect(result.frameworkSnippet).toBeDefined();
    expect(result.frameworkSnippet).toContain('<template>');
    expect(result.frameworkSnippet).toContain('my-button');
  });

  it('returns frameworkSnippet when framework="svelte" is explicitly set', async () => {
    const result = await suggestUsage('my-button', makeConfig(), undefined, {
      framework: 'svelte',
    });
    expect(result.framework).toBe('svelte');
    expect(result.frameworkSnippet).toBeDefined();
    expect(result.frameworkSnippet).toContain('<script lang="ts">');
  });

  it('returns frameworkSnippet when framework="angular" is explicitly set', async () => {
    const result = await suggestUsage('my-button', makeConfig(), undefined, {
      framework: 'angular',
    });
    expect(result.framework).toBe('angular');
    expect(result.frameworkSnippet).toBeDefined();
    expect(result.frameworkSnippet).toContain('CUSTOM_ELEMENTS_SCHEMA');
  });

  it('returns no frameworkSnippet when framework="html"', async () => {
    const result = await suggestUsage('my-button', makeConfig(), undefined, { framework: 'html' });
    expect(result.framework).toBe('html');
    expect(result.frameworkSnippet).toBeUndefined();
  });

  it('returns no frameworkSnippet when no framework option and project has no framework deps', async () => {
    // The fixtures dir package.json has no framework deps
    const result = await suggestUsage('my-button', makeConfig());
    expect(result.frameworkSnippet).toBeUndefined();
    expect(result.framework).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// suggestUsage — error paths
// ---------------------------------------------------------------------------

describe('suggestUsage — error paths', () => {
  it('throws MCPError when CEM file does not exist', async () => {
    const config: McpWcConfig = {
      ...makeConfig(),
      cemPath: 'nonexistent-cem.json',
    };
    await expect(suggestUsage('my-button', config)).rejects.toThrow(MCPError);
  });

  it('accepts an explicit cem argument and skips file loading', async () => {
    // Provide a minimal inline CEM to avoid any file I/O
    const inlineCem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module' as const,
          path: 'src/x-foo.js',
          declarations: [
            {
              kind: 'class' as const,
              name: 'XFoo',
              tagName: 'x-foo',
              members: [],
              events: [],
              slots: [],
            },
          ],
        },
      ],
    };
    const result = await suggestUsage('x-foo', makeConfig(), inlineCem as never);
    expect(result.tagName).toBe('x-foo');
    expect(result.htmlSnippet).toContain('<x-foo>');
  });
});

// ---------------------------------------------------------------------------
// suggestUsage — Stencil detection
// ---------------------------------------------------------------------------

describe('suggestUsage — Stencil CEM detection', () => {
  it('includes a Stencil note when CEM modules have .tsx paths', async () => {
    const stencilConfig: McpWcConfig = {
      cemPath: 'stencil-custom-elements.json',
      projectRoot: FIXTURES_DIR,
      componentPrefix: 'ion-',
      tokensPath: null,
    };
    const result = await suggestUsage('ion-button', stencilConfig);
    expect(result.notes).toBeDefined();
    const stencilNote = result.notes!.find((n) => n.includes('Stencil'));
    expect(stencilNote).toBeDefined();
    expect(stencilNote).toContain('defineCustomElements');
  });
});

// ---------------------------------------------------------------------------
// suggestUsage — framework detection via fixture package.json files
// ---------------------------------------------------------------------------

// Minimal inline CEM for framework detection tests (avoids file loading for CEM)
const minimalCem = {
  schemaVersion: '1.0.0',
  modules: [
    {
      kind: 'javascript-module' as const,
      path: 'src/my-button.js',
      declarations: [
        {
          kind: 'class' as const,
          name: 'MyButton',
          tagName: 'my-button',
          members: [],
          events: [],
          slots: [],
        },
      ],
    },
  ],
};

describe('suggestUsage — auto-detected framework from package.json', () => {
  it('detects vue when package.json lists vue as a dependency', async () => {
    // vue-project/ has package.json with vue; pass inline CEM to skip CEM file loading
    const config: McpWcConfig = {
      ...makeConfig(),
      projectRoot: resolve(FIXTURES_DIR, 'vue-project'),
    };
    const result = await suggestUsage('my-button', config, minimalCem as never);
    expect(result.framework).toBe('vue');
    expect(result.frameworkSnippet).toContain('<template>');
  });

  it('detects svelte when package.json lists svelte as a dependency', async () => {
    const config: McpWcConfig = {
      ...makeConfig(),
      projectRoot: resolve(FIXTURES_DIR, 'svelte-project'),
    };
    const result = await suggestUsage('my-button', config, minimalCem as never);
    expect(result.framework).toBe('svelte');
    expect(result.frameworkSnippet).toContain('<script lang="ts">');
  });

  it('detects angular when package.json lists @angular/core as a dependency', async () => {
    const config: McpWcConfig = {
      ...makeConfig(),
      projectRoot: resolve(FIXTURES_DIR, 'angular-project'),
    };
    const result = await suggestUsage('my-button', config, minimalCem as never);
    expect(result.framework).toBe('angular');
    expect(result.frameworkSnippet).toContain('CUSTOM_ELEMENTS_SCHEMA');
  });

  it('detects react when package.json lists react as a dependency', async () => {
    const config: McpWcConfig = {
      ...makeConfig(),
      projectRoot: resolve(FIXTURES_DIR, 'react-project'),
    };
    const result = await suggestUsage('my-button', config, minimalCem as never);
    expect(result.framework).toBe('react');
    expect(result.frameworkSnippet).toContain('function MyComponent');
  });

  it('returns no framework when projectRoot has no package.json', async () => {
    // no-pkg-project/ has no package.json — detectFrontendFramework returns null
    const config: McpWcConfig = {
      ...makeConfig(),
      projectRoot: resolve(FIXTURES_DIR, 'no-pkg-project'),
    };
    const result = await suggestUsage('my-button', config, minimalCem as never);
    expect(result.framework).toBeUndefined();
    expect(result.frameworkSnippet).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// generateImport — error paths
// ---------------------------------------------------------------------------

describe('generateImport — error paths', () => {
  it('throws MCPError when component is not found in CEM', async () => {
    await expect(generateImport('non-existent-tag', makeConfig())).rejects.toThrow(MCPError);
  });

  it('accepts an explicit cem argument and skips file loading for generateImport', async () => {
    // Provide a minimal inline CEM with my-button so readJSON is never called for CEM
    const inlineCem = {
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module' as const,
          path: 'src/components/my-button.js',
          declarations: [
            {
              kind: 'class' as const,
              name: 'MyButton',
              tagName: 'my-button',
            },
          ],
        },
      ],
    };
    const result = await generateImport('my-button', makeConfig(), inlineCem as never);
    expect(result.modulePath).toBe('src/components/my-button.js');
    expect(result.namedImport).toContain('{ MyButton }');
  });
});

// ---------------------------------------------------------------------------
// suggestUsage — extractUnionOptions edge cases
// ---------------------------------------------------------------------------

describe('suggestUsage — extractUnionOptions edge cases', () => {
  it('treats a field with a single-string-literal type as a non-variant (null from extractUnionOptions)', async () => {
    // A field with a single quoted string literal is not >= 2, so no variantOptions entry
    // my-button variant field uses 3 literals — test with a component that has no variant
    const result = await suggestUsage('my-card', makeConfig());
    // my-card has no variant union fields; variantOptions should be empty
    expect(Object.keys(result.variantOptions)).toHaveLength(0);
  });

  it('treats a mixed union type (string literal + non-literal) as non-variant', async () => {
    // Stencil ion-button color field has type ending in "| undefined" — extractUnionOptions returns null
    const stencilConfig: McpWcConfig = {
      cemPath: 'stencil-custom-elements.json',
      projectRoot: FIXTURES_DIR,
      componentPrefix: 'ion-',
      tokensPath: null,
    };
    const result = await suggestUsage('ion-button', stencilConfig);
    // The color field type includes "| undefined" so it should NOT appear as a variantOptions entry
    expect(result.variantOptions['color']).toBeUndefined();
  });
});

describe('generateImport — CDN mode via cdnBase', () => {
  it('returns mode cdn when cdnBase is set', async () => {
    const config = makeShoelaceConfig({
      cdnBase: 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn',
    });
    const result = await generateImport('sl-button', config);
    expect(result.mode).toBe('cdn');
  });

  it('returns cdnStylesheetLink containing themes/light.css', async () => {
    const config = makeShoelaceConfig({
      cdnBase: 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn',
    });
    const result = await generateImport('sl-button', config);
    expect(result.cdnStylesheetLink).toContain('themes/light.css');
  });

  it('returns cdnScriptLink containing shoelace-autoloader.js', async () => {
    const config = makeShoelaceConfig({
      cdnBase: 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn',
    });
    const result = await generateImport('sl-button', config);
    expect(result.cdnScriptLink).toContain('shoelace-autoloader.js');
  });

  it('sideEffectImport is a script tag in CDN mode', async () => {
    const config = makeShoelaceConfig({
      cdnBase: 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn',
    });
    const result = await generateImport('sl-button', config);
    expect(result.sideEffectImport).toContain('<script');
    expect(result.sideEffectImport).not.toContain("import '");
  });

  it('returns mode esm when cdnBase is null', async () => {
    const result = await generateImport('sl-button', makeShoelaceConfig());
    expect(result.mode).toBe('esm');
  });
});
