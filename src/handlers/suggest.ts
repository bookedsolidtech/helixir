import { resolve } from 'path';
import { z } from 'zod';
import type { McpWcConfig } from '../config.js';
import { SafeFileOperations } from '../shared/file-ops.js';
import { parseCem } from './cem.js';
import type { Cem } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

// ─── Return types ─────────────────────────────────────────────────────────────

export interface SuggestUsageResult {
  tagName: string;
  htmlSnippet: string;
  requiredAttributes: string[];
  optionalAttributes: string[];
  variantOptions: Record<string, string[]>;
  slots: Array<{ name: string; description: string }>;
  notes?: string[];
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
  cem: Cem,
): Promise<SuggestUsageResult> {
  const meta = parseCem(tagName, cem);
  const fields = meta.members.filter((m) => m.kind === 'field');

  const requiredAttributes: string[] = [];
  const optionalAttributes: string[] = [];
  const variantOptions: Record<string, string[]> = {};
  const attrParts: string[] = [];

  for (const field of fields) {
    const typeText = field.type ?? '';
    const options = typeText ? extractUnionOptions(typeText) : null;

    if (options) {
      variantOptions[field.name] = options;
    }

    const isOptional = !typeText || isOptionalType(typeText) || options !== null;
    if (isOptional) {
      optionalAttributes.push(field.name);
    } else {
      requiredAttributes.push(field.name);
    }

    // Build attribute snippet
    if (typeText === 'boolean' || typeText.startsWith('boolean ')) {
      // Boolean attrs: omit from default snippet (defaults to false/absent)
    } else if (options && options.length > 0) {
      attrParts.push(`  ${field.name}="${options[0]}"`);
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
  const isStencil = cem.modules.some((mod) => mod.path.endsWith('.tsx'));

  if (isStencil) {
    notes.push(
      'This component is built with Stencil. Stencil components are self-registering — ' +
        'they call customElements.define() automatically when the component bundle is loaded. ' +
        'No manual customElements.define() call is needed. ' +
        'Import using the loader pattern: import { defineCustomElements } from "your-package/loader"; ' +
        'then call defineCustomElements() once at app startup.',
    );
  }

  return {
    tagName,
    htmlSnippet,
    requiredAttributes,
    optionalAttributes,
    variantOptions,
    slots,
    ...(notes.length > 0 ? { notes } : {}),
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
  cem: Cem,
): Promise<GenerateImportResult> {
  const fileOps = new SafeFileOperations();

  // Find the module path for this component in the cached CEM
  let modulePath: string | null = null;
  let className: string | null = null;

  for (const mod of cem.modules) {
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
    return {
      sideEffectImport: `<script type="module" src="${cdnBase}/shoelace-autoloader.js"></script>`,
      namedImport: `<!-- CDN mode: components auto-register via shoelace-autoloader.js -->`,
      modulePath,
      packageName,
      mode: 'cdn',
      cdnStylesheetLink: `<link rel="stylesheet" href="${cdnBase}/themes/light.css">`,
      cdnScriptLink: `<script type="module" src="${cdnBase}/shoelace-autoloader.js"></script>`,
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
