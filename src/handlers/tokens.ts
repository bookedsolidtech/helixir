import { access, readFile } from 'node:fs/promises';
import { resolve } from 'path';

import { z } from 'zod';

import type { McpWcConfig } from '../config.js';
import type { Cem } from './cem.js';

export interface DesignToken {
  name: string;
  value: unknown;
  category: string;
  description: string;
}

type DtcgNode = {
  $value?: unknown;
  $description?: string;
  $type?: string;
  [key: string]: DtcgNode | unknown;
};

/**
 * The top-level token file must be a plain JSON object (not an array or primitive).
 */
const TokenFileSchema = z
  .record(z.string(), z.unknown())
  .refine((val) => typeof val === 'object' && val !== null && !Array.isArray(val), {
    message: 'Token file must be a JSON object at the top level',
  });

function flattenNode(
  node: DtcgNode,
  path: string[],
  category: string,
  result: DesignToken[],
): void {
  if (Object.prototype.hasOwnProperty.call(node, '$value')) {
    result.push({
      name: path.join('.'),
      value: node.$value,
      category,
      description: typeof node.$description === 'string' ? node.$description : '',
    });
    return;
  }

  for (const key of Object.keys(node)) {
    if (key.startsWith('$')) continue;
    flattenNode(node[key] as DtcgNode, [...path, key], category, result);
  }
}

/**
 * Reads a W3C DTCG-format tokens.json file and returns a flat array of tokens.
 * Throws if the file does not exist or cannot be parsed.
 */
export async function parseTokens(filePath: string): Promise<DesignToken[]> {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Tokens file not found: ${filePath}`);
  }

  const raw = await readFile(filePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Tokens file is not valid JSON: ${filePath} — ${(err as Error).message}`);
  }

  const validated = TokenFileSchema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues.map((i) => i.message).join('; ');
    throw new Error(`Tokens file has invalid structure: ${filePath} — ${issues}`);
  }

  const data = validated.data as DtcgNode;
  const result: DesignToken[] = [];

  for (const key of Object.keys(data)) {
    if (key.startsWith('$')) continue;
    flattenNode(data[key] as DtcgNode, [key], key, result);
  }

  return result;
}

/**
 * Returns all design tokens, optionally filtered by category (top-level group name).
 * Category matching is case-insensitive.
 */
export async function getDesignTokens(
  config: McpWcConfig,
  category?: string,
): Promise<DesignToken[]> {
  if (!config.tokensPath) throw new Error('Token tools are disabled: tokensPath is not configured');
  const filePath = resolve(config.projectRoot, config.tokensPath);
  const tokens = await parseTokens(filePath);

  if (!category) {
    return tokens;
  }

  const lowerCategory = category.toLowerCase();
  return tokens.filter((t) => t.category.toLowerCase() === lowerCategory);
}

/**
 * Finds tokens whose name or value (as string) contains the query as a
 * case-insensitive substring.
 */
export async function findToken(config: McpWcConfig, query: string): Promise<DesignToken[]> {
  if (!config.tokensPath) throw new Error('Token tools are disabled: tokensPath is not configured');
  const filePath = resolve(config.projectRoot, config.tokensPath);
  const tokens = await parseTokens(filePath);

  const lowerQuery = query.toLowerCase();
  return tokens.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      String(t.value).toLowerCase().includes(lowerQuery),
  );
}

// --- Token-to-component reverse lookup ---

export interface TokenUsageEntry {
  tagName: string;
  usedIn: string;
  description: string;
}

export interface FindComponentsUsingTokenResult {
  token: string;
  total: number;
  components: TokenUsageEntry[];
}

/**
 * Finds all components in the CEM that reference a given CSS custom property token.
 * @param cem - The parsed Custom Elements Manifest
 * @param token - The CSS custom property name to search for
 * @param options.fuzzy - When true, supports wildcard (`*`) and substring matching
 */
export function findComponentsUsingToken(
  cem: Cem,
  token: string,
  options: { fuzzy?: boolean } = {},
): FindComponentsUsingTokenResult {
  const { fuzzy = false } = options;

  function matches(propName: string): boolean {
    if (!fuzzy) return propName === token;
    if (token.endsWith('*')) {
      const prefix = token.slice(0, -1);
      return propName.startsWith(prefix);
    }
    return propName.includes(token);
  }

  const components: TokenUsageEntry[] = [];

  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      for (const prop of decl.cssProperties ?? []) {
        if (matches(prop.name)) {
          components.push({
            tagName: decl.tagName,
            usedIn: prop.name,
            description: prop.description ?? '',
          });
        }
      }
    }
  }

  return { token, total: components.length, components };
}
