/**
 * Code Validator — single-call aggregator that runs all relevant validation
 * tools on agent-generated code and returns combined results.
 *
 * Runs:
 * 1. check_html_usage — attribute/slot/enum validation
 * 2. check_shadow_dom_usage — CSS anti-pattern detection
 * 3. check_event_usage — framework event binding validation
 * 4. check_slot_children — slot child type constraints
 * 5. check_attribute_conflicts — conditional attribute guards
 * 6. check_a11y_usage — accessibility pattern validation
 * 7. check_css_vars — custom property usage validation
 * 8. check_component_imports — unknown tag detection
 */

import type { Cem } from './cem.js';
import { checkHtmlUsage, type HtmlUsageCheckResult } from './html-usage-checker.js';
import { checkShadowDomUsage, type ShadowDomCheckResult } from './shadow-dom-checker.js';
import { checkEventUsage, type EventUsageCheckResult } from './event-usage-checker.js';
import { checkSlotChildren, type SlotChildCheckResult } from './slot-children-checker.js';
import {
  checkAttributeConflicts,
  type AttributeConflictResult,
} from './attribute-conflict-checker.js';
import { checkA11yUsage, type A11yUsageResult } from './a11y-usage-checker.js';
import { checkCssVars, type CssVarCheckResult } from './css-var-checker.js';
import { checkComponentImports, type ImportCheckResult } from './import-checker.js';
import { parseCem } from './cem.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidateComponentCodeInput {
  html: string;
  css?: string;
  code?: string;
  tagName: string;
  cem: Cem;
  framework?: 'react' | 'vue' | 'angular' | 'html';
}

export interface ValidateComponentCodeResult {
  clean: boolean;
  totalIssues: number;
  htmlUsage?: HtmlUsageCheckResult;
  shadowDom?: ShadowDomCheckResult;
  eventUsage?: EventUsageCheckResult;
  slotChildren?: SlotChildCheckResult;
  attributeConflicts?: AttributeConflictResult;
  a11yUsage?: A11yUsageResult;
  cssVars?: CssVarCheckResult;
  imports?: ImportCheckResult;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function validateComponentCode(
  input: ValidateComponentCodeInput,
): ValidateComponentCodeResult {
  const { html, css, code, tagName, cem, framework } = input;
  let totalIssues = 0;

  const result: ValidateComponentCodeResult = {
    clean: true,
    totalIssues: 0,
  };

  // 1. HTML Usage — attribute/slot/enum validation
  try {
    const meta = parseCem(tagName, cem);
    const htmlResult = checkHtmlUsage(html, meta);
    if (htmlResult.issues.length > 0) {
      result.htmlUsage = htmlResult;
      totalIssues += htmlResult.issues.length;
    }
  } catch {
    // Tag not in CEM — skip HTML validation
  }

  // 2. Slot Children — slot child type constraints
  try {
    const slotResult = checkSlotChildren(html, tagName, cem);
    if (slotResult.issues.length > 0) {
      result.slotChildren = slotResult;
      totalIssues += slotResult.issues.length;
    }
  } catch {
    // Skip if tag not found
  }

  // 3. Attribute Conflicts — conditional attribute guards
  try {
    const attrResult = checkAttributeConflicts(html, tagName, cem);
    if (attrResult.issues.length > 0) {
      result.attributeConflicts = attrResult;
      totalIssues += attrResult.issues.length;
    }
  } catch {
    // Skip if tag not found
  }

  // 4. A11y Usage — accessibility patterns
  try {
    const a11yResult = checkA11yUsage(html, tagName, cem);
    if (a11yResult.issues.length > 0) {
      result.a11yUsage = a11yResult;
      totalIssues += a11yResult.issues.length;
    }
  } catch {
    // Skip if tag not found
  }

  // 5. Component Imports — unknown tag detection
  try {
    const importResult = checkComponentImports(html, cem);
    if (importResult.unknownTags.length > 0) {
      result.imports = importResult;
      totalIssues += importResult.unknownTags.length;
    }
  } catch {
    // Skip on error
  }

  // 6. Shadow DOM Usage — CSS anti-patterns (only if CSS provided)
  if (css) {
    try {
      const meta = parseCem(tagName, cem);
      const shadowResult = checkShadowDomUsage(css, tagName, meta);
      if (shadowResult.issues.length > 0) {
        result.shadowDom = shadowResult;
        totalIssues += shadowResult.issues.length;
      }
    } catch {
      // Still run pattern checks without CEM
      const shadowResult = checkShadowDomUsage(css, tagName);
      if (shadowResult.issues.length > 0) {
        result.shadowDom = shadowResult;
        totalIssues += shadowResult.issues.length;
      }
    }

    // 7. CSS Vars — custom property validation (only if CSS provided)
    try {
      const cssResult = checkCssVars(css, tagName, cem);
      if (cssResult.issues.length > 0) {
        result.cssVars = cssResult;
        totalIssues += cssResult.issues.length;
      }
    } catch {
      // Skip if tag not found
    }
  }

  // 8. Event Usage — framework event binding (only if code provided)
  if (code) {
    try {
      const meta = parseCem(tagName, cem);
      const eventResult = checkEventUsage(code, meta, framework);
      if (eventResult.issues.length > 0) {
        result.eventUsage = eventResult;
        totalIssues += eventResult.issues.length;
      }
    } catch {
      // Skip if tag not found
    }
  }

  result.totalIssues = totalIssues;
  result.clean = totalIssues === 0;

  return result;
}
