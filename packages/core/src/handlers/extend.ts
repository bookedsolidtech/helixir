import type { Cem, CemDeclaration } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

// --- Helpers ---

/**
 * Converts a tag name like "my-button" to PascalCase like "MyButton".
 */
function tagNameToClassName(tagName: string): string {
  return tagName
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function findDeclaration(cem: Cem, tagName: string): CemDeclaration | undefined {
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) return decl;
    }
  }
  return undefined;
}

// --- Public API ---

export interface ExtendComponentResult {
  /** Generated TypeScript source code for the subclass. */
  source: string;
  /** The tag name of the parent component. */
  parentTagName: string;
  /** The class name of the parent component (PascalCase). */
  parentClassName: string;
  /** The tag name of the new subclass. */
  newTagName: string;
  /** The class name of the new subclass (PascalCase). */
  newClassName: string;
  /** CSS parts inherited from the parent. */
  inheritedCssParts: string[];
  /** Slots inherited from the parent. */
  inheritedSlots: string[];
  /** Shadow DOM style encapsulation warnings for the implementer. */
  warnings: string[];
}

/**
 * Generates a properly subclassed TypeScript component extending a parent web component.
 *
 * Produces:
 * - Correct `class NewClass extends ParentClass` inheritance chain
 * - `@customElement('new-tag-name')` CEM annotation
 * - Inherited CSS parts and slots documented in the generated source
 * - `exportparts` forwarding guidance for inherited CSS parts
 * - `HTMLElementTagNameMap` TypeScript declaration for the new tag
 * - Shadow DOM style encapsulation warnings
 *
 * @param parentTagName - Tag name of the existing parent component (must exist in CEM)
 * @param newTagName - Tag name for the new subclass (must contain a hyphen)
 * @param cem - The Custom Elements Manifest to look up the parent
 * @param newClassName - Optional explicit class name; defaults to PascalCase of newTagName
 */
export function extendComponent(
  parentTagName: string,
  newTagName: string,
  cem: Cem,
  newClassName?: string,
): ExtendComponentResult {
  const parentDecl = findDeclaration(cem, parentTagName);
  if (!parentDecl) {
    throw new MCPError(`Component "${parentTagName}" not found in CEM.`, ErrorCategory.NOT_FOUND);
  }

  const parentClassName = tagNameToClassName(parentTagName);
  const derivedClassName = newClassName ?? tagNameToClassName(newTagName);

  const inheritedCssParts = (parentDecl.cssParts ?? []).map((p) => p.name);
  const inheritedSlots = (parentDecl.slots ?? []).map((s) => s.name || '(default)');

  const warnings = buildShadowDomWarnings(parentTagName, newTagName, inheritedCssParts);

  const source = generateSubclassSource({
    parentTagName,
    parentClassName,
    newTagName,
    newClassName: derivedClassName,
    inheritedCssParts,
    inheritedSlots,
    parentDescription: parentDecl.description,
  });

  return {
    source,
    parentTagName,
    parentClassName,
    newTagName,
    newClassName: derivedClassName,
    inheritedCssParts,
    inheritedSlots,
    warnings,
  };
}

// --- Private helpers ---

interface SubclassSourceOptions {
  parentTagName: string;
  parentClassName: string;
  newTagName: string;
  newClassName: string;
  inheritedCssParts: string[];
  inheritedSlots: string[];
  parentDescription?: string;
}

function buildShadowDomWarnings(
  parentTagName: string,
  newTagName: string,
  inheritedCssParts: string[],
): string[] {
  const exportparts =
    inheritedCssParts.length > 0 ? inheritedCssParts.map((p) => `${p}: ${p}`).join(', ') : null;

  return [
    `Shadow DOM encapsulation: ${parentTagName}'s styles live in its own shadow root and do NOT ` +
      `automatically apply to ${newTagName}'s shadow root. Each shadow root is isolated.`,
    exportparts
      ? `To expose parent CSS parts to consumers of ${newTagName}, add exportparts="${exportparts}" ` +
        `to the host element or the shadow root container in your render() override.`
      : `The parent component has no CSS parts to forward. Use CSS custom properties for theming.`,
    `Overriding render() REPLACES the parent's shadow template and styles — ` +
      `import and spread the parent's styles array explicitly if you override render().`,
    `CSS custom properties (var(--token)) cross shadow boundaries and are the preferred theming mechanism. ` +
      `Define extension-specific tokens on the ${newTagName} host.`,
    `Never use \`/deep/\`, \`>>>\`, or \`.shadowRoot.querySelector()\` to style or access ` +
      `internal shadow DOM nodes — this breaks encapsulation and will break on library updates.`,
  ];
}

function generateSubclassSource(opts: SubclassSourceOptions): string {
  const {
    parentTagName,
    parentClassName,
    newTagName,
    newClassName,
    inheritedCssParts,
    inheritedSlots,
    parentDescription,
  } = opts;

  const partsComment =
    inheritedCssParts.length > 0
      ? `Inherited CSS parts from ${parentTagName}: ${inheritedCssParts.join(', ')}`
      : `No CSS parts inherited from ${parentTagName}`;

  const slotsComment =
    inheritedSlots.length > 0
      ? `Inherited slots from ${parentTagName}: ${inheritedSlots.join(', ')}`
      : `No slots inherited from ${parentTagName}`;

  const exportpartsAttr =
    inheritedCssParts.length > 0 ? inheritedCssParts.map((p) => `${p}: ${p}`).join(', ') : null;

  const lines: string[] = [
    `import { customElement } from 'lit/decorators.js';`,
    `import { ${parentClassName} } from './${parentTagName}.js'; // Adjust import path to match your project`,
    ``,
    `/**`,
    ` * ${newClassName} — extends ${parentClassName} (${parentTagName}).`,
    ...(parentDescription ? [` *`, ` * Parent component: ${parentDescription}`] : []),
    ` *`,
    ` * @customElement ${newTagName}`,
    ` *`,
    ` * CSS Parts:`,
    ` *   ${partsComment}`,
    ...(exportpartsAttr
      ? [` *   To forward these to consumers: exportparts="${exportpartsAttr}"`]
      : []),
    ` *`,
    ` * Slots:`,
    ` *   ${slotsComment}`,
    ` */`,
    `@customElement('${newTagName}')`,
    `export class ${newClassName} extends ${parentClassName} {`,
    `  // --- Extended Properties ---`,
    `  // Add new properties or override existing ones using @property() or @state().`,
    `  // Example:`,
    `  // @property({ type: String }) customProp = '';`,
    ``,
    `  // --- CSS Parts ---`,
    `  // ${partsComment}`,
    ...(exportpartsAttr
      ? [
          `  //`,
          `  // To expose inherited parts to consumers, add this attribute to the shadow root's`,
          `  // outermost container element in your render() override:`,
          `  //   exportparts="${exportpartsAttr}"`,
        ]
      : []),
    ``,
    `  // --- Slots ---`,
    `  // ${slotsComment}`,
    `  // To add new named slots, override render() and include <slot name="..."> elements.`,
    `  // WARNING: Overriding render() replaces the parent shadow template — re-import parent styles.`,
    `}`,
    ``,
    `// TypeScript HTMLElementTagNameMap augmentation — enables tag-name type checking.`,
    `declare global {`,
    `  interface HTMLElementTagNameMap {`,
    `    '${newTagName}': ${newClassName};`,
    `  }`,
    `}`,
  ];

  return lines.join('\n');
}
