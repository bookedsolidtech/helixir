import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Detects whether the current host is Cursor editor by inspecting the
 * application name reported by the VS Code API and common environment
 * variables set by the Cursor process.
 */
function isCursor(): boolean {
  const appName = vscode.env.appName ?? '';
  return (
    appName.toLowerCase().includes('cursor') ||
    (process.env['CURSOR_TRACE_ID'] !== undefined) ||
    (process.env['CURSOR_APP_PATH'] !== undefined)
  );
}

/**
 * Returns the directory name (.cursor or .windsurf) and a human-readable
 * editor label based on the detected editor.
 */
function resolveEditorConfig(): { dirName: string; label: string } {
  if (isCursor()) {
    return { dirName: '.cursor', label: 'Cursor' };
  }
  return { dirName: '.windsurf', label: 'Windsurf' };
}

interface McpServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface McpJson {
  mcpServers: Record<string, McpServerEntry>;
}

/**
 * Registers the "Helixir: Configure for Cursor/Windsurf" command.
 *
 * When invoked the command:
 * 1. Detects whether the host is Cursor or Windsurf/other.
 * 2. Resolves the target mcp.json path inside the workspace root (or $HOME as
 *    fallback when no workspace is open).
 * 3. Reads any existing mcp.json so that pre-existing server entries are
 *    preserved.
 * 4. Upserts the "helixir" entry pointing at the bundled mcp-server.js.
 * 5. Writes the file and shows an information notification.
 */
export function registerConfigureCursorWindsurfCommand(
  context: vscode.ExtensionContext
): void {
  const command = vscode.commands.registerCommand(
    'helixir.configureCursorWindsurf',
    async () => {
      const { dirName, label } = resolveEditorConfig();

      // Resolve the base directory (workspace root or home directory).
      const baseDir =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();

      const configDir = path.join(baseDir, dirName);
      const configFilePath = path.join(configDir, 'mcp.json');

      // Path to the bundled MCP server shipped with this extension.
      const serverScriptPath = path.join(
        context.extensionPath,
        'dist',
        'mcp-server.js'
      );

      // Read existing config (if any) so we don't stomp other servers.
      let existing: McpJson = { mcpServers: {} };
      if (fs.existsSync(configFilePath)) {
        try {
          const raw = fs.readFileSync(configFilePath, 'utf8');
          const parsed = JSON.parse(raw) as Partial<McpJson>;
          existing = {
            mcpServers: parsed.mcpServers ?? {},
          };
        } catch {
          // If the file is malformed, start fresh but preserve the attempt.
          existing = { mcpServers: {} };
        }
      }

      // Upsert the helixir entry.
      existing.mcpServers['helixir'] = {
        command: 'node',
        args: [serverScriptPath],
        env: {},
      };

      // Ensure the config directory exists.
      fs.mkdirSync(configDir, { recursive: true });

      // Write the updated config.
      fs.writeFileSync(
        configFilePath,
        JSON.stringify(existing, null, 2) + '\n',
        'utf8'
      );

      await vscode.window.showInformationMessage(
        `Helixir: MCP server entry written to ${configFilePath} (${label}).`
      );
    }
  );

  context.subscriptions.push(command);
}
