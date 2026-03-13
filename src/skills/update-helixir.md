---
name: update-helixir
description: Update the helixir MCP server to the latest version from npm. Checks current version, compares with latest, runs the update, and verifies.
category: setup
argument-hint: (no arguments)
allowed-tools:
  - Bash
---

# Update helixir

You are updating the user's helixir MCP server to the latest version available on npm.

## Steps

### 1. Detect current installed version

```bash
# Check if helixir is installed globally
npm list -g helixir --depth=0 2>/dev/null

# Also check PATH
which helixir 2>/dev/null

# Get current version directly
npm list -g helixir --depth=0 --json 2>/dev/null | grep -A1 '"helixir"' | grep version
```

Report what you find: installed version (or "not found"), and whether the `helixir` binary is on PATH.

### 2. Check latest version on npm

```bash
npm view helixir version
```

Save this as the **latest version**.

### 3. Compare versions

- If the installed version equals the latest version, tell the user:

  > "helixir is already up to date (vX.Y.Z). No update needed."

  Then stop — do not run the update.

- If the versions differ (or helixir is not installed globally), proceed to step 4.

### 4. Run the update

```bash
npm install -g helixir@latest
```

If this fails with a permissions error, suggest the user run it manually with `sudo npm install -g helixir@latest` or switch to a Node version manager (nvm, fnm) that doesn't require sudo.

### 5. Verify the update

```bash
npm list -g helixir --depth=0 2>/dev/null
```

Confirm the installed version now matches the latest version from step 2.

### 6. Tell the user to restart Claude Code

Print a clear message:

> **helixir updated to vX.Y.Z.**
>
> Please restart Claude Code for the new version to take effect. The MCP server will reconnect automatically on the next session.

## Error Recovery

- **Permission denied**: The user's global npm directory requires elevated permissions. Recommend using nvm or fnm to manage Node.js so global installs don't need sudo.
- **npm not found**: Ask the user to ensure Node.js and npm are installed and on their PATH.
- **Version not changing after install**: Run `which helixir` to check if there are multiple installations. The one on PATH may not be the globally installed npm one.
