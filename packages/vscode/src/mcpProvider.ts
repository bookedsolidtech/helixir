import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Registers helixir as an MCP server definition provider with VS Code.
 *
 * The provider spawns dist/mcp-server.js (the bundled helixir MCP server)
 * as a child process via stdio. VS Code passes it to connected AI models
 * (e.g., GitHub Copilot, Claude) automatically.
 *
 * The server is configured with the workspace folder as MCP_WC_PROJECT_ROOT
 * so helixir reads the correct custom-elements.json.
 *
 * Requires VS Code ≥ 1.99.0 (MCP server definition provider API).
 */
export function registerMcpProvider(context: vscode.ExtensionContext): void {
  const provider = {
    provideMcpServerDefinitions() {
      const serverScriptPath = path.join(
        context.extensionPath,
        'dist',
        'mcp-server.js'
      );

      const workspaceFolder =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

      const configPath = vscode.workspace
        .getConfiguration('helixir')
        .get<string>('configPath', '');

      const env: Record<string, string> = {
        MCP_WC_PROJECT_ROOT: workspaceFolder,
      };

      // If the user specified a custom config path, resolve it and pass it on.
      if (configPath && configPath.trim() !== '') {
        env['MCP_WC_CONFIG_PATH'] = path.isAbsolute(configPath)
          ? configPath
          : path.join(workspaceFolder, configPath);
      }

      return [
        {
          label: 'Helixir',
          command: 'node',
          args: [serverScriptPath],
          env,
        },
      ];
    },
  };

  // vscode.lm.registerMcpServerDefinitionProvider was introduced in VS Code 1.99.
  // We guard the call so the extension degrades gracefully on older hosts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lm = vscode.lm as any;
  if (typeof lm?.registerMcpServerDefinitionProvider === 'function') {
    context.subscriptions.push(
      lm.registerMcpServerDefinitionProvider('helixir', provider) as vscode.Disposable
    );
  } else {
    console.warn(
      '[helixir-vscode] vscode.lm.registerMcpServerDefinitionProvider is not available. ' +
        'Upgrade to VS Code ≥ 1.99.0 to enable MCP server support.'
    );
  }
}
