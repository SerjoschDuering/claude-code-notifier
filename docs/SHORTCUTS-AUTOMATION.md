# Shortcuts CLI Integration - Focus Mode Detection

**Automatically detect Focus Mode using Shortcuts CLI - No file-based state needed!**

This guide shows how to use a simple Shortcut and the `shortcuts` command-line tool to automatically enable/disable remote notifications based on your current Focus Mode.

**✨ No file state! No automations! No Full Disk Access required!**

---

## Why This Approach?

**Benefits:**
- ✅ **Super simple** - Just ONE Shortcut (2 actions)
- ✅ **No automations** - No "Ask Before Running" issues
- ✅ **No file state** - No file picker UX problems
- ✅ **No Full Disk Access** - Uses Shortcuts API
- ✅ **Direct detection** - Hook calls `shortcuts run` to get current Focus Mode
- ✅ **Fast** - ~100-200ms per check (acceptable for hooks)

**vs. Other Approaches:**

| Approach | Simplicity | Permissions | Speed | Issues |
|----------|-----------|-------------|-------|--------|
| **Shortcuts CLI** | 1 Shortcut (2 actions) | None | ~100ms | None! |
| File + Automations | 2 Automations | None | ~1ms | File picker UX terrible |
| JXA Script | Complex script | Full Disk Access | ~50ms | Needs permission |

---

## How It Works

### The Simple Flow

```
┌───────────────────────────────────────────────┐
│ Claude Code wants to run command              │
│   ↓                                           │
│ Hook executes: shortcuts run "Get Current Focus" │
│   ↓                                           │
│ Shortcut returns: "claude remote approve"     │
│   ↓                                           │
│ Hook: Name matches! → Send to iPhone 📱       │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Claude Code wants to run command              │
│   ↓                                           │
│ Hook executes: shortcuts run "Get Current Focus" │
│   ↓                                           │
│ Shortcut returns: "" (no Focus active)        │
│   ↓                                           │
│ Hook: No match → Show CLI prompt 💻           │
└───────────────────────────────────────────────┘
```

### The Hook Code

```bash
# In ~/.claude-approve-hook.sh (lines 22-29)

# Focus Mode Check - use shortcuts CLI to get current Focus Mode
FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')

# If Focus Mode is NOT "claude remote approve", skip notifications
if [[ "$FOCUS_MODE" != "claude remote approve" ]]; then
    exit 1  # Show CLI prompt instead
fi
```

That's it! Just 4 lines of bash.

---

## One-Time Setup (2 minutes)

### Step 1: Install the Shortcut

**Option 1: Download (Easiest)**

[📥 Download "Get Current Focus" Shortcut](https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad)

Click the link, then click "Add Shortcut" in Shortcuts app.

**Option 2: Create Manually**

1. Open **Shortcuts** app on your Mac
2. Click **"+"** (create new shortcut - NOT automation!)
3. Name it: **`Get Current Focus`**

4. Add first action:
   - Search for: **"Get Current Focus"**
   - Click to add it

5. Add second action:
   - Search for: **"Get Name"**
   - Click to add it
   - It should connect to the "Focus" output from step 4

6. **Save** the shortcut (Cmd+S)

**Result:** Just 2 actions:
```
Get Current Focus
  ↓ Focus
Get Name
  ↓ Name
```

### Step 2: Create Your Focus Mode

1. Open **System Settings** > **Focus**
2. Click **"+"** to create a new Focus Mode
3. Name it: **`claude remote approve`** (exact match required!)
4. Configure as desired (icons, schedules, etc.)
5. Save

> **💡 Tip:** Want to use a different Focus Mode name like "Work" or "Coding"?
> Add this to `~/.claude-approve/config.json`:
> ```json
> {
>   "focusModeName": "Your Custom Name"
> }
> ```

### Step 3: Test It Works

Open Terminal and run:

```bash
shortcuts run "Get Current Focus"
```

**Expected results:**
- If Focus Mode is OFF: prints nothing or blank line
- If Focus Mode "claude remote approve" is ON: prints `claude remote approve`
- If a different Focus Mode is ON: prints that Focus Mode's name

---

## Testing

### Test 1: Shortcut Works

```bash
# With Focus Mode OFF
shortcuts run "Get Current Focus"
# Should print: (nothing) or blank line

# Activate your "claude remote approve" Focus Mode
shortcuts run "Get Current Focus"
# Should print: claude remote approve

# Activate a different Focus Mode (e.g., "Do Not Disturb")
shortcuts run "Get Current Focus"
# Should print: Do Not Disturb
```

### Test 2: Hook Integration

**With Focus Mode OFF:**
1. Make sure "claude remote approve" is deactivated
2. Ask Claude Code to run: `ls`
3. **Expected:** CLI prompt appears (not iPhone notification)

**With Focus Mode ON:**
1. Activate "claude remote approve" Focus Mode
2. Ask Claude Code to run: `ls`
3. **Expected:** iPhone notification appears 📱

---

## Troubleshooting

### Shortcut Not Found Error

**Symptom:** `shortcuts run "Get Current Focus"` says "Shortcut not found"

**Solutions:**
1. Check the exact name in Shortcuts app - must be: `Get Current Focus`
2. Case-sensitive! Not "get focus mode" or "Get Focus mode"
3. Make sure it's a **Shortcut**, not an **Automation**
4. Try listing all shortcuts: `shortcuts list | grep Focus`

### Shortcut Returns Nothing

**Symptom:** `shortcuts run "Get Current Focus"` returns blank even when Focus is active

**Solutions:**
1. Make sure you added **both** actions:
   - Get Current Focus
   - Get Name (connected to the Focus output)
2. The "Get Name" action should show it's getting the name FROM the Focus object
3. Try running the shortcut manually in Shortcuts app - does it work?

### Hook Still Shows CLI Prompts When Focus Mode is ON

**Symptom:** Focus Mode is active but still seeing CLI prompts

**Diagnostic:**
```bash
# Check what the hook sees
FOCUS=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')
echo "Hook sees: '$FOCUS'"

# Should print: Hook sees: 'claude remote approve'
```

**Solutions:**
1. Check Focus Mode name is EXACTLY: `claude remote approve`
2. Check the shortcut returns the exact string (no extra whitespace)
3. Make sure the shortcut is actually running:
   ```bash
   time shortcuts run "Get Current Focus"
   # Should take ~100-200ms
   ```

### Slow Performance

**Symptom:** Hook takes >1 second to respond

**This is normal!** The `shortcuts run` command takes ~100-200ms. This is acceptable overhead for the convenience of not needing Full Disk Access.

**If it's slower (>500ms):**
- Check if Shortcuts app is responding (not hung)
- Try quitting and reopening Shortcuts app
- Restart your Mac (Shortcuts daemon may be stuck)

---

## Advanced Usage

### Use Different Focus Mode Name

If you want to use a different Focus Mode:

1. Create Focus Mode with any name (e.g., "Work Mode")
2. Update hook to match:
   ```bash
   if [[ "$FOCUS_MODE" != "Work Mode" ]]; then
   ```

### Multiple Focus Modes

Want multiple Focus Modes to enable notifications?

```bash
# In the hook, change to:
if [[ "$FOCUS_MODE" != "claude remote approve" ]] && [[ "$FOCUS_MODE" != "Work Mode" ]]; then
    exit 1
fi

# Or use a case statement:
case "$FOCUS_MODE" in
    "claude remote approve"|"Work Mode"|"Coding")
        # Send notification
        ;;
    *)
        # Show CLI prompt
        exit 1
        ;;
esac
```

### Invert the Logic

Want notifications OFF when Focus Mode is ON? (opposite behavior)

```bash
# In the hook, change to:
if [[ "$FOCUS_MODE" == "Do Not Disturb" ]]; then
    exit 1  # Skip notifications when DND is on
fi
```

### Add Timeout/Fallback

If Shortcuts CLI fails, fall back to sending notification:

```bash
FOCUS_MODE=$(timeout 1s shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')

# If command timed out or failed, default to sending notification
if [ $? -ne 0 ]; then
    FOCUS_MODE=""  # Treat as "no focus", send notification
fi
```

---

## Why This is Better Than File-Based State

**Old approach (file + automations):**
```
YOU: Toggle Focus Mode
  ↓
Shortcuts Automation triggered
  ↓
Append "enabled/disabled" to file
  ↓ (PROBLEMS HERE)
File picker won't show hidden files
Can't type path (needs browsing)
Automations need "Ask Before Running" unchecked
  ↓
Hook reads last line of file
  ↓
Decision: enabled or disabled?
```

**New approach (Shortcuts CLI):**
```
Hook runs: shortcuts run "Get Current Focus"
  ↓
Get current Focus Mode name
  ↓
Decision: matches "claude remote approve"?
```

**Comparison:**

| Aspect | File-Based | Shortcuts CLI |
|--------|-----------|---------------|
| Setup steps | 8 | 3 |
| Actions needed | 4 (2 automations × 2 actions) | 2 (1 shortcut) |
| File picker UX | ❌ Terrible | ✅ N/A |
| "Ask Before Running" | ❌ Must uncheck | ✅ N/A |
| Debugging | ❌ Check file state | ✅ Just run command |
| State sync | ❌ File may be stale | ✅ Always current |
| Performance | ~1ms | ~100ms |

**Verdict:** Shortcuts CLI is simpler despite being slightly slower.

---

## Performance Impact

The `shortcuts run` command adds ~100-200ms to each tool call. Is this acceptable?

**Yes, because:**
1. Tool calls only happen when Claude needs permission
2. You're already waiting for network (iPhone notification) anyway
3. 100ms is imperceptible in the context of human approval
4. Much better than dealing with Full Disk Access prompts

**Optimization:** If performance is critical, you can cache the result:

```bash
# Cache for 5 seconds
CACHE_FILE="/tmp/claude-focus-cache.txt"
CACHE_AGE=5

if [ -f "$CACHE_FILE" ]; then
    AGE=$(($(date +%s) - $(stat -f%m "$CACHE_FILE")))
    if [ $AGE -lt $CACHE_AGE ]; then
        FOCUS_MODE=$(cat "$CACHE_FILE")
    fi
fi

if [ -z "$FOCUS_MODE" ]; then
    FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')
    echo "$FOCUS_MODE" > "$CACHE_FILE"
fi
```

But honestly, the ~100ms is fine. Don't over-optimize!

---

## Manual Override Commands

You can still use manual commands to override Focus Mode:

```bash
# Force disable (even if Focus Mode says enabled)
claude-notify-off

# Force enable (even if Focus Mode says disabled)
claude-notify-on

# Check status
claude-notify-status
```

These work alongside the Focus Mode detection.

---

## Summary

**What you created:**
- 1 Shortcut named "Get Current Focus" (2 actions)
- 1 Focus Mode named "claude remote approve"

**How it works:**
- Hook runs: `shortcuts run "Get Current Focus"` (~100ms)
- If returns "claude remote approve" → Send notification
- If returns anything else → Show CLI prompt

**Benefits:**
- ✅ No file picker issues
- ✅ No automation "Ask Before Running" issues
- ✅ No Full Disk Access needed
- ✅ Direct, real-time Focus Mode detection
- ✅ Super simple setup

**The entire integration is 4 lines of bash:**
```bash
FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\n')
if [[ "$FOCUS_MODE" != "claude remote approve" ]]; then
    exit 1
fi
```

---

## Related Documentation

- [Complete Setup Guide](../SETUP-PROMPT.md) - Full installation
- [Focus Mode Quick Setup](./FOCUS-MODE-QUICK-SETUP.md) - Visual step-by-step
- [macOS Notification Setup](./MACOS-NOTIFICATION-SETUP.md) - Alternative notification method

---

## Support

- **GitHub Issues**: https://github.com/SerjoschDuering/claude-code-notifier/issues
- **Test command**: `shortcuts run "Get Current Focus"`
- **List all shortcuts**: `shortcuts list`
