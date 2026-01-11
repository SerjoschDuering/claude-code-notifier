// Main page logic
import { getPairingData, clearPairingData } from './storage';
import { API_BASE, getVapidPublicKey, registerPushSubscription, getPendingRequests, submitDecision } from './api';

async function init() {
  await setupInstallGuide();
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
    const setupBtn = document.getElementById('setup-btn');
    const installModal = document.getElementById('install-modal');
    const closeInstall = document.getElementById('close-install');
    const installBackdrop = installModal?.querySelector('.modal-backdrop');
    
    const openInstallModal = () => installModal?.classList.remove('hidden');
    installGuideBtn?.addEventListener('click', openInstallModal);
    setupBtn?.addEventListener('click', openInstallModal);
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

  // Setup button (always visible in header)
  const setupBtn = document.getElementById('setup-btn');
  const installModal = document.getElementById('install-modal');
  const closeInstall = document.getElementById('close-install');
  const installBackdrop = installModal?.querySelector('.modal-backdrop');
  
  setupBtn?.addEventListener('click', () => installModal?.classList.remove('hidden'));
  closeInstall?.addEventListener('click', () => installModal?.classList.add('hidden'));
  installBackdrop?.addEventListener('click', () => installModal?.classList.add('hidden'));

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

async function setupInstallGuide() {
  const workerUrl = deriveWorkerUrl();
  const pwaUrl = window.location.origin;

  // Get pairing data if available (for credentials embedding)
  const pairingData = await getPairingData();

  // Generate setup prompt with credentials if paired
  const setupPrompt = buildSetupPrompt(
    workerUrl,
    pwaUrl,
    pairingData?.pairingId,
    pairingData?.pairingSecret
  );

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

function buildSetupPrompt(workerUrl: string, _pwaUrl: string, pairingId?: string, pairingSecret?: string): string {
  const sanitizedWorkerUrl = workerUrl || 'https://claude-code-notifier.YOUR_SUBDOMAIN.workers.dev';

  // If no credentials, user hasn't paired yet
  if (!pairingId || !pairingSecret) {
    return `You need to pair your iPhone first before running this setup.

1. Open the PWA on your iPhone
2. Tap "Pair Device"
3. After pairing, go to Settings and tap "Setup"
4. Copy the setup prompt from there (it will have your credentials embedded)`;
  }

  return `Install Claude Code Approver - this sends approval requests to my iPhone instead of CLI prompts.

**Credentials are already embedded below - just execute the steps.**

## STEP 1: Check Dependencies

Run this first:
\`\`\`bash
echo "Checking dependencies..." && for cmd in jq curl openssl xxd; do command -v $cmd &>/dev/null && echo "✓ $cmd" || echo "✗ $cmd MISSING"; done
\`\`\`

If any are missing, tell me to install them with \`brew install <name>\` and wait for me to confirm.

## STEP 2: Create Hook Script

Run this command (credentials are already embedded):
\`\`\`bash
cat > ~/.claude-approve-hook.sh << 'HOOKEOF'
#!/bin/bash
PAIRING_ID="${pairingId}"
PAIRING_SECRET="${pairingSecret}"
SERVER_URL="${sanitizedWorkerUrl}"
FOCUS_MODE_NAME="claude remote approve"
SESSION_CACHE="/tmp/claude-approve-cache-$PPID.json"
ALLOW='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Approved via notification"}}'
DENY='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Denied via notification"}}'
command -v jq &>/dev/null || { echo "$ALLOW"; exit 0; }
command -v curl &>/dev/null || { echo "$ALLOW"; exit 0; }
command -v openssl &>/dev/null || { echo "$ALLOW"; exit 0; }
command -v xxd &>/dev/null || { echo "$ALLOW"; exit 0; }
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\\n')
[[ "$FOCUS_MODE" != "$FOCUS_MODE_NAME" ]] && exit 1
if [ -f "$SESSION_CACHE" ]; then
    jq -e '.approvals."session-all"' "$SESSION_CACHE" &>/dev/null && { echo "$ALLOW"; exit 0; }
    jq -e ".approvals.\\"tool:$TOOL\\"" "$SESSION_CACHE" &>/dev/null && { echo "$ALLOW"; exit 0; }
fi
case "$TOOL" in
    Bash) DETAILS=$(echo "$TOOL_INPUT" | jq -r '.command // ""') ;;
    Write|Edit) DETAILS="$TOOL: $(echo "$TOOL_INPUT" | jq -r '.file_path // ""')" ;;
    *) DETAILS=$(echo "$TOOL_INPUT" | jq -c '.' | head -c 200) ;;
esac
create_signature() {
    local METHOD="$1" API_PATH="$2" BODY="$3" TS="$4" NONCE="$5" SECRET="$6"
    local BODY_HASH
    [ -z "$BODY" ] && BODY_HASH=$(printf '' | openssl dgst -sha256 -binary | openssl enc -base64 -A) || BODY_HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -binary | openssl enc -base64 -A)
    local CANONICAL=$(printf '%s\\n%s\\n%s\\n%s\\n%s' "$METHOD" "$API_PATH" "$BODY_HASH" "$TS" "$NONCE")
    local SECRET_HEX=$(printf '%s' "$SECRET" | openssl enc -d -base64 -A | xxd -p -c 256 | tr -d '\\n')
    printf '%s' "$CANONICAL" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$SECRET_HEX" -binary | openssl enc -base64 -A
}
REQUEST_ID=$(openssl rand -hex 16)
NONCE=$(openssl rand -base64 16 | tr -d '\\n')
TS=$(date +%s)
BODY=$(jq -c -n --arg rid "$REQUEST_ID" --arg tool "$TOOL" --arg details "$DETAILS" --arg cwd "$CWD" '{requestId:$rid,payload:{tool:$tool,details:$details,cwd:$cwd}}')
SIGNATURE=$(create_signature "POST" "/api/v2/request" "$BODY" "$TS" "$NONCE" "$PAIRING_SECRET")
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/approve-resp-$$.json -X POST "$SERVER_URL/api/v2/request" -H "Content-Type: application/json" -H "X-Pairing-ID: $PAIRING_ID" -H "X-Timestamp: $TS" -H "X-Nonce: $NONCE" -H "Authorization: HMAC-SHA256 $SIGNATURE" -d "$BODY" --connect-timeout 5 --max-time 10)
[[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]] && { rm -f /tmp/approve-resp-$$.json; echo "$DENY"; exit 0; }
TIMEOUT=120; START=$(date +%s)
while [ $(($(date +%s) - START)) -lt $TIMEOUT ]; do
    sleep 1
    NONCE=$(openssl rand -base64 16 | tr -d '\\n'); TS=$(date +%s)
    SIGNATURE=$(create_signature "GET" "/api/v2/decision/$REQUEST_ID" "" "$TS" "$NONCE" "$PAIRING_SECRET")
    RESP=$(curl -s "$SERVER_URL/api/v2/decision/$REQUEST_ID" -H "X-Pairing-ID: $PAIRING_ID" -H "X-Timestamp: $TS" -H "X-Nonce: $NONCE" -H "Authorization: HMAC-SHA256 $SIGNATURE" --connect-timeout 5 --max-time 10)
    STATUS=$(echo "$RESP" | jq -r '.data.status // "pending"')
    SCOPE=$(echo "$RESP" | jq -r '.data.scope // "once"')
    if [ "$STATUS" = "allowed" ]; then
        rm -f /tmp/approve-resp-$$.json
        if [[ "$SCOPE" == "session-all" || "$SCOPE" == "session-tool" ]]; then
            [ ! -f "$SESSION_CACHE" ] && jq -n --arg s "$PPID" '{"sessionId":$s,"approvals":{}}' > "$SESSION_CACHE"
            [ "$SCOPE" = "session-all" ] && jq --argjson t "$(date +%s)" '.approvals."session-all"={"approved":true,"timestamp":$t}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
            [ "$SCOPE" = "session-tool" ] && jq --arg tool "$TOOL" --argjson t "$(date +%s)" '.approvals["tool:"+$tool]={"approved":true,"timestamp":$t}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
        fi
        echo "$ALLOW"; exit 0
    elif [[ "$STATUS" == "denied" || "$STATUS" == "expired" ]]; then
        rm -f /tmp/approve-resp-$$.json; echo "$DENY"; exit 0
    fi
done
rm -f /tmp/approve-resp-$$.json; echo "$DENY"
HOOKEOF
chmod +x ~/.claude-approve-hook.sh
\`\`\`

Then verify:
\`\`\`bash
ls -la ~/.claude-approve-hook.sh && echo "✓ Hook created"
\`\`\`

## STEP 3: Configure Settings

Check if settings exist:
\`\`\`bash
[ -f ~/.claude/settings.json ] && echo "EXISTS:" && cat ~/.claude/settings.json || echo "DOES NOT EXIST"
\`\`\`

If it does NOT exist, create it:
\`\`\`bash
mkdir -p ~/.claude && cat > ~/.claude/settings.json << 'EOF'
{"hooks":{"PreToolUse":[{"matcher":"Bash|Write|Edit|NotebookEdit","hooks":[{"type":"command","command":"$HOME/.claude-approve-hook.sh"}]}]}}
EOF
\`\`\`

If it EXISTS, you need to merge the hooks - ask me how I want to handle it.

## STEP 4: Manual Steps (tell me to do these)

Tell me:
> **Do these manually:**
> 1. **Install Shortcut**: Open https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad on your Mac and click "Add Shortcut"
> 2. **Create Focus Mode**: System Settings → Focus → "+" → Custom → Name it exactly: \`claude remote approve\`
> 3. Tell me when done

Wait for my confirmation before continuing.

After I confirm, verify shortcut works:
\`\`\`bash
shortcuts run "Get Current Focus" 2>&1 || echo "(no focus active - OK)"
\`\`\`

## STEP 5: Restart Required

Tell me:
> **IMPORTANT: You must restart Claude Code now.**
> Close this session and run \`claude\` again.
> After restart, paste this prompt again and say "continue from step 6"

## STEP 6: Test (after restart)

Ask me to enable/disable Focus Mode and test:

1. **Focus OFF test**: Ask me to disable Focus Mode, then run \`echo "test"\` - I should see CLI prompt
2. **Focus ON test**: Ask me to enable Focus Mode, then run \`echo "test"\` - I should get iPhone notification

If both work, tell me:
> **Setup complete!** Focus Mode ON = iPhone notifications, Focus Mode OFF = CLI prompts

Server: ${sanitizedWorkerUrl}`;
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
      const expiresAt = req.expiresAt || (req.createdAt + 120000);
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
            <button class="btn-deny" data-request-id="${req.requestId}">
              <span class="btn-icon">✕</span>
              <span class="btn-text">Deny</span>
            </button>
            <button class="btn-approve-once" data-request-id="${req.requestId}" data-tool="${escapeHtml(req.payload.tool)}">
              <span class="btn-icon">✓</span>
              <span class="btn-text">Approve Once</span>
            </button>
            <button class="btn-approve-tool" data-request-id="${req.requestId}" data-tool="${escapeHtml(req.payload.tool)}">
              <span class="btn-icon">⚡</span>
              <span class="btn-text">Approve All ${escapeHtml(req.payload.tool)} This Session</span>
            </button>
            <button class="btn-approve-all" data-request-id="${req.requestId}">
              <span class="btn-icon">⚡⚡</span>
              <span class="btn-text">Approve All Tools This Session</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners for buttons
    requestsList.querySelectorAll('.btn-approve-once').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const requestId = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id');
        if (requestId) await handleDecision(pairingData, requestId, 'allow', 'once');
      });
    });

    requestsList.querySelectorAll('.btn-approve-tool').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const requestId = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id');
        if (requestId) await handleDecision(pairingData, requestId, 'allow', 'session-tool');
      });
    });

    requestsList.querySelectorAll('.btn-approve-all').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const requestId = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id');
        if (requestId) await handleDecision(pairingData, requestId, 'allow', 'session-all');
      });
    });

    requestsList.querySelectorAll('.btn-deny').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const requestId = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id');
        if (requestId) await handleDecision(pairingData, requestId, 'deny', 'once');
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
  decision: 'allow' | 'deny',
  scope?: 'once' | 'session-tool' | 'session-all'
) {
  const card = document.querySelector(`[data-request-id="${requestId}"]`) as HTMLElement;
  if (card) {
    card.querySelectorAll('button').forEach(btn => (btn as HTMLButtonElement).disabled = true);
  }

  try {
    const result = await submitDecision(pairingData, requestId, decision, scope);
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
