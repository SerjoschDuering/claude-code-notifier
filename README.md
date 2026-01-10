# Claude Code Notifier

**Approve Claude Code permission requests from your iPhone via push notifications.**

When Claude Code wants to run a command, write a file, or perform other actions, you get a push notification on your phone. Tap to review, approve or deny - all without leaving your couch.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│ Cloudflare Worker│────▶│   iPhone PWA    │
│  (with hook)    │◀────│   (API + DO)     │◀────│  (Web Push)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

1. Claude Code hook intercepts permission requests
2. Sends request to your Cloudflare Worker
3. Worker pushes notification to your iPhone
4. You approve/deny in the PWA
5. Claude Code continues or stops

## Features

- 🔔 **Push notifications** to iPhone (iOS 16.4+)
- 🔐 **Secure** - HMAC-SHA256 signed requests, nonce replay protection
- ⚡ **Fast** - Edge-deployed on Cloudflare Workers
- 🆓 **Free** - Runs entirely on Cloudflare free tier
- 📱 **PWA** - No app store, just add to Home Screen

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Cloudflare account (free)
- iPhone with iOS 16.4+

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/claude-code-notifier.git
cd claude-code-notifier
pnpm install
```

### 2. Setup Cloudflare

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Generate VAPID keys for push notifications
npm install -g web-push
web-push generate-vapid-keys
```

Save the output - you'll need both keys.

### 3. Deploy Worker

```bash
cd packages/worker

# Set secrets (paste when prompted)
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT  # e.g., mailto:you@example.com

# Deploy
wrangler deploy
```

Note your Worker URL: `https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev`

### 4. Deploy PWA

```bash
cd packages/pwa

# Set your Worker URL
echo "VITE_API_URL=https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev/api" > .env

# Build and deploy
pnpm build
cp public/* dist/
wrangler pages project create claude-approver --production-branch main
wrangler pages deploy dist --project-name=claude-approver
```

Your PWA: `https://claude-approver.pages.dev`

### 5. Pair Your iPhone

```bash
cd packages/cli
pnpm start init --server https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev
```

Or set the environment variable:
```bash
export CLAUDE_NOTIFIER_SERVER=https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev
pnpm start init
```

Then on your iPhone:
1. Open your PWA URL in Safari
2. Tap Share → "Add to Home Screen"
3. Open from Home Screen (required for push!)
4. Tap "Pair Device"
5. Enter the pairing credentials or scan QR
6. Allow notifications

### 6. Install Claude Code Hook

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/claude-code-notifier/hook/approve-hook.sh"
          }
        ]
      }
    ]
  }
}
```

Make the hook executable:
```bash
chmod +x /path/to/claude-code-notifier/hook/approve-hook.sh
```

**Note:** The hook script requires `jq` for JSON parsing:
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt install jq
```

## Hook Configuration

The hook intercepts Claude Code tool calls and sends them for approval.

### Available Matchers

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",           // Shell commands
        "hooks": [{ "type": "command", "command": "..." }]
      },
      {
        "matcher": "Write",          // File writes
        "hooks": [{ "type": "command", "command": "..." }]
      },
      {
        "matcher": "Edit",           // File edits
        "hooks": [{ "type": "command", "command": "..." }]
      },
      {
        "matcher": "Bash|Write|Edit", // Multiple tools
        "hooks": [{ "type": "command", "command": "..." }]
      }
    ]
  }
}
```

### Hook Script

The `hook/approve-hook.sh` script:
1. Reads tool input from stdin (JSON)
2. Sends approval request to your Worker
3. Polls for your decision
4. Returns `{"decision": "approve"}` or `{"decision": "deny"}`

## Project Structure

```
claude-code-notifier/
├── packages/
│   ├── shared/      # Shared TypeScript types
│   ├── worker/      # Cloudflare Worker (API)
│   ├── pwa/         # Progressive Web App
│   └── cli/         # CLI tool for pairing
├── hook/            # Claude Code hook scripts
└── docs/            # Documentation
```

## Security

- **HMAC-SHA256**: All requests signed with pairing secret
- **Nonce replay protection**: Each nonce valid once (10 min)
- **Timestamp validation**: ±60 second drift allowed
- **Rate limiting**: 30 requests per 10 minutes
- **Request TTL**: Pending requests expire in 60 seconds
- **Max pending**: 2,000 concurrent requests per pairing

## Development

```bash
# Run worker locally
cd packages/worker && pnpm dev

# Run PWA dev server
cd packages/pwa && pnpm dev

# Test CLI
cd packages/cli && pnpm start status
```

## Troubleshooting

### Push notifications not working

- iPhone must be iOS 16.4+
- PWA must be opened from Home Screen (not Safari)
- Notification permission must be granted

### Hook not triggering

- Check `~/.claude/settings.json` syntax
- Ensure hook script is executable
- Test manually: `pnpm start -- request --tool Bash --command "test"`

### "Device not paired" error

- Run `pnpm start init` to generate new pairing
- Re-pair on iPhone

## Contributing

PRs welcome! Please:
1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

## License

MIT - see [LICENSE](LICENSE)

## Acknowledgments

- [Cloudflare Workers](https://workers.cloudflare.com/) for serverless edge compute
- [Web Push](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) for notifications
- [Claude Code](https://claude.ai/) for the AI coding assistant
