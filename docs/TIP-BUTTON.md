# Optional Tip Button Configuration

The PWA includes an optional "tip" button feature that allows users to support the project via Stripe payment links. **This feature is completely optional** and the app works perfectly without it.

## How It Works

- If Stripe payment links are configured via environment variables, a subtle floating tip button appears in the bottom-right corner
- If no Stripe links are configured, the tip button is automatically hidden
- The repository can be public without exposing your personal payment links

## Setup (For Maintainers)

### 1. Create Stripe Payment Links

1. Go to https://dashboard.stripe.com/payment-links
2. Create two payment links:
   - **Small tip** (e.g., $2-5 fixed amount)
   - **Custom amount** (user-defined amount)

### 2. Configure Environment Variables

Create or update `packages/pwa/.env`:

```bash
cd packages/pwa

# Required: API endpoint
VITE_API_URL=https://your-worker.workers.dev/api

# Optional: Stripe payment links (omit to hide tip button)
VITE_STRIPE_LINK_SMALL=https://buy.stripe.com/YOUR_SMALL_LINK
VITE_STRIPE_LINK_CUSTOM=https://buy.stripe.com/YOUR_CUSTOM_LINK
```

### 3. Build and Deploy

```bash
pnpm build
wrangler pages deploy dist --project-name=claude-approver
```

## For Forkers

If you fork this repository:

1. The `.env` file is gitignored, so your Stripe links won't be exposed
2. Copy `.env.example` to `.env` and configure your own links (optional)
3. If you don't set up Stripe links, the tip button simply won't appear
4. The core functionality of the app works perfectly either way

## Code Implementation

The tip button is controlled in `packages/pwa/src/main.ts`:

```typescript
function setupTipPopover() {
  const stripeLinks = {
    small: import.meta.env.VITE_STRIPE_LINK_SMALL || '',
    custom: import.meta.env.VITE_STRIPE_LINK_CUSTOM || ''
  };

  // If no Stripe links configured, hide tip button
  if (!stripeLinks.small && !stripeLinks.custom) {
    const floatingActions = document.querySelector('.floating-actions');
    if (floatingActions) {
      (floatingActions as HTMLElement).style.display = 'none';
    }
    return;
  }
  // ... rest of tip button logic
}
```

## User Experience

When configured, users see:
- A subtle "Like it? ☕" floating button in the bottom-right
- Clicking opens a small popover with two payment options
- Completely non-intrusive and doesn't interfere with the main functionality
- Works on mobile and desktop

## Security

- Stripe links are embedded at build time (not runtime)
- No sensitive API keys are exposed (payment links are public URLs)
- Users are redirected to Stripe's secure checkout
- The repository can remain fully open source
