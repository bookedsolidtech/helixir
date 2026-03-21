/**
 * Suggest Fix — generates concrete, copy-pasteable code fixes for validation
 * issues found by other tools. Turns error messages into actionable corrections.
 *
 * Covers:
 * - Shadow DOM selector fixes (descendant piercing → ::part())
 * - Token fallback fixes (bare var() → var() with fallback, hardcoded → var())
 * - Theme compatibility fixes (hardcoded colors → token references)
 * - Method call fixes (property-as-method, method-as-property, typos)
 * - Event usage fixes (React onXxx → addEventListener)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FixSuggestion {
  original: string;
  suggestion: string;
  explanation: string;
  severity: 'error' | 'warning' | 'info';
}

export interface SuggestFixInput {
  type:
    | 'shadow-dom'
    | 'token-fallback'
    | 'theme-compat'
    | 'method-call'
    | 'event-usage'
    | 'specificity'
    | 'layout';
  issue: string;
  original: string;
  tagName?: string;
  partNames?: string[];
  property?: string;
  memberName?: string;
  suggestedName?: string;
  eventName?: string;
}

// ─── Token heuristics ────────────────────────────────────────────────────────

const TOKEN_SUGGESTIONS: Record<string, string> = {
  'background-color': '--sl-color-neutral-0',
  background: '--sl-color-neutral-0',
  color: '--sl-color-neutral-900',
  'border-color': '--sl-color-neutral-300',
  'box-shadow': '--sl-shadow-medium',
  'font-family': '--sl-font-sans',
  'font-size': '--sl-font-size-medium',
  'border-radius': '--sl-border-radius-medium',
  padding: '--sl-spacing-medium',
  margin: '--sl-spacing-medium',
  gap: '--sl-spacing-small',
};

function suggestTokenForProperty(property: string): string {
  return TOKEN_SUGGESTIONS[property] ?? '--your-design-token';
}

// ─── Shadow DOM fixes ────────────────────────────────────────────────────────

function fixShadowDom(input: SuggestFixInput): FixSuggestion {
  const { original, tagName, partNames = [] } = input;

  if (input.issue === 'descendant-piercing' || input.issue === 'direct-element-styling') {
    // Try to match the inner selector to a known part name
    const innerMatch = original.match(
      /(?:^|\s)([a-z][a-z0-9-]*)\s*(?:\.[a-z][a-z0-9_-]*|\s+[a-z][a-z0-9_-]*)\s*\{/i,
    );
    const cssBody = original.match(/\{([^}]*)\}/)?.[1]?.trim() ?? '';

    // Find the best matching part name
    let bestPart = partNames[0] ?? 'base';
    if (innerMatch) {
      const innerName = (innerMatch[1] ?? '').toLowerCase();
      const partMatch = partNames.find(
        (p) => p === innerName || innerName.includes(p) || p.includes(innerName),
      );
      if (partMatch) bestPart = partMatch;
    }

    const suggestion = `${tagName ?? 'the-element'}::part(${bestPart}) { ${cssBody} }`;

    return {
      original,
      suggestion,
      explanation: `CSS selectors cannot reach inside Shadow DOM. Use ::part(${bestPart}) to style exposed parts of the component. Available parts: ${partNames.join(', ') || 'none documented'}.`,
      severity: 'error',
    };
  }

  if (input.issue === 'deprecated-deep') {
    const cssBody = original.match(/\{([^}]*)\}/)?.[1]?.trim() ?? '';
    const bestPart = partNames[0] ?? 'base';
    const suggestion = `${tagName ?? 'the-element'}::part(${bestPart}) { ${cssBody} }`;

    return {
      original,
      suggestion,
      explanation: `The /deep/, >>>, and ::deep combinators are deprecated and removed from all browsers. Use ::part() to style exposed parts, or CSS custom properties to pass values through the shadow boundary.`,
      severity: 'error',
    };
  }

  if (input.issue === 'part-structural') {
    // Remove the class/attribute selector after ::part()
    const suggestion = original.replace(
      /(::part\([^)]+\))(?:\.[a-zA-Z][a-zA-Z0-9_-]*|\[[^\]]+\])/,
      '$1',
    );

    return {
      original,
      suggestion,
      explanation: `::part() cannot be combined with class or attribute selectors because parts exist in a different DOM tree. Style the part directly. If you need state-based styling, use :host([state])::part(name) or a CSS custom property to communicate state.`,
      severity: 'error',
    };
  }

  if (input.issue === 'part-chain') {
    // Extract the outer part name
    const partMatch = original.match(/::part\(([^)]+)\)/);
    const partName = partMatch?.[1] ?? 'inner-part';

    return {
      original,
      suggestion: `${tagName ?? 'the-element'}::part(${partName}) { /* style the forwarded part */ }`,
      explanation: `::part() cannot be chained through nested shadow roots. The outer component must use exportparts="inner-part" on the inner component's host element to re-export the part. Then style the forwarded part name directly on the outer component.`,
      severity: 'error',
    };
  }

  if (input.issue === 'display-contents-host') {
    const tag = tagName ?? 'the-element';
    return {
      original,
      suggestion: `${tag} { display: block; /* or inline-block */ }`,
      explanation: `display: contents removes the host element from the layout box tree, which destroys the Shadow DOM attachment point and breaks accessibility. Use display: block or display: inline-block instead.`,
      severity: 'error',
    };
  }

  return {
    original,
    suggestion: original,
    explanation:
      'Shadow DOM encapsulates component internals. Use ::part() selectors, CSS custom properties, or the host element to style web components.',
    severity: 'info',
  };
}

// ─── Token fallback fixes ────────────────────────────────────────────────────

function fixTokenFallback(input: SuggestFixInput): FixSuggestion {
  const { original, property } = input;

  if (input.issue === 'missing-fallback') {
    // Extract the var() call and add a sensible fallback
    const varMatch = original.match(/var\(\s*(--[a-z][a-z0-9-]*)\s*\)/i);
    if (varMatch) {
      const tokenName = varMatch[1];
      // Suggest a fallback based on the token name pattern
      let fallback = 'inherit';
      if (/color|bg|background/i.test(tokenName ?? '')) fallback = '#333';
      if (/size|font/i.test(tokenName ?? '')) fallback = '1rem';
      if (/space|gap|padding|margin/i.test(tokenName ?? '')) fallback = '1rem';
      if (/radius/i.test(tokenName ?? '')) fallback = '4px';
      if (/shadow/i.test(tokenName ?? '')) fallback = 'none';

      const suggestion = original.replace(
        /var\(\s*(--[a-z][a-z0-9-]*)\s*\)/i,
        `var(${tokenName}, ${fallback})`,
      );

      return {
        original,
        suggestion,
        explanation: `Add a fallback value to var() in case the token is undefined. This prevents invisible/broken styling when the design system isn't loaded.`,
        severity: 'warning',
      };
    }
  }

  if (input.issue === 'hardcoded-color') {
    const token = suggestTokenForProperty(property ?? 'color');
    // Extract the property and value
    const propMatch = original.match(/([a-z-]+)\s*:\s*([^;]+)/i);
    if (propMatch) {
      const [, prop, value] = propMatch;
      const suggestion = `${prop}: var(${token}, ${value?.trim()});`;

      return {
        original,
        suggestion,
        explanation: `Replace hardcoded colors with design tokens so the component adapts to theme changes (dark mode, high contrast, etc.). Use the hardcoded value as a fallback.`,
        severity: 'warning',
      };
    }
  }

  return {
    original,
    suggestion: original,
    explanation: 'Use var() with fallback values and design tokens for resilient styling.',
    severity: 'info',
  };
}

// ─── Theme compatibility fixes ───────────────────────────────────────────────

function fixThemeCompat(input: SuggestFixInput): FixSuggestion {
  const { original, property } = input;

  if (input.issue === 'hardcoded-color') {
    const token = suggestTokenForProperty(property ?? 'background');
    const propMatch = original.match(/([a-z-]+)\s*:\s*([^;]+)/i);
    if (propMatch) {
      const [, prop, value] = propMatch;
      const suggestion = `${prop}: var(${token}, ${value?.trim()});`;

      return {
        original,
        suggestion,
        explanation: `Hardcoded colors break in dark mode and high-contrast themes. Use a design token that the theme system can override.`,
        severity: 'warning',
      };
    }
  }

  if (input.issue === 'contrast-pair') {
    return {
      original,
      suggestion: `background: var(--sl-color-neutral-0); color: var(--sl-color-neutral-900);`,
      explanation: `Light-on-light or dark-on-dark color pairs create contrast issues. Use semantic token pairs (surface + on-surface) that maintain readable contrast across themes.`,
      severity: 'warning',
    };
  }

  return {
    original,
    suggestion: original,
    explanation: 'Use theme-aware tokens for all color values to ensure readability across themes.',
    severity: 'info',
  };
}

// ─── Method call fixes ───────────────────────────────────────────────────────

function fixMethodCall(input: SuggestFixInput): FixSuggestion {
  const { original, memberName, suggestedName, tagName } = input;

  if (input.issue === 'property-as-method') {
    // dialog.open() → dialog.open = true
    const suggestion = original.replace(
      new RegExp(`\\.${memberName}\\s*\\(\\)`, 'g'),
      `.${memberName} = true`,
    );
    return {
      original,
      suggestion,
      explanation: `"${memberName}" is a property on <${tagName ?? 'the element'}>, not a method. Set it as a boolean property instead of calling it as a function.`,
      severity: 'error',
    };
  }

  if (input.issue === 'method-as-property') {
    // dialog.show = true → dialog.show()
    const suggestion = original.replace(
      new RegExp(`\\.${memberName}\\s*=\\s*[^;]+`, 'g'),
      `.${memberName}()`,
    );
    return {
      original,
      suggestion,
      explanation: `"${memberName}" is a method on <${tagName ?? 'the element'}>, not a property. Call it as a function.`,
      severity: 'error',
    };
  }

  if (input.issue === 'typo' && suggestedName) {
    const suggestion = original.replace(new RegExp(`\\.${memberName}`, 'g'), `.${suggestedName}`);
    return {
      original,
      suggestion,
      explanation: `"${memberName}" doesn't exist — did you mean "${suggestedName}"?`,
      severity: 'error',
    };
  }

  return {
    original,
    suggestion: original,
    explanation: `Check the component API documentation for available methods and properties.`,
    severity: 'info',
  };
}

// ─── Event usage fixes ───────────────────────────────────────────────────────

function fixEventUsage(input: SuggestFixInput): FixSuggestion {
  const { original, eventName } = input;

  if (input.issue === 'react-custom-event') {
    const suggestion = `// Custom events don't work with React's onXxx props.
// Use a ref and addEventListener instead:
const ref = useRef(null);
useEffect(() => {
  const el = ref.current;
  if (!el) return;
  el.addEventListener('${eventName ?? 'sl-event'}', handler);
  return () => el.removeEventListener('${eventName ?? 'sl-event'}', handler);
}, []);`;

    return {
      original,
      suggestion,
      explanation: `React's synthetic event system doesn't support custom events like "${eventName}". You must use addEventListener via a ref. This is a React limitation, not a component bug.`,
      severity: 'error',
    };
  }

  return {
    original,
    suggestion: original,
    explanation: 'Use the correct event binding pattern for your framework.',
    severity: 'info',
  };
}

// ─── Specificity fixes ──────────────────────────────────────────────────────

function fixSpecificity(input: SuggestFixInput): FixSuggestion {
  const { original, tagName } = input;

  if (input.issue === 'important') {
    const suggestion = original.replace(/\s*!important\s*/g, ' ');
    return {
      original,
      suggestion,
      explanation:
        '!important prevents theme overrides and makes specificity impossible to manage. Remove it and use CSS custom properties to communicate with the component instead.',
      severity: 'error',
    };
  }

  if (input.issue === 'id-selector') {
    // Replace #id with a class or tag selector
    const suggestion = original.replace(/#([a-z][a-z0-9_-]*)/gi, '.$1');
    return {
      original,
      suggestion,
      explanation:
        'ID selectors have extremely high specificity and make component styling brittle. Use class selectors or the tag name directly.',
      severity: 'warning',
    };
  }

  if (input.issue === 'deep-nesting') {
    const tag = tagName ?? 'the-element';
    return {
      original,
      suggestion: `${tag} { /* use CSS custom properties or ::part() instead of deep nesting */ }`,
      explanation:
        'Deeply nested selectors (4+ levels) are fragile and cannot pierce shadow DOM anyway. Use the component tag directly with CSS custom properties or ::part().',
      severity: 'warning',
    };
  }

  if (input.issue === 'inline-style') {
    const tag = tagName ?? 'the-element';
    return {
      original,
      suggestion: `/* Move inline styles to a stylesheet: */\n${tag} { /* your styles here */ }`,
      explanation:
        'Inline styles have the highest specificity and prevent theming. Move styles to a stylesheet using the tag name selector.',
      severity: 'warning',
    };
  }

  return {
    original,
    suggestion: original,
    explanation: 'Reduce CSS specificity to make styling more maintainable and theme-friendly.',
    severity: 'info',
  };
}

// ─── Layout fixes ───────────────────────────────────────────────────────────

function fixLayout(input: SuggestFixInput): FixSuggestion {
  const { original, tagName, property } = input;
  const tag = tagName ?? 'the-element';

  if (input.issue === 'host-display') {
    return {
      original,
      suggestion: `/* Web components manage their own display. Wrap instead: */\n.${tag}-wrapper { display: flex; }\n${tag} { /* no display override */ }`,
      explanation: `Setting display on <${tag}> overrides the component's internal layout. Wrap the component in a container and set display there instead.`,
      severity: 'warning',
    };
  }

  if (input.issue === 'fixed-dimensions') {
    const prop = property ?? 'width';
    return {
      original,
      suggestion: `${tag} { ${prop}: auto; max-${prop}: 400px; }`,
      explanation: `Fixed ${prop} on a web component host prevents responsive behavior. Use max-${prop} or let the component size itself. Use CSS custom properties if the component exposes sizing tokens.`,
      severity: 'warning',
    };
  }

  if (input.issue === 'position-override') {
    return {
      original,
      suggestion: `/* Wrap the component instead: */\n.${tag}-container { position: relative; }\n${tag} { /* no position override */ }`,
      explanation: `Setting position on <${tag}> can break the component's internal stacking context. Position a wrapper element instead.`,
      severity: 'warning',
    };
  }

  if (input.issue === 'overflow-hidden') {
    return {
      original,
      suggestion: `/* If needed, wrap: */\n.${tag}-container { overflow: hidden; }\n${tag} { /* no overflow override */ }`,
      explanation: `overflow: hidden on <${tag}> can clip the component's dropdown menus, tooltips, and other overlay content. Apply overflow to a wrapper instead.`,
      severity: 'warning',
    };
  }

  return {
    original,
    suggestion: original,
    explanation:
      'Avoid overriding layout properties on web component host elements. Use wrapper elements or CSS custom properties.',
    severity: 'info',
  };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function suggestFix(input: SuggestFixInput): FixSuggestion {
  switch (input.type) {
    case 'shadow-dom':
      return fixShadowDom(input);
    case 'token-fallback':
      return fixTokenFallback(input);
    case 'theme-compat':
      return fixThemeCompat(input);
    case 'method-call':
      return fixMethodCall(input);
    case 'event-usage':
      return fixEventUsage(input);
    case 'specificity':
      return fixSpecificity(input);
    case 'layout':
      return fixLayout(input);
    default:
      return {
        original: input.original,
        suggestion: input.original,
        explanation: 'No specific fix suggestion available for this issue type.',
        severity: 'info',
      };
  }
}
