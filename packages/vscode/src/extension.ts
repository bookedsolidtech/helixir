import * as vscode from 'vscode';
import { registerMcpProvider } from './mcpProvider.js';

/**
 * Called when the extension is activated.
 * Registers the Helixir MCP server definition provider and the
 * "Helixir: Run Health Check" command.
 */
export function activate(context: vscode.ExtensionContext): void {
  registerMcpProvider(context);

  const healthCheckCommand = vscode.commands.registerCommand(
    'helixir.runHealthCheck',
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        await vscode.window.showErrorMessage(
          'Helixir: No workspace folder is open. ' +
            'Open a component library folder to run a health check.'
        );
        return;
      }

      await vscode.window.showInformationMessage(
        'Helixir: MCP server is active. ' +
          'Ask your AI assistant to call score_all_components via the Helixir MCP server.'
      );
    }
  );

  context.subscriptions.push(healthCheckCommand);
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  // Subscriptions are disposed automatically via context.subscriptions.
}
