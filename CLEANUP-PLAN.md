# Cleanup & Documentation Update Plan

## 1. Files to DELETE (Deprecated)

```
packages/cli/                    # Old Node.js CLI - BROKEN, never worked
docs/HOOK-SETUP.md              # Old npx-based instructions
INSTALL.md                      # Already deleted per git status
PURE-BASH-IMPLEMENTATION.md     # Merged into main implementation
HOOK-ANALYSIS.md                # Debug artifact
PERFORMANCE-COMPARISON.md       # Debug artifact
REFACTOR-PLAN.md                # Completed, no longer needed
HANDOVER.md                     # Session artifact
```

## 2. Files to UPDATE

### README.md
- Remove all npm/npx references
- Update architecture diagram (no CLI package)
- Add "Quick Start with Claude Code" section
- Simplify installation to PWA-based flow

### SETUP-PROMPT.md
- This becomes the CANONICAL user guide
- Should contain complete bash script with placeholders
- Clear instructions for Focus Mode setup
- Troubleshooting section

### docs/FOCUS-MODE-QUICK-SETUP.md
- Verify still accurate
- Add macOS notification mode instructions

### hook/approve-hook.sh
- Already updated with fixes
- Ensure matches ~/.claude-approve-hook.sh exactly

## 3. User Installation Prompt for Claude Code

### Information Claude Code Needs from User:

1. **Server URL** (required)
   - Example: `https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev`
   - User gets this after `wrangler deploy`

2. **Pairing ID** (required)
   - 32-character hex string
   - User gets this from PWA after scanning QR code

3. **Pairing Secret** (required)
   - Base64-encoded string (44 chars with `=` padding)
   - User gets this from PWA after pairing

4. **Focus Mode Name** (optional)
   - Default: "claude remote approve"
   - User can customize if desired

### Complete Installation Script Template:

```bash
#!/bin/bash
# Claude Code Approval Hook - Pure Bash Implementation
#
# REQUIRED USER VALUES (replace placeholders):
#   SERVER_URL    - Your Cloudflare Worker URL
#   PAIRING_ID    - From PWA after pairing (32 hex chars)
#   PAIRING_SECRET - From PWA after pairing (base64 string)

set -e

# === USER CONFIGURATION ===
SERVER_URL="__SERVER_URL__"
PAIRING_ID="__PAIRING_ID__"
PAIRING_SECRET="__PAIRING_SECRET__"
FOCUS_MODE_NAME="claude remote approve"  # Optional: customize

# === VALIDATION ===
if [[ "$SERVER_URL" == "__"* ]] || [[ "$PAIRING_ID" == "__"* ]] || [[ "$PAIRING_SECRET" == "__"* ]]; then
    echo "ERROR: Please replace placeholder values before running!"
    echo ""
    echo "Required values (get from PWA after pairing):"
    echo "  SERVER_URL:     Your Cloudflare Worker URL"
    echo "  PAIRING_ID:     32-character hex string"
    echo "  PAIRING_SECRET: Base64-encoded secret"
    exit 1
fi

# === CREATE CONFIG ===
mkdir -p ~/.claude-approve
cat > ~/.claude-approve/config.json << EOF
{
  "serverUrl": "$SERVER_URL",
  "pairingId": "$PAIRING_ID",
  "pairingSecret": "$PAIRING_SECRET",
  "focusModeName": "$FOCUS_MODE_NAME",
  "createdAt": $(date +%s)000
}
EOF
echo "Created ~/.claude-approve/config.json"

# === INSTALL HOOK ===
cat > ~/.claude-approve-hook.sh << 'HOOKEOF'
#!/bin/bash
# Claude Code Approval Hook v2 - Pure Bash Implementation
# Uses header-based authentication with curl + openssl (no npm/npx dependencies)

CONFIG="$HOME/.claude-approve/config.json"
SESSION_CACHE="/tmp/claude-approve-cache-$PPID.json"

ALLOW='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Approved via notification"}}'
DENY='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Denied via notification"}}'

# Fail open if not configured
[ ! -f "$CONFIG" ] && echo "$ALLOW" && exit 0
command -v jq &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v curl &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v openssl &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v xxd &> /dev/null || { echo "$ALLOW"; exit 0; }

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')
REMOTE_FOCUS=$(jq -r '.focusModeName // "claude remote approve"' "$CONFIG" 2>/dev/null)
MACOS_FOCUS="claude notification approval"

USE_REMOTE=false
USE_MACOS=false

if [[ "$FOCUS_MODE" == "$REMOTE_FOCUS" ]]; then
    USE_REMOTE=true
elif [[ "$FOCUS_MODE" == "$MACOS_FOCUS" ]]; then
    USE_MACOS=true
else
    exit 1
fi

# Check session cache
if [ -f "$SESSION_CACHE" ]; then
    if jq -e '.approvals."session-all"' "$SESSION_CACHE" &>/dev/null; then
        echo "$ALLOW"
        exit 0
    fi
    if jq -e ".approvals.\"tool:$TOOL\"" "$SESSION_CACHE" &>/dev/null; then
        echo "$ALLOW"
        exit 0
    fi
fi

case "$TOOL" in
    Bash) CMD=$(echo "$TOOL_INPUT" | jq -r '.command // ""'); DETAILS="$CMD" ;;
    Write) FILE=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""'); DETAILS="Write: $FILE" ;;
    Edit) FILE=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""'); DETAILS="Edit: $FILE" ;;
    *) DETAILS=$(echo "$TOOL_INPUT" | jq -c '.' | head -c 200) ;;
esac

show_macos_approval() {
    local TOOL="$1" DETAILS="$2" CWD="$3"
    DETAILS=$(echo "$DETAILS" | sed 's/\\/\\\\/g; s/"/\\"/g')
    CWD=$(echo "$CWD" | sed 's/\\/\\\\/g; s/"/\\"/g')
    local DIALOG_TEXT="Tool: $TOOL
Command: $DETAILS

Directory: $CWD"
    DIALOG_RESULT=$(osascript 2>&1 <<EOF
tell application "System Events"
    activate
    display dialog "$DIALOG_TEXT" buttons {"Deny", "Approve Once", "Approve Session"} default button "Approve Once" with title "Claude Code" with icon caution giving up after 120
end tell
EOF
)
    [ $? -ne 0 ] && return 1
    echo "$DIALOG_RESULT" | grep -q "gave up:true" && return 1
    echo "$DIALOG_RESULT" | grep -q "button returned:Approve Session" && { echo "session-tool"; return 0; }
    echo "$DIALOG_RESULT" | grep -q "button returned:Approve Once" && { echo "once"; return 0; }
    return 1
}

# CRITICAL: Use API_PATH not PATH to avoid shadowing system PATH!
create_signature() {
    local METHOD="$1" API_PATH="$2" BODY="$3" TS="$4" NONCE="$5" SECRET="$6"
    local BODY_HASH
    [ -z "$BODY" ] && BODY_HASH=$(printf '' | openssl dgst -sha256 -binary | openssl enc -base64 -A) || \
                      BODY_HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -binary | openssl enc -base64 -A)
    local CANONICAL=$(printf '%s\n%s\n%s\n%s\n%s' "$METHOD" "$API_PATH" "$BODY_HASH" "$TS" "$NONCE")
    local SECRET_HEX=$(printf '%s' "$SECRET" | openssl enc -d -base64 -A | xxd -p -c 256 | tr -d '\n')
    printf '%s' "$CANONICAL" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$SECRET_HEX" -binary | openssl enc -base64 -A
}

send_remote_request() {
    local TOOL="$1" DETAILS="$2" CWD="$3"
    local SERVER_URL=$(jq -r '.serverUrl' "$CONFIG")
    local PAIRING_ID=$(jq -r '.pairingId' "$CONFIG")
    local PAIRING_SECRET=$(jq -r '.pairingSecret' "$CONFIG")
    local REQUEST_ID=$(openssl rand -hex 16)
    local NONCE=$(openssl rand -base64 16 | tr -d '\n')
    local TS=$(date +%s)
    local BODY=$(jq -c -n --arg requestId "$REQUEST_ID" --arg tool "$TOOL" --arg details "$DETAILS" --arg cwd "$CWD" \
        '{requestId: $requestId, payload: {tool: $tool, details: $details, cwd: $cwd}}')
    local SIGNATURE=$(create_signature "POST" "/api/v2/request" "$BODY" "$TS" "$NONCE" "$PAIRING_SECRET")
    local RESPONSE_FILE="/tmp/claude-approve-response-$$.json"
    local HTTP_CODE=$(curl -s -w "%{http_code}" -o "$RESPONSE_FILE" -X POST "${SERVER_URL}/api/v2/request" \
        -H "Content-Type: application/json" -H "X-Pairing-ID: $PAIRING_ID" -H "X-Timestamp: $TS" \
        -H "X-Nonce: $NONCE" -H "Authorization: HMAC-SHA256 $SIGNATURE" -d "$BODY" --connect-timeout 5 --max-time 10)

    [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ] && { rm -f "$RESPONSE_FILE"; echo "deny|once"; return 1; }

    local TIMEOUT=120 START=$(date +%s)
    while true; do
        local ELAPSED=$(($(date +%s) - START))
        [ "$ELAPSED" -ge "$TIMEOUT" ] && { rm -f "$RESPONSE_FILE"; echo "deny|once"; return 1; }
        sleep 1
        NONCE=$(openssl rand -base64 16 | tr -d '\n')
        TS=$(date +%s)
        SIGNATURE=$(create_signature "GET" "/api/v2/decision/$REQUEST_ID" "" "$TS" "$NONCE" "$PAIRING_SECRET")
        local RESP=$(curl -s "${SERVER_URL}/api/v2/decision/$REQUEST_ID" -H "X-Pairing-ID: $PAIRING_ID" \
            -H "X-Timestamp: $TS" -H "X-Nonce: $NONCE" -H "Authorization: HMAC-SHA256 $SIGNATURE" --connect-timeout 5 --max-time 10)
        local STATUS=$(echo "$RESP" | jq -r '.data.status // "pending"')
        local SCOPE=$(echo "$RESP" | jq -r '.data.scope // "once"')
        [ "$STATUS" = "allowed" ] && { rm -f "$RESPONSE_FILE"; echo "allow|$SCOPE"; return 0; }
        [ "$STATUS" = "denied" ] || [ "$STATUS" = "expired" ] && { rm -f "$RESPONSE_FILE"; echo "deny|once"; return 0; }
    done
}

DECISION="deny"
SCOPE="once"

if [ "$USE_REMOTE" = true ]; then
    RESULT=$(send_remote_request "$TOOL" "$DETAILS" "$CWD")
    DECISION=$(echo "$RESULT" | cut -d'|' -f1)
    SCOPE=$(echo "$RESULT" | cut -d'|' -f2)
elif [ "$USE_MACOS" = true ]; then
    APPROVAL_SCOPE=$(show_macos_approval "$TOOL" "$DETAILS" "$CWD")
    [ $? -eq 0 ] && { DECISION="allow"; SCOPE="$APPROVAL_SCOPE"; }
fi

if [ "$DECISION" = "allow" ]; then
    if [ "$SCOPE" = "session-tool" ] || [ "$SCOPE" = "session-all" ]; then
        [ ! -f "$SESSION_CACHE" ] && jq -n --arg sid "$PPID" '{"sessionId": $sid, "approvals": {}}' > "$SESSION_CACHE"
        local CURRENT_TS=$(date +%s)
        [ "$SCOPE" = "session-all" ] && jq --argjson ts "$CURRENT_TS" '.approvals."session-all" = {"approved": true, "timestamp": $ts}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
        [ "$SCOPE" = "session-tool" ] && jq --arg tool "$TOOL" --argjson ts "$CURRENT_TS" '.approvals["tool:" + $tool] = {"approved": true, "timestamp": $ts}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
    fi
    echo "$ALLOW"
else
    echo "$DENY"
fi
HOOKEOF

chmod +x ~/.claude-approve-hook.sh
echo "Created ~/.claude-approve-hook.sh"

# === UPDATE CLAUDE CODE SETTINGS ===
SETTINGS_FILE="$HOME/.claude/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
    # Backup existing
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup"

    # Check if hooks already configured
    if jq -e '.hooks.PreToolUse' "$SETTINGS_FILE" &>/dev/null; then
        echo "hooks.PreToolUse already exists in settings.json"
        echo "Please manually add/verify this hook entry:"
    else
        # Add hooks section
        jq '.hooks = {"PreToolUse": [{"matcher": "Bash|Write|Edit", "hooks": [{"type": "command", "command": "$HOME/.claude-approve-hook.sh"}]}]}' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
        echo "Updated ~/.claude/settings.json with hook configuration"
    fi
else
    mkdir -p ~/.claude
    cat > "$SETTINGS_FILE" << 'SETTINGSEOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [{"type": "command", "command": "$HOME/.claude-approve-hook.sh"}]
      }
    ]
  }
}
SETTINGSEOF
    echo "Created ~/.claude/settings.json"
fi

echo ""
echo "=== INSTALLATION COMPLETE ==="
echo ""
echo "Required: Install the 'Get Current Focus' Shortcut:"
echo "  https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad"
echo ""
echo "Required: Create Focus Mode named: '$FOCUS_MODE_NAME'"
echo "  System Settings > Focus > + > Name it exactly as above"
echo ""
echo "Optional: Create Focus Mode 'claude notification approval' for local macOS dialogs"
echo ""
echo "To test: Enable Focus Mode, then run Claude Code"
```

## 4. Claude Code Integration Prompt

For users who want Claude Code to help them install, create this prompt:

```markdown
# Claude Code Notifier - Installation Guide

## Prerequisites
- Deployed Cloudflare Worker (you have the URL)
- Paired iPhone via PWA (you have pairing credentials)
- macOS with jq, curl, openssl, xxd installed

## What Claude Code Needs From You

I need these values to complete the installation:

1. **Server URL**: Your Cloudflare Worker URL
   Format: `https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev`

2. **Pairing ID**: From PWA after pairing
   Format: 32-character hex string (e.g., `3354a997aca2670b16f48b6b956ce133`)

3. **Pairing Secret**: From PWA after pairing
   Format: Base64 string ending in `=` (e.g., `5DyrYzTqYIMVmXEaLruXLOFLEbGwS+iefISchwdbvr8=`)

## Known Issues / Anti-Patterns

### NEVER do these:
- Don't use `npx` in hooks (too slow, package doesn't exist)
- Don't use `local PATH=...` in bash functions (shadows system PATH!)
- Don't embed unescaped quotes in AppleScript (syntax errors)
- Don't rely on JSON property order for signatures

### Files that will be created:
- `~/.claude-approve/config.json` - Your credentials
- `~/.claude-approve-hook.sh` - The approval hook
- `~/.claude/settings.json` - Will be updated with hook config

## After Installation

1. Install Shortcut: https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad
2. Create Focus Mode: "claude remote approve"
3. Enable Focus Mode when you want iPhone notifications
4. Disable Focus Mode for normal CLI prompts
```

## 5. Summary of Changes Needed

| File | Action | Priority |
|------|--------|----------|
| `packages/cli/` | DELETE entire directory | High |
| `docs/HOOK-SETUP.md` | DELETE | High |
| `HANDOVER.md` | DELETE | Medium |
| `REFACTOR-PLAN.md` | DELETE | Medium |
| `HOOK-ANALYSIS.md` | DELETE | Medium |
| `PERFORMANCE-COMPARISON.md` | DELETE | Medium |
| `README.md` | UPDATE - remove npm refs | High |
| `SETUP-PROMPT.md` | UPDATE - complete rewrite | High |
| `hook/approve-hook.sh` | VERIFY matches deployed version | High |
| `CLAUDE.md` | DONE - anti-patterns added | Complete |

## 6. Execution Order

1. Delete deprecated files
2. Update SETUP-PROMPT.md with complete installation script
3. Update README.md
4. Verify hook/approve-hook.sh matches ~/.claude-approve-hook.sh
5. Test fresh installation on clean system
6. Commit all changes
