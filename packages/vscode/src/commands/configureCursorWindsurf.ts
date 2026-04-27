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
    process.env['CURSOR_TRACE_ID'] !== undefined ||
    process.env['CURSOR_APP_PATH'] !== undefined
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
export function registerConfigureCursorWindsurfCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('helixir.configureCursorWindsurf', async () => {
    const { dirName, label } = resolveEditorConfig();

    // Resolve the base directory (workspace root or home directory).
    const baseDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();

    const configDir = path.join(baseDir, dirName);
    const configFilePath = path.join(configDir, 'mcp.json');

    // Path to the bundled MCP server shipped with this extension.
    const serverScriptPath = path.join(context.extensionPath, 'dist', 'mcp-server.js');

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

    // Upsert the helixir entry. Populating MCP_WC_PROJECT_ROOT matters most for
    // the global `~/.cursor/mcp.json` / `~/.windsurf/mcp.json` case, where the
    // editor spawns the MCP process from its own cwd (often $HOME) rather than
    // the workspace root. Without it, helixir cannot locate the target
    // component library's CEM, tsconfig, or tokens.
    //
    // Also forward helixir.configPath so workspaces with a non-root config
    // (mirroring mcpProvider.ts behavior) work in Cursor/Windsurf too —
    // otherwise this command silently writes a config that points at the
    // workspace defaults even when the user has selected a different one.
    const env: Record<string, string> = {};
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    // Only persist MCP_WC_PROJECT_ROOT for the GLOBAL ~/.cursor or
    // ~/.windsurf config (where the editor spawns from $HOME). For
    // workspace-local .cursor/mcp.json or .windsurf/mcp.json (configDir
    // under workspaceRoot), omit it — Cursor/Windsurf already spawn from
    // the workspace and the absolute path would make the committed file
    // non-portable across machines.
    const isWorkspaceLocal = workspaceRoot && configDir.startsWith(workspaceRoot);
    if (workspaceRoot && !isWorkspaceLocal) {
      env['MCP_WC_PROJECT_ROOT'] = workspaceRoot;
    }
    const configPath = vscode.workspace.getConfiguration('helixir').get<string>('configPath', '');
    // Only forward MCP_WC_CONFIG_PATH when we can pair it with a known
    // MCP_WC_PROJECT_ROOT — without the pair, loadConfig() falls back to
    // the editor host's cwd as projectRoot, which causes relative paths
    // in the selected config to resolve against the wrong tree (and
    // out-of-tree cemPath gets dropped). Skipping configPath entirely in
    // the no-workspace case is safer than emitting a half-configured
    // entry that will silently target the wrong library.
    if (configPath && configPath.trim() !== '' && workspaceRoot) {
      // Preserve relative paths verbatim so the generated mcp.json stays
      // portable across machines and clones. loadConfig() resolves
      // relative MCP_WC_CONFIG_PATH against MCP_WC_PROJECT_ROOT at
      // runtime. Only absolute paths are written as-is.
      env['MCP_WC_CONFIG_PATH'] = configPath;
    }
    existing.mcpServers['helixir'] = {
      command: 'node',
      args: [serverScriptPath],
      env,
    };

    // Ensure the config directory exists.
    fs.mkdirSync(configDir, { recursive: true });

    // Write the updated config.
    fs.writeFileSync(configFilePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');

    await vscode.window.showInformationMessage(
      `Helixir: MCP server entry written to ${configFilePath} (${label}).`,
    );
  });

  context.subscriptions.push(command);
}
