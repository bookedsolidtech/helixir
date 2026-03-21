/**
 * Composition Checker — validates cross-component patterns in HTML.
 *
 * Detects:
 * 1. Tab/panel count mismatches (more tabs than panels or vice versa)
 * 2. Unlinked cross-references (tab panel="x" without matching panel name="x")
 * 3. Empty containers (select with no options, tab-group with no tabs)
 *
 * Works by detecting component pairs from CEM slot descriptions
 * ("Must be X elements") and then validating the HTML structure.
 */

import type { Cem } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompositionIssue {
  rule: 'count-mismatch' | 'unlinked-reference' | 'empty-container';
  parent: string;
  message: string;
}

export interface CompositionResult {
  issues: CompositionIssue[];
  pairsDetected: number;
  clean: boolean;
}

// ─── Pair detection from CEM ────────────────────────────────────────────────

interface ComponentPair {
  parent: string;
  childTag: string;
  slotName: string;
}

/**
 * Extracts parent/child component pairs from CEM slot descriptions.
 * Looks for patterns like "Must be `<my-option>` elements" in slot descriptions.
 */
function detectComponentPairs(cem: Cem): ComponentPair[] {
  const pairs: ComponentPair[] = [];
  const tagPattern = /<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)>/g;

  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      for (const slot of decl.slots ?? []) {
        const desc = slot.description ?? '';
        if (!/must be|accepts|requires/i.test(desc)) continue;

        let match: RegExpExecArray | null;
        tagPattern.lastIndex = 0;
        while ((match = tagPattern.exec(desc)) !== null) {
          pairs.push({
            parent: decl.tagName,
            childTag: match[1] ?? '',
            slotName: slot.name ?? '',
          });
        }
      }
    }
  }

  return pairs;
}

// ─── Cross-reference detection ──────────────────────────────────────────────

interface CrossRefPair {
  parentTag: string;
  childTag: string;
  parentAttr: string; // attribute on child that references parent concept
  childAttr: string; // attribute on sibling that is referenced
}

/**
 * Detects tab/panel-like cross-reference patterns from CEM.
 * Looks for components where one has a "panel" attribute and a sibling
 * has a "name" attribute, both constrained to the same parent.
 */
function detectCrossReferences(cem: Cem, pairs: ComponentPair[]): CrossRefPair[] {
  const refs: CrossRefPair[] = [];

  // Group pairs by parent
  const byParent = new Map<string, ComponentPair[]>();
  for (const pair of pairs) {
    const existing = byParent.get(pair.parent) ?? [];
    existing.push(pair);
    byParent.set(pair.parent, existing);
  }

  for (const [parentTag, children] of byParent) {
    if (children.length < 2) continue;

    // Look for linking attributes between child pairs
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const a = children[i];
        const b = children[j];
        if (!a || !b) continue;

        // Check if child A has a "panel" attr and child B has a "name" attr
        const aDecl = findDeclaration(cem, a.childTag);
        const bDecl = findDeclaration(cem, b.childTag);

        if (!aDecl || !bDecl) continue;

        const aMembers = (aDecl.members ?? []).map((m: { name: string }) => m.name);
        const bMembers = (bDecl.members ?? []).map((m: { name: string }) => m.name);

        // Common cross-ref patterns: panel↔name, for↔id, controls↔id
        if (aMembers.includes('panel') && bMembers.includes('name')) {
          refs.push({
            parentTag,
            childTag: a.childTag,
            parentAttr: 'panel',
            childAttr: 'name',
          });
        } else if (bMembers.includes('panel') && aMembers.includes('name')) {
          refs.push({
            parentTag,
            childTag: b.childTag,
            parentAttr: 'panel',
            childAttr: 'name',
          });
        }
      }
    }
  }

  return refs;
}

type CemDeclaration = NonNullable<Cem['modules'][number]['declarations']>[number];

function findDeclaration(cem: Cem, tagName: string): CemDeclaration | undefined {
  for (const mod of cem.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tagName) return decl;
    }
  }
  return undefined;
}

// ─── HTML tag counting ──────────────────────────────────────────────────────

function countTags(html: string, tagName: string): number {
  const pattern = new RegExp(`<${tagName}(?:\\s|>|$)`, 'gi');
  const matches = html.match(pattern);
  return matches ? matches.length : 0;
}

function extractAttributeValues(html: string, tagName: string, attrName: string): string[] {
  const values: string[] = [];
  // Match opening tags of the specified element
  const tagPattern = new RegExp(`<${tagName}\\s[^>]*${attrName}="([^"]*)"`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    values.push(match[1] ?? '');
  }
  return values;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function checkComposition(html: string, cem: Cem): CompositionResult {
  const pairs = detectComponentPairs(cem);
  const crossRefs = detectCrossReferences(cem, pairs);
  const issues: CompositionIssue[] = [];

  // Group pairs by parent for count validation
  const byParent = new Map<string, ComponentPair[]>();
  for (const pair of pairs) {
    const existing = byParent.get(pair.parent) ?? [];
    existing.push(pair);
    byParent.set(pair.parent, existing);
  }

  // Check each parent tag present in the HTML
  for (const [parentTag, children] of byParent) {
    const parentCount = countTags(html, parentTag);
    if (parentCount === 0) continue;

    // Check for empty containers
    const totalChildren = children.reduce((sum, c) => sum + countTags(html, c.childTag), 0);
    if (totalChildren === 0) {
      issues.push({
        rule: 'empty-container',
        parent: parentTag,
        message:
          `<${parentTag}> has no expected child elements. ` +
          `Expected: ${children.map((c) => `<${c.childTag}>`).join(', ')}.`,
      });
      continue;
    }

    // Check count mismatches between paired children (e.g., tabs vs panels)
    if (children.length >= 2) {
      const counts = children.map((c) => ({
        tag: c.childTag,
        count: countTags(html, c.childTag),
      }));

      // For tab/panel-like pairs, counts should match
      const nonZeroCounts = counts.filter((c) => c.count > 0);
      if (nonZeroCounts.length >= 2) {
        const first = nonZeroCounts[0];
        if (!first) continue;
        for (let i = 1; i < nonZeroCounts.length; i++) {
          const other = nonZeroCounts[i];
          if (!other) continue;
          if (first.count !== other.count) {
            issues.push({
              rule: 'count-mismatch',
              parent: parentTag,
              message:
                `<${parentTag}> has ${first.count} <${first.tag}> but ${other.count} <${other.tag}>. ` +
                `These should be 1:1 — each ${first.tag} needs a matching ${other.tag}.`,
            });
          }
        }
      }
    }
  }

  // Check cross-references (tab panel="x" ↔ panel name="x")
  for (const ref of crossRefs) {
    const parentCount = countTags(html, ref.parentTag);
    if (parentCount === 0) continue;

    const sourceValues = extractAttributeValues(html, ref.childTag, ref.parentAttr);
    // Find the sibling tag (the one with childAttr)
    const siblingPair = pairs.find(
      (p) => p.parent === ref.parentTag && p.childTag !== ref.childTag,
    );
    if (!siblingPair) continue;

    const targetValues = extractAttributeValues(html, siblingPair.childTag, ref.childAttr);
    const targetSet = new Set(targetValues);

    for (const val of sourceValues) {
      if (val && !targetSet.has(val)) {
        issues.push({
          rule: 'unlinked-reference',
          parent: ref.parentTag,
          message:
            `<${ref.childTag} ${ref.parentAttr}="${val}"> references "${val}" ` +
            `but no <${siblingPair.childTag} ${ref.childAttr}="${val}"> exists.`,
        });
      }
    }
  }

  return {
    issues,
    pairsDetected: pairs.length,
    clean: issues.length === 0,
  };
}
