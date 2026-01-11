# Claude Code Approver - Setup Prompt

**Users: Copy everything below the line and paste it to Claude Code.**

---

You are helping me install Claude Code Approver, a system that sends approval requests to my iPhone via push notifications instead of showing CLI prompts.

## Your Task

Guide me through the complete setup process. You MUST:
1. Ask me for any missing information before proceeding
2. Execute each step and verify it worked
3. Not skip any steps
4. Tell me when I need to do something manually (like creating Focus Mode in System Settings)

## First: Ask Me for Credentials

Before doing anything else, ask me:

> I need 3 pieces of information from you. You can find these in the PWA after pairing your iPhone:
>
> 1. **Server URL** - Your Cloudflare Worker URL (looks like `https://claude-code-notifier.xxx.workers.dev`)
> 2. **Pairing ID** - A 32-character hex string
> 3. **Pairing Secret** - A base64 string (usually ends with `=`)
>
> If you haven't set up the PWA yet, let me know and I'll guide you through that first.

**Wait for my response before proceeding.** Do not continue until you have all 3 values.

If I say I haven't paired yet, tell me:
> You need to pair first:
> 1. Deploy the Cloudflare Worker (run `pnpm deploy` in the project)
> 2. Open the PWA URL on your iPhone in Safari
> 3. Tap the Share button → "Add to Home Screen"
> 4. Open from Home Screen
> 5. Tap "Pair Device" and scan the QR code or enter manually
> 6. After pairing, go to Settings → Setup to see your credentials
> 7. Come back and give me the 3 values

## Setup Steps to Execute

### Step 1: Verify Dependencies

Run this and check all pass:

```bash
echo "=== Checking Dependencies ===" && \
for cmd in jq curl openssl xxd; do
    if command -v $cmd &>/dev/null; then
        echo "✓ $cmd"
    else
        echo "✗ $cmd MISSING - install with: brew install $cmd"
    fi
done
```

If any are missing, tell me how to install them and wait for confirmation.

### Step 2: Create the Hook Script

Create `~/.claude-approve-hook.sh` with my credentials embedded.

**CRITICAL - Read these before writing the script:**

1. **NEVER use `local PATH=...`** - Use `local API_PATH=...` instead. `PATH` shadows the system PATH and breaks all commands.
2. **Use header-based auth** (v2 API) with `Authorization: HMAC-SHA256 <signature>` header
3. **Decode secret properly**: `printf '%s' "$SECRET" | openssl enc -d -base64 -A | xxd -p -c 256 | tr -d '\n'`
4. **Use `printf` not `echo`** for canonical strings (no trailing newline issues)

Here is the complete script. **You (Claude) must replace `__PAIRING_ID__`, `__PAIRING_SECRET__`, and `__SERVER_URL__` with the actual values I gave you:**

```bash
cat > ~/.claude-approve-hook.sh << 'HOOKEOF'
#!/bin/bash
# Claude Code Approval Hook v2 - Pure Bash (no npm/npx)

# ===== CREDENTIALS (Claude: substitute with user's actual values) =====
PAIRING_ID="__PAIRING_ID__"
PAIRING_SECRET="__PAIRING_SECRET__"
SERVER_URL="__SERVER_URL__"
FOCUS_MODE_NAME="claude remote approve"

SESSION_CACHE="/tmp/claude-approve-cache-$PPID.json"

ALLOW='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Approved via notification"}}'
DENY='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Denied via notification"}}'

# Fail open if dependencies missing
command -v jq &>/dev/null || { echo "$ALLOW"; exit 0; }
command -v curl &>/dev/null || { echo "$ALLOW"; exit 0; }
command -v openssl &>/dev/null || { echo "$ALLOW"; exit 0; }
command -v xxd &>/dev/null || { echo "$ALLOW"; exit 0; }

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

# Focus Mode check - exit 1 falls back to CLI prompt
FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')
[[ "$FOCUS_MODE" != "$FOCUS_MODE_NAME" ]] && exit 1

# Session cache check
if [ -f "$SESSION_CACHE" ]; then
    jq -e '.approvals."session-all"' "$SESSION_CACHE" &>/dev/null && { echo "$ALLOW"; exit 0; }
    jq -e ".approvals.\"tool:$TOOL\"" "$SESSION_CACHE" &>/dev/null && { echo "$ALLOW"; exit 0; }
fi

# Build details
case "$TOOL" in
    Bash) DETAILS=$(echo "$TOOL_INPUT" | jq -r '.command // ""') ;;
    Write|Edit) DETAILS="$TOOL: $(echo "$TOOL_INPUT" | jq -r '.file_path // ""')" ;;
    *) DETAILS=$(echo "$TOOL_INPUT" | jq -c '.' | head -c 200) ;;
esac

# HMAC-SHA256 signature function
# CRITICAL: Use API_PATH not PATH!
create_signature() {
    local METHOD="$1" API_PATH="$2" BODY="$3" TS="$4" NONCE="$5" SECRET="$6"
    local BODY_HASH
    [ -z "$BODY" ] && BODY_HASH=$(printf '' | openssl dgst -sha256 -binary | openssl enc -base64 -A) \
                   || BODY_HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -binary | openssl enc -base64 -A)
    local CANONICAL=$(printf '%s\n%s\n%s\n%s\n%s' "$METHOD" "$API_PATH" "$BODY_HASH" "$TS" "$NONCE")
    local SECRET_HEX=$(printf '%s' "$SECRET" | openssl enc -d -base64 -A | xxd -p -c 256 | tr -d '\n')
    printf '%s' "$CANONICAL" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$SECRET_HEX" -binary | openssl enc -base64 -A
}

REQUEST_ID=$(openssl rand -hex 16)
NONCE=$(openssl rand -base64 16 | tr -d '\n')
TS=$(date +%s)

BODY=$(jq -c -n --arg rid "$REQUEST_ID" --arg tool "$TOOL" --arg details "$DETAILS" --arg cwd "$CWD" \
    '{requestId:$rid,payload:{tool:$tool,details:$details,cwd:$cwd}}')

SIGNATURE=$(create_signature "POST" "/api/v2/request" "$BODY" "$TS" "$NONCE" "$PAIRING_SECRET")

HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/approve-resp-$$.json \
    -X POST "$SERVER_URL/api/v2/request" \
    -H "Content-Type: application/json" \
    -H "X-Pairing-ID: $PAIRING_ID" \
    -H "X-Timestamp: $TS" \
    -H "X-Nonce: $NONCE" \
    -H "Authorization: HMAC-SHA256 $SIGNATURE" \
    -d "$BODY" --connect-timeout 5 --max-time 10)

[[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]] && { rm -f /tmp/approve-resp-$$.json; echo "$DENY"; exit 0; }

# Poll for decision (120s timeout)
TIMEOUT=120; START=$(date +%s)
while [ $(($(date +%s) - START)) -lt $TIMEOUT ]; do
    sleep 1
    NONCE=$(openssl rand -base64 16 | tr -d '\n'); TS=$(date +%s)
    SIGNATURE=$(create_signature "GET" "/api/v2/decision/$REQUEST_ID" "" "$TS" "$NONCE" "$PAIRING_SECRET")
    RESP=$(curl -s "$SERVER_URL/api/v2/decision/$REQUEST_ID" \
        -H "X-Pairing-ID: $PAIRING_ID" -H "X-Timestamp: $TS" -H "X-Nonce: $NONCE" \
        -H "Authorization: HMAC-SHA256 $SIGNATURE" --connect-timeout 5 --max-time 10)
    STATUS=$(echo "$RESP" | jq -r '.data.status // "pending"')
    SCOPE=$(echo "$RESP" | jq -r '.data.scope // "once"')

    if [ "$STATUS" = "allowed" ]; then
        rm -f /tmp/approve-resp-$$.json
        if [[ "$SCOPE" == "session-all" || "$SCOPE" == "session-tool" ]]; then
            [ ! -f "$SESSION_CACHE" ] && jq -n --arg s "$PPID" '{"sessionId":$s,"approvals":{}}' > "$SESSION_CACHE"
            if [ "$SCOPE" = "session-all" ]; then
                jq --argjson t "$(date +%s)" '.approvals."session-all"={"approved":true,"timestamp":$t}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
            else
                jq --arg tool "$TOOL" --argjson t "$(date +%s)" '.approvals["tool:"+$tool]={"approved":true,"timestamp":$t}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
            fi
        fi
        echo "$ALLOW"; exit 0
    elif [[ "$STATUS" == "denied" || "$STATUS" == "expired" ]]; then
        rm -f /tmp/approve-resp-$$.json; echo "$DENY"; exit 0
    fi
done
rm -f /tmp/approve-resp-$$.json; echo "$DENY"
HOOKEOF

chmod +x ~/.claude-approve-hook.sh
```

After creating, verify it exists:
```bash
ls -la ~/.claude-approve-hook.sh && head -20 ~/.claude-approve-hook.sh
```

### Step 3: Configure Claude Code Settings

Check if settings.json exists and update it:

```bash
SETTINGS="$HOME/.claude/settings.json"
if [ -f "$SETTINGS" ]; then
    echo "Existing settings found:"
    cat "$SETTINGS"
else
    echo "No existing settings - will create new"
fi
```

**If no existing settings**, create:
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
```

**If settings exist**, you need to MERGE the hooks section carefully - don't overwrite other settings.

Verify:
```bash
cat ~/.claude/settings.json | jq .
```

### Step 4: Install the Shortcut (REQUIRED)

Tell me to do this manually:

> **ACTION REQUIRED**: Install the "Get Current Focus" shortcut
>
> 1. Open this link on your Mac: https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad
> 2. Click "Add Shortcut"
>
> **OR create manually in Shortcuts app:**
> 1. Open Shortcuts app
> 2. Create NEW SHORTCUT (not automation)
> 3. Name it exactly: `Get Current Focus`
> 4. Add action: "Get Current Focus"
> 5. Add action: "Get Name"
> 6. Save
>
> Tell me when done.

After I confirm, verify:
```bash
shortcuts run "Get Current Focus" 2>&1 || echo "(no focus active - this is OK)"
```

### Step 5: Create Focus Mode (REQUIRED)

Tell me to do this manually:

> **ACTION REQUIRED**: Create the Focus Mode
>
> 1. Open **System Settings** → **Focus**
> 2. Click "+" at bottom left
> 3. Select "Custom"
> 4. Name it **exactly**: `claude remote approve`
> 5. Save (default settings are fine)
>
> Then **enable it** (click it in Control Center or menu bar) and tell me when done.

After I confirm and enable it, verify:
```bash
FOCUS=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')
echo "Detected Focus Mode: '$FOCUS'"
if [[ "$FOCUS" == "claude remote approve" ]]; then
    echo "✓ Focus Mode working correctly!"
else
    echo "✗ Expected 'claude remote approve' but got '$FOCUS'"
    echo "Please check the Focus Mode name is exact (case-sensitive)"
fi
```

### Step 6: Restart Claude Code (CRITICAL)

Tell me:

> **CRITICAL**: You must restart Claude Code now!
>
> The hook only loads when Claude Code starts. Close this terminal and run `claude` again.
>
> After restarting, come back and paste this same prompt to continue testing.

If this is after restart, proceed to Step 7.

### Step 7: Test the Setup

Run these tests:

**Test 1: Focus Mode OFF** (should get CLI prompt)
```bash
echo "Disable your 'claude remote approve' Focus Mode, then tell me"
```
After I confirm, try to run `ls` - I should see a CLI permission prompt, not a notification.

**Test 2: Focus Mode ON** (should get iPhone notification)
```bash
echo "Enable your 'claude remote approve' Focus Mode, then tell me"
```
After I confirm, try to run `ls` - I should get an iPhone notification.

If Test 2 works, tell me:
> **Setup complete!**
> - Focus Mode OFF = CLI prompts
> - Focus Mode ON = iPhone notifications
> - Session approvals will be cached

## Troubleshooting (if tests fail)

### No notification received
```bash
# Check hook is executable
ls -la ~/.claude-approve-hook.sh

# Test hook directly
echo '{"tool_name":"Bash","tool_input":{"command":"ls"},"cwd":"/tmp"}' | ~/.claude-approve-hook.sh
```

### "command not found" errors in hook
```bash
# Check for PATH bug
grep -n "local PATH" ~/.claude-approve-hook.sh
# Should return nothing. If it shows results, the script has the bug.
```

### Focus Mode not detected
```bash
shortcuts list | grep -i focus
shortcuts run "Get Current Focus"
```

## Instructions for Claude Code

1. **First ask for credentials** - Don't proceed until user provides all 3 values
2. **Substitute placeholders** - When creating the hook script, replace `__PAIRING_ID__`, `__PAIRING_SECRET__`, `__SERVER_URL__` with actual user values
3. **Execute and verify each step** - Run the verification commands and check output
4. **Prompt for manual steps** - Use blockquotes to clearly tell user what to do in System Settings
5. **Wait for confirmations** - After manual steps, wait for user to say "done" before verifying
6. **Restart is mandatory** - Do not skip Step 6, hooks don't reload without restart
7. **Run tests** - After restart, run both tests to confirm setup works
