# macOS Native Notification Setup

This guide shows you how to use **macOS native notifications** with Claude Code approvals instead of (or alongside) iPhone push notifications.

## Overview

The Claude Code Notifier now supports **two notification methods**:

1. **iPhone Push Notifications** (original) - Get approvals on your iPhone via PWA
2. **macOS Native Notifications** (new!) - Get approvals via Notification Center + dialog on your Mac

You control which method to use via **Focus Mode**.

## How It Works

### Focus Mode Routing

The hook script automatically routes approval requests based on your current macOS Focus Mode:

| Focus Mode | Notification Method | Description |
|------------|-------------------|-------------|
| `"claude remote approve"` | iPhone Push | Send to iPhone PWA (requires pairing) |
| `"claude notification approval"` | macOS Native | Show Notification Center alert + dialog (local only) |
| Any other Focus Mode | CLI Prompt | Falls back to standard Claude Code prompt |

### What You'll See (macOS Native)

When `"claude notification approval"` Focus Mode is active:

1. **Notification Center Alert** - A notification appears in the top-right corner with sound
   - Title: "Claude Code"
   - Message: "Approval needed for [Tool] action"
   - Stays in Notification Center for later review

2. **Approval Dialog** - A modal window appears immediately with:
   - Tool type (Bash, Write, Edit)
   - Command or file details
   - Working directory
   - Three action buttons:
     - **Deny** - Reject this action
     - **Approve Once** - Approve this single action
     - **Approve Session** - Approve all future actions of this tool type in the current Claude session

## Setup Instructions

### Prerequisites

- macOS (tested on macOS 11+)
- Hook script already installed (see main README)
- Apple Shortcuts app with "Get Current Focus" shortcut installed

### Step 1: Install terminal-notifier (Optional but Recommended)

For better Notification Center integration:

```bash
brew install terminal-notifier
```

**Note:** If you don't install this, the system will fall back to `osascript` notifications, which still work but are less polished.

### Step 2: Create Focus Mode

Create a new Focus Mode in macOS:

1. Open **System Settings** → **Focus**
2. Click **+** to add a new Focus Mode
3. Choose **Custom** → **Continue**
4. Name it: `claude notification approval` (exact name matters!)
5. Choose an icon and color
6. Click **Done**

### Step 3: Configure Focus Mode

Optional but recommended settings:

- **Allowed Notifications:** Allow all (or at least "Script Editor" and "Terminal")
- **Screen Sharing:** Turn off (if you don't want this to affect screen sharing)
- **Turn on Automatically:** Configure when you want this active
  - Example: When at home WiFi
  - Example: During work hours at your desk

### Step 4: Activate the Focus Mode

Turn on the Focus Mode when you want to use macOS notifications:

**Option A: Manual Toggle**
- Click the Focus Mode icon in menu bar
- Select "claude notification approval"

**Option B: Shortcuts Automation** (Recommended)
- Open Shortcuts app
- Create automation: "When I connect to [Home WiFi]"
- Action: "Set Focus" to "claude notification approval"
- Create reverse automation for when you disconnect

### Step 5: Test It

1. Activate the `"claude notification approval"` Focus Mode
2. In Claude Code, try a command that requires approval:
   ```
   Can you run ls -la?
   ```
3. You should see:
   - Notification in Notification Center 🔔
   - Dialog window with approval buttons 💬

## Usage Patterns

### Pattern 1: At Desk = macOS, Away = iPhone

Use Shortcuts automations:

**At Home (Desk):**
```
When: Connected to "Home WiFi"
Do: Set Focus to "claude notification approval"
```

**Away from Home:**
```
When: Disconnected from "Home WiFi"
Do: Set Focus to "claude remote approve"
```

Now approvals automatically route to the right device based on location!

### Pattern 2: Work Hours = macOS, After Hours = iPhone

```
When: Time is 9:00 AM - 6:00 PM on Weekdays
Do: Set Focus to "claude notification approval"

When: Time is 6:00 PM or Weekend
Do: Set Focus to "claude remote approve"
```

### Pattern 3: Focus Time = No Interruptions

```
When: "Do Not Disturb" is enabled
Do: Set Focus to "Do Not Disturb"
```

This will fall back to CLI prompts (no notifications at all).

## Session Caching

Both notification methods support **session caching**:

- **Approve Once** - Approves this single action
- **Approve Session** - Caches approval for this tool type for the entire Claude Code session

Session cache is shared between both notification methods and persists until Claude Code exits.

Cache location: `/tmp/claude-approve-cache-$PPID.json`

## Troubleshooting

### "No notification appeared"

**Check:**
1. Is the Focus Mode name exactly `"claude notification approval"`?
2. Run `shortcuts run "Get Current Focus"` - does it return `claude notification approval`?
3. Is the hook script executable? `chmod +x ~/.claude-approve-hook.sh`

### "Dialog appeared but no Notification Center alert"

This is expected if `terminal-notifier` is not installed. The dialog is the important part - the Notification Center alert is just a bonus for visibility.

**To fix:** `brew install terminal-notifier`

### "Dialog times out after 2 minutes"

This is by design. The dialog has a 120-second timeout. If you don't respond, it denies the action.

**To change timeout:** Edit the hook script and modify `giving up after 120` to your preferred seconds.

### "Want to use both iPhone AND macOS"

Currently, each Focus Mode routes to only one method. However, you can:
1. Switch Focus Modes manually when needed
2. Use Shortcuts automations to switch based on context
3. Keep both methods configured and switch as needed

## Advanced Configuration

### Change the macOS Focus Mode Name

Edit your config file: `~/.claude-approve/config.json`

```json
{
  "pairingId": "...",
  "pairingSecret": "...",
  "serverUrl": "...",
  "createdAt": 123456789,
  "macosFocusName": "my custom focus name"
}
```

Then update the hook script to read this config value (requires editing `hook/approve-hook.sh`).

### Customize Dialog Appearance

Edit `/hook/approve-hook.sh` in the `show_macos_approval()` function:

- **Timeout:** Change `giving up after 120` to your preferred seconds
- **Button Labels:** Modify the `buttons {\"Deny\", \"Approve Once\", \"Approve Session\"}`
- **Icon:** Change `with icon caution` to `with icon note` or `with icon stop`
- **Sound:** Modify `-sound default` to use a different system sound

### Disable Notification Center Alert

If you only want the dialog (no Notification Center alert), edit the hook and comment out the `terminal-notifier` section:

```bash
# if command -v terminal-notifier &> /dev/null; then
#     terminal-notifier -title "Claude Code" \
#         -message "Approval needed for $TOOL action" \
#         -subtitle "Click to respond" \
#         -sound default \
#         -group "claude-approval-$PPID" &
# fi
```

## How Session Caching Works

When you click "Approve Session", the approval is cached in `/tmp/claude-approve-cache-$PPID.json`:

```json
{
  "sessionId": "12345",
  "approvals": {
    "tool:Bash": {
      "approved": true,
      "timestamp": 1234567890
    }
  }
}
```

Future requests for the same tool type will skip the notification and auto-approve until Claude Code exits.

## Comparison: iPhone vs macOS

| Feature | iPhone Push | macOS Native |
|---------|------------|--------------|
| Works when away from Mac | ✅ Yes | ❌ No |
| Works without iPhone | ❌ No | ✅ Yes |
| Notification Center | ✅ Yes (iOS) | ✅ Yes (macOS) |
| Action buttons | ✅ Yes (in notification) | ✅ Yes (in dialog) |
| Requires pairing | ✅ Yes | ❌ No |
| Requires internet | ✅ Yes (Cloudflare Worker) | ❌ No (fully local) |
| Session caching | ✅ Yes | ✅ Yes |
| Privacy | Network request | 🔒 100% local |
| Setup complexity | Medium (pairing + PWA) | Easy (just Focus Mode) |

## Privacy & Security

**macOS Native notifications are 100% local:**
- No network requests
- No data leaves your Mac
- No server infrastructure needed
- Works offline

**iPhone Push notifications require:**
- Internet connection
- Cloudflare Worker backend
- Push notification service (Apple Push)
- Pairing credentials stored in config

Choose based on your privacy preferences and usage patterns!

---

## Quick Reference

**To use macOS notifications:**
```bash
# 1. Activate Focus Mode
shortcuts run "Set Focus" -i "claude notification approval"

# 2. Use Claude Code normally
# Notifications will appear as dialogs
```

**To use iPhone notifications:**
```bash
# 1. Activate Focus Mode
shortcuts run "Set Focus" -i "claude remote approve"

# 2. Use Claude Code normally
# Notifications will go to your iPhone
```

**To disable notifications (CLI prompts only):**
```bash
# Set any other Focus Mode
shortcuts run "Set Focus" -i "Do Not Disturb"
```

---

**Need help?** Check the [Main Setup Guide](../SETUP-PROMPT.md) or [README](../README.md).
