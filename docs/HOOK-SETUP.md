# Claude Code Hook Setup

Claude Code exposes a `~/.claude/settings.json` file (created automatically the first time you run Claude Code). You can register custom hooks there so Claude runs a command before a tool executes. The notifier uses a `PreToolUse` hook to intercept commands and forward them to your phone.

## 1. Locate your settings file

On macOS/Linux Claude stores settings under your home directory:

```
~/.claude/settings.json
```

If the file does not exist yet, start Claude Code once and it will be created. You can edit it with any text editor.

## 2. Install the hook script

Use the `approve-hook.sh` helper that ships with this repo (or the TypeScript version if you prefer tsx/node). Make sure it is executable:

```bash
chmod +x /path/to/claude-code-notifier/hook/approve-hook.sh
```

The script shells out to `claude-approve request …` which means you must pair the CLI first (`pnpm --filter cli start init --server …`).

## 3. Add the hook to `settings.json`

Structure:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash /path/to/claude-code-notifier/hook/approve-hook.sh"
          }
        ]
      }
    ]
  }
}
```

Notes:
- `matcher` accepts a pipe-delimited list of Claude tools. Use `Bash|Write|Edit` to cover shell commands and file modifications. Separate entries if you need different scripts per tool.
- The hook runs inside Claude Code’s sandbox, so always specify absolute paths.
- Hooks fire synchronously. Claude waits for the script to print a JSON payload like `{ "decision": "approve" }` or `{ "decision": "deny" }`.

## 4. Verify the hook is firing

1. Restart Claude Code (or run a new chat) so it reloads `settings.json`.
2. Ask Claude to run `ls` or edit a file. You should see a pending request appear in the PWA immediately.
3. In the Claude terminal you will see the hook input/outputs plus any stderr from the script.

If something goes wrong:
- Check `~/.claude/settings.json` for JSON errors (run `jq . ~/.claude/settings.json`).
- Test the hook script directly: `echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | bash /path/to/approve-hook.sh`.
- Confirm the CLI config exists at `~/.claude-approve/config.json`.

## 5. Advanced options

- **TypeScript hook**: run `ts-node hook/approve-hook.ts` or `npx tsx hook/approve-hook.ts` in the config above if you prefer a TypeScript implementation.
- **Multiple matchers**: create multiple entries under `PreToolUse` to point different matchers to different scripts.
- **Fail-open vs fail-closed**: the default script approves on failure so Claude doesn’t hang. You can change the behavior inside `hook/approve-hook.sh` if you want to fail closed instead.

This mirrors the current Claude Code hook implementation observed in `~/.claude/settings.json` and matches the behavior documented by Anthropic in their Claude Code beta release notes.
