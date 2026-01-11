# Claude Code Approver - Setup Prompt

**Copy everything below this line and paste it to Claude Code after pairing your iPhone.**

---

I want to install Claude Code Approver so I can approve your actions from my iPhone via push notifications.

This setup uses a pure bash hook with NO npm/npx dependencies. When I activate my "claude remote approve" Focus Mode on macOS, notifications go to my iPhone. When I deactivate it, I get normal CLI prompts instead.

## My Credentials (from PWA after pairing)

```
SERVER_URL: __REPLACE_WITH_YOUR_WORKER_URL__
PAIRING_ID: __REPLACE_WITH_YOUR_PAIRING_ID__
PAIRING_SECRET: __REPLACE_WITH_YOUR_PAIRING_SECRET__
```

Please help me set this up by following ALL these steps carefully.

---

## STEP 1: Verify Dependencies

First, check that I have all required tools installed:

```bash
echo "Checking dependencies..."
for cmd in jq curl openssl xxd; do
    if command -v $cmd &>/dev/null; then
        echo "✓ $cmd found"
    else
        echo "✗ $cmd NOT FOUND - please install it"
    fi
done
```

If any are missing:
- **jq**: `brew install jq`
- **curl**: Usually pre-installed on macOS
- **openssl**: Usually pre-installed on macOS
- **xxd**: Usually pre-installed on macOS (comes with vim)

---

## STEP 2: Create the Hook Script

Create `~/.claude-approve-hook.sh` with my credentials embedded.

**CRITICAL IMPLEMENTATION NOTES** (read these before writing the script):

1. **NEVER use `local PATH=...`** in bash functions - this shadows the system PATH and breaks ALL commands (openssl, curl, jq, xxd will fail with "command not found"). Use `local API_PATH=...` instead.

2. **NEVER use `npx` or `npm`** - they add 500ms-3s latency and the package doesn't exist anyway.

3. **Use header-based authentication** (v2 API), NOT body-embedded signatures.

4. **Decode the secret properly**: The PAIRING_SECRET is base64-encoded bytes. To use with openssl HMAC, decode to hex: `printf '%s' "$SECRET" | openssl enc -d -base64 -A | xxd -p -c 256 | tr -d '\n'`

5. **Use `printf` not `echo`** for canonical strings to avoid trailing newline issues.

6. **Session caching uses `$PPID`** (Parent Process ID) to identify the Claude Code session.

Here's the complete script structure:

```bash
cat > ~/.claude-approve-hook.sh << 'HOOKEOF'
#!/bin/bash
# Claude Code Approval Hook v2 - Pure Bash Implementation
# Uses header-based authentication with curl + openssl (no npm/npx dependencies)

# ===== EMBEDDED CREDENTIALS (from PWA) =====
PAIRING_ID="__REPLACE_WITH_YOUR_PAIRING_ID__"
PAIRING_SECRET="__REPLACE_WITH_YOUR_PAIRING_SECRET__"
SERVER_URL="__REPLACE_WITH_YOUR_WORKER_URL__"
FOCUS_MODE_NAME="claude remote approve"

SESSION_CACHE="/tmp/claude-approve-cache-$PPID.json"

# Response formats for Claude Code hooks
ALLOW='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Approved via notification"}}'
DENY='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Denied via notification"}}'

# Fail open if missing dependencies (let Claude Code handle it normally)
command -v jq &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v curl &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v openssl &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v xxd &> /dev/null || { echo "$ALLOW"; exit 0; }

# Read input from Claude Code
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

# Focus Mode Check - only route to iPhone if Focus Mode is active
FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')
if [[ "$FOCUS_MODE" != "$FOCUS_MODE_NAME" ]]; then
    exit 1  # Fall back to CLI prompt (Focus Mode not active)
fi

# Check session cache for previously approved scopes
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

# Build details based on tool type
case "$TOOL" in
    Bash)
        CMD=$(echo "$TOOL_INPUT" | jq -r '.command // ""')
        DETAILS="$CMD"
        ;;
    Write|Edit)
        FILE=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""')
        DETAILS="$TOOL: $FILE"
        ;;
    *)
        DETAILS=$(echo "$TOOL_INPUT" | jq -c '.' | head -c 200)
        ;;
esac

# Function: Create HMAC-SHA256 signature
# CRITICAL: Use API_PATH not PATH to avoid shadowing system PATH!
create_signature() {
    local METHOD="$1"
    local API_PATH="$2"
    local BODY="$3"
    local TS="$4"
    local NONCE="$5"
    local SECRET="$6"

    local BODY_HASH
    if [ -z "$BODY" ]; then
        BODY_HASH=$(printf '' | openssl dgst -sha256 -binary | openssl enc -base64 -A)
    else
        BODY_HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -binary | openssl enc -base64 -A)
    fi

    local CANONICAL=$(printf '%s\n%s\n%s\n%s\n%s' "$METHOD" "$API_PATH" "$BODY_HASH" "$TS" "$NONCE")
    local SECRET_HEX=$(printf '%s' "$SECRET" | openssl enc -d -base64 -A | xxd -p -c 256 | tr -d '\n')
    printf '%s' "$CANONICAL" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$SECRET_HEX" -binary | openssl enc -base64 -A
}

# Generate request ID, nonce, timestamp
REQUEST_ID=$(openssl rand -hex 16)
NONCE=$(openssl rand -base64 16 | tr -d '\n')
TS=$(date +%s)

# Build request body
BODY=$(jq -c -n --arg requestId "$REQUEST_ID" --arg tool "$TOOL" --arg details "$DETAILS" --arg cwd "$CWD" \
    '{requestId: $requestId, payload: {tool: $tool, details: $details, cwd: $cwd}}')

# Create signature
SIGNATURE=$(create_signature "POST" "/api/v2/request" "$BODY" "$TS" "$NONCE" "$PAIRING_SECRET")

# Send request to server
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/approve-resp-$$.json \
    -X POST "$SERVER_URL/api/v2/request" \
    -H "Content-Type: application/json" \
    -H "X-Pairing-ID: $PAIRING_ID" \
    -H "X-Timestamp: $TS" \
    -H "X-Nonce: $NONCE" \
    -H "Authorization: HMAC-SHA256 $SIGNATURE" \
    -d "$BODY" --connect-timeout 5 --max-time 10)

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
    rm -f /tmp/approve-resp-$$.json
    echo "$DENY"
    exit 0
fi

# Poll for decision (120s timeout)
TIMEOUT=120
START=$(date +%s)
while [ $(($(date +%s) - START)) -lt $TIMEOUT ]; do
    sleep 1
    NONCE=$(openssl rand -base64 16 | tr -d '\n')
    TS=$(date +%s)
    SIGNATURE=$(create_signature "GET" "/api/v2/decision/$REQUEST_ID" "" "$TS" "$NONCE" "$PAIRING_SECRET")

    RESP=$(curl -s "$SERVER_URL/api/v2/decision/$REQUEST_ID" \
        -H "X-Pairing-ID: $PAIRING_ID" \
        -H "X-Timestamp: $TS" \
        -H "X-Nonce: $NONCE" \
        -H "Authorization: HMAC-SHA256 $SIGNATURE" \
        --connect-timeout 5 --max-time 10)

    STATUS=$(echo "$RESP" | jq -r '.data.status // "pending"')
    SCOPE=$(echo "$RESP" | jq -r '.data.scope // "once"')

    if [ "$STATUS" = "allowed" ]; then
        rm -f /tmp/approve-resp-$$.json
        # Handle session-based approvals
        if [ "$SCOPE" = "session-all" ] || [ "$SCOPE" = "session-tool" ]; then
            [ ! -f "$SESSION_CACHE" ] && jq -n --arg s "$PPID" '{"sessionId":$s,"approvals":{}}' > "$SESSION_CACHE"
            if [ "$SCOPE" = "session-all" ]; then
                jq --argjson t "$(date +%s)" '.approvals."session-all"={"approved":true,"timestamp":$t}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
            else
                jq --arg tool "$TOOL" --argjson t "$(date +%s)" '.approvals["tool:"+$tool]={"approved":true,"timestamp":$t}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
            fi
        fi
        echo "$ALLOW"
        exit 0
    elif [ "$STATUS" = "denied" ] || [ "$STATUS" = "expired" ]; then
        rm -f /tmp/approve-resp-$$.json
        echo "$DENY"
        exit 0
    fi
done

rm -f /tmp/approve-resp-$$.json
echo "$DENY"
HOOKEOF

chmod +x ~/.claude-approve-hook.sh
echo "✓ Created ~/.claude-approve-hook.sh"
```

**IMPORTANT**: Replace the three `__REPLACE_WITH_*__` placeholders with my actual credentials!

---

## STEP 3: Configure Claude Code Settings

Update `~/.claude/settings.json` to register the hook.

First, check if settings.json exists:

```bash
if [ -f ~/.claude/settings.json ]; then
    echo "Existing settings.json found - will need to merge"
    cat ~/.claude/settings.json
else
    echo "No existing settings.json - will create new one"
fi
```

**If creating new file** (no existing settings):

```bash
mkdir -p ~/.claude
cat > ~/.claude/settings.json << 'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit|NotebookEdit",
        "hooks": [{"type": "command", "command": "$HOME/.claude-approve-hook.sh"}]
      }
    ]
  }
}
EOF
echo "✓ Created ~/.claude/settings.json"
```

**If merging with existing settings**: Carefully merge the hooks section, preserving other settings.

---

## STEP 4: Set Up the macOS Shortcut (REQUIRED)

The hook uses the Shortcuts app to detect Focus Mode. This is REQUIRED.

### Option A: Download Pre-made Shortcut (Recommended)

1. Open this link on your Mac: https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad
2. Click "Add Shortcut"
3. The shortcut should be named "Get Current Focus"

### Option B: Create Manually

1. Open the **Shortcuts** app on macOS
2. Click "+" to create a **NEW SHORTCUT** (not automation!)
3. Name it exactly: `Get Current Focus`
4. Add these actions in order:
   - **Get Current Focus** (from Focus category)
   - **Get Name** (to extract the focus mode name)
5. Save the shortcut

### Verify the Shortcut Works

```bash
shortcuts run "Get Current Focus"
# Should print nothing (if no Focus Mode active)
# Or print the name of your active Focus Mode
```

---

## STEP 5: Create the Focus Mode (REQUIRED)

1. Open **System Settings** → **Focus**
2. Click "+" in the bottom left to add a new Focus
3. Select "Custom" focus
4. Name it **exactly**: `claude remote approve`
5. You can leave the settings default (no apps/people filtered)
6. Save

### Verify Focus Mode Works

1. Enable the "claude remote approve" Focus Mode (click it in Control Center or menu bar)
2. Run this test:

```bash
FOCUS=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')
echo "Focus Mode: '$FOCUS'"
if [[ "$FOCUS" == "claude remote approve" ]]; then
    echo "✓ Focus Mode detection working!"
else
    echo "✗ Expected 'claude remote approve', got '$FOCUS'"
fi
```

---

## STEP 6: Restart Claude Code (REQUIRED)

**IMPORTANT**: The hook only loads when Claude Code starts. You must restart Claude Code for the hook to take effect!

```bash
echo "Please restart Claude Code now, then come back and test."
```

---

## STEP 7: Test Everything

After restarting Claude Code:

### Test 1: Focus Mode OFF (should get CLI prompt)

1. **Disable** the "claude remote approve" Focus Mode
2. Ask Claude to run: `ls`
3. You should see a normal CLI permission prompt
4. This confirms fallback is working

### Test 2: Focus Mode ON (should get iPhone notification)

1. **Enable** the "claude remote approve" Focus Mode
2. Ask Claude to run: `ls`
3. You should receive a push notification on your iPhone
4. Approve or deny from your phone
5. Claude should continue or stop based on your decision

### Test 3: Session Approval

1. With Focus Mode ON, approve a request with "Approve Session" or "Approve Tool for Session"
2. Ask Claude to run the same tool again
3. It should auto-approve without notification (cached)

---

## Troubleshooting

### Hook Not Working At All

```bash
# Check the hook exists and is executable
ls -la ~/.claude-approve-hook.sh

# Test it manually
echo '{"tool_name":"Bash","tool_input":{"command":"ls"},"cwd":"/tmp"}' | ~/.claude-approve-hook.sh
```

### "command not found" Errors

This usually means the PATH variable was shadowed. Check the hook script:

```bash
grep -n "local PATH" ~/.claude-approve-hook.sh
# Should return nothing. If it shows results, the PATH bug exists.
# The correct code uses "local API_PATH" not "local PATH"
```

### Focus Mode Not Detecting

```bash
# Test the shortcut directly
shortcuts run "Get Current Focus"

# If it errors, the shortcut may not exist or be named wrong
shortcuts list | grep -i focus
```

### Signature Verification Failures

Check the server logs. Common causes:
- Timestamp too far in future/past (check system clock)
- Nonce reused (shouldn't happen with openssl rand)
- Secret not properly base64-decoded

### No Notification on iPhone

1. Check iPhone has notifications enabled for the PWA
2. Check the PWA is added to Home Screen (not just bookmarked)
3. Verify pairing is still valid (check PWA main screen)

---

## Advanced: macOS Native Dialog (Optional, Experimental)

If you want a **local macOS dialog** instead of iPhone notifications, you can use a second Focus Mode. This is EXPERIMENTAL and can be unstable.

**Known Issues with macOS Dialogs:**
- AppleScript (`osascript`) can hang or crash
- Dialog may not appear if System Events lacks permissions
- Quotes in command strings can break the dialog (we escape them, but edge cases exist)
- The "System Events" app sometimes needs to be restarted

### To Enable macOS Dialog Mode

1. Create another Focus Mode named exactly: `claude notification approval`
2. Modify the hook to support both modes (see `hook/approve-hook.sh` in the repo for the full dual-mode implementation)

The full hook with macOS dialog support includes:
- AppleScript escaping for special characters (`sed 's/\\/\\\\/g; s/"/\\"/g'`)
- Proper `display dialog` with buttons
- 120-second timeout with "gave up" detection

**Recommendation**: Stick with iPhone notifications - they're more reliable. Only use macOS dialogs if you can't use your phone.

---

## Quick Reference

| Focus Mode State | Behavior |
|-----------------|----------|
| OFF (or wrong name) | CLI prompt (hook exits with code 1) |
| "claude remote approve" | iPhone push notification |
| "claude notification approval" | macOS native dialog (experimental) |

| Approval Scope | Behavior |
|---------------|----------|
| Once | Single approval, next action asks again |
| Session (Tool) | All uses of that tool auto-approved this session |
| Session (All) | All tools auto-approved this session |

| File | Purpose |
|------|---------|
| `~/.claude-approve-hook.sh` | The approval hook script |
| `~/.claude/settings.json` | Claude Code configuration |
| `/tmp/claude-approve-cache-$PPID.json` | Session approval cache |

---

## Server Information

- **Worker URL**: `__REPLACE_WITH_YOUR_WORKER_URL__`
- **API Version**: v2 (header-based authentication)
- **Endpoints Used**:
  - `POST /api/v2/request` - Create approval request
  - `GET /api/v2/decision/:id` - Poll for decision

---

**Setup complete!** Once all steps are done and Claude Code is restarted, the hook will be active.
