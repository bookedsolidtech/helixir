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
