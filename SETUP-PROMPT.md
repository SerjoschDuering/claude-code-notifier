# Claude Code Approver - Setup Guide

**Setup is now automated via the PWA.** After pairing your iPhone, the PWA generates a complete setup script with embedded credentials.

## Quick Setup

1. **Deploy the backend** (see README.md)
2. **Pair your iPhone**
   - Open PWA in Safari on iPhone
   - Add to Home Screen
   - Open from Home Screen
   - Tap "Pair Device" and scan QR code
3. **Copy the setup script**
   - After pairing, click "Setup" in the PWA
   - Copy the generated bash script
   - Run it in your terminal
4. **Set up Focus Mode**
   - Install the Shortcut: https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad
   - Create Focus Mode named "claude remote approve"

## What Gets Installed

```
~/.claude-approve-hook.sh         # Pure bash hook (embedded credentials)
~/.claude/settings.json           # Claude Code hook configuration
```

## How It Works

```
Claude Code → Hook (bash) → Worker API (v2) → Push Notification → iPhone
```

- **Pure bash**: Uses `curl` + `openssl` for signing (no npm dependencies)
- **Header auth**: HMAC-SHA256 signature in HTTP headers
- **Focus Mode**: Automatically routes to iPhone when Focus Mode is active
- **Session caching**: Approve once for entire session

## Technical Details

The hook uses header-based authentication (v2 API):

- `POST /api/v2/request` - Create approval request
- `GET /api/v2/decision/:id` - Poll for decision

Auth headers:
- `X-Pairing-ID`: Device identifier
- `X-Timestamp`: Unix timestamp
- `X-Nonce`: Random base64 string
- `Authorization: HMAC-SHA256 <signature>`

Canonical string format:
```
METHOD\nPATH\nBODY_HASH\nTIMESTAMP\nNONCE
```

## Requirements

- macOS with `jq`, `curl`, `openssl`, `xxd`
- iPhone with iOS 16.4+
- "Get Current Focus" Shortcut installed

## Troubleshooting

### Hook not working
```bash
# Check dependencies
which jq curl openssl xxd

# Make executable
chmod +x ~/.claude-approve-hook.sh

# Test manually
echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | ~/.claude-approve-hook.sh
```

### Focus Mode not detecting
```bash
# Test shortcut
shortcuts run "Get Current Focus"
# Should print: claude remote approve
```

### Re-pairing
1. Delete `~/.claude-approve-hook.sh`
2. Unpair in PWA (Settings > Unpair)
3. Re-pair and regenerate setup script
