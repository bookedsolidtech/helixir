import type { Cem } from './cem.js';
import { MCPError, ErrorCategory } from '../shared/error-handling.js';

export interface ComponentDependencyResult {
  tagName: string;
  direct: string[];
  transitive: string[];
  graph: Record<string, string[]>;
  note?: string;
}

/**
 * Builds a map of tagName → direct dependency tag names from the CEM.
 * Walks module-level and declaration-level `references` arrays, resolving
 * class names to tag names using the known component set.
 */
function buildDependencyMap(cem: Cem): Map<string, string[]> {
  const map = new Map<string, string[]>();

  // Build lookup: class name → tag name
  const classToTag = new Map<string, string>();
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName) {
        classToTag.set(decl.name, decl.tagName);
      }
    }
  }

  for (const mod of cem.modules) {
    // Module-level references apply to all declarations in the module
    const modRefTags: string[] = [];
    for (const ref of mod.references ?? []) {
      const tag = classToTag.get(ref.name);
      if (tag) modRefTags.push(tag);
    }

    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;

      const declRefs: string[] = [...modRefTags];

      // Declaration-level references
      for (const ref of decl.references ?? []) {
        const tag = classToTag.get(ref.name);
        if (tag) declRefs.push(tag);
      }

      const deps = [...new Set(declRefs)].filter((t) => t !== decl.tagName);
      if (deps.length > 0) {
        map.set(decl.tagName, deps);
      }
    }
  }

  return map;
}

/**
 * Resolves all transitively reachable dependencies via BFS.
 * Returns only components not already in the `direct` set.
 */
function resolveTransitive(direct: string[], depMap: Map<string, string[]>): string[] {
  const visited = new Set<string>(direct);
  const queue = [...direct];
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const deps = depMap.get(current) ?? [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        result.push(dep);
        queue.push(dep);
      }
    }
  }

  return result;
}

/**
 * Returns the dependency graph for a given component.
 *
 * @param cem - Parsed Custom Elements Manifest
 * @param tagName - The custom element tag name to look up
 * @param includeTransitive - When true (default), resolves the full dep tree
 * @throws Error if the tag name is not found in the CEM
 */
export function getComponentDependencies(
  cem: Cem,
  tagName: string,
  includeTransitive = true,
): ComponentDependencyResult {
  // Verify the component exists
  let found = false;
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) {
        found = true;
        break;
      }
    }
    if (found) break;
  }

  if (!found) {
    throw new MCPError(`Component "${tagName}" not found in CEM.`, ErrorCategory.NOT_FOUND);
  }

  const depMap = buildDependencyMap(cem);
  const direct = depMap.get(tagName) ?? [];
  const transitive = includeTransitive ? resolveTransitive(direct, depMap) : [];

  // Build adjacency graph for all reachable components
  const graph: Record<string, string[]> = {};
  const allComponents = [tagName, ...direct, ...transitive];
  for (const comp of allComponents) {
    graph[comp] = depMap.get(comp) ?? [];
  }

  const result: ComponentDependencyResult = {
    tagName,
    direct,
    transitive,
    graph,
  };

  // Add a note when the CEM has no reference data at all
  if (depMap.size === 0) {
    result.note =
      'This CEM does not include dependency information. Check your CEM analyzer config.';
  }

  return result;
}
