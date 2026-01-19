# Claude Code Notifier

**Approve Claude Code permission requests from your iPhone via push notifications.**

![Claude Code remote approval](assets/cc-approval-b.jpg)

When Claude Code wants to run a command, write a file, or perform other actions, you get a push notification on your phone. Tap to review, approve or deny - all without leaving your couch.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 🚀 Try It Now

**Live PWA:** [https://claude-approver.pages.dev](https://claude-approver.pages.dev)

Open on your iPhone, add to Home Screen, and follow the pairing wizard.

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
- 🎛️ **Focus Mode routing** - Automatic switching between iPhone and macOS dialogs
- ⏱️ **Session approvals** - Approve once, all session, or per-tool

## Quick Start

### Prerequisites

- Cloudflare account (free tier works)
- iPhone with iOS 16.4+ (must add the PWA to Home Screen for push)
- macOS with `jq`, `curl`, `openssl`, and `xxd` installed

### 1. Deploy the Backend

```bash
git clone https://github.com/SerjoschDuering/claude-code-notifier.git
cd claude-code-notifier
pnpm install

# Deploy Worker
npm install -g wrangler web-push
wrangler login
web-push generate-vapid-keys  # Save these keys!

cd packages/worker
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT   # e.g. mailto:you@example.com
wrangler deploy
```

Note your Worker URL: `https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev`

### 2. Deploy the PWA

```bash
cd packages/pwa
echo "VITE_API_URL=https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev/api" > .env
pnpm build
wrangler pages deploy dist --project-name=claude-approver
```

### 3. Pair Your iPhone

1. Open your PWA URL in Safari on iPhone
2. Tap Share → "Add to Home Screen"
3. Open the app FROM Home Screen (not Safari!)
4. Complete the pairing wizard
5. Allow push notifications when prompted

### 4. Install the Hook

After pairing, the PWA shows a **Setup Prompt**. Copy it and paste into Claude Code. The AI will:

- Create `~/.claude-approve-hook.sh` with embedded credentials
- Configure `~/.claude/settings.json` with the hook
- Set up the Focus Mode shortcut

The hook uses pure bash (curl + openssl) with HMAC-SHA256 header-based authentication - no npm dependencies.

## Focus Mode Routing

The hook automatically detects your Focus Mode and routes accordingly:

| Focus Mode | Behavior |
|------------|----------|
| `claude remote approve` | Send push notification to iPhone 📱 |
| `claude notification approval` | Show macOS native dialog 💻 |
| Any other / none | Fall back to CLI prompt |

### Setup Focus Mode

1. **Install the Shortcut:** [Get Current Focus](https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad)

2. **Create Focus Mode:**
   - System Settings → Focus → "+"
   - Name: **"claude remote approve"** (exact match required)

3. **Test:**
   ```bash
   shortcuts run "Get Current Focus"
   # Should print: claude remote approve (when Focus is ON)
   ```

## Project Structure

```
claude-code-notifier/
├── packages/
│   ├── shared/      # Shared TypeScript types
│   ├── worker/      # Cloudflare Worker (API + header auth)
│   └── pwa/         # Progressive Web App (generates setup scripts)
├── hook/            # Claude Code hook scripts (pure bash)
└── docs/            # Documentation
```

## Security

- **HMAC-SHA256**: All requests signed with pairing secret
- **Nonce replay protection**: Each nonce valid once (10 min)
- **Timestamp validation**: ±60 second drift allowed
- **Rate limiting**: 30 requests per 10 minutes
- **Request TTL**: Pending requests expire in 60 seconds

## Development

```bash
# Run worker locally
cd packages/worker && pnpm dev

# Run PWA dev server
cd packages/pwa && pnpm dev
```

## Troubleshooting

### Push notifications not working

- iPhone must be iOS 16.4+
- PWA must be opened from Home Screen (not Safari)
- Notification permission must be granted

### Hook not triggering

- Check `~/.claude/settings.json` syntax
- Ensure hook script is executable: `chmod +x ~/.claude-approve-hook.sh`
- Check dependencies: `which jq curl openssl xxd`
- Try restarting Claude Code

### "Device not paired" error

- Re-pair on iPhone using the PWA
- Regenerate the setup script after pairing

## Contributing

PRs welcome! Please fork, create a feature branch, and submit a PR.

## License

MIT - see [LICENSE](LICENSE)

## Disclaimer

"Claude" and "Claude Code" are trademarks of Anthropic PBC. This project is an unofficial third-party tool that extends Claude Code functionality with remote approval notifications. It is not affiliated with, endorsed by, or maintained by Anthropic.
