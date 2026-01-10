// Main page logic
import { getPairingData, clearPairingData } from './storage';
import { API_BASE, getVapidPublicKey, registerPushSubscription, getPendingRequests, submitDecision } from './api';

async function init() {
  setupInstallGuide();
  setupTipPopover();

  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registered:', registration.scope);
    } catch (error) {
      console.error('SW registration failed:', error);
    }
  }

  // Check pairing status
  const pairingData = await getPairingData();
  const notPairedSection = document.getElementById('not-paired')!;
  const pairedView = document.getElementById('paired-view')!;
  const statusDot = document.getElementById('status-dot')!;
  const statusText = document.getElementById('status-text')!;
  const pushSection = document.getElementById('push-permission')!;
  const pairingIdDisplay = document.getElementById('pairing-id-display')!;

  if (!pairingData) {
    // Not paired - show onboarding
    notPairedSection.classList.remove('hidden');
    
    // Setup install guide button
    const installGuideBtn = document.getElementById('install-guide-btn');
    const installModal = document.getElementById('install-modal');
    const closeInstall = document.getElementById('close-install');
    const installBackdrop = installModal?.querySelector('.modal-backdrop');
    
    installGuideBtn?.addEventListener('click', () => installModal?.classList.remove('hidden'));
    closeInstall?.addEventListener('click', () => installModal?.classList.add('hidden'));
    installBackdrop?.addEventListener('click', () => installModal?.classList.add('hidden'));
    
    return;
  }

  // Paired - show paired view and settings button
  const settingsBtn = document.getElementById('settings-btn')!;
  const settingsModal = document.getElementById('settings-modal')!;
  const closeSettings = document.getElementById('close-settings')!;
  const modalBackdrop = settingsModal.querySelector('.modal-backdrop')!;
  const infoBtn = document.getElementById('info-btn');
  const infoBtnSecondary = document.getElementById('info-btn-secondary');
  const infoModal = document.getElementById('info-modal');
  const closeInfo = document.getElementById('close-info');
  const infoBackdrop = infoModal?.querySelector('.modal-backdrop');

  statusDot.classList.add('connected');
  statusText.textContent = 'Connected';
  pairedView.classList.remove('hidden');
  settingsBtn.classList.remove('hidden');
  pairingIdDisplay.textContent = pairingData.pairingId.slice(0, 8) + '...';

  // Settings modal handlers
  settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
  modalBackdrop.addEventListener('click', () => settingsModal.classList.add('hidden'));

  const openInfoModal = () => infoModal?.classList.remove('hidden');
  infoBtn?.addEventListener('click', openInfoModal);
  infoBtnSecondary?.addEventListener('click', openInfoModal);
  closeInfo?.addEventListener('click', () => infoModal?.classList.add('hidden'));
  infoBackdrop?.addEventListener('click', () => infoModal?.classList.add('hidden'));

  // Check push permission
  if ('Notification' in window && Notification.permission !== 'granted') {
    pushSection.classList.remove('hidden');

    const enablePushBtn = document.getElementById('enable-push')!;
    enablePushBtn.addEventListener('click', async () => {
      await enablePushNotifications(pairingData);
    });
  }

  // Test notification button
  const testBtn = document.getElementById('test-notification')!;
  testBtn.addEventListener('click', async () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Test Notification', {
        body: 'Push notifications are working!',
        icon: '/icon-192.png',
      });
    } else {
      alert('Please enable notifications first');
    }
  });

  // Unpair button
  const unpairBtn = document.getElementById('unpair')!;
  unpairBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to unpair this device?')) {
      await clearPairingData();
      window.location.reload();
    }
  });

  // Show pending requests section and load requests
  const pendingSection = document.getElementById('pending-requests')!;
  pendingSection.classList.remove('hidden');

  // Load pending requests
  await loadPendingRequests(pairingData);

  // Refresh button
  const refreshBtn = document.getElementById('refresh-requests')!;
  refreshBtn.addEventListener('click', () => loadPendingRequests(pairingData));

  // Auto-refresh every 5 seconds
  setInterval(() => loadPendingRequests(pairingData), 5000);
}

function setupInstallGuide() {
  const workerUrl = deriveWorkerUrl();
  const pwaUrl = window.location.origin;
  const setupPrompt = buildSetupPrompt(workerUrl, pwaUrl);

  // Populate modal with setup prompt
  const setupPromptEl = document.getElementById('setup-prompt-modal');
  const setupPromptCopyBtn = document.getElementById('copy-setup-prompt');
  const togglePreviewBtn = document.getElementById('toggle-prompt-preview');
  const promptPreview = document.getElementById('prompt-preview');

  if (setupPromptEl) setupPromptEl.textContent = setupPrompt;
  if (setupPromptCopyBtn) setupCopyButton(setupPromptCopyBtn, setupPrompt);

  // Toggle prompt preview
  if (togglePreviewBtn && promptPreview) {
    togglePreviewBtn.addEventListener('click', () => {
      const isCollapsed = promptPreview.classList.toggle('collapsed');
      togglePreviewBtn.textContent = isCollapsed ? '👁️ Preview' : '✖️ Hide';
    });
  }
}

function setupCopyButton(button: HTMLElement, text: string) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied!';
      setTimeout(() => { button.textContent = 'Copy'; }, 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      button.textContent = 'Copy failed';
      setTimeout(() => { button.textContent = 'Copy'; }, 2000);
    }
  });
}

function deriveWorkerUrl(): string {
  try {
    const apiUrl = new URL(API_BASE, window.location.origin);
    if (apiUrl.pathname.endsWith('/api')) {
      apiUrl.pathname = apiUrl.pathname.replace(/\/api$/, '');
    }
    return apiUrl.href.replace(/\/$/, '');
  } catch {
    return API_BASE.replace(/\/api$/, '');
  }
}

function buildSetupPrompt(workerUrl: string, pwaUrl: string): string {
  const sanitizedWorkerUrl = workerUrl || 'https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev';
  const sanitizedPwaUrl = pwaUrl || 'https://claude-approver.pages.dev';
  
  return `I want to install Claude Code Approver so I can approve your actions from my iPhone via push notifications.

Please help me set this up by following these steps:

**STEP 1: Generate Pairing Credentials**
Run: npx claude-code-approver@latest init --server ${sanitizedWorkerUrl}

This will display a QR code. Tell me to keep this terminal open and proceed to step 2.

**STEP 2: Create Hook Script**
Create file ~/.claude-approve-hook.sh with this EXACT content:

#!/bin/bash
CONFIG="$HOME/.claude-approve/config.json"

# Fail open if not configured or jq missing
[ ! -f "$CONFIG" ] && echo '{"decision": "approve"}' && exit 0
command -v jq &> /dev/null || { echo '{"decision": "approve"}'; exit 0; }

# Read input from Claude Code
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')

# Read config
SERVER=$(jq -r '.serverUrl' "$CONFIG")
PAIRING_ID=$(jq -r '.pairingId' "$CONFIG")
PAIRING_SECRET=$(jq -r '.pairingSecret' "$CONFIG")

# Generate request ID
REQUEST_ID="req_$(date +%s)_$$"

# Build payload based on tool type
case "$TOOL" in
    Bash)
        CMD=$(echo "$TOOL_INPUT" | jq -r '.command // ""')
        PAYLOAD=$(jq -n --arg t "$TOOL" --arg c "$CMD" --arg cwd "$(pwd)" '{tool:$t,command:$c,cwd:$cwd}')
        ;;
    Write)
        FILE=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""')
        PAYLOAD=$(jq -n --arg t "$TOOL" --arg d "Write: $FILE" --arg cwd "$(pwd)" '{tool:$t,details:$d,cwd:$cwd}')
        ;;
    Edit)
        FILE=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""')
        PAYLOAD=$(jq -n --arg t "$TOOL" --arg d "Edit: $FILE" --arg cwd "$(pwd)" '{tool:$t,details:$d,cwd:$cwd}')
        ;;
    *)
        PAYLOAD=$(jq -n --arg t "$TOOL" --arg d "$TOOL_INPUT" --arg cwd "$(pwd)" '{tool:$t,details:$d,cwd:$cwd}')
        ;;
esac

# Generate HMAC signature
TS=$(date +%s)
NONCE=$(openssl rand -base64 16 2>/dev/null)
BODY=$(jq -n --arg pid "$PAIRING_ID" --arg rid "$REQUEST_ID" --argjson p "$PAYLOAD" --arg t "$TS" --arg n "$NONCE" '{pairingId:$pid,requestId:$rid,payload:$p,ts:($t|tonumber),nonce:$n,signature:""}')
BODY_HASH=$(echo -n "$BODY" | openssl dgst -sha256 -binary | base64)
CANONICAL=$(printf "POST\\n/api/request\\n%s\\n%s\\n%s" "$BODY_HASH" "$TS" "$NONCE")
SIGNATURE=$(echo -n "$CANONICAL" | openssl dgst -sha256 -hmac "$(echo -n "$PAIRING_SECRET" | base64 -d)" -binary | base64)
SIGNED=$(echo "$BODY" | jq --arg s "$SIGNATURE" '.signature=$s')

# Send request
curl -s -X POST -H "Content-Type: application/json" -d "$SIGNED" "$SERVER/api/request" >/dev/null

# Poll for decision (60 seconds)
for i in {1..60}; do
    sleep 1
    POLL_TS=$(date +%s)
    POLL_NONCE=$(openssl rand -base64 16 2>/dev/null)
    POLL_HASH=$(echo -n "" | openssl dgst -sha256 -binary | base64)
    POLL_CANONICAL=$(printf "GET\\n/api/decision/%s\\n%s\\n%s\\n%s" "$REQUEST_ID" "$POLL_HASH" "$POLL_TS" "$POLL_NONCE")
    POLL_SIG=$(echo -n "$POLL_CANONICAL" | openssl dgst -sha256 -hmac "$(echo -n "$PAIRING_SECRET" | base64 -d)" -binary | base64)
    RESULT=$(curl -s -G --data-urlencode "pairingId=$PAIRING_ID" --data-urlencode "ts=$POLL_TS" --data-urlencode "nonce=$POLL_NONCE" --data-urlencode "signature=$POLL_SIG" "$SERVER/api/decision/$REQUEST_ID")
    STATUS=$(echo "$RESULT" | jq -r '.data.status // "pending"')
    [ "$STATUS" = "allowed" ] && echo '{"decision":"approve"}' && exit 0
    [ "$STATUS" = "denied" ] && echo '{"decision":"deny"}' && exit 0
    [ "$STATUS" = "expired" ] && echo '{"decision":"deny"}' && exit 0
done
echo '{"decision":"deny"}' && exit 0

Then run: chmod +x ~/.claude-approve-hook.sh

**STEP 3: Configure Claude Code**
Update or create ~/.claude/settings.json with this (merge carefully if it exists):

{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [{"type": "command", "command": "$HOME/.claude-approve-hook.sh"}]
      }
    ]
  }
}

**STEP 4: Show iPhone Instructions**
Display these instructions:
1. Open ${sanitizedPwaUrl} in Safari on iPhone
2. Tap Share → "Add to Home Screen" → Add
3. Open app FROM Home Screen (not Safari!)
4. Tap "Pair Device" and scan QR code from Step 1
5. Enable notifications when prompted

**STEP 5: Test**
After I confirm pairing is done, test with: ls

Server URL: ${sanitizedWorkerUrl}
PWA URL: ${sanitizedPwaUrl}`;
}

async function loadPendingRequests(pairingData: { pairingId: string; pairingSecret: string }) {
  const requestsList = document.getElementById('requests-list')!;

  try {
    const result = await getPendingRequests(pairingData);

    if (!result.success || !result.data) {
      requestsList.innerHTML = '<p class="error">Failed to load requests</p>';
      return;
    }

    if (result.data.length === 0) {
      requestsList.innerHTML = '<p class="no-requests">No pending requests</p>';
      return;
    }

    requestsList.innerHTML = result.data.map(req => {
      const expiresAt = req.expiresAt || (req.createdAt + 60000);
      const remainingMs = expiresAt - Date.now();
      const isExpired = remainingMs <= 0;
      const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));

      if (isExpired) {
        return `
          <div class="request-card expired" data-request-id="${req.requestId}">
            <div class="request-meta">
              <span class="tool-badge expired-badge">EXPIRED</span>
              <span class="time-ago">${escapeHtml(req.payload.tool)}</span>
            </div>
            <div class="expired-message">This request has timed out</div>
            <button class="btn-dismiss" data-request-id="${req.requestId}">Dismiss</button>
          </div>
        `;
      }

      return `
        <div class="request-card" data-request-id="${req.requestId}" data-expires="${expiresAt}">
          <div class="request-meta">
            <span class="tool-badge">${escapeHtml(req.payload.tool)}</span>
            <span class="expires-countdown" data-expires="${expiresAt}">${remainingSecs}s</span>
          </div>
          ${req.payload.command ? `
            <div class="request-command">
              <label>Command</label>
              <pre>${escapeHtml(req.payload.command)}</pre>
            </div>
          ` : ''}
          ${req.payload.details ? `
            <div class="request-details">
              <label>Details</label>
              <p>${escapeHtml(req.payload.details)}</p>
            </div>
          ` : ''}
          <div class="request-buttons">
            <button class="btn-approve" data-request-id="${req.requestId}">
              <span class="btn-icon">✓</span>
              <span class="btn-text">Approve</span>
            </button>
            <button class="btn-deny" data-request-id="${req.requestId}">
              <span class="btn-icon">✕</span>
              <span class="btn-text">Deny</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners for buttons
    requestsList.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const requestId = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id');
        if (requestId) await handleDecision(pairingData, requestId, 'allow');
      });
    });

    requestsList.querySelectorAll('.btn-deny').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const requestId = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id');
        if (requestId) await handleDecision(pairingData, requestId, 'deny');
      });
    });

    // Dismiss expired requests
    requestsList.querySelectorAll('.btn-dismiss').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('.request-card');
        if (card) {
          card.classList.add('denying');
          setTimeout(() => card.remove(), 350);
        }
      });
    });

    // Start countdown timer
    startCountdownTimer();

  } catch (error) {
    console.error('Load requests error:', error);
    requestsList.innerHTML = '<p class="error">Error loading requests</p>';
  }
}

async function handleDecision(
  pairingData: { pairingId: string; pairingSecret: string },
  requestId: string,
  decision: 'allow' | 'deny'
) {
  const card = document.querySelector(`[data-request-id="${requestId}"]`) as HTMLElement;
  if (card) {
    card.querySelectorAll('button').forEach(btn => (btn as HTMLButtonElement).disabled = true);
  }

  try {
    const result = await submitDecision(pairingData, requestId, decision);
    if (result.success) {
      if (card) {
        // Add animation class based on decision
        card.classList.add(decision === 'allow' ? 'approving' : 'denying');
        // Remove after animation completes
        setTimeout(() => card.remove(), 350);
      }
    } else {
      alert('Failed: ' + result.error);
      if (card) {
        card.querySelectorAll('button').forEach(btn => (btn as HTMLButtonElement).disabled = false);
      }
    }
  } catch (error) {
    alert('Error: ' + error);
    if (card) {
      card.querySelectorAll('button').forEach(btn => (btn as HTMLButtonElement).disabled = false);
    }
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 120) return '1 min ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  return 'A while ago';
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let countdownInterval: number | null = null;

function startCountdownTimer() {
  // Clear existing interval
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    const countdowns = document.querySelectorAll('.expires-countdown');
    countdowns.forEach(el => {
      const expiresAt = parseInt(el.getAttribute('data-expires') || '0');
      const remainingMs = expiresAt - Date.now();
      const remainingSecs = Math.ceil(remainingMs / 1000);

      if (remainingSecs <= 0) {
        // Mark card as expired
        const card = el.closest('.request-card');
        if (card && !card.classList.contains('expired')) {
          card.classList.add('expired');
          const meta = card.querySelector('.request-meta');
          const buttons = card.querySelector('.request-buttons');
          if (meta) {
            const badge = meta.querySelector('.tool-badge');
            if (badge) {
              badge.classList.add('expired-badge');
              badge.textContent = 'EXPIRED';
            }
          }
          el.textContent = 'Timed out';
          el.classList.add('expired-text');
          if (buttons) {
            buttons.innerHTML = '<button class="btn-dismiss">Dismiss</button>';
            buttons.querySelector('.btn-dismiss')?.addEventListener('click', () => {
              card.classList.add('denying');
              setTimeout(() => card.remove(), 350);
            });
          }
        }
      } else if (remainingSecs <= 10) {
        el.textContent = `${remainingSecs}s`;
        el.classList.add('urgent');
      } else {
        el.textContent = `${remainingSecs}s`;
      }
    });
  }, 1000) as unknown as number;
}

async function enablePushNotifications(pairingData: { pairingId: string; pairingSecret: string }) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notification permission denied');
      return;
    }

    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key from server
    const vapidPublicKey = await getVapidPublicKey();

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // Register with server
    const result = await registerPushSubscription(pairingData, subscription);

    if (result.success) {
      document.getElementById('push-permission')!.classList.add('hidden');
      alert('Push notifications enabled!');
    } else {
      alert('Failed to register push: ' + result.error);
    }
  } catch (error) {
    console.error('Push setup error:', error);
    alert('Failed to enable notifications: ' + error);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function setupTipPopover() {
  // Get Stripe links from environment variables (optional)
  const stripeLinks = {
    small: import.meta.env.VITE_STRIPE_LINK_SMALL || '',
    custom: import.meta.env.VITE_STRIPE_LINK_CUSTOM || ''
  };

  // If no Stripe links configured, hide tip button and return
  if (!stripeLinks.small && !stripeLinks.custom) {
    const floatingActions = document.querySelector('.floating-actions');
    if (floatingActions) {
      (floatingActions as HTMLElement).style.display = 'none';
    }
    return;
  }

  const tipPopover = document.getElementById('tipPopover');
  const floatingTip = document.getElementById('floatingTip');
  const closeTipPopoverBtn = document.getElementById('closeTipPopover');

  // Toggle popover on button click
  floatingTip?.addEventListener('click', (e) => {
    e.stopPropagation();
    tipPopover?.classList.toggle('open');
  });

  // Close popover
  closeTipPopoverBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    tipPopover?.classList.remove('open');
  });

  // Handle tip option clicks
  document.querySelectorAll('.tip-option').forEach((option) => {
    option.addEventListener('click', (e) => {
      e.preventDefault();
      const tier = (option as HTMLElement).dataset.tier as 'small' | 'custom';
      if (tier && stripeLinks[tier]) {
        window.open(stripeLinks[tier], '_blank');
        tipPopover?.classList.remove('open');
      }
    });
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tipPopover?.classList.contains('open')) {
      tipPopover.classList.remove('open');
    }
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (tipPopover?.classList.contains('open') &&
        !tipPopover.contains(target) &&
        !floatingTip?.contains(target)) {
      tipPopover.classList.remove('open');
    }
  });
}

init();
