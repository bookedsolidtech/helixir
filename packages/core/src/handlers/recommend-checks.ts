/**
 * Recommend Checks — analyzes code to determine which validation tools
 * are most relevant, helping agents discover the right validators.
 *
 * Returns a prioritized list of tool names based on code analysis:
 * - Detects HTML, CSS, JavaScript, JSX patterns
 * - Identifies custom element tags in the code
 * - Always recommends the all-in-one aggregator first
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecommendChecksResult {
  recommended: string[];
  codeType: string[];
  detectedTags: string[];
}

// ─── Code type detection ────────────────────────────────────────────────────

function detectCodeTypes(code: string): string[] {
  const types: string[] = [];

  // HTML detection: opening tags
  if (/<[a-z][a-z0-9-]*[\s>]/i.test(code)) {
    types.push('html');
  }

  // CSS detection: property declarations or selectors with braces
  if (/[{][\s\S]*?[}]/.test(code) && /[a-z-]+\s*:\s*[^;]+;/i.test(code)) {
    types.push('css');
  }

  // JavaScript detection: function calls, const/let/var, addEventListener
  if (/\b(?:const|let|var|function|=>|addEventListener|querySelector|document\.)/.test(code)) {
    types.push('javascript');
  }

  // JSX detection: React-style event handlers or JSX syntax
  if (/\bon[A-Z][a-zA-Z]*=\{/.test(code) || /<[A-Z][a-zA-Z]*/.test(code)) {
    types.push('jsx');
  }

  return types;
}

// ─── Tag extraction ─────────────────────────────────────────────────────────

function extractCustomElementTags(code: string): string[] {
  const tags = new Set<string>();
  const pattern = /<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)[\s>/$]/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    tags.add((match[1] ?? '').toLowerCase());
  }
  return [...tags];
}

// ─── Compound component detection ───────────────────────────────────────────

const COMPOUND_PATTERNS = [
  /tab-group|tab-panel|tabgroup|tabpanel/i,
  /select.*option|option.*select/i,
  /accordion.*item|item.*accordion/i,
  /menu.*item|item.*menu/i,
  /carousel.*slide|slide.*carousel/i,
  /tree.*item|item.*tree/i,
];

function hasCompoundComponents(code: string): boolean {
  return COMPOUND_PATTERNS.some((p) => p.test(code));
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function recommendChecks(code: string): RecommendChecksResult {
  const codeType = detectCodeTypes(code);
  const detectedTags = extractCustomElementTags(code);
  const recommended: string[] = [];

  // Always recommend the all-in-one aggregator first
  recommended.push('validate_component_code');

  // Always recommend quick ref for understanding component APIs
  recommended.push('get_component_quick_ref');

  // HTML-based checks
  if (codeType.includes('html') || codeType.includes('jsx')) {
    recommended.push('check_html_usage');
    recommended.push('check_component_imports');
    recommended.push('check_a11y_usage');
    recommended.push('check_slot_children');
    recommended.push('check_attribute_conflicts');
  }

  // Compound component detection
  if (hasCompoundComponents(code) || detectedTags.length > 2) {
    if (!recommended.includes('check_composition')) {
      recommended.push('check_composition');
    }
  }

  // CSS-based checks
  if (codeType.includes('css')) {
    recommended.push('check_shadow_dom_usage');
    recommended.push('check_css_vars');
    recommended.push('check_theme_compatibility');
    recommended.push('check_css_specificity');
    recommended.push('check_layout_patterns');
    recommended.push('check_css_scope');
    recommended.push('check_color_contrast');
    recommended.push('check_transition_animation');

    // Token fallback and shorthand checks when var() is used
    if (/var\s*\(/.test(code)) {
      recommended.push('check_token_fallbacks');
      recommended.push('check_css_shorthand');
    }
  }

  // JavaScript-based checks
  if (codeType.includes('javascript')) {
    recommended.push('check_method_calls');

    if (/addEventListener|on[A-Z]/.test(code)) {
      recommended.push('check_event_usage');
    }
  }

  // JSX event handler checks
  if (codeType.includes('jsx')) {
    if (!recommended.includes('check_event_usage')) {
      recommended.push('check_event_usage');
    }
  }

  return {
    recommended,
    codeType,
    detectedTags,
  };
}
