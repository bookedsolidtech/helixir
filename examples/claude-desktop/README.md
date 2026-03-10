# HELiXiR + Claude Desktop

This example shows how to connect HELiXiR to [Claude Desktop](https://claude.ai/download) so Claude can introspect your web component library during conversations.

## Prerequisites

1. [Claude Desktop](https://claude.ai/download) installed
2. Node.js 20+ installed (verify: `node --version`)
3. A project with a Custom Elements Manifest (CEM) — see any other example in this directory for how to generate one

## Config File Location

Claude Desktop reads its MCP server configuration from a JSON file. The location depends on your operating system:

| OS          | Path                                                              |
| ----------- | ----------------------------------------------------------------- |
| **macOS**   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json`                     |
| **Linux**   | `~/.config/Claude/claude_desktop_config.json`                     |

The file may not exist yet — create it if needed.

## `claude_desktop_config.json` Template

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

Replace `/path/to/your/project` with the absolute path to your project directory — the one containing your `mcpwc.config.json` or `custom-elements.json`.

## Quick Setup (macOS)

```bash
# Open the config file in your default editor
open -e "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

If the file does not exist:

```bash
mkdir -p "$HOME/Library/Application Support/Claude"
cat > "$HOME/Library/Application Support/Claude/claude_desktop_config.json" << 'EOF'
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
EOF
```

## Quick Setup (Windows — PowerShell)

```powershell
$configDir = "$env:APPDATA\Claude"
New-Item -ItemType Directory -Force -Path $configDir

@'
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "C:\\path\\to\\your\\project"
      }
    }
  }
}
'@ | Set-Content -Path "$configDir\claude_desktop_config.json"
```

> Note: on Windows, use double backslashes (`\\`) in JSON strings for path separators.

## Quick Setup (Linux)

```bash
mkdir -p "$HOME/.config/Claude"
cat > "$HOME/.config/Claude/claude_desktop_config.json" << 'EOF'
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir"],
      "env": {
        "MCP_WC_PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
EOF
```

## Using a `mcpwc.config.json` Instead of Env Vars

If you prefer, drop a `mcpwc.config.json` in your project root (see other examples) and omit the `env` block:

```json
{
  "mcpServers": {
    "helixir": {
      "command": "npx",
      "args": ["helixir", "--project-root", "/path/to/your/project"]
    }
  }
}
```

Or keep the env var approach and let `mcpwc.config.json` hold only the component-specific config (CEM path, prefix, tokens path).

## Verifying the Connection

1. Restart Claude Desktop after editing the config file.
2. Open a new conversation.
3. Look for the hammer (🔨) icon in the toolbar — this indicates MCP tools are available.
4. Ask Claude: _"What web component tools do you have available?"_

Claude should list the HELiXiR tools: `list_components`, `describe_component`, `suggest_usage`, and others.

## Example: Claude Using HELiXiR in Claude Desktop

**Prompt:** "Using my component library, build me a login form with email and password fields and a submit button."

**Claude's response (powered by HELiXiR):**

> Here's a login form using your component library:
>
> ```html
> <my-form>
>   <my-field label="Email" type="email" name="email" required>
>     <my-icon slot="prefix" name="envelope"></my-icon>
>   </my-field>
>
>   <my-field label="Password" type="password" name="password" required>
>     <my-icon slot="prefix" name="lock"></my-icon>
>   </my-field>
>
>   <my-button type="submit" variant="primary" full-width> Sign in </my-button>
> </my-form>
> ```
>
> I used `my-form`, `my-field`, `my-icon`, and `my-button` — all components registered in your CEM. Let me know if you'd like to add "Forgot password?" link or a "Remember me" checkbox.

## Troubleshooting

**Hammer icon not appearing:** Restart Claude Desktop. If still missing, check the config file path and JSON syntax with `cat` or a JSON validator.

**`npx helixir` fails:** Ensure Node 20+ is on your PATH. Try `which node` and `node --version` in a terminal.

**"No CEM found" error:** Set `MCP_WC_PROJECT_ROOT` to the directory containing your `custom-elements.json` or `mcpwc.config.json`.
