/**
 * Transition & Animation Checker — detects CSS transitions and animations
 * that target properties on web component hosts which cannot cross Shadow DOM.
 *
 * Catches:
 * 1. Transitions on standard properties (color, background, etc.) applied to
 *    component hosts — these affect only the host box, not shadow internals
 * 2. Animations applied to component hosts that animate standard properties —
 *    the animation only affects the host element, not internal shadow elements
 *
 * Custom properties (--*) DO cross shadow boundaries, so transitioning those
 * is valid and not flagged.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TransitionIssue {
  rule: 'transition-no-effect' | 'animation-host-only';
  selector: string;
  property: string;
  message: string;
  line: number;
}

export interface TransitionCheckResult {
  issues: TransitionIssue[];
  clean: boolean;
}

// ─── CSS block parsing ───────────────────────────────────────────────────────

interface CssBlock {
  selector: string;
  declarations: Array<{ property: string; value: string }>;
  line: number;
}

function parseCssBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  // Match selector { ... } blocks (skip @keyframes and nested blocks)
  const blockPattern = /([^{}@]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(css)) !== null) {
    const selector = (match[1] ?? '').trim();
    const body = match[2] ?? '';

    // Skip @keyframes blocks
    if (selector.includes('@keyframes')) continue;

    const preceding = css.slice(0, match.index);
    const line = (preceding.match(/\n/g) ?? []).length + 1;

    const declarations: Array<{ property: string; value: string }> = [];
    const declPattern = /([a-z-]+)\s*:\s*([^;]+)/gi;
    let declMatch: RegExpExecArray | null;

    while ((declMatch = declPattern.exec(body)) !== null) {
      declarations.push({
        property: (declMatch[1] ?? '').trim(),
        value: (declMatch[2] ?? '').trim(),
      });
    }

    blocks.push({ selector, declarations, line });
  }

  return blocks;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isCustomElement(selector: string): boolean {
  // Custom elements contain a hyphen in their tag name
  return /^[a-z][a-z0-9]*-[a-z0-9-]*$/i.test(selector.trim());
}

function selectorTargetsComponent(selector: string, tagName: string): boolean {
  const lower = selector.toLowerCase().trim();
  const tagLower = tagName.toLowerCase();
  // Check if the selector is or starts with the component tag
  return (
    lower === tagLower ||
    lower.startsWith(tagLower + ' ') ||
    lower.startsWith(tagLower + ':') ||
    lower.startsWith(tagLower + '[') ||
    lower.startsWith(tagLower + '.')
  );
}

function extractTransitionProperties(value: string): string[] {
  // transition: property duration timing, property2 duration2 timing2
  // or transition: all 0.3s
  const parts = value.split(',');
  const props: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    const firstToken = trimmed.split(/\s+/)[0] ?? '';
    if (firstToken) props.push(firstToken);
  }

  return props;
}

function isCustomProperty(prop: string): boolean {
  return prop.startsWith('--');
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function checkTransitionAnimation(css: string, tagName: string): TransitionCheckResult {
  const issues: TransitionIssue[] = [];
  const blocks = parseCssBlocks(css);

  // Check if there are @keyframes definitions
  const hasKeyframes = /@keyframes\s+\S+/.test(css);

  for (const block of blocks) {
    const targetsComponent =
      selectorTargetsComponent(block.selector, tagName) ||
      (isCustomElement(block.selector) && block.selector.toLowerCase() === tagName.toLowerCase());

    if (!targetsComponent) continue;

    for (const decl of block.declarations) {
      // Check transitions
      if (decl.property === 'transition') {
        const transitionProps = extractTransitionProperties(decl.value);

        for (const prop of transitionProps) {
          // 'all' may affect custom properties — don't flag
          if (prop === 'all' || prop === 'none') continue;
          // Custom properties cross shadow boundary — don't flag
          if (isCustomProperty(prop)) continue;

          issues.push({
            rule: 'transition-no-effect',
            selector: block.selector,
            property: prop,
            message:
              `Transitioning "${prop}" on <${tagName}> only affects the host element box, not the component's ` +
              `shadow DOM internals. The visual change you expect may not occur. Transition CSS custom properties instead.`,
            line: block.line,
          });
        }
      }

      // Check animations on component host
      if (decl.property === 'animation' || decl.property === 'animation-name') {
        if (hasKeyframes) {
          issues.push({
            rule: 'animation-host-only',
            selector: block.selector,
            property: decl.value.split(/\s+/)[0] ?? decl.value,
            message:
              `Animation on <${tagName}> only affects the host element. @keyframes properties like opacity, transform, ` +
              `color only change the host box — not the component's internal shadow DOM elements. ` +
              `Use CSS custom properties in @keyframes to animate values that the component consumes internally.`,
            line: block.line,
          });
        }
      }
    }
  }

  return {
    issues,
    clean: issues.length === 0,
  };
}
