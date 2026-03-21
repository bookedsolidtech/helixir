/**
 * Method/Property Checker — validates JavaScript code for correct method
 * and property usage against a component's CEM.
 *
 * Detects:
 * 1. Unknown methods (hallucinated API calls)
 * 2. Properties called as methods (e.g., dialog.open() when open is a boolean)
 * 3. Methods assigned as properties (e.g., dialog.show = true when show() is a method)
 * 4. Typo suggestions via Levenshtein distance
 */

import { parseCem } from './cem.js';
import type { Cem } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MethodCheckIssue {
  rule: 'unknown-method' | 'property-as-method' | 'method-as-property';
  name: string;
  suggestion: string | null;
  line: number;
  message: string;
}

export interface MethodCheckResult {
  issues: MethodCheckIssue[];
  availableMethods: string[];
  availableProperties: string[];
  clean: boolean;
}

// ─── Levenshtein distance ────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) {
    const row = dp[i];
    if (row) row[0] = i;
  }
  for (let j = 0; j <= n; j++) {
    const row = dp[0];
    if (row) row[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const prevRow = dp[i - 1];
      const currRow = dp[i];
      if (prevRow && currRow) {
        currRow[j] = Math.min(
          (prevRow[j] ?? 0) + 1,
          (currRow[j - 1] ?? 0) + 1,
          (prevRow[j - 1] ?? 0) + cost,
        );
      }
    }
  }

  const lastRow = dp[m];
  return lastRow ? (lastRow[n] ?? 0) : 0;
}

function findClosestMatch(input: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  let best: string | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(input, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return bestDist <= 3 ? best : null;
}

// ─── Code analysis ──────────────────────────────────────────────────────────

interface MethodCall {
  name: string;
  line: number;
}

interface PropertyAssignment {
  name: string;
  line: number;
}

/**
 * Extract method-call-like patterns from JavaScript code.
 * Matches: identifier.name() patterns
 */
function extractMethodCalls(code: string): MethodCall[] {
  const calls: MethodCall[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Match .methodName( patterns — captures the method name
    const pattern = /\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const name = match[1] ?? '';
      // Skip common built-in methods
      if (BUILTIN_METHODS.has(name)) continue;
      calls.push({ name, line: i + 1 });
    }
  }

  return calls;
}

/**
 * Extract property assignment patterns from JavaScript code.
 * Matches: identifier.name = value patterns
 */
function extractPropertyAssignments(code: string): PropertyAssignment[] {
  const assignments: PropertyAssignment[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Match .propertyName = patterns
    const pattern = /\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const name = match[1] ?? '';
      assignments.push({ name, line: i + 1 });
    }
  }

  return assignments;
}

/** Common JS built-in methods to ignore */
const BUILTIN_METHODS = new Set([
  'addEventListener',
  'removeEventListener',
  'querySelector',
  'querySelectorAll',
  'getAttribute',
  'setAttribute',
  'removeAttribute',
  'hasAttribute',
  'appendChild',
  'removeChild',
  'insertBefore',
  'replaceChild',
  'cloneNode',
  'contains',
  'closest',
  'matches',
  'dispatchEvent',
  'focus',
  'blur',
  'scrollIntoView',
  'toString',
  'valueOf',
  'then',
  'catch',
  'finally',
  'map',
  'filter',
  'reduce',
  'forEach',
  'find',
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'slice',
  'concat',
  'join',
  'sort',
  'reverse',
  'includes',
  'indexOf',
  'log',
  'error',
  'warn',
  'stringify',
  'parse',
  'keys',
  'values',
  'entries',
  'assign',
  'create',
  'defineProperty',
  'freeze',
  'preventExtensions',
  'getOwnPropertyNames',
  'requestUpdate',
  'connectedCallback',
  'disconnectedCallback',
  'attributeChangedCallback',
  'render',
  'updated',
  'firstUpdated',
]);

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkMethodCalls(code: string, tagName: string, cem: Cem): MethodCheckResult {
  const meta = parseCem(tagName, cem);

  const methods = new Set(meta.members.filter((m) => m.kind === 'method').map((m) => m.name));
  const properties = new Set(meta.members.filter((m) => m.kind === 'field').map((m) => m.name));
  const allMembers = [...methods, ...properties];

  const methodCalls = extractMethodCalls(code);
  const propertyAssignments = extractPropertyAssignments(code);
  const issues: MethodCheckIssue[] = [];

  // Check method calls
  for (const call of methodCalls) {
    if (methods.has(call.name)) {
      // Valid method call
      continue;
    }

    if (properties.has(call.name)) {
      // Property called as method
      issues.push({
        rule: 'property-as-method',
        name: call.name,
        suggestion: null,
        line: call.line,
        message:
          `"${call.name}" is a property, not a method. ` +
          `Use "${call.name} = value" instead of "${call.name}()".`,
      });
      continue;
    }

    // Unknown method — check if it's a typo
    const suggestion = findClosestMatch(call.name, allMembers);
    issues.push({
      rule: 'unknown-method',
      name: call.name,
      suggestion,
      line: call.line,
      message: suggestion
        ? `Unknown method "${call.name}()". Did you mean "${suggestion}"?`
        : `Unknown method "${call.name}()". Available methods: ${[...methods].join(', ') || 'none'}.`,
    });
  }

  // Check property assignments against methods
  for (const assign of propertyAssignments) {
    if (methods.has(assign.name)) {
      issues.push({
        rule: 'method-as-property',
        name: assign.name,
        suggestion: null,
        line: assign.line,
        message:
          `"${assign.name}" is a method, not a property. ` +
          `Use "${assign.name}()" instead of "${assign.name} = value".`,
      });
    }
    // We don't flag unknown property assignments — too many false positives
    // from internal JS variables sharing names
  }

  return {
    issues,
    availableMethods: [...methods],
    availableProperties: [...properties],
    clean: issues.length === 0,
  };
}
