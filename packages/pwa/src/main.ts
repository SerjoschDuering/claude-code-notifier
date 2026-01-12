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
    return `The user needs to pair their iPhone first before running this setup.

Tell the user:
> Please pair your iPhone before running setup:
> 1. Open the PWA on your iPhone
> 2. Tap "Pair Device"
> 3. After pairing, go to Settings and tap "Setup"
> 4. Copy the setup prompt from there

The prompt will have credentials embedded once pairing is complete.`;
  }

  return `You are helping the user install Claude Code Approver - a tool that sends Claude Code approval requests to their iPhone via push notifications instead of CLI prompts.

**IMPORTANT FOR YOU (Claude Code AI):**
- Credentials are already embedded in this prompt
- Your job is to execute the setup steps
- Ask the user questions when indicated
- Wait for user confirmation before proceeding with manual steps

---

## How Focus Mode Routing Works (Explain to User First)

Before starting, explain this to the user:

> This system uses macOS **Focus Mode** to automatically route approval requests:
>
> 1. **Focus Mode: "claude remote approve"** → iPhone push notifications (what we're setting up)
> 2. **Focus Mode OFF (or any other name)** → Claude Code CLI prompts (default behavior)
>
> When the Focus Mode "claude remote approve" is active, approval requests go to your iPhone.
> When it's off, you'll see normal CLI prompts in the terminal.
>
> You can switch between these anytime by enabling/disabling the Focus Mode.

---

## Ask User Preferences

Before starting installation, ask the user:

**Question 1:** "What Focus Mode name do you want to use?"
- Recommended: "claude remote approve" (this is what most users use)
- Custom: You can choose your own name (must match exactly when you create it)

**Question 2:** "Have you already installed the 'Get Current Focus' shortcut?"
- Yes → I'll skip the installation step
- No → I'll provide the link and wait for you to install it

Store their answers and use them throughout the setup.

---

## STEP 1: Check Dependencies

Run this command to check for required tools:

\`\`\`bash
echo "Checking dependencies..." && for cmd in jq curl openssl xxd; do command -v $cmd &>/dev/null && echo "✓ $cmd" || echo "✗ $cmd MISSING"; done
\`\`\`

If any are missing, tell the user:
> You're missing: [list missing tools]
>
> Install them with: \`brew install jq curl openssl xxd\`
>
> Let me know when you've installed them, then I'll re-check.

Wait for user confirmation, then re-run the check.

---

## STEP 2: Create Hook Script

Create the hook script with embedded credentials:

\`\`\`bash
cat > ~/.claude-approve-hook.sh << 'HOOKEOF'
#!/bin/bash
# Debug timing log - check /tmp/claude-approve-timing.log for performance data
DEBUG_LOG="/tmp/claude-approve-timing.log"
log_time() { echo "$(date +%s.%N) [$1] $2" >> "$DEBUG_LOG"; }
START_TIME=$(date +%s.%N)
log_time "START" "Hook invoked"

PAIRING_ID="${pairingId}"
PAIRING_SECRET="${pairingSecret}"
SERVER_URL="${sanitizedWorkerUrl}"
FOCUS_MODE_NAME="claude remote approve"
SESSION_CACHE="/tmp/claude-approve-cache-$PPID.json"
ALLOW='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Approved via notification"}}'
DENY='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Denied via notification"}}'

command -v jq &>/dev/null || { log_time "EXIT" "jq missing"; echo "$ALLOW"; exit 0; }
command -v curl &>/dev/null || { log_time "EXIT" "curl missing"; echo "$ALLOW"; exit 0; }
command -v openssl &>/dev/null || { log_time "EXIT" "openssl missing"; echo "$ALLOW"; exit 0; }
command -v xxd &>/dev/null || { log_time "EXIT" "xxd missing"; echo "$ALLOW"; exit 0; }
log_time "DEPS" "Dependencies checked"

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
log_time "INPUT" "Parsed input: tool=$TOOL"

# TIMING CRITICAL: shortcuts run can take 100-500ms
FOCUS_START=$(date +%s.%N)
FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\\n')
FOCUS_END=$(date +%s.%N)
FOCUS_DURATION=$(echo "$FOCUS_END - $FOCUS_START" | bc)
log_time "FOCUS" "Shortcuts took ${FOCUS_DURATION}s, result='$FOCUS_MODE'"

if [[ "$FOCUS_MODE" != "$FOCUS_MODE_NAME" ]]; then
    TOTAL=$(echo "$(date +%s.%N) - $START_TIME" | bc)
    log_time "EXIT" "Focus mismatch, falling back to CLI (total: ${TOTAL}s)"
    exit 1
fi

if [ -f "$SESSION_CACHE" ]; then
    if jq -e '.approvals."session-all"' "$SESSION_CACHE" &>/dev/null; then
        TOTAL=$(echo "$(date +%s.%N) - $START_TIME" | bc)
        log_time "EXIT" "Session-all cached (total: ${TOTAL}s)"
        echo "$ALLOW"; exit 0
    fi
    if jq -e ".approvals.\\"tool:$TOOL\\"" "$SESSION_CACHE" &>/dev/null; then
        TOTAL=$(echo "$(date +%s.%N) - $START_TIME" | bc)
        log_time "EXIT" "Tool cached (total: ${TOTAL}s)"
        echo "$ALLOW"; exit 0
    fi
fi
log_time "CACHE" "No cache hit"

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
log_time "CRYPTO" "Signature created"

POST_START=$(date +%s.%N)
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/approve-resp-$$.json -X POST "$SERVER_URL/api/v2/request" -H "Content-Type: application/json" -H "X-Pairing-ID: $PAIRING_ID" -H "X-Timestamp: $TS" -H "X-Nonce: $NONCE" -H "Authorization: HMAC-SHA256 $SIGNATURE" -d "$BODY" --connect-timeout 5 --max-time 10)
POST_DURATION=$(echo "$(date +%s.%N) - $POST_START" | bc)
log_time "POST" "Request sent (${POST_DURATION}s), HTTP=$HTTP_CODE"

if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]]; then
    TOTAL=$(echo "$(date +%s.%N) - $START_TIME" | bc)
    log_time "EXIT" "POST failed HTTP=$HTTP_CODE (total: ${TOTAL}s)"
    rm -f /tmp/approve-resp-$$.json; echo "$DENY"; exit 0
fi

TIMEOUT=120; POLL_START=$(date +%s)
while [ $(($(date +%s) - POLL_START)) -lt $TIMEOUT ]; do
    sleep 1
    NONCE=$(openssl rand -base64 16 | tr -d '\\n'); TS=$(date +%s)
    SIGNATURE=$(create_signature "GET" "/api/v2/decision/$REQUEST_ID" "" "$TS" "$NONCE" "$PAIRING_SECRET")
    RESP=$(curl -s "$SERVER_URL/api/v2/decision/$REQUEST_ID" -H "X-Pairing-ID: $PAIRING_ID" -H "X-Timestamp: $TS" -H "X-Nonce: $NONCE" -H "Authorization: HMAC-SHA256 $SIGNATURE" --connect-timeout 5 --max-time 10)
    STATUS=$(echo "$RESP" | jq -r '.data.status // "pending"')
    SCOPE=$(echo "$RESP" | jq -r '.data.scope // "once"')
    log_time "POLL" "status=$STATUS scope=$SCOPE"

    if [ "$STATUS" = "allowed" ]; then
        rm -f /tmp/approve-resp-$$.json
        if [[ "$SCOPE" == "session-all" || "$SCOPE" == "session-tool" ]]; then
            [ ! -f "$SESSION_CACHE" ] && jq -n --arg s "$PPID" '{"sessionId":$s,"approvals":{}}' > "$SESSION_CACHE"
            [ "$SCOPE" = "session-all" ] && jq --argjson t "$(date +%s)" '.approvals."session-all"={"approved":true,"timestamp":$t}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
            [ "$SCOPE" = "session-tool" ] && jq --arg tool "$TOOL" --argjson t "$(date +%s)" '.approvals["tool:"+$tool]={"approved":true,"timestamp":$t}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
        fi
        TOTAL=$(echo "$(date +%s.%N) - $START_TIME" | bc)
        log_time "EXIT" "ALLOWED (total: ${TOTAL}s)"
        echo "$ALLOW"; exit 0
    elif [[ "$STATUS" == "denied" || "$STATUS" == "expired" ]]; then
        TOTAL=$(echo "$(date +%s.%N) - $START_TIME" | bc)
        log_time "EXIT" "DENIED/EXPIRED (total: ${TOTAL}s)"
        rm -f /tmp/approve-resp-$$.json; echo "$DENY"; exit 0
    fi
done
TOTAL=$(echo "$(date +%s.%N) - $START_TIME" | bc)
log_time "EXIT" "TIMEOUT (total: ${TOTAL}s)"
rm -f /tmp/approve-resp-$$.json; echo "$DENY"
HOOKEOF
chmod +x ~/.claude-approve-hook.sh
\`\`\`

**IMPORTANT:** If the user chose a custom Focus Mode name in Question 1, you need to update line 11 of the hook script above. Change \`FOCUS_MODE_NAME="claude remote approve"\` to their chosen name before creating the file.

Verify the hook was created:
\`\`\`bash
ls -la ~/.claude-approve-hook.sh && echo "✓ Hook created"
\`\`\`

---

## STEP 3: Configure Claude Code Settings

Check if the user already has Claude Code settings:

\`\`\`bash
[ -f ~/.claude/settings.json ] && echo "EXISTS:" && cat ~/.claude/settings.json || echo "DOES NOT EXIST"
\`\`\`

**If settings file DOES NOT EXIST:**

Create it with the hook configuration:

\`\`\`bash
mkdir -p ~/.claude && cat > ~/.claude/settings.json << 'EOF'
{"hooks":{"PreToolUse":[{"matcher":"Bash|Write|Edit|NotebookEdit","hooks":[{"type":"command","command":"$HOME/.claude-approve-hook.sh"}]}]}}
EOF
\`\`\`

**If settings file EXISTS:**

Tell the user:
> Your Claude Code settings file already exists.
>
> I need to add the hook configuration to it. Can I overwrite your settings.json?
> Or would you like to manually merge the hook settings?

Wait for user response. If they approve, run the same create command above.

---

## STEP 4: Install Shortcut (Manual - Only if User Answered "No")

**(Skip this if the user answered "Yes" to Question 2)**

Tell the user:
> I cannot install Shortcuts programmatically. You need to do this manually:
>
> 1. Click this link on your Mac: https://www.icloud.com/shortcuts/b13ac25ce397415097a80cb6fe28fbad
> 2. The Shortcuts app will open
> 3. Click "Add Shortcut"
> 4. The shortcut "Get Current Focus" should now appear in your Shortcuts library
>
> **Important:** You must do this on your Mac (not iPhone) where Claude Code runs.
>
> Let me know when you've added it (type "done" or "continue")

Wait for user confirmation.

After they confirm, verify it works:

\`\`\`bash
shortcuts run "Get Current Focus" 2>&1
\`\`\`

Explain the output to the user:
> If you see a Focus Mode name (like "Do Not Disturb"), the shortcut works!
> If you see an error or empty output, that's normal - it means no Focus Mode is active right now.

---

## STEP 5: Create Focus Mode (Manual)

Tell the user:
> I cannot create Focus Modes programmatically. You need to do this manually:
>
> 1. Open **System Settings** → **Focus**
> 2. Click the **"+"** button (bottom left)
> 3. Select **"Custom"**
> 4. Name it exactly: **[their chosen name from Question 1]**
>    - Default: \`claude remote approve\`
>    - **CRITICAL:** The name must match EXACTLY (case-sensitive, no typos, no extra spaces)
> 5. Click **"Done"**
> 6. You can customize when it activates (optional), but for testing, we'll enable it manually
>
> Let me know when you've created it (type "done" or "continue")

Wait for user confirmation.

---

## STEP 6: Restart Claude Code (Required)

Explain to the user:
> **IMPORTANT:** Claude Code only loads settings.json when it starts.
> Since we just created/modified it, you must restart for the hook to work.
>
> **How to restart:**
> 1. Exit this session (press Ctrl+C or type "exit")
> 2. Start a new Claude Code session: \`claude\`
> 3. The hook will now be active
>
> **After restarting:** Paste this same setup prompt again and say "continue from testing"

---

## STEP 7: Testing (Run After Restart)

**(User should restart first and paste prompt again before running these tests)**

### Test 1: Default CLI Behavior (Focus Mode OFF)

Tell the user:
> Let's test the default CLI behavior first.
>
> **Make sure NO Focus Mode is active:**
> - Check Control Center (menu bar) → Focus icon should NOT be highlighted
> - Or check System Settings → Focus → Nothing should be enabled
>
> Let me know when you're ready (type "ready")

Wait for confirmation. Then run:

\`\`\`bash
echo "test - cli fallback"
\`\`\`

**Expected behavior - explain to user:**
> I (Claude Code) should pause and show you a prompt in the terminal:
> \`Approve Bash command: echo "test - cli fallback"? (y/n):\`
>
> This is the default Claude Code behavior when no Focus Mode is active.
> Type "n" to deny (we're just testing).
>
> Did you see the CLI prompt? (yes/no)

Wait for their confirmation.

---

### Test 2: iPhone Push Notifications (Focus Mode ON)

Tell the user:
> Now let's test iPhone notifications.
>
> **Enable your Focus Mode:**
> 1. Click the Focus icon in Control Center (menu bar)
> 2. Select "[their chosen Focus Mode name]"
> 3. The icon should now be highlighted (Focus Mode active)
>
> Let me know when you've enabled it (type "ready")

Wait for confirmation. Then run:

\`\`\`bash
echo "test - iphone notification"
\`\`\`

**Expected behavior - explain to user:**
> With Focus Mode active, here's what should happen:
>
> 1. I (Claude Code) will pause (no terminal prompt this time)
> 2. Within 3-5 seconds: Your iPhone receives a push notification
> 3. Notification shows: "Tool: Bash" and "Command: echo test - iphone notification"
> 4. Tap the notification → PWA opens with Approve/Deny buttons
> 5. Tap "Approve Once" → I continue execution
>
> Did you receive the push notification on your iPhone? (yes/no)

Wait for response.

**If they say NO:**

Help troubleshoot:
> Let's check what went wrong. Run this command:

\`\`\`bash
shortcuts run "Get Current Focus"
\`\`\`

> What does it show?
> - Expected: "[their chosen Focus Mode name]"
> - If it shows something different or empty, the Focus Mode isn't active or the name doesn't match

Also check timing logs:

\`\`\`bash
tail -20 /tmp/claude-approve-timing.log
\`\`\`

> Send me the output and I'll help debug.

**If they say YES:**

> Great! Now approve the request in the PWA (tap "Approve Once").
> The test command should complete.

---

## STEP 8: Completion

If all tests pass, tell the user:

> **Setup Complete!** 🎉
>
> Here's how to use it:
>
> - **Focus Mode "[their name]" ON** → iPhone push notifications
> - **Focus Mode OFF (or any other)** → Claude Code CLI prompts (default)
>
> You can switch between these anytime by enabling/disabling the Focus Mode.
>
> **Pro Tip:** Automate it with Focus Mode schedules:
> - System Settings → Focus → [Your Mode] → Add Schedule
> - Example: Auto-enable when using certain apps, at certain times, or locations
>
> **Troubleshooting:**
> - Check timing logs: \`tail /tmp/claude-approve-timing.log\`
> - Verify Focus Mode: \`shortcuts run "Get Current Focus"\`
> - Test hook manually: \`echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | ~/.claude-approve-hook.sh\`

---

## Setup Summary

**Credentials:**
- Server: ${sanitizedWorkerUrl}
- Pairing ID: ${pairingId}
- Hook: ~/.claude-approve-hook.sh
- Settings: ~/.claude/settings.json

**Focus Mode:** [their chosen name from Question 1]`;
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
