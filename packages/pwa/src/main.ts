// Main PWA logic - Simplified single-page flow
import { getPairingData, savePairingData, clearPairingData, StoredPairingData } from './storage';

// Type extension for iOS Safari standalone detection
interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}
import { API_BASE, getVapidPublicKey, registerPushSubscription, getPendingRequests, submitDecision } from './api';

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.error('SW registration failed:', error);
    }
  }

  // Get or generate credentials
  let pairingData = await getPairingData();

  if (!pairingData) {
    // Generate credentials immediately on first load
    pairingData = await generateCredentials();
    await savePairingData(pairingData);
  }

  // Check state - welcome modal starts hidden, only show if needed
  const welcomeSeen = localStorage.getItem('welcome-seen') === 'true';
  const onboardingComplete = localStorage.getItem('onboarding-complete') === 'true';

  if (onboardingComplete) {
    // Go straight to dashboard, keep welcome hidden
    showDashboard(pairingData);
  } else if (welcomeSeen) {
    // Continue onboarding, keep welcome hidden
    showOnboarding(pairingData);
  } else {
    // First visit - show welcome modal
    showWelcome();
    setupWelcome(pairingData);
  }

  // Setup settings drawer
  setupSettingsDrawer(pairingData);
}

function showWelcome() {
  const modal = document.getElementById('welcome-modal');
  if (modal) {
    modal.classList.remove('hidden', 'hiding');
  }
}

function setupWelcome(pairingData: StoredPairingData) {
  document.getElementById('welcome-start')?.addEventListener('click', () => {
    localStorage.setItem('welcome-seen', 'true');
    hideWelcome();
    showOnboarding(pairingData);
  });
}

function hideWelcome() {
  const modal = document.getElementById('welcome-modal');
  if (modal) {
    // Use smooth fade transition
    modal.classList.add('hiding');
    setTimeout(() => modal.classList.add('hidden'), 300);
  }
}

// ============================================
// CREDENTIAL GENERATION
// ============================================

async function generateCredentials(): Promise<StoredPairingData> {
  const idBytes = new Uint8Array(16);
  crypto.getRandomValues(idBytes);
  const pairingId = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const pairingSecret = btoa(String.fromCharCode(...secretBytes));

  return { pairingId, pairingSecret, createdAt: Date.now() };
}

// ============================================
// ONBOARDING WIZARD
// ============================================

function showOnboarding(pairingData: StoredPairingData) {
  const onboarding = document.getElementById('onboarding')!;
  const dashboard = document.getElementById('dashboard')!;
  onboarding.classList.remove('hidden');
  dashboard.classList.add('hidden');

  const setupPrompt = buildSetupPrompt(pairingData);
  const promptCode = document.getElementById('prompt-code');
  if (promptCode) promptCode.textContent = setupPrompt;

  const copyBtn = document.getElementById('copy-prompt-btn');
  copyBtn?.addEventListener('click', async () => {
    await copyToClipboard(setupPrompt);
    showToast('✓ Copied to clipboard', 'success');
    const btnText = copyBtn.querySelector('.btn-text');
    if (btnText) {
      btnText.textContent = 'Copied!';
      setTimeout(() => { btnText.textContent = 'Copy to Clipboard'; }, 2000);
    }
  });

  setupWizardNavigation(pairingData);
  updatePWAStatus();
}

function setupWizardNavigation(pairingData: StoredPairingData) {
  const steps = ['step-1', 'step-2', 'step-3'];
  const progressSteps = document.querySelectorAll('.progress-step');

  function goToStep(stepNum: number) {
    steps.forEach((stepId, index) => {
      const stepEl = document.getElementById(stepId);
      const progressEl = progressSteps[index];
      if (index + 1 === stepNum) {
        stepEl?.classList.add('active');
        progressEl?.classList.add('active');
        progressEl?.classList.remove('completed');
      } else if (index + 1 < stepNum) {
        stepEl?.classList.remove('active');
        progressEl?.classList.remove('active');
        progressEl?.classList.add('completed');
      } else {
        stepEl?.classList.remove('active');
        progressEl?.classList.remove('active', 'completed');
      }
    });
  }

  document.getElementById('next-step-1')?.addEventListener('click', () => goToStep(2));
  document.getElementById('prev-step-2')?.addEventListener('click', () => goToStep(1));
  document.getElementById('next-step-2')?.addEventListener('click', () => goToStep(3));
  document.getElementById('prev-step-3')?.addEventListener('click', () => goToStep(2));
  document.getElementById('enable-notifications-btn')?.addEventListener('click', () => enablePushNotifications(pairingData));
  document.getElementById('finish-setup')?.addEventListener('click', () => {
    localStorage.setItem('onboarding-complete', 'true');
    showDashboard(pairingData);
  });
}

function updatePWAStatus() {
  const pwaCheck = document.getElementById('pwa-check');
  const pwaIcon = document.getElementById('pwa-icon');
  const pwaText = document.getElementById('pwa-text');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as NavigatorStandalone).standalone === true;
  if (isStandalone) {
    pwaCheck?.classList.add('success');
    if (pwaIcon) pwaIcon.textContent = '✓';
    if (pwaText) pwaText.textContent = 'Added! Ready for notifications';
  }
}

// ============================================
// DASHBOARD
// ============================================

function showDashboard(pairingData: StoredPairingData) {
  document.getElementById('onboarding')!.classList.add('hidden');
  document.getElementById('dashboard')!.classList.remove('hidden');
  document.getElementById('connection-dot')?.classList.add('connected');

  if ('Notification' in window && Notification.permission !== 'granted') {
    const pushBanner = document.getElementById('push-banner');
    pushBanner?.classList.remove('hidden');
    document.getElementById('banner-enable-push')?.addEventListener('click', async () => {
      await enablePushNotifications(pairingData);
      pushBanner?.classList.add('hidden');
    });
  }

  loadPendingRequests(pairingData);
  document.getElementById('refresh-btn')?.addEventListener('click', () => loadPendingRequests(pairingData));
  setInterval(() => loadPendingRequests(pairingData), 5000);
}

async function loadPendingRequests(pairingData: StoredPairingData) {
  const requestsList = document.getElementById('requests-list')!;
  try {
    const result = await getPendingRequests(pairingData);
    if (!result.success || !result.data) {
      requestsList.innerHTML = '<div class="empty-state"><span class="empty-icon">⚠️</span><p class="empty-text">Failed to load</p></div>';
      return;
    }
    if (result.data.length === 0) {
      requestsList.innerHTML = '<div class="empty-state"><span class="empty-icon">✨</span><p class="empty-text">No pending requests</p><p class="empty-hint">Requests appear when Claude Code needs approval</p></div>';
      return;
    }
    requestsList.innerHTML = result.data.map(req => {
      const expiresAt = req.expiresAt || (req.createdAt + 120000);
      const remainingMs = expiresAt - Date.now();
      const isExpired = remainingMs <= 0;
      const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
      if (isExpired) {
        return `<div class="request-card expired" data-request-id="${escapeHtml(req.requestId)}"><div class="request-meta"><span class="tool-badge expired">EXPIRED</span></div><div class="expired-message">Timed out</div><div class="request-buttons"><button class="btn-dismiss">Dismiss</button></div></div>`;
      }
      return `<div class="request-card" data-request-id="${escapeHtml(req.requestId)}" data-expires="${expiresAt}"><div class="request-meta"><span class="tool-badge">${escapeHtml(req.payload.tool)}</span><span class="expires-countdown" data-expires="${expiresAt}">${remainingSecs}s</span></div>${req.payload.command ? `<div class="request-command"><label>Command</label><pre>${escapeHtml(req.payload.command)}</pre></div>` : ''}${req.payload.details ? `<div class="request-details"><label>Details</label><p>${escapeHtml(req.payload.details)}</p></div>` : ''}<div class="request-buttons"><button class="btn-deny" data-request-id="${escapeHtml(req.requestId)}"><span>✕</span> Deny</button><button class="btn-approve-once" data-request-id="${escapeHtml(req.requestId)}"><span>✓</span> Approve</button><button class="btn-approve-tool" data-request-id="${escapeHtml(req.requestId)}"><span>⚡</span> All ${escapeHtml(req.payload.tool)}</button><button class="btn-approve-all" data-request-id="${escapeHtml(req.requestId)}"><span>⚡⚡</span> Session</button></div></div>`;
    }).join('');
    setupRequestButtons(pairingData);
    startCountdownTimer();
  } catch (error) {
    requestsList.innerHTML = '<div class="empty-state"><span class="empty-icon">⚠️</span><p class="empty-text">Error</p></div>';
  }
}

function setupRequestButtons(pairingData: StoredPairingData) {
  const list = document.getElementById('requests-list')!;
  list.querySelectorAll('.btn-approve-once').forEach(btn => btn.addEventListener('click', e => { const id = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id'); if (id) handleDecision(pairingData, id, 'allow', 'once'); }));
  list.querySelectorAll('.btn-approve-tool').forEach(btn => btn.addEventListener('click', e => { const id = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id'); if (id) handleDecision(pairingData, id, 'allow', 'session-tool'); }));
  list.querySelectorAll('.btn-approve-all').forEach(btn => btn.addEventListener('click', e => { const id = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id'); if (id) handleDecision(pairingData, id, 'allow', 'session-all'); }));
  list.querySelectorAll('.btn-deny').forEach(btn => btn.addEventListener('click', e => { const id = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id'); if (id) handleDecision(pairingData, id, 'deny', 'once'); }));
  list.querySelectorAll('.btn-dismiss').forEach(btn => btn.addEventListener('click', e => { const card = (e.target as HTMLElement).closest('.request-card'); card?.classList.add('denying'); setTimeout(() => card?.remove(), 300); }));
}

async function handleDecision(pairingData: StoredPairingData, requestId: string, decision: 'allow' | 'deny', scope?: 'once' | 'session-tool' | 'session-all') {
  const card = document.querySelector(`[data-request-id="${requestId}"]`) as HTMLElement;
  card?.querySelectorAll('button').forEach(btn => (btn as HTMLButtonElement).disabled = true);
  try {
    const result = await submitDecision(pairingData, requestId, decision, scope);
    if (result.success) {
      card?.classList.add(decision === 'allow' ? 'approving' : 'denying');
      setTimeout(() => card?.remove(), 300);
      showToast(decision === 'allow' ? '✓ Approved' : '✕ Denied', decision === 'allow' ? 'success' : 'error');
    } else {
      showToast('Failed: ' + result.error, 'error');
      card?.querySelectorAll('button').forEach(btn => (btn as HTMLButtonElement).disabled = false);
    }
  } catch (error) {
    showToast('Error', 'error');
    card?.querySelectorAll('button').forEach(btn => (btn as HTMLButtonElement).disabled = false);
  }
}

let countdownInterval: number | null = null;
function startCountdownTimer() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    document.querySelectorAll('.expires-countdown[data-expires]').forEach(el => {
      const expiresAt = parseInt(el.getAttribute('data-expires') || '0');
      const secs = Math.ceil((expiresAt - Date.now()) / 1000);
      if (secs <= 0) {
        const card = el.closest('.request-card');
        if (card && !card.classList.contains('expired')) {
          card.classList.add('expired');
          card.querySelector('.tool-badge')?.classList.add('expired');
          el.textContent = 'Expired';
          el.classList.add('expired-text');
        }
      } else {
        el.textContent = `${secs}s`;
        if (secs <= 10) el.classList.add('urgent');
      }
    });
  }, 1000) as unknown as number;
}

// ============================================
// SETTINGS DRAWER
// ============================================

function setupSettingsDrawer(pairingData: StoredPairingData) {
  const drawer = document.getElementById('settings-drawer')!;
  document.getElementById('settings-trigger')?.addEventListener('click', () => drawer.classList.remove('hidden'));
  document.getElementById('close-drawer')?.addEventListener('click', () => drawer.classList.add('hidden'));
  drawer.querySelector('.drawer-backdrop')?.addEventListener('click', () => drawer.classList.add('hidden'));

  const idEl = document.getElementById('settings-pairing-id');
  if (idEl) idEl.textContent = pairingData.pairingId.slice(0, 12) + '...';

  document.getElementById('test-notification-btn')?.addEventListener('click', () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Test', { body: 'Notifications work!', icon: '/icon-192.png' });
      showToast('✓ Sent', 'success');
    } else showToast('Enable notifications first', 'error');
  });

  document.getElementById('copy-prompt-settings')?.addEventListener('click', async () => {
    await copyToClipboard(buildSetupPrompt(pairingData));
    showToast('✓ Copied', 'success');
  });

  document.getElementById('unpair-btn')?.addEventListener('click', async () => {
    if (confirm('Unpair device?')) {
      await clearPairingData();
      localStorage.removeItem('onboarding-complete');
      localStorage.removeItem('welcome-seen');
      location.reload();
    }
  });
}

// ============================================
// PUSH NOTIFICATIONS
// ============================================

async function enablePushNotifications(pairingData: StoredPairingData) {
  const statusEl = document.getElementById('notification-status');
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { showToast('Permission denied', 'error'); return; }
    const reg = await navigator.serviceWorker.ready;
    const vapid = await getVapidPublicKey();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) });
    const result = await registerPushSubscription(pairingData, sub);
    if (result.success) {
      statusEl?.classList.add('success');
      const icon = statusEl?.querySelector('.status-icon'); if (icon) icon.textContent = '✓';
      const text = statusEl?.querySelector('.status-text'); if (text) text.textContent = 'Enabled';
      showToast('✓ Notifications enabled', 'success');
    } else showToast('Failed: ' + result.error, 'error');
  } catch (e) { showToast('Failed to enable', 'error'); }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ============================================
// SETUP PROMPT
// ============================================

function buildSetupPrompt(p: StoredPairingData): string {
  const url = deriveWorkerUrl();
  return `You are helping install Claude Code Approver - sends approval requests to iPhone via push notifications.

**Credentials embedded - execute these steps:**

## STEP 1: Check Dependencies
\`\`\`bash
for cmd in jq curl openssl xxd; do command -v $cmd &>/dev/null && echo "✓ $cmd" || echo "✗ $cmd MISSING"; done
\`\`\`

## STEP 2: Create Hook
\`\`\`bash
cat > ~/.claude-approve-hook.sh << 'HOOKEOF'
#!/bin/bash
PAIRING_ID="${p.pairingId}"
PAIRING_SECRET="${p.pairingSecret}"
SERVER_URL="${url}"
FOCUS_MODE_NAME="claude remote approve"
SESSION_CACHE="/tmp/claude-approve-cache-$PPID.json"
ALLOW='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Approved via notification"}}'
DENY='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Denied via notification"}}'

command -v jq &>/dev/null || { echo "$ALLOW"; exit 0; }
command -v curl &>/dev/null || { echo "$ALLOW"; exit 0; }

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\\n')
if [[ "$FOCUS_MODE" != "$FOCUS_MODE_NAME" ]]; then exit 1; fi

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

if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]]; then rm -f /tmp/approve-resp-$$.json; echo "$DENY"; exit 0; fi

TIMEOUT=120; POLL_START=$(date +%s)
while [ $(($(date +%s) - POLL_START)) -lt $TIMEOUT ]; do
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

## STEP 3: Configure Claude Code
\`\`\`bash
mkdir -p ~/.claude && cat > ~/.claude/settings.json << 'EOF'
{"hooks":{"PreToolUse":[{"matcher":"Bash|Write|Edit|NotebookEdit","hooks":[{"type":"command","command":"$HOME/.claude-approve-hook.sh"}]}]}}
EOF
\`\`\`

## STEP 4: Install Shortcut (Manual)
Click: https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad

## STEP 5: Create Focus Mode (Manual)
System Settings → Focus → + → Custom → Name: "claude remote approve"

## STEP 6: Restart Claude Code
Exit and restart for hook to activate.

**Credentials:** Server: ${url} | ID: ${p.pairingId}`;
}

function deriveWorkerUrl(): string {
  try {
    const u = new URL(API_BASE, location.origin);
    if (u.pathname.endsWith('/api')) u.pathname = u.pathname.replace(/\/api$/, '');
    return u.href.replace(/\/$/, '');
  } catch { return API_BASE.replace(/\/api$/, ''); }
}

// ============================================
// UTILITIES
// ============================================

async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
}

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  const c = document.getElementById('toast-container'); if (!c) return;
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 3000);
}

function escapeHtml(s: string): string { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

init();
