# Focus Mode Quick Setup Guide

**2-minute setup for automatic notification toggling**

This guide shows you EXACTLY what to click and type in Shortcuts to set up Focus Mode automation.

---

## What You'll Get

- **Focus Mode ON** → iPhone notifications 📱
- **Focus Mode OFF** → CLI prompts 💻
- **Fully automatic** - No manual commands needed!
- **No automations** - Just one simple Shortcut!
- **No file state** - Direct Focus Mode detection!

---

## The Simple Approach

Unlike other methods that require complex automations and file management, this approach uses the `shortcuts` command-line tool to directly query your current Focus Mode.

**Total setup:** 1 Shortcut (2 actions) + 1 Focus Mode = Done!

---

## Step-by-Step Setup

### Step 1: Install the Shortcut (1 min)

**Option 1: Download (Easiest)**

[📥 Download "Get Current Focus" Shortcut](https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad)

Click the link, then click "Add Shortcut" in Shortcuts app. **Done!** ✅

---

**Option 2: Create Manually**

1. Open **Shortcuts** app on your Mac
2. Click **"+"** button (create new shortcut - NOT automation!)
3. Name it: **`Get Current Focus`**

4. Search for: **"Get Current Focus"**
   - Click to add it

5. Search for: **"Get Name"**
   - Click to add it
   - It should automatically connect to the "Focus" output from step 4

6. **Save** the shortcut (Cmd+S)

Your shortcut should look like this:
```
Get Current Focus
  ↓ Focus
Get Name
  ↓ Name
```

**✅ Shortcut created!**

---

### Step 2: Create Your Focus Mode (1 min)

1. Open **System Settings**
2. Click **Focus** in sidebar
3. Click **"+"** button (bottom left corner)
4. Choose any icon you like
5. Name it: **`claude remote approve`** (exactly this - case-sensitive!)
6. Click **Done**

> **💡 Tip:** Want to use "Work" or another Focus Mode?
> Add `"focusModeName": "Your Mode"` to `~/.claude-approve/config.json`

**✅ Focus Mode created!**

---

### Step 3: Test It Works (30 seconds)

Open Terminal and run:

```bash
shortcuts run "Get Current Focus"
```

**Expected results:**

**With Focus Mode OFF:**
```bash
shortcuts run "Get Current Focus"
# Prints: (nothing) or blank line
```

**With Focus Mode ON:**
```bash
# Activate your "claude remote approve" Focus Mode first
shortcuts run "Get Current Focus"
# Prints: claude remote approve
```

**If you see "claude remote approve" when Focus is active, you're done!** ✅

---

## How It Works

### The Magic 4 Lines

When Claude Code wants to run a command, the hook executes:

```bash
# Get current Focus Mode name
FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')

# If it's not "claude remote approve", skip notifications
if [[ "$FOCUS_MODE" != "claude remote approve" ]]; then
    exit 1  # Show CLI prompt instead
fi
```

That's literally it! Direct, real-time Focus Mode detection.

---

## Testing with Claude Code

### Test 1: Focus Mode OFF

1. Make sure "claude remote approve" is **deactivated**
2. Ask Claude Code to run a command (e.g., "Please run ls")
3. **Expected:** You see CLI prompt in terminal (not iPhone notification)

### Test 2: Focus Mode ON

1. **Activate** "claude remote approve" Focus Mode
   - Control Center > Focus > claude remote approve
2. Ask Claude Code to run a command (e.g., "Please run ls")
3. **Expected:** You get iPhone notification 📱

---

## Troubleshooting

### "Shortcut not found" Error

**Symptom:**
```bash
shortcuts run "Get Current Focus"
# Error: The shortcut "Get Current Focus" could not be found
```

**Solutions:**
1. Check the exact name in Shortcuts app - must be: `Get Current Focus`
2. Case-sensitive! Not "get focus mode" or "Get Focus mode"
3. Make sure it's a **Shortcut**, not an **Automation**
4. List all shortcuts to verify:
   ```bash
   shortcuts list | grep -i focus
   ```

---

### Shortcut Returns Nothing

**Symptom:** Command returns blank even when Focus Mode is active

**Solutions:**
1. Make sure you added **both** actions:
   - Get Current Focus
   - Get Name (connected to the Focus output)
2. The "Get Name" action should show it's getting the name FROM the Focus object
3. Try running the shortcut manually in Shortcuts app - does it work?
4. Check the connection between actions:
   ```
   Get Current Focus
     ↓ Focus          ← This connection must exist!
   Get Name
   ```

---

### Hook Still Shows CLI Prompts (Focus ON)

**Symptom:** Focus Mode is active but still seeing CLI prompts instead of iPhone notifications

**Diagnostic:**
```bash
# Check what the hook sees
FOCUS=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')
echo "Hook sees: '$FOCUS'"

# Should print: Hook sees: 'claude remote approve'
```

**Solutions:**

1. **Check Focus Mode name** is EXACTLY: `claude remote approve`
   - Open System Settings > Focus
   - Click on your Focus Mode
   - Check the name matches exactly (case-sensitive!)

2. **Check the shortcut returns exact string:**
   ```bash
   shortcuts run "Get Current Focus" | cat -A
   # Should show: claude remote approve$
   # No extra whitespace or special characters
   ```

3. **Verify shortcut is actually running:**
   ```bash
   time shortcuts run "Get Current Focus"
   # Should take ~100-200ms and print the Focus name
   ```

4. **Check hook file** has the correct code (lines 22-29):
   ```bash
   sed -n '22,29p' ~/.claude-approve-hook.sh
   ```

---

### Slow Performance

**Symptom:** Hook takes >1 second to respond

**This is normal!** The `shortcuts run` command takes ~100-200ms. This is acceptable overhead.

**If it's slower (>500ms):**
- Check if Shortcuts app is responding (not hung)
- Try quitting and reopening Shortcuts app
- Restart your Mac (Shortcuts daemon may be stuck)

**Performance note:** You're already waiting for network (iPhone notification) anyway, so 100ms is imperceptible in the context of human approval.

---

## Advanced Usage

### Use a Different Focus Mode Name

Want to use "Work Mode" instead?

1. Create Focus Mode with name: "Work Mode"
2. Update hook (line 27 in `~/.claude-approve-hook.sh`):
   ```bash
   if [[ "$FOCUS_MODE" != "Work Mode" ]]; then
   ```

### Multiple Focus Modes

Want several Focus Modes to enable notifications?

```bash
# In the hook, change to:
if [[ "$FOCUS_MODE" != "claude remote approve" ]] && [[ "$FOCUS_MODE" != "Work Mode" ]]; then
    exit 1
fi

# Or use a case statement:
case "$FOCUS_MODE" in
    "claude remote approve"|"Work Mode"|"Coding")
        # Send notification (continue with hook)
        ;;
    *)
        # Show CLI prompt
        exit 1
        ;;
esac
```

### Invert the Logic

Want notifications OFF when a specific Focus Mode is ON?

```bash
# Skip notifications when "Do Not Disturb" is active
if [[ "$FOCUS_MODE" == "Do Not Disturb" ]]; then
    exit 1  # Show CLI prompt
fi
```

---

## Why This is Better Than File-Based State

**Old approach (file + automations):**
- 2 Shortcuts Automations
- 4 total actions
- File picker UX nightmare
- Hidden files not visible
- "Ask Before Running" issues
- State can be stale

**New approach (Shortcuts CLI):**
- 1 Shortcut
- 2 total actions
- No file picker needed
- No automation issues
- Always current state
- Direct detection

**Setup time:**
- Old: ~5 minutes (if you're lucky)
- New: ~2 minutes

**Reliability:**
- Old: File state can be wrong
- New: Always accurate

---

## Quick Reference Card

### What You Created

**1 Shortcut:** "Get Current Focus"
```
Get Current Focus
  ↓ Focus
Get Name
  ↓ Name
```

**1 Focus Mode:** "claude remote approve"

### Test Commands

```bash
# Test the shortcut
shortcuts run "Get Current Focus"

# List all shortcuts
shortcuts list

# List all Focus Modes (indirect - shows recent ones)
# No direct CLI command, use System Settings
```

### How the Hook Uses It

```bash
# Lines 22-29 of ~/.claude-approve-hook.sh
FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')

if [[ "$FOCUS_MODE" != "claude remote approve" ]]; then
    exit 1  # Show CLI prompt
fi
```

---

## Summary

**Setup steps:**
1. Create Shortcut: "Get Current Focus" (2 actions)
2. Create Focus Mode: "claude remote approve"
3. Test: `shortcuts run "Get Current Focus"`

**How it works:**
- Hook runs shortcut (~100ms)
- If returns "claude remote approve" → iPhone notification
- If returns anything else → CLI prompt

**Benefits:**
- ✅ Super simple (1 shortcut vs 2 automations)
- ✅ No file picker UX issues
- ✅ No "Ask Before Running" issues
- ✅ No Full Disk Access needed
- ✅ Direct, real-time detection
- ✅ Only 4 lines of bash in the hook

---

## Next Steps

- ✅ Setup complete? Test it thoroughly!
- 📱 Make sure iPhone PWA is paired
- 🔧 Customize Focus Mode (schedule, automation, etc.)
- 📖 Read [Full Shortcuts Guide](./SHORTCUTS-AUTOMATION.md) for more details

---

## Related Documentation

- [Complete Setup Guide](../SETUP-PROMPT.md) - Full installation
- [Shortcuts Automation Details](./SHORTCUTS-AUTOMATION.md) - In-depth guide
- [macOS Notification Setup](./MACOS-NOTIFICATION-SETUP.md) - Alternative notification method

---

## Need Help?

- **Full Shortcuts Guide**: [SHORTCUTS-AUTOMATION.md](./SHORTCUTS-AUTOMATION.md)
- **Complete Setup**: [SETUP-PROMPT.md](../SETUP-PROMPT.md)
- **GitHub Issues**: https://github.com/SerjoschDuering/claude-code-notifier/issues
