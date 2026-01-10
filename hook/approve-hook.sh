#!/bin/bash
# Claude Code Approval Hook
# This hook sends approval requests to your phone via the claude-approve CLI
#
# Installation:
# 1. Make this script executable: chmod +x approve-hook.sh
# 2. Add to your Claude Code settings (.claude/settings.json):
#
# {
#   "hooks": {
#     "PreToolUse": [
#       {
#         "matcher": "Bash|Write|Edit",
#         "hooks": ["bash /path/to/approve-hook.sh"]
#       }
#     ]
#   }
# }

# Check for jq dependency
if ! command -v jq &> /dev/null; then
  echo '{"decision": "approve", "reason": "jq not installed, approving by default"}'
  exit 0
fi

# Read the hook input from stdin
INPUT=$(cat)

# Parse the tool name and input from the JSON
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // empty')

# Skip if no tool name
if [ -z "$TOOL" ]; then
  echo '{"decision": "approve"}'
  exit 0
fi

# Extract relevant info based on tool type
case "$TOOL" in
  "Bash")
    COMMAND=$(echo "$TOOL_INPUT" | jq -r '.command // empty')
    DETAILS="Command: $COMMAND"
    ;;
  "Write")
    FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty')
    DETAILS="Write to: $FILE_PATH"
    ;;
  "Edit")
    FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty')
    OLD_STRING=$(echo "$TOOL_INPUT" | jq -r '.old_string // empty' | head -c 100)
    DETAILS="Edit: $FILE_PATH"
    ;;
  *)
    DETAILS=$(echo "$TOOL_INPUT" | jq -c '.' | head -c 200)
    ;;
esac

# Send approval request and wait for response
if claude-approve request \
  --tool "$TOOL" \
  --command "$COMMAND" \
  --details "$DETAILS" \
  --cwd "$(pwd)" \
  --timeout 600000; then
  # Approved
  echo '{"decision": "approve"}'
else
  # Denied or timed out
  echo '{"decision": "deny", "reason": "Request denied via mobile approval"}'
fi
