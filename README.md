# Claude Code Notifier

**Approve Claude Code permission requests from your iPhone via push notifications.**

![Claude Code remote approval](assets/cc-approval-b.jpg)

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
- Cloudflare account (free tier works)
- iPhone with iOS 16.4+ (must add the PWA to Home Screen for push)

## Step-by-Step Install

### 1. Clone & Install

```bash
git clone https://github.com/SerjoschDuering/claude-code-notifier.git
cd claude-code-notifier
pnpm install
```

> Tip: keep the folder somewhere permanent (for example `~/ClaudeCodeNotifyer`) so the CLI + hook can always find it.

### 2. Deploy the Worker (Cloudflare)

```bash
npm install -g wrangler web-push
wrangler login

# Generate VAPID keys once and store them somewhere safe
web-push generate-vapid-keys

cd packages/worker
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT   # e.g. mailto:you@example.com
wrangler deploy
```

The deploy step prints your Worker URL (for example `https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev`). You will reuse it everywhere.

### 3. Deploy the PWA (Cloudflare Pages)

```bash
cd packages/pwa
echo "VITE_API_URL=https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev/api" > .env
pnpm build
wrangler pages deploy dist --project-name=claude-approver
```

Visit the Pages URL in Safari and "Add to Home Screen".

#### Optional: Enable Tip Button

If you want to add a support tip button (completely optional):

1. Create Stripe Payment Links at https://dashboard.stripe.com/payment-links
2. Add them to your `.env` file:

```bash
cd packages/pwa
cat >> .env << 'EOF'
VITE_STRIPE_LINK_SMALL=https://buy.stripe.com/YOUR_SMALL_LINK
VITE_STRIPE_LINK_CUSTOM=https://buy.stripe.com/YOUR_CUSTOM_LINK
EOF
```

3. Rebuild and redeploy:

```bash
pnpm build
wrangler pages deploy dist --project-name=claude-approver
```

If these variables are not set, the tip button will be automatically hidden.

### 4. Pair Your Phone

```bash
cd packages/cli
pnpm start init --server https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev
```

Point the iPhone camera at the QR code (or type the pairing ID + secret), then tap **Enable notifications**.

### 5. Install the Claude Code Hook

1. Install `jq` (`brew install jq` on macOS, `sudo apt install jq` on Linux).
2. Make the hook executable: `chmod +x /path/to/claude-code-notifier/hook/approve-hook.sh`
3. Add it to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
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

#### Copy/Paste installer for Claude Code

Set your Worker URL and paste this block into Claude Code’s terminal to let it do the rest:

```bash
WORKER_URL="https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev"
APP_DIR="$HOME/ClaudeCodeNotifyer"

set -euo pipefail

if [ ! -d "$APP_DIR" ]; then
  git clone https://github.com/SerjoschDuering/claude-code-notifier.git "$APP_DIR"
fi

cd "$APP_DIR"
pnpm install
pnpm --filter cli start init --server "$WORKER_URL"
chmod +x hook/approve-hook.sh

cat <<JSON > ~/.claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash $APP_DIR/hook/approve-hook.sh"
          }
        ]
      }
    ]
  }
}
JSON

echo "All set! Claude Code will request approvals via $WORKER_URL"
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
