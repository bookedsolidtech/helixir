export interface MCPTextContent {
  type: 'text';
  text: string;
}

export interface MCPToolResult {
  content: MCPTextContent[];
  isError?: boolean;
}

/**
 * Creates a successful MCP tool response with text content.
 */
export function createSuccessResponse(text: string): MCPToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Creates an error MCP tool response with text content.
 */
export function createErrorResponse(text: string): MCPToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

/**
 * Returns Shadow DOM styling constraint warnings, interpolated with the given tagName.
 * Used by suggest_usage, narrative, and quick-ref handlers to keep messaging consistent.
 *
 * These warnings are the primary defense against AI hallucination of invalid
 * Shadow DOM styling patterns. Every warning maps to a real anti-pattern
 * observed in production agent output.
 */
export function getShadowDomWarnings(tagName: string): string[] {
  return [
    // Core encapsulation
    `CSS selectors cannot pierce Shadow DOM — \`${tagName} .inner\` will NOT style internal elements. Use \`::part()\` or CSS custom properties instead.`,
    `CSS custom properties (\`var(--token)\`) and \`::part()\` selectors are the ONLY ways to style across the shadow boundary.`,

    // ::part() rules
    `Never chain \`::part()::part()\` — parts do not forward through nested shadow roots without \`exportparts\`.`,
    `Never combine \`::part()\` with \`.class\` or \`[attr]\` selectors (e.g. \`${tagName}::part(base).active\` is invalid — parts exist in a different DOM tree). Pseudo-classes like \`:hover\` and pseudo-elements like \`::before\` ARE allowed on \`::part()\`.`,

    // ::slotted() rules
    `\`::slotted()\` only works inside a shadow root stylesheet, not in consumer CSS. It accepts only a single simple selector — no descendants (\`::slotted(div) span\`), no compound selectors (\`::slotted(div.foo)\`).`,

    // :host rules
    `\`:host\` and \`:host-context()\` only work inside a shadow root stylesheet. In consumer CSS, target the tag name directly: \`${tagName} { ... }\`.`,

    // Host element constraints
    `Do not set \`display: contents\` on \`${tagName}\` — it destroys the shadow root attachment point.`,
    `Transitions and animations on \`${tagName}\` only affect the host box (e.g. opacity, transform). They cannot animate shadow internals.`,

    // Token usage
    `Always use fallback values with CSS custom properties: \`var(--sl-color-primary, #0969da)\`. If the variable is undefined, the fallback prevents broken styles.`,
    `Do not mix \`var()\` with literal values in CSS shorthands (e.g. \`border: 1px solid var(--color)\`) — if the variable is undefined, the entire shorthand declaration fails.`,
    `Place component tokens on the component host (\`${tagName} { --token: value; }\`), not on \`:root\` — \`:root\` tokens cannot reach through shadow boundaries.`,

    // JS encapsulation
    `Never access \`.shadowRoot.querySelector()\` or set \`.innerHTML\` on \`${tagName}\` from consumer code — this breaks encapsulation and will break on library updates.`,

    // Deprecated selectors
    `Never use \`/deep/\`, \`>>>\`, or \`::deep\` — these are removed from all browsers.`,
  ];
}
