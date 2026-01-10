# Claude Code Approver - Self-Install Prompt

Copy and paste this entire prompt into Claude Code, and it will set everything up for you!

---

## 📋 Copy This Prompt:

```
I want to install Claude Code Approver so I can approve your actions from my iPhone via push notifications.

Please help me set this up by following these steps:

1. **Generate Pairing Credentials**
   - Run: npx claude-code-approver@latest init --server https://claude-code-notifier.tralala798.workers.dev
   - This will display a QR code and pairing credentials
   - Tell me to keep this terminal open and proceed to step 2

2. **Create Hook Script**
   - Create file at: ~/.claude-approve-hook.sh
   - The hook script should:
     * Read JSON from stdin containing tool_name and tool_input
     * Read config from ~/.claude-approve/config.json (created by step 1)
     * Send approval request to the server with the pairing credentials
     * Poll for decision (approve/deny) for up to 60 seconds
     * Output JSON: {"decision": "approve"} or {"decision": "deny"}
     * Use bash and standard tools (curl, jq)
     * Fail open (approve) if any errors occur
   - Make it executable: chmod +x ~/.claude-approve-hook.sh

3. **Configure Claude Code Settings**
   - Update or create ~/.claude/settings.json
   - Add this hook configuration:
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
   - If settings.json already exists, merge the hooks section carefully

4. **Show iPhone Setup Instructions**
   - Display clear instructions for:
     * Opening https://claude-approver.pages.dev in Safari on iPhone
     * Adding to Home Screen (Share → Add to Home Screen)
     * Opening the app FROM Home Screen (critical for notifications)
     * Tapping "Pair Device" and scanning the QR code from step 1
     * Enabling push notifications when prompted

5. **Test the Setup**
   - After I confirm the iPhone is paired, ask if I want you to test it
   - Try running a simple command like "ls" that will trigger an approval request
   - I should see it on my iPhone

Please proceed step by step, showing me what you're doing and waiting for my confirmation before moving to the next step.

Server URL: https://claude-code-notifier.tralala798.workers.dev
PWA URL: https://claude-approver.pages.dev
```

---

## What This Does

When you paste this into Claude Code, it will:

✅ **Run the pairing command** - Generates your unique QR code  
✅ **Write the hook script** - Creates `~/.claude-approve-hook.sh` with proper logic  
✅ **Update settings** - Modifies `~/.claude/settings.json` safely  
✅ **Guide you through iPhone setup** - Step-by-step instructions  
✅ **Test everything** - Verifies it's working  

## Why This Is Better

- ❌ No repository cloning
- ❌ No script downloads
- ❌ No trusting random bash scripts from the internet
- ✅ Claude writes the code locally
- ✅ You can see exactly what it's doing
- ✅ Claude explains each step
- ✅ You stay in control

## Expected Flow

1. **You**: *paste prompt*
2. **Claude**: "I'll help you set this up. First, let me generate pairing credentials..."
3. **Claude**: *runs npx command, shows QR code*
4. **Claude**: "Great! Now I'll create the hook script..."
5. **Claude**: *creates ~/.claude-approve-hook.sh*
6. **Claude**: "Next, I'll configure your settings..."
7. **Claude**: *updates ~/.claude/settings.json*
8. **Claude**: "Setup complete! Now please follow these steps on your iPhone..."
9. **You**: *pairs iPhone*
10. **You**: "Done pairing"
11. **Claude**: "Perfect! Let me test it by listing files in this directory. You should see an approval request on your iPhone..."

## Alternative: Minimal Prompt

If you just want the essentials:

```
Install Claude Code Approver for remote approvals via iPhone:

1. Run: npx claude-code-approver@latest init --server https://claude-code-notifier.tralala798.workers.dev
2. Create ~/.claude-approve-hook.sh (bash script to handle approval requests)
3. Update ~/.claude/settings.json with PreToolUse hook for Bash|Write|Edit
4. Guide me through pairing my iPhone with the PWA

Server: https://claude-code-notifier.tralala798.workers.dev
PWA: https://claude-approver.pages.dev
```

## Customization

Want different behavior? Modify the prompt:

**Only approve bash commands:**
```
"matcher": "Bash"
```

**Approve everything:**
```
"matcher": "*"
```

**Different timeout:**
```
"hooks": [{
  "type": "command",
  "command": "$HOME/.claude-approve-hook.sh",
  "timeout": 120
}]
```

## Notes

- The hook script needs `jq` installed: `brew install jq` (macOS) or `apt install jq` (Linux)
- Claude Code will tell you if `jq` is missing and help you install it
- Pairing credentials are saved to `~/.claude-approve/config.json`
- If setup fails, Claude can help troubleshoot

## What Gets Created

```
~/.claude-approve/
  └── config.json                    # Your pairing credentials

~/.claude-approve-hook.sh            # Hook script (~50 lines)

~/.claude/settings.json              # Updated with hook config
```

Clean, minimal, transparent!
