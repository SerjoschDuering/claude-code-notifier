#!/bin/bash
# Claude Code Approver - Quick Install Script
# This script installs the approval hook for Claude Code

set -euo pipefail

WORKER_URL="https://claude-code-notifier.tralala798.workers.dev"
HOOK_URL="https://raw.githubusercontent.com/SerjoschDuering/claude-code-notifier/main/hook/approve-hook.sh"
HOOK_PATH="$HOME/.claude-approve-hook.sh"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"

echo "🚀 Claude Code Approver - Quick Install"
echo ""

# Step 1: Check dependencies
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "⚠️  jq not found. Installing jq is recommended for better hook performance."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 2: Generate pairing
echo "📱 Step 1: Generating pairing credentials..."
echo ""

if npx -y claude-code-approver@latest init --server "$WORKER_URL"; then
    echo ""
    echo "✅ Pairing credentials generated!"
else
    echo "❌ Failed to generate pairing. Please try manually:"
    echo "   npx claude-code-approver init --server $WORKER_URL"
    exit 1
fi

echo ""
echo "📝 Step 2: Installing hook script..."

# Step 3: Download hook
if curl -fsSL "$HOOK_URL" -o "$HOOK_PATH"; then
    chmod +x "$HOOK_PATH"
    echo "✅ Hook script installed to $HOOK_PATH"
else
    echo "❌ Failed to download hook script"
    exit 1
fi

echo ""
echo "⚙️  Step 3: Configuring Claude Code..."

# Step 4: Configure Claude Code settings
mkdir -p "$HOME/.claude"

if [ ! -f "$CLAUDE_SETTINGS" ]; then
    # Create new settings file
    cat > "$CLAUDE_SETTINGS" << 'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude-approve-hook.sh"
          }
        ]
      }
    ]
  }
}
EOF
    echo "✅ Created Claude Code settings file"
else
    echo "⚠️  Claude Code settings already exist at $CLAUDE_SETTINGS"
    echo ""
    echo "Please manually add this to your hooks configuration:"
    echo ""
    cat << 'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude-approve-hook.sh"
          }
        ]
      }
    ]
  }
}
EOF
    echo ""
fi

echo ""
echo "✨ Installation complete!"
echo ""
echo "📱 Next steps:"
echo "   1. Open https://claude-approver.pages.dev in Safari on your iPhone"
echo "   2. Add to Home Screen (Share → Add to Home Screen)"
echo "   3. Open the app from your Home Screen"
echo "   4. Tap 'Pair Device' and scan the QR code above"
echo "   5. Enable push notifications when prompted"
echo ""
echo "🎉 That's it! Claude Code will now send approval requests to your phone."
echo ""
