# Quick Install - For End Users

This guide is for users who want to use the hosted Claude Code Approver service.

## Prerequisites

- iPhone with iOS 16.4+ 
- Claude Code installed on your laptop
- Node.js 18+ (for pairing only)

## Step 1: iPhone Setup (5 minutes)

1. **Open the app**: Visit [your-pwa-url.pages.dev](https://your-pwa-url.pages.dev) in Safari
2. **Add to Home Screen**: Tap Share → "Add to Home Screen" → Add
3. **Open from Home Screen**: Important! Open the app from your Home Screen, not Safari
4. Keep this tab open - you'll come back after Step 2

## Step 2: Generate Pairing (On Your Laptop)

Run this one command to generate your pairing QR code:

```bash
npx claude-code-approver init --server https://your-worker-url.workers.dev
```

This will:
- Generate a unique pairing ID and secret
- Display a QR code
- Save credentials to `~/.claude-approve/config.json`

## Step 3: Pair Your iPhone

1. Go back to the app on your iPhone
2. Tap "Pair Device"
3. Scan the QR code with your camera
4. Tap "Enable notifications" when prompted

## Step 4: Install Claude Code Hook

### Quick Install (Recommended)

Download and install the hook with this one-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/claude-code-notifier/main/install.sh | bash
```

### Manual Install

1. Download the hook script:
```bash
curl -o ~/.claude-approve-hook.sh https://raw.githubusercontent.com/YOUR_USERNAME/claude-code-notifier/main/hook/approve-hook.sh
chmod +x ~/.claude-approve-hook.sh
```

2. Add to `~/.claude/settings.json`:
```json
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
```

## Done! 🎉

Now when Claude Code wants to run a command or edit a file, you'll get a push notification on your iPhone!

## Troubleshooting

**QR code not scanning?**
- The CLI will also print the Pairing ID and Secret - enter them manually in the app

**Push notifications not working?**
- Make sure you opened the app from Home Screen (not Safari browser)
- Check notification permissions in Settings → Claude Code Approver

**Hook not triggering?**
- Verify the hook is installed: `cat ~/.claude-approve-hook.sh`
- Check Claude Code settings: `cat ~/.claude/settings.json`
- Test the CLI: `claude-approve status` (after installing via npx)

## What Gets Installed?

- `~/.claude-approve/config.json` - Your pairing credentials (keep this safe!)
- `~/.claude-approve-hook.sh` - The hook script (20 lines of bash)
- Nothing else! No repository clone needed.

## Uninstall

```bash
rm ~/.claude-approve-hook.sh
rm -rf ~/.claude-approve
# Remove the hook from ~/.claude/settings.json
```
