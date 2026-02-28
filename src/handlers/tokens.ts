import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import type { McpWcConfig } from '../config.js';

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
export function parseTokens(filePath: string): DesignToken[] {
  if (!existsSync(filePath)) {
    throw new Error(`Tokens file not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw) as DtcgNode;
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
export function getDesignTokens(config: McpWcConfig, category?: string): DesignToken[] {
  if (!config.tokensPath) throw new Error('Token tools are disabled: tokensPath is not configured');
  const filePath = resolve(config.projectRoot, config.tokensPath);
  const tokens = parseTokens(filePath);

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
export function findToken(config: McpWcConfig, query: string): DesignToken[] {
  if (!config.tokensPath) throw new Error('Token tools are disabled: tokensPath is not configured');
  const filePath = resolve(config.projectRoot, config.tokensPath);
  const tokens = parseTokens(filePath);

  const lowerQuery = query.toLowerCase();
  return tokens.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      String(t.value).toLowerCase().includes(lowerQuery),
  );
}
