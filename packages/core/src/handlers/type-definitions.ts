import { readFileSync } from 'fs';
import { resolve } from 'path';

import type { McpWcConfig } from '../config.js';
import type { Cem } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

export interface TypeDefinitionMismatch {
  component: string;
  category: 'attribute' | 'property' | 'event' | 'slot';
  issue: 'missing_in_dts' | 'missing_in_cem' | 'type_mismatch';
  name: string;
  cemValue?: string;
  dtsValue?: string;
  message: string;
}

export interface TypeDefinitionResult {
  summary: {
    totalComponents: number;
    componentsChecked: number;
    componentsWithIssues: number;
    totalMismatches: number;
  };
  mismatches: TypeDefinitionMismatch[];
  formatted: string;
}

interface DtsClass {
  className: string;
  properties: Map<string, string>; // camelCase propName → type text
  events: Set<string>; // event names from addEventListener overloads
}

/**
 * Parses `HTMLElementTagNameMap` block to extract tag name → class name mappings.
 * Handles: interface HTMLElementTagNameMap { 'hx-button': HxButton; }
 */
function parseTagNameMap(content: string): Map<string, string> {
  const tagMap = new Map<string, string>();
  // Match ALL HTMLElementTagNameMap blocks (there may be multiple global augmentations)
  const blockRegex = /interface\s+HTMLElementTagNameMap\s*\{([^}]+)\}/gs;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(content)) !== null) {
    const block = blockMatch[1] ?? '';
    const entryRegex = /['"]([a-z][a-z0-9-]+)['"]\s*:\s*([A-Za-z0-9_$]+)/g;
    let m: RegExpExecArray | null;
    while ((m = entryRegex.exec(block)) !== null) {
      const tagName = m[1] ?? '';
      const className = m[2] ?? '';
      if (tagName && className) tagMap.set(tagName, className);
    }
  }
  return tagMap;
}

/**
 * Extracts the body of a brace-delimited block starting at `startIndex`.
 * Returns the content between the outermost braces, or null if not found.
 */
function extractBraceBlock(content: string, startIndex: number): string | null {
  const braceStart = content.indexOf('{', startIndex);
  if (braceStart === -1) return null;

  let depth = 1;
  let i = braceStart + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return content.slice(braceStart + 1, i - 1);
}

/**
 * Parses class and interface declarations from a .d.ts file.
 * Extracts public property names/types and event names from addEventListener overloads.
 */
function parseDtsClasses(content: string): Map<string, DtsClass> {
  const classes = new Map<string, DtsClass>();

  // Strip single-line comments to reduce noise
  const stripped = content.replace(/\/\/[^\n]*/g, '');

  const headerRegex =
    /(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface)\s+([A-Za-z0-9_$]+)/g;
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(stripped)) !== null) {
    const className = match[1] ?? '';
    if (!className) continue;
    // Skip known built-in global interface names
    if (
      ['HTMLElementTagNameMap', 'HTMLElementEventMap', 'Window', 'IntrinsicElements'].includes(
        className,
      )
    )
      continue;

    const body = extractBraceBlock(stripped, match.index + match[0].length);
    if (body === null) continue;

    const properties = new Map<string, string>();
    const events = new Set<string>();

    // Extract property declarations (public only — skip private/protected lines)
    // Handles: propName: Type; / propName?: Type; / readonly propName: Type;
    // get propName(): Type;
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip private/protected/static members
      if (/^(?:private|protected|static)\s/.test(trimmed)) continue;
      // Skip lines starting with complex signatures
      if (trimmed.startsWith('(') || trimmed.startsWith('[')) continue;

      // Getter: get propName(): Type;
      const getterMatch = trimmed.match(
        /^(?:readonly\s+)?get\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\s*\)\s*:\s*([^;]+)/,
      );
      if (getterMatch) {
        const gName = getterMatch[1] ?? '';
        const gType = getterMatch[2] ?? '';
        if (gName) properties.set(gName, gType.trim().replace(/;$/, '').trim());
        continue;
      }

      // Property: propName: Type; / propName?: Type; / readonly propName: Type;
      const propMatch = trimmed.match(
        /^(?:readonly\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\??\s*:\s*([^;(]+)/,
      );
      if (propMatch) {
        const propName = propMatch[1] ?? '';
        const propType = propMatch[2] ?? '';
        if (
          propName &&
          !['constructor', 'new', 'get', 'set', 'delete', 'extends', 'implements'].includes(
            propName,
          )
        ) {
          properties.set(propName, propType.trim().replace(/;$/, '').trim());
        }
      }
    }

    // Extract event names from addEventListener overloads:
    // addEventListener(type: 'event-name', ...): void;
    const eventRegex = /addEventListener\s*\(\s*type:\s*['"]([^'"]+)['"]/g;
    let e: RegExpExecArray | null;
    while ((e = eventRegex.exec(body)) !== null) {
      const evName = e[1] ?? '';
      if (evName) events.add(evName);
    }

    classes.set(className, { className, properties, events });
  }

  return classes;
}

/**
 * Compare a .d.ts type definitions file against the CEM and report drift.
 *
 * For each component in the CEM:
 * - Verifies it has an entry in HTMLElementTagNameMap
 * - Verifies every CEM field (attribute/property) exists in the d.ts class definition
 * - If addEventListener overloads are present, cross-checks event names with CEM
 *
 * Also reports any tag names present in the d.ts but missing from the CEM.
 */
export function validateTypeDefinitions(
  config: McpWcConfig,
  cem: Cem,
  dtsPath: string,
  tagNames?: string[],
): TypeDefinitionResult {
  const absPath = resolve(config.projectRoot, dtsPath);
  let dtsContent: string;
  try {
    dtsContent = readFileSync(absPath, 'utf-8');
  } catch {
    throw new MCPError(`Cannot read type definitions file: ${dtsPath}`, ErrorCategory.FILESYSTEM);
  }

  const tagMap = parseTagNameMap(dtsContent);
  const classes = parseDtsClasses(dtsContent);

  const allCemComponents = cem.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => d.tagName != null);

  const componentsToCheck =
    tagNames && tagNames.length > 0
      ? allCemComponents.filter((d) => d.tagName != null && tagNames.includes(d.tagName))
      : allCemComponents;

  const mismatches: TypeDefinitionMismatch[] = [];
  let componentsWithIssues = 0;

  for (const decl of componentsToCheck) {
    const tagName = decl.tagName ?? '';
    const className = tagMap.get(tagName);
    const dtsClass = className ? classes.get(className) : undefined;
    const componentMismatches: TypeDefinitionMismatch[] = [];

    if (!className) {
      componentMismatches.push({
        component: tagName,
        category: 'property',
        issue: 'missing_in_dts',
        name: tagName,
        message: `Component "${tagName}" is in CEM but has no entry in HTMLElementTagNameMap`,
      });
    }

    // Compare CEM fields against d.ts class properties
    const cemFields = (decl.members ?? []).filter((m) => m.kind === 'field');
    for (const field of cemFields) {
      const propName = field.name;
      const attrName = field.attribute;
      const cemType = field.type?.text ?? 'unknown';

      if (!dtsClass) {
        // Component not in d.ts at all — report each attribute separately
        if (attrName !== undefined) {
          componentMismatches.push({
            component: tagName,
            category: 'attribute',
            issue: 'missing_in_dts',
            name: propName,
            cemValue: cemType,
            message: `Attribute "${attrName}" (property: "${propName}") defined in CEM but class "${className ?? tagName}" not found in type definitions`,
          });
        }
        continue;
      }

      if (!dtsClass.properties.has(propName)) {
        componentMismatches.push({
          component: tagName,
          category: attrName !== undefined ? 'attribute' : 'property',
          issue: 'missing_in_dts',
          name: propName,
          cemValue: cemType,
          message:
            attrName !== undefined
              ? `Attribute "${attrName}" (property: "${propName}") found in CEM but missing from "${className}" type definition`
              : `Property "${propName}" found in CEM but missing from "${className}" type definition`,
        });
      }
    }

    // Cross-check events only when the d.ts uses addEventListener overloads
    if (dtsClass && dtsClass.events.size > 0) {
      const cemEventNames = new Set((decl.events ?? []).map((e) => e.name));
      for (const dtsEventName of dtsClass.events) {
        if (!cemEventNames.has(dtsEventName)) {
          componentMismatches.push({
            component: tagName,
            category: 'event',
            issue: 'missing_in_cem',
            name: dtsEventName,
            dtsValue: dtsEventName,
            message: `Event "${dtsEventName}" is in type definitions for "${className}" but not in CEM`,
          });
        }
      }
      for (const cemEvent of decl.events ?? []) {
        if (!dtsClass.events.has(cemEvent.name)) {
          componentMismatches.push({
            component: tagName,
            category: 'event',
            issue: 'missing_in_dts',
            name: cemEvent.name,
            cemValue: cemEvent.type?.text,
            message: `Event "${cemEvent.name}" is in CEM but not in type definitions for "${className}"`,
          });
        }
      }
    }

    if (componentMismatches.length > 0) {
      componentsWithIssues++;
      mismatches.push(...componentMismatches);
    }
  }

  // Report type definition entries that have no matching CEM component.
  // Use the full CEM (not the filtered subset) so that filtering by tagNames
  // doesn't incorrectly report unfiltered d.ts entries as missing from CEM.
  const allCemTagNameSet = new Set(allCemComponents.map((d) => d.tagName ?? ''));
  for (const [tagName, className] of tagMap) {
    if (!allCemTagNameSet.has(tagName)) {
      mismatches.push({
        component: tagName,
        category: 'property',
        issue: 'missing_in_cem',
        name: tagName,
        dtsValue: className,
        message: `Component "${tagName}" has type definitions but is not found in CEM`,
      });
    }
  }

  const formatted = formatResult(componentsToCheck.length, mismatches);

  return {
    summary: {
      totalComponents: allCemComponents.length,
      componentsChecked: componentsToCheck.length,
      componentsWithIssues,
      totalMismatches: mismatches.length,
    },
    mismatches,
    formatted,
  };
}

function formatResult(checkedCount: number, mismatches: TypeDefinitionMismatch[]): string {
  if (mismatches.length === 0) {
    return `Type definitions are in sync with CEM (${checkedCount} components checked, 0 mismatches)`;
  }

  const lines: string[] = [
    `Found ${mismatches.length} mismatch(es) across ${checkedCount} components checked:`,
    '',
  ];

  const byComponent = new Map<string, TypeDefinitionMismatch[]>();
  for (const m of mismatches) {
    const existing = byComponent.get(m.component) ?? [];
    existing.push(m);
    byComponent.set(m.component, existing);
  }

  for (const [component, issues] of byComponent) {
    lines.push(`  ${component} (${issues.length} issue(s)):`);
    for (const issue of issues) {
      lines.push(`    - [${issue.category}/${issue.issue}] ${issue.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
