#!/bin/bash
# Claude Code Approval Hook v2 - Pure Bash Implementation
# Uses header-based authentication with curl + openssl (no npm/npx dependencies)
#
# Installation:
# 1. Make this script executable: chmod +x ~/.claude-approve-hook.sh
# 2. Add to your Claude Code settings (~/.claude/settings.json):
#
# {
#   "hooks": {
#     "PreToolUse": [
#       {
#         "matcher": "Bash|Write|Edit",
#         "hooks": [{"type": "command", "command": "$HOME/.claude-approve-hook.sh"}]
#       }
#     ]
#   }
# }
#
# Focus Mode Routing:
# - "claude remote approve" → iPhone push notification (requires pairing)
# - "claude notification approval" → macOS native dialog (local only)
# - Any other Focus Mode → Falls back to CLI prompt

CONFIG="$HOME/.claude-approve/config.json"
SESSION_CACHE="/tmp/claude-approve-cache-$PPID.json"

# Response formats for Claude Code hooks
ALLOW='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Approved via notification"}}'
DENY='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Denied via notification"}}'

# Fail open if not configured or missing dependencies
[ ! -f "$CONFIG" ] && echo "$ALLOW" && exit 0
command -v jq &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v curl &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v openssl &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v xxd &> /dev/null || { echo "$ALLOW"; exit 0; }

# Read input from Claude Code
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

# Focus Mode Check - use shortcuts CLI to get current Focus Mode
# Requires: Shortcut named "Get Current Focus" (download: https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad)
FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')

# Get configured Focus Mode names
REMOTE_FOCUS=$(jq -r '.focusModeName // "claude remote approve"' "$CONFIG" 2>/dev/null)
MACOS_FOCUS="claude notification approval"

# Determine notification method based on Focus Mode
USE_REMOTE=false
USE_MACOS=false

if [[ "$FOCUS_MODE" == "$REMOTE_FOCUS" ]]; then
    USE_REMOTE=true
elif [[ "$FOCUS_MODE" == "$MACOS_FOCUS" ]]; then
    USE_MACOS=true
else
    # No matching Focus Mode - fall back to CLI prompt
    exit 1
fi

# Check local whitelist first to avoid unnecessary notifications
LOCAL_SETTINGS="$CWD/.claude/settings.local.json"
if [ -f "$LOCAL_SETTINGS" ]; then
    if [ "$TOOL" = "Bash" ]; then
        CMD=$(echo "$TOOL_INPUT" | jq -r '.command // ""')
        BASE_CMD=$(echo "$CMD" | awk '{print $1}')
        if jq -e ".permissions.allow[] | select(. == \"Bash($BASE_CMD:*)\" or . == \"Bash($CMD)\")" "$LOCAL_SETTINGS" &>/dev/null; then
            echo "$ALLOW"
            exit 0
        fi
    fi
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
    Write)
        FILE=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""')
        CMD=""
        DETAILS="Write: $FILE"
        ;;
    Edit)
        FILE=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""')
        CMD=""
        DETAILS="Edit: $FILE"
        ;;
    *)
        CMD=""
        DETAILS=$(echo "$TOOL_INPUT" | jq -c '.' | head -c 200)
        ;;
esac

# Function: Show macOS approval dialog (always on top, clean UI)
show_macos_approval() {
    local TOOL="$1"
    local DETAILS="$2"
    local CWD="$3"

    # Escape special characters for AppleScript
    DETAILS=$(echo "$DETAILS" | sed 's/\\/\\\\/g; s/"/\\"/g')
    CWD=$(echo "$CWD" | sed 's/\\/\\\\/g; s/"/\\"/g')

    # Compact dialog text
    local DIALOG_TEXT="Tool: $TOOL
Command: $DETAILS

Directory: $CWD"

    # Show dialog - activate System Events to bring to front
    DIALOG_RESULT=$(osascript 2>&1 <<EOF
tell application "System Events"
    activate
    display dialog "$DIALOG_TEXT" ¬
        buttons {"Deny", "Approve Once", "Approve Session"} ¬
        default button "Approve Once" ¬
        with title "Claude Code" ¬
        with icon caution ¬
        giving up after 120
end tell
EOF
)
    DIALOG_EXIT=$?

    # Parse result
    if [ $DIALOG_EXIT -ne 0 ]; then
        return 1
    fi

    if echo "$DIALOG_RESULT" | grep -q "gave up:true"; then
        return 1
    elif echo "$DIALOG_RESULT" | grep -q "button returned:Approve Session"; then
        echo "session-tool"
        return 0
    elif echo "$DIALOG_RESULT" | grep -q "button returned:Approve Once"; then
        echo "once"
        return 0
    else
        return 1
    fi
}

# Function: Create HMAC-SHA256 signature with header-based auth
# Uses pure bash with openssl for crypto operations
create_signature() {
    local METHOD="$1"
    local API_PATH="$2"
    local BODY="$3"
    local TS="$4"
    local NONCE="$5"
    local SECRET="$6"

    # Hash body with SHA-256 (use empty string for GET requests)
    # Use -A flag for consistent base64 output without line breaks
    local BODY_HASH
    if [ -z "$BODY" ]; then
        BODY_HASH=$(printf '' | openssl dgst -sha256 -binary | openssl enc -base64 -A)
    else
        BODY_HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -binary | openssl enc -base64 -A)
    fi

    # Build canonical string: METHOD\nAPI_PATH\nBODY_HASH\nTS\nNONCE
    local CANONICAL
    CANONICAL=$(printf '%s\n%s\n%s\n%s\n%s' "$METHOD" "$API_PATH" "$BODY_HASH" "$TS" "$NONCE")

    # Decode secret from base64 to hex for openssl HMAC
    # CRITICAL: Use openssl for base64 decode (cross-platform, works on macOS and Linux)
    # Use -A flag for consistent base64 handling
    local SECRET_HEX
    SECRET_HEX=$(printf '%s' "$SECRET" | openssl enc -d -base64 -A | xxd -p -c 256 | tr -d '\n')

    # Create HMAC-SHA256 signature
    printf '%s' "$CANONICAL" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$SECRET_HEX" -binary | openssl enc -base64 -A
}

# Function: Send approval request via pure bash (curl + headers)
send_remote_request() {
    local TOOL="$1"
    local DETAILS="$2"
    local CWD="$3"

    # Load config
    local SERVER_URL PAIRING_ID PAIRING_SECRET
    SERVER_URL=$(jq -r '.serverUrl' "$CONFIG")
    PAIRING_ID=$(jq -r '.pairingId' "$CONFIG")
    PAIRING_SECRET=$(jq -r '.pairingSecret' "$CONFIG")

    # Generate request ID, nonce, and timestamp
    local REQUEST_ID NONCE TS
    REQUEST_ID=$(openssl rand -hex 16)
    NONCE=$(openssl rand -base64 16 | tr -d '\n')
    TS=$(date +%s)

    # Build request body (JSON payload)
    local BODY
    BODY=$(jq -c -n \
        --arg requestId "$REQUEST_ID" \
        --arg tool "$TOOL" \
        --arg details "$DETAILS" \
        --arg cwd "$CWD" \
        '{requestId: $requestId, payload: {tool: $tool, details: $details, cwd: $cwd}}')

    # Create signature with header-based auth
    local SIGNATURE
    SIGNATURE=$(create_signature "POST" "/api/v2/request" "$BODY" "$TS" "$NONCE" "$PAIRING_SECRET")

    # Send request with headers
    local HTTP_CODE RESPONSE_FILE
    RESPONSE_FILE="/tmp/claude-approve-response-$$.json"

    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$RESPONSE_FILE" \
        -X POST "${SERVER_URL}/api/v2/request" \
        -H "Content-Type: application/json" \
        -H "X-Pairing-ID: $PAIRING_ID" \
        -H "X-Timestamp: $TS" \
        -H "X-Nonce: $NONCE" \
        -H "Authorization: HMAC-SHA256 $SIGNATURE" \
        -d "$BODY" \
        --connect-timeout 5 \
        --max-time 10)

    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
        rm -f "$RESPONSE_FILE"
        echo "deny|once"
        return 1
    fi

    # Poll for decision
    local TIMEOUT=120
    local START ELAPSED
    START=$(date +%s)

    while true; do
        ELAPSED=$(($(date +%s) - START))
        if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
            rm -f "$RESPONSE_FILE"
            echo "deny|once"
            return 1
        fi

        sleep 1

        # Generate new nonce and timestamp for each poll request
        NONCE=$(openssl rand -base64 16 | tr -d '\n')
        TS=$(date +%s)

        # Sign GET request (empty body)
        SIGNATURE=$(create_signature "GET" "/api/v2/decision/$REQUEST_ID" "" "$TS" "$NONCE" "$PAIRING_SECRET")

        # Poll for decision
        local DECISION_RESPONSE
        DECISION_RESPONSE=$(curl -s \
            "${SERVER_URL}/api/v2/decision/$REQUEST_ID" \
            -H "X-Pairing-ID: $PAIRING_ID" \
            -H "X-Timestamp: $TS" \
            -H "X-Nonce: $NONCE" \
            -H "Authorization: HMAC-SHA256 $SIGNATURE" \
            --connect-timeout 5 \
            --max-time 10)

        local STATUS SCOPE
        STATUS=$(echo "$DECISION_RESPONSE" | jq -r '.data.status // "pending"')
        SCOPE=$(echo "$DECISION_RESPONSE" | jq -r '.data.scope // "once"')

        if [ "$STATUS" = "allowed" ]; then
            rm -f "$RESPONSE_FILE"
            echo "allow|$SCOPE"
            return 0
        elif [ "$STATUS" = "denied" ] || [ "$STATUS" = "expired" ]; then
            rm -f "$RESPONSE_FILE"
            echo "deny|once"
            return 0
        fi
        # Continue polling if status is pending
    done
}

# Route to appropriate notification method
DECISION="deny"
SCOPE="once"

if [ "$USE_REMOTE" = true ]; then
    # Use remote iPhone push notification (pure bash with curl)
    RESULT=$(send_remote_request "$TOOL" "$DETAILS" "$CWD")
    DECISION=$(echo "$RESULT" | cut -d'|' -f1)
    SCOPE=$(echo "$RESULT" | cut -d'|' -f2)

elif [ "$USE_MACOS" = true ]; then
    # Use macOS native notification and dialog
    APPROVAL_SCOPE=$(show_macos_approval "$TOOL" "$DETAILS" "$CWD")
    APPROVAL_EXIT=$?

    if [ $APPROVAL_EXIT -eq 0 ]; then
        DECISION="allow"
        SCOPE="$APPROVAL_SCOPE"
    fi
fi

# Process decision and update session cache
if [ "$DECISION" = "allow" ]; then
    # Update session cache if scope is session-tool or session-all
    if [ "$SCOPE" = "session-tool" ] || [ "$SCOPE" = "session-all" ]; then
        if [ ! -f "$SESSION_CACHE" ]; then
            jq -n --arg sessionId "$PPID" '{"sessionId": $sessionId, "approvals": {}}' > "$SESSION_CACHE"
        fi

        CURRENT_TS=$(date +%s)
        if [ "$SCOPE" = "session-all" ]; then
            jq --argjson ts "$CURRENT_TS" '.approvals."session-all" = {"approved": true, "timestamp": $ts}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
        elif [ "$SCOPE" = "session-tool" ]; then
            jq --arg tool "$TOOL" --argjson ts "$CURRENT_TS" '.approvals["tool:" + $tool] = {"approved": true, "timestamp": $ts}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
        fi
    fi

    echo "$ALLOW"
else
    echo "$DENY"
fi
