# Claude Code Approver - User Guide

**Approve Claude Code actions from your iPhone via push notifications.**

## What You Need

- iPhone with iOS 16.4+
- Claude Code on your laptop
- Node.js 18+ (for initial pairing only)
- 5 minutes

---

## Quick Start (Recommended)

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/SerjoschDuering/claude-code-notifier/main/install.sh | bash
```

This will:
1. Generate your pairing credentials (shows QR code)
2. Download and install the hook script
3. Configure Claude Code settings

Then just:
1. Open the app on your iPhone (link shown after install)
2. Add to Home Screen in Safari
3. Scan the QR code
4. Enable notifications

**Done!** Claude Code will now ask your permission via your phone.

---

## Manual Install (Step by Step)

### Step 1: iPhone Setup

1. Open Safari on your iPhone
2. Go to: `https://claude-approver.pages.dev` (or your custom domain)
3. Tap the **Share** button (square with arrow up)
4. Scroll down, tap **"Add to Home Screen"**
5. Tap **"Add"**
6. **Important**: Open the app from your Home Screen (not Safari)

**Why Home Screen?** iOS only allows push notifications for apps added to the Home Screen.

### Step 2: Generate Pairing (On Laptop)

Run this command on your laptop:

```bash
npx claude-code-approver init --server https://claude-code-notifier.tralala798.workers.dev
```

You'll see:
- A QR code
- Pairing ID and Secret (for manual entry)
- Confirmation that credentials are saved

**Note**: This creates `~/.claude-approve/config.json` with your pairing info.

### Step 3: Pair Your iPhone

1. Go back to the app on your iPhone
2. Tap **"Pair Device"** or **"Start Pairing"**
3. **Option A**: Point your camera at the QR code on your laptop
4. **Option B**: Tap "Manual Entry" and type the Pairing ID + Secret
5. Tap **"Enable notifications"** when prompted
6. Grant notification permissions

You should see "Connected" status!

### Step 4: Install Claude Code Hook

Download the hook script:

```bash
curl -o ~/.claude-approve-hook.sh https://raw.githubusercontent.com/SerjoschDuering/claude-code-notifier/main/hook/approve-hook.sh
chmod +x ~/.claude-approve-hook.sh
```

Add to Claude Code settings (`~/.claude/settings.json`):

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

If the file doesn't exist, create it with the content above.

### Step 5: Test It!

Ask Claude Code to run a simple command:

```
Can you list the files in this directory?
```

You should:
1. See a notification on your iPhone
2. Tap it to open the app
3. See the pending request: "Bash: ls"
4. Tap **Approve** or **Deny**
5. Claude Code continues or stops

---

## What Gets Installed?

Only two small files on your laptop:

1. **`~/.claude-approve/config.json`** (50 bytes)  
   Your pairing credentials

2. **`~/.claude-approve-hook.sh`** (~2KB)  
   The hook script that sends requests to your phone

That's it! No repository clone, no dependencies, no bloat.

---

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│  Cloud Server    │────▶│   Your iPhone   │
│  (hook script)  │◀────│  (relay only)    │◀────│   (approve/deny)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

1. Claude Code wants to do something (run command, edit file)
2. Hook script intercepts and sends notification to server
3. Server immediately pushes to your paired iPhone
4. You tap Approve or Deny
5. Hook script gets response and tells Claude Code to continue or stop

**Your data**: Approval requests are automatically deleted after 60 seconds. Nothing is stored permanently.

---

## Troubleshooting

### "Push notifications not working"

**Check:**
- Did you add the app to Home Screen? (Required for iOS push)
- Did you open it from Home Screen, not Safari?
- Did you grant notification permissions?
- Is your iPhone iOS 16.4 or later?

**Fix:**
1. Delete the app from Home Screen
2. Clear Safari cache
3. Add to Home Screen again
4. Open from Home Screen
5. Re-pair and enable notifications

### "Hook not triggering"

**Check:**
```bash
# Verify hook exists
ls -la ~/.claude-approve-hook.sh

# Verify config exists
cat ~/.claude-approve/config.json

# Verify Claude settings
cat ~/.claude/settings.json
```

**Fix:**
- Make sure hook is executable: `chmod +x ~/.claude-approve-hook.sh`
- Check Claude settings JSON is valid (use `jq . ~/.claude/settings.json`)
- Restart Claude Code to reload settings

### "QR code won't scan"

**Alternative:**
1. In the app, tap **"Manual Entry"**
2. Copy Pairing ID from terminal
3. Copy Pairing Secret from terminal
4. Paste them into the app
5. Tap "Pair"

### "Request timed out"

The hook waits 60 seconds for your response. If you don't respond in time:
- The request is automatically denied
- Claude Code stops and waits for you

---

## Customization

### Change what requires approval

Edit the `matcher` in `~/.claude/settings.json`:

**Only bash commands:**
```json
"matcher": "Bash"
```

**Only file operations:**
```json
"matcher": "Write|Edit"
```

**Everything:**
```json
"matcher": "*"
```

### Change timeout

Add `timeout` to the hook config (in seconds):

```json
{
  "type": "command",
  "command": "$HOME/.claude-approve-hook.sh",
  "timeout": 120
}
```

---

## Uninstall

```bash
# Remove hook script
rm ~/.claude-approve-hook.sh

# Remove pairing config
rm -rf ~/.claude-approve

# Remove from Claude settings
# (edit ~/.claude/settings.json and remove the hooks section)
```

Then delete the app from your iPhone Home Screen.

---

## Privacy & Security

### What data is collected?
None. Zero. Nada.

### What data is temporarily stored?
When you get an approval request:
- The command/action Claude wants to perform
- Your project directory path
- This data exists for max 60 seconds, then auto-deleted

### Who can see my requests?
Only you. The pairing ID + secret are unique to you and never shared.

### Is it open source?
Yes! See the code: https://github.com/SerjoschDuering/claude-code-notifier

### Can I self-host?
Yes! See the main README for deployment instructions.

---

## Support

**Questions or issues?**
- GitHub Issues: https://github.com/SerjoschDuering/claude-code-notifier/issues
- Check the main README: https://github.com/SerjoschDuering/claude-code-notifier

**Found a bug?**
Please report it on GitHub with:
- What you tried to do
- What happened
- Your OS and Node.js version

---

## Like it?

This tool is open source and free to use. If it helped you, consider buying me a coffee! ☕

[Tip Link] (shown in the app)
