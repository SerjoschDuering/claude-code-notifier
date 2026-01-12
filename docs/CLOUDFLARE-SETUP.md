# Cloudflare Setup Guide (For Dummies)

This guide walks you through setting up Cloudflare from scratch to deploy the Claude Code Notifier.

## Table of Contents

1. [What is Cloudflare?](#what-is-cloudflare)
2. [Create a Cloudflare Account](#step-1-create-a-cloudflare-account)
3. [Install Wrangler CLI](#step-2-install-wrangler-cli)
4. [Login to Cloudflare from Terminal](#step-3-login-to-cloudflare-from-terminal)
5. [Generate VAPID Keys](#step-4-generate-vapid-keys)
6. [Deploy the Worker](#step-5-deploy-the-worker)
7. [Deploy the PWA](#step-6-deploy-the-pwa)
8. [Test Everything](#step-7-test-everything)

---

## What is Cloudflare?

Cloudflare offers several services we'll use:

| Service | What it does | Cost |
|---------|--------------|------|
| **Workers** | Runs your backend code (API) at the edge | Free tier: 100k requests/day |
| **Durable Objects** | Stores data with strong consistency | Free tier: 1M requests/month |
| **Pages** | Hosts static websites (our PWA) | Free tier: Unlimited |

**You don't need a credit card for the free tier.**

---

## Step 1: Create a Cloudflare Account

### 1.1 Go to Cloudflare

Open your browser and go to:
```
https://dash.cloudflare.com/sign-up
```

### 1.2 Sign Up

1. Enter your email address
2. Create a password
3. Click **"Create Account"**

### 1.3 Verify Email

1. Check your email inbox
2. Click the verification link from Cloudflare
3. You're now logged in!

### 1.4 Skip Domain Setup (Optional)

Cloudflare will ask if you want to add a domain. You can:
- **Skip this** - We'll use free `*.workers.dev` and `*.pages.dev` subdomains
- Or add your own domain later

Click **"Skip"** or the small link that says "maybe later"

---

## Step 2: Install Wrangler CLI

Wrangler is Cloudflare's command-line tool for deploying Workers and Pages.

### 2.1 Open Terminal

On macOS, press `Cmd + Space`, type "Terminal", and press Enter.

### 2.2 Check Node.js Version

```bash
node --version
```

You should see `v18.x.x` or higher. If not, install Node.js from https://nodejs.org

### 2.3 Install Wrangler Globally

```bash
npm install -g wrangler
```

### 2.4 Verify Installation

```bash
wrangler --version
```

You should see something like `3.99.0` or similar.

---

## Step 3: Login to Cloudflare from Terminal

### 3.1 Run Login Command

```bash
wrangler login
```

### 3.2 Browser Opens Automatically

1. A browser window will open
2. You'll see "Allow Wrangler to access your Cloudflare account?"
3. Click **"Allow"**

### 3.3 Confirmation

Back in Terminal, you should see:
```
Successfully logged in.
```

### 3.4 Verify Login

```bash
wrangler whoami
```

This shows your account email and account ID.

---

## Step 4: Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for Web Push notifications.

### 4.1 What are VAPID Keys?

- **Public Key**: Shared with browsers to identify your server
- **Private Key**: Secret, used to sign push messages (never share this!)
- **Subject**: Your email or website URL for identification

### 4.2 Generate the Keys

Run this command from anywhere:

```bash
npx web-push generate-vapid-keys
```

### 4.3 Save the Output

You'll see something like:

```
=======================================

Public Key:
BNbxGYNMhEIi5k...rest-of-public-key...

Private Key:
T2x9X7CZ_kE9fF...rest-of-private-key...

=======================================
```

**IMPORTANT: Copy both keys and save them somewhere safe!**

I recommend creating a file (NOT in your git repo):

```bash
# Create a secrets file in your home directory
cat > ~/.claude-notifier-secrets << 'EOF'
VAPID_PUBLIC_KEY=BNbxGYNMhEIi5k...your-actual-public-key...
VAPID_PRIVATE_KEY=T2x9X7CZ_kE9fF...your-actual-private-key...
VAPID_SUBJECT=mailto:your-email@example.com
EOF
```

---

## Step 5: Deploy the Worker

### 5.1 Navigate to Worker Directory

```bash
cd /Users/Joo/01_Projects/ClaudeCodeNotifyer/packages/worker
```

### 5.2 Install Dependencies

```bash
pnpm install
```

If you don't have pnpm:
```bash
npm install -g pnpm
pnpm install
```

### 5.3 Set Your Secrets

These are stored securely in Cloudflare, not in your code.

**Set VAPID Public Key:**
```bash
wrangler secret put VAPID_PUBLIC_KEY
```
When prompted, paste your public key and press Enter.

**Set VAPID Private Key:**
```bash
wrangler secret put VAPID_PRIVATE_KEY
```
When prompted, paste your private key and press Enter.

**Set VAPID Subject:**
```bash
wrangler secret put VAPID_SUBJECT
```
When prompted, type `mailto:your-email@example.com` and press Enter.

### 5.4 Deploy the Worker

```bash
wrangler deploy
```

### 5.5 Note Your Worker URL

After deployment, you'll see:
```
Published claude-code-notifier (X.XX sec)
  https://claude-code-notifier.YOUR-SUBDOMAIN.workers.dev
```

**Save this URL!** You'll need it for the CLI and PWA.

### 5.6 Verify Deployment

Open your browser and go to:
```
https://claude-code-notifier.YOUR-SUBDOMAIN.workers.dev/health
```

You should see:
```json
{"status":"ok"}
```

---

## Step 6: Deploy the PWA

### 6.1 Navigate to PWA Directory

```bash
cd /Users/Joo/01_Projects/ClaudeCodeNotifyer/packages/pwa
```

### 6.2 Install Dependencies

```bash
pnpm install
```

### 6.3 Update API URL (Important!)

Edit the file `packages/pwa/src/api.ts` and update the API_BASE if needed.

Since we're using Cloudflare Pages with a separate Worker, you need to set the full URL.

Create a `.env` file:
```bash
echo "VITE_API_URL=https://claude-code-notifier.YOUR-SUBDOMAIN.workers.dev/api" > .env
```

Replace `YOUR-SUBDOMAIN` with your actual Cloudflare subdomain.

### 6.4 Build the PWA

```bash
pnpm build
```

This creates a `dist/` folder with the compiled PWA.

### 6.5 Deploy to Cloudflare Pages

**First time deployment:**
```bash
wrangler pages deploy dist --project-name=claude-approver
```

You'll be asked:
```
? No project found. Would you like to create one? (Y/n)
```
Type `Y` and press Enter.

### 6.6 Note Your PWA URL

After deployment, you'll see:
```
✨ Deployment complete! Take a peek over at https://claude-approver.pages.dev
```

**This is your PWA URL!** Open it on your iPhone.

---

## Step 7: Test Everything

### 7.1 Test the Worker API

```bash
# Health check
curl https://claude-code-notifier.YOUR-SUBDOMAIN.workers.dev/health

# Get VAPID public key
curl https://claude-code-notifier.YOUR-SUBDOMAIN.workers.dev/api/vapid-public-key
```

### 7.2 Test the PWA

1. Open Safari on your iPhone
2. Go to `https://claude-approver.pages.dev` (your Pages URL)
3. You should see the "Claude Code Approver" page

### 7.3 Add PWA to Home Screen (Required for Push!)

**This is critical! Web Push only works for Home Screen apps on iOS.**

1. In Safari, tap the **Share** button (square with arrow)
2. Scroll down and tap **"Add to Home Screen"**
3. Tap **"Add"**
4. Find the app on your Home Screen and open it from there

---

## Quick Reference: Your URLs

After setup, you'll have these URLs:

| Service | URL |
|---------|-----|
| Worker API | `https://claude-code-notifier.YOUR-SUBDOMAIN.workers.dev` |
| PWA | `https://claude-approver.pages.dev` |
| Health Check | `https://claude-code-notifier.YOUR-SUBDOMAIN.workers.dev/health` |

---

## Troubleshooting

### "Error: You must be logged in"

Run `wrangler login` again.

### "Error: Could not find wrangler.toml"

Make sure you're in the right directory:
```bash
cd /Users/Joo/01_Projects/ClaudeCodeNotifyer/packages/worker
```

### "Error: Missing required secret"

Set all three secrets:
```bash
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT
```

### Push notifications not working

1. Make sure the PWA is opened from **Home Screen**, not Safari
2. Check iOS version is 16.4 or higher (Settings → General → About)
3. Enable notifications when prompted in the app

### "Durable Objects not available"

Make sure you're on Cloudflare Workers **Paid** plan ($5/month) OR using the free tier which includes Durable Objects.

Actually, Durable Objects are now included in the free tier! Just make sure your account is verified.

---

## Cloudflare Dashboard Reference

### Where to Find Things

**Dashboard Home:**
```
https://dash.cloudflare.com
```

**Your Workers:**
```
https://dash.cloudflare.com → Workers & Pages → Overview
```

**Worker Logs (for debugging):**
```
Workers & Pages → Your Worker → Logs
```

**Worker Settings:**
```
Workers & Pages → Your Worker → Settings → Variables
```

**Pages Projects:**
```
Workers & Pages → Pages tab
```

---

## Next Steps

Once Cloudflare is set up:

1. Continue with [Main Setup Guide](../SETUP-PROMPT.md)
2. [Set up Focus Mode automation](./FOCUS-MODE-QUICK-SETUP.md)
3. [Learn about macOS notifications](./MACOS-NOTIFICATION-SETUP.md)
