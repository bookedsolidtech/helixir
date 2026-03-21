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
 */
export function getShadowDomWarnings(tagName: string): string[] {
  return [
    `Do not use descendant selectors to reach internal elements (e.g. \`${tagName} .inner\` will not work — Shadow DOM prevents this).`,
    'CSS custom properties and `::part()` selectors are the only supported ways to style across the shadow boundary.',
  ];
}
