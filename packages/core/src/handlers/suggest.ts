import { readFile } from 'node:fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { SafeFileOperations } from '../shared/file-ops.js';
import { parseCem, CemSchema } from './cem.js';
import type { Cem } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';
import { getShadowDomWarnings } from '../shared/mcp-helpers.js';

export type FrontendFramework = 'react' | 'vue' | 'svelte' | 'angular' | 'html';

async function detectFrontendFramework(projectRoot: string): Promise<FrontendFramework | null> {
  const pkgPath = resolve(projectRoot, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as Record<string, unknown>;
    const deps = {
      ...((pkg['dependencies'] as Record<string, string>) ?? {}),
      ...((pkg['devDependencies'] as Record<string, string>) ?? {}),
    };
    if ('react' in deps || 'react-dom' in deps) return 'react';
    if ('vue' in deps) return 'vue';
    if ('svelte' in deps) return 'svelte';
    if ('@angular/core' in deps) return 'angular';
  } catch {
    // ignore
  }
  return null;
}

function buildReactSnippet(
  tagName: string,
  attrParts: string[],
  slotLines: string[],
  booleanFields: string[],
): string {
  const jsxAttrs = attrParts.map((a) => a.trim());
  const boolAttrs = booleanFields.map((b) => `  ${b}`);
  const allAttrs = [...jsxAttrs, ...boolAttrs];
  // Convert <!-- ... --> to {/* ... */}
  const jsxSlots = slotLines.map((s) => s.replace(/<!--\s*(.*?)\s*-->/g, '{/* $1 */}'));
  const tagOpen = allAttrs.length > 0 ? `<${tagName}\n${allAttrs.join('\n')}\n>` : `<${tagName}>`;
  const inner = jsxSlots.length > 0 ? `\n${jsxSlots.join('\n')}\n` : '';
  return `function MyComponent() {\n  return (\n    ${tagOpen}${inner}</${tagName}>\n  );\n}`;
}

function buildVueSnippet(
  tagName: string,
  attrParts: string[],
  slotLines: string[],
  eventNames: string[],
): string {
  const attrs = attrParts.map((a) => a.trim());
  const events = eventNames.map(
    (e) => `  @${e}="handle${e.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}"`,
  );
  const allAttrs = [...attrs, ...events];
  const tagOpen = allAttrs.length > 0 ? `<${tagName}\n${allAttrs.join('\n')}\n>` : `<${tagName}>`;
  const inner = slotLines.length > 0 ? `\n${slotLines.join('\n')}\n` : '';
  return `<template>\n  ${tagOpen}${inner}</${tagName}>\n</template>`;
}

function buildSvelteSnippet(
  tagName: string,
  attrParts: string[],
  slotLines: string[],
  eventNames: string[],
): string {
  const attrs = attrParts.map((a) => a.trim());
  const events = eventNames.map(
    (e) => `  on:${e}={handle${e.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}}`,
  );
  const allAttrs = [...attrs, ...events];
  const tagOpen = allAttrs.length > 0 ? `<${tagName}\n${allAttrs.join('\n')}\n>` : `<${tagName}>`;
  const inner = slotLines.length > 0 ? `\n${slotLines.join('\n')}\n` : '';
  return `<script lang="ts">\n  // Note: augment HTMLElementTagNameMap for TypeScript support\n</script>\n\n${tagOpen}${inner}</${tagName}>`;
}

function buildAngularSnippet(
  tagName: string,
  attrParts: string[],
  slotLines: string[],
  eventNames: string[],
): string {
  const attrs = attrParts.map((a) => a.trim());
  const events = eventNames.map((e) => {
    const handler = e.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());
    return `  (${handler.charAt(0).toLowerCase() + handler.slice(1)})="handle${handler}($event)"`;
  });
  const allAttrs = [...attrs, ...events];
  const tagOpen = allAttrs.length > 0 ? `<${tagName}\n${allAttrs.join('\n')}\n>` : `<${tagName}>`;
  const inner = slotLines.length > 0 ? `\n${slotLines.join('\n')}\n` : '';
  return `<!-- Remember: add CUSTOM_ELEMENTS_SCHEMA to your module -->\n${tagOpen}${inner}</${tagName}>`;
}

async function loadCemFromConfig(config: McpWcConfig): Promise<Cem> {
  const cemPath = resolve(config.projectRoot, config.cemPath);
  if (!existsSync(cemPath)) {
    throw new MCPError(`CEM file not found: ${config.cemPath}`, ErrorCategory.FILESYSTEM);
  }
  return CemSchema.parse(JSON.parse(await readFile(cemPath, 'utf-8')));
}

// ─── Return types ─────────────────────────────────────────────────────────────

export interface SuggestUsageStylingProperty {
  name: string;
  exampleValue: string;
  description: string;
}

export interface SuggestUsageStylingPart {
  name: string;
  description: string;
  exampleSelector: string;
}

export interface SuggestUsageStyling {
  cssProperties: SuggestUsageStylingProperty[];
  cssParts: SuggestUsageStylingPart[];
  cssSnippet: string;
  warnings: string[];
}

export interface SuggestUsageResult {
  tagName: string;
  htmlSnippet: string;
  requiredAttributes: string[];
  optionalAttributes: string[];
  variantOptions: Record<string, string[]>;
  slots: Array<{ name: string; description: string }>;
  notes?: string[];
  framework?: FrontendFramework;
  frameworkSnippet?: string;
  styling?: SuggestUsageStyling;
}

export interface GenerateImportResult {
  sideEffectImport: string;
  namedImport: string;
  modulePath: string;
  packageName: string;
  mode?: 'esm' | 'cdn';
  cdnStylesheetLink?: string;
  cdnScriptLink?: string;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

const PackageJsonSchema = z.object({
  name: z.string(),
});

function isOptionalType(typeText: string): boolean {
  return (
    typeText.includes('undefined') ||
    typeText.includes('null') ||
    typeText === 'boolean' ||
    typeText.startsWith('boolean ')
  );
}

/**
 * Returns the string literal options if the type is a union of string literals.
 * e.g. "'primary' | 'secondary' | 'danger'" → ['primary', 'secondary', 'danger']
 */
function extractUnionOptions(typeText: string): string[] | null {
  const parts = typeText.split('|').map((p) => p.trim());
  const stringLiterals = parts.filter(
    (p) => (p.startsWith("'") && p.endsWith("'")) || (p.startsWith('"') && p.endsWith('"')),
  );
  if (stringLiterals.length >= 2 && stringLiterals.length === parts.length) {
    return stringLiterals.map((p) => p.slice(1, -1));
  }
  return null;
}

function buildStyling(
  tagName: string,
  meta: {
    cssProperties: Array<{ name: string; description: string; default?: string }>;
    cssParts: Array<{ name: string; description: string }>;
  },
): SuggestUsageStyling | undefined {
  if (meta.cssProperties.length === 0 && meta.cssParts.length === 0) return undefined;

  const topProps = meta.cssProperties.slice(0, 5);
  const topParts = meta.cssParts.slice(0, 4);

  const cssProperties: SuggestUsageStylingProperty[] = topProps.map((p) => ({
    name: p.name,
    exampleValue: p.default ?? 'initial',
    description: p.description,
  }));

  const cssParts: SuggestUsageStylingPart[] = topParts.map((p) => ({
    name: p.name,
    description: p.description,
    exampleSelector: `${tagName}::part(${p.name})`,
  }));

  const propLines = topProps.map((p) => `  ${p.name}: ${p.default ?? 'initial'};`).join('\n');

  const partLines = topParts
    .map((p) => `${tagName}::part(${p.name}) {\n  /* ${p.description || p.name} */\n}`)
    .join('\n\n');

  const snippetParts: string[] = [];
  if (topProps.length > 0) {
    snippetParts.push(`${tagName} {\n${propLines}\n}`);
  }
  if (topParts.length > 0) {
    snippetParts.push(partLines);
  }
  const cssSnippet = snippetParts.join('\n\n');

  const warnings: string[] = getShadowDomWarnings(tagName);

  return { cssProperties, cssParts, cssSnippet, warnings };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synthesizes a usage HTML snippet from a component's CEM member list.
 * Attributes with union types show the first option as the default value.
 * Boolean attributes are listed as optional and omitted from the snippet by default.
 * Fields without defaults and with concrete non-boolean types are listed as required.
 */
export async function suggestUsage(
  tagName: string,
  config: McpWcConfig,
  cem?: Cem,
  options?: { framework?: FrontendFramework },
): Promise<SuggestUsageResult> {
  const resolvedCem = cem ?? (await loadCemFromConfig(config));
  const meta = parseCem(tagName, resolvedCem);
  const fields = meta.members.filter((m) => m.kind === 'field');

  const requiredAttributes: string[] = [];
  const optionalAttributes: string[] = [];
  const variantOptions: Record<string, string[]> = {};
  const attrParts: string[] = [];
  const booleanFields: string[] = [];

  for (const field of fields) {
    const typeText = field.type ?? '';
    const fieldOptions = typeText ? extractUnionOptions(typeText) : null;

    if (fieldOptions) {
      variantOptions[field.name] = fieldOptions;
    }

    const isOptional = !typeText || isOptionalType(typeText) || fieldOptions !== null;
    if (isOptional) {
      optionalAttributes.push(field.name);
    } else {
      requiredAttributes.push(field.name);
    }

    // Build attribute snippet
    if (typeText === 'boolean' || typeText.startsWith('boolean ')) {
      // Boolean attrs: omit from default snippet (defaults to false/absent)
      booleanFields.push(field.name);
    } else if (fieldOptions && fieldOptions.length > 0) {
      attrParts.push(`  ${field.name}="${fieldOptions[0]}"`);
    } else if (!isOptionalType(typeText) && typeText) {
      // Required non-boolean, non-variant field — show placeholder
      attrParts.push(`  ${field.name}=""`);
    }
  }

  // Build slot content
  const slots = meta.slots;
  const slotLines = slots.map((s) => {
    if (s.name === '') {
      return `  <!-- ${s.description || 'content'} -->`;
    }
    return `  <span slot="${s.name}"><!-- ${s.description || s.name} --></span>`;
  });

  // Compose HTML snippet
  const tagOpen = attrParts.length > 0 ? `<${tagName}\n${attrParts.join('\n')}\n>` : `<${tagName}>`;
  const inner = slotLines.length > 0 ? `\n${slotLines.join('\n')}\n` : '';
  const htmlSnippet = `${tagOpen}${inner}</${tagName}>`;

  const notes: string[] = [];
  if (tagName === 'sl-icon') {
    notes.push(
      'sl-icon accepts a "name" attribute drawn from the Bootstrap Icons set (1500+ icons). ' +
        'Browse icons at https://icons.getbootstrap.com/. Example: <sl-icon name="heart"></sl-icon>',
    );
  }

  // Detect Stencil CEM by checking if module source paths use .tsx extension
  const isStencil = resolvedCem.modules.some((mod) => mod.path.endsWith('.tsx'));

  if (isStencil) {
    notes.push(
      'This component is built with Stencil. Stencil components are self-registering — ' +
        'they call customElements.define() automatically when the component bundle is loaded. ' +
        'No manual customElements.define() call is needed. ' +
        'Import using the loader pattern: import { defineCustomElements } from "your-package/loader"; ' +
        'then call defineCustomElements() once at app startup.',
    );
  }

  // A11y note
  const ariaMembers = meta.members.filter((m) => m.name.startsWith('aria-') || m.name === 'role');
  const supportsAriaLabel = meta.members.some((m) => m.name === 'aria-label');
  if (ariaMembers.length > 0 || supportsAriaLabel) {
    const ariaList = ariaMembers.map((m) => m.name).join(', ');
    notes.push(
      `Accessibility: ${tagName} supports ${ariaList || 'aria-label'}. Always provide visible text or aria-label for icon-only usage.`,
    );
  }

  // Build styling section
  const styling = buildStyling(tagName, meta);

  // Detect events for framework snippets
  const eventNamesArr = meta.events.map((e) => e.name);

  // Framework snippet
  const detectedFramework =
    options?.framework ?? (await detectFrontendFramework(config.projectRoot)) ?? undefined;
  let frameworkSnippet: string | undefined;
  if (detectedFramework && detectedFramework !== 'html') {
    if (detectedFramework === 'react') {
      frameworkSnippet = buildReactSnippet(tagName, attrParts, slotLines, booleanFields);
    } else if (detectedFramework === 'vue') {
      frameworkSnippet = buildVueSnippet(tagName, attrParts, slotLines, eventNamesArr);
    } else if (detectedFramework === 'svelte') {
      frameworkSnippet = buildSvelteSnippet(tagName, attrParts, slotLines, eventNamesArr);
    } else if (detectedFramework === 'angular') {
      frameworkSnippet = buildAngularSnippet(tagName, attrParts, slotLines, eventNamesArr);
    }
  }

  return {
    tagName,
    htmlSnippet,
    requiredAttributes,
    optionalAttributes,
    variantOptions,
    slots,
    ...(notes.length > 0 ? { notes } : {}),
    ...(detectedFramework ? { framework: detectedFramework } : {}),
    ...(frameworkSnippet ? { frameworkSnippet } : {}),
    ...(styling ? { styling } : {}),
  };
}

/**
 * Generates import statements for a component by reading the CEM exports field
 * and the project's package.json.
 *
 * Returns both a side-effect import and a named import.
 */
export async function generateImport(
  tagName: string,
  config: McpWcConfig,
  cem?: Cem,
): Promise<GenerateImportResult> {
  const fileOps = new SafeFileOperations(config.projectRoot);
  const resolvedCem = cem ?? (await loadCemFromConfig(config));

  // Find the module path for this component in the cached CEM
  let modulePath: string | null = null;
  let className: string | null = null;

  for (const mod of resolvedCem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) {
        modulePath = mod.path;
        className = decl.name;
        break;
      }
    }
    if (modulePath) break;
  }

  if (!modulePath || !className) {
    throw new MCPError(`Component "${tagName}" not found in CEM.`, ErrorCategory.NOT_FOUND);
  }

  // Read package.json for the package name
  const pkgAbsPath = resolve(config.projectRoot, 'package.json');
  const pkg = await fileOps.readJSON(pkgAbsPath, PackageJsonSchema);
  const packageName = pkg.name;

  const fullImportPath = `${packageName}/${modulePath}`;

  if (config.cdnBase) {
    const cdnBase = config.cdnBase.replace(/\/$/, '');

    // Resolve autoloader and stylesheet: explicit config overrides library-specific defaults.
    const isShoelace = packageName === '@shoelace-style/shoelace';
    const autoloaderPath =
      config.cdnAutoloader ?? (isShoelace ? `${cdnBase}/shoelace-autoloader.js` : null);
    const stylesheetPath =
      config.cdnStylesheet ?? (isShoelace ? `${cdnBase}/themes/light.css` : null);

    if (autoloaderPath) {
      return {
        sideEffectImport: `<script type="module" src="${autoloaderPath}"></script>`,
        namedImport: `<!-- CDN mode: components auto-register via ${autoloaderPath} -->`,
        modulePath,
        packageName,
        mode: 'cdn',
        ...(stylesheetPath
          ? { cdnStylesheetLink: `<link rel="stylesheet" href="${stylesheetPath}">` }
          : {}),
        cdnScriptLink: `<script type="module" src="${autoloaderPath}"></script>`,
      };
    }

    // Generic fallback: point directly at the component module.
    return {
      sideEffectImport: `<script type="module" src="${cdnBase}/${modulePath}"></script>`,
      namedImport: `<!-- CDN mode: component loaded via ${cdnBase}/${modulePath} -->`,
      modulePath,
      packageName,
      mode: 'cdn',
      ...(stylesheetPath
        ? { cdnStylesheetLink: `<link rel="stylesheet" href="${stylesheetPath}">` }
        : {}),
      cdnScriptLink: `<script type="module" src="${cdnBase}/${modulePath}"></script>`,
    };
  }

  return {
    sideEffectImport: `import '${fullImportPath}';`,
    namedImport: `import { ${className} } from '${fullImportPath}';`,
    modulePath,
    packageName,
    mode: 'esm',
  };
}
