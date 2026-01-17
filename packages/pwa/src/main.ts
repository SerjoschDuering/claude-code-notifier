// Main PWA logic - Simplified single-page flow
import { getPairingData, savePairingData, clearPairingData, StoredPairingData } from './storage';

// Type extension for iOS Safari standalone detection
interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}
import { API_BASE, getVapidPublicKey, registerPushSubscription, getPendingRequests, submitDecision, initPairing, sendTestNotification } from './api';

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

  // Check if running as installed PWA (homescreen)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       (window.navigator as NavigatorStandalone).standalone === true;

  // Check if we have credentials (paired)
  const pairingData = await getPairingData();
  const isPaired = !!pairingData;
  const onboardingComplete = localStorage.getItem('onboarding-complete') === 'true';

  console.log('[init] isStandalone:', isStandalone, 'isPaired:', isPaired, 'onboardingComplete:', onboardingComplete);

  // SIMPLE LOGIC:
  // - If paired AND onboarding complete → Dashboard
  // - If standalone AND paired → Onboarding (to finish setup)
  // - If standalone AND not paired → Welcome → generate creds → Onboarding
  // - If NOT standalone (browser) → ALWAYS show welcome/add-to-home

  if (isPaired && onboardingComplete && isStandalone) {
    // Fully set up and running from homescreen → Dashboard
    showDashboard(pairingData);
    setupSettingsDrawer(pairingData);
    return;
  }

  if (!isStandalone) {
    // In browser - ALWAYS show welcome with add-to-home instructions
    showWelcome();
    setupWelcomeFlow(false);
    return;
  }

  // Running from homescreen (standalone)
  if (!isPaired) {
    // First time in PWA - show welcome, then generate creds
    showWelcome();
    setupWelcomeFlow(true);
    return;
  }

  // Paired but onboarding not complete - continue onboarding
  showOnboarding(pairingData);
  setupSettingsDrawer(pairingData);
}

function showAddToHomeScreen() {
  // Hide other screens
  document.getElementById('onboarding')?.classList.add('hidden');
  document.getElementById('dashboard')?.classList.add('hidden');
  document.getElementById('welcome-modal')?.classList.add('hidden');

  // Show add-to-home-screen instructions
  const addToHomeEl = document.getElementById('add-to-homescreen');
  if (addToHomeEl) {
    addToHomeEl.classList.remove('hidden');
  }

  // Detect platform for specific instructions
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const instructionsEl = document.getElementById('aths-instructions');
  if (instructionsEl) {
    if (isIOS) {
      instructionsEl.innerHTML = `
        <div class="aths-step"><span class="step-num">1</span><span class="step-text">Tap <strong>Share</strong> ⬆️ at bottom</span></div>
        <div class="aths-step"><span class="step-num">2</span><span class="step-text">Scroll right → tap <strong>More</strong></span></div>
        <div class="aths-step"><span class="step-num">3</span><span class="step-text">Tap <strong>Add to Home Screen</strong></span></div>
        <div class="aths-step"><span class="step-num">4</span><span class="step-text">Tap <strong>Add</strong> → Open from home</span></div>
      `;
    } else {
      instructionsEl.innerHTML = `
        <div class="aths-step"><span class="step-num">1</span><span class="step-text">Tap menu <strong>⋮</strong> (3 dots)</span></div>
        <div class="aths-step"><span class="step-num">2</span><span class="step-text">Tap <strong>Add to Home Screen</strong></span></div>
        <div class="aths-step"><span class="step-num">3</span><span class="step-text">Open from home screen</span></div>
      `;
    }
  }

  // Setup skip button
  document.getElementById('aths-skip-btn')?.addEventListener('click', async () => {
    // User wants to skip - proceed without PWA install
    let pairingData = await getPairingData();
    if (!pairingData) {
      pairingData = await generateCredentials();
      if (!pairingData) {
        // Server registration failed - don't proceed
        return;
      }
      await savePairingData(pairingData);
    }
    addToHomeEl?.classList.add('hidden');
    showOnboarding(pairingData);
    setupSettingsDrawer(pairingData);
  });
}

function showWelcome() {
  const modal = document.getElementById('welcome-modal');
  if (modal) {
    modal.classList.remove('hidden', 'hiding');
  }
}

function setupWelcomeFlow(isStandalone: boolean) {
  document.getElementById('welcome-start')?.addEventListener('click', async () => {
    await hideWelcome();

    if (isStandalone) {
      // Running from homescreen - go to onboarding (pairing happens in Step 0)
      const existingData = await getPairingData();
      showOnboarding(existingData); // Pass null if not paired yet
      if (existingData) {
        setupSettingsDrawer(existingData);
      }
    } else {
      // In browser - show Add to Home Screen instructions
      showAddToHomeScreen();
    }
  });
}

async function hideWelcome(): Promise<void> {
  const modal = document.getElementById('welcome-modal');
  if (modal) {
    // Use smooth fade transition and wait for it to complete
    modal.classList.add('hiding');
    await new Promise(resolve => setTimeout(resolve, 300));
    modal.classList.add('hidden');
  }
}

// ============================================
// CREDENTIAL GENERATION
// ============================================

async function generateCredentials(): Promise<StoredPairingData | null> {
  // Call server to generate AND register credentials in one step
  // This ensures the device is registered before the hook tries to use it
  try {
    const result = await initPairing();

    if (!result.success || !result.data) {
      console.error('[generateCredentials] Server registration failed:', result.error);
      showToast('Failed to connect to server. Check your internet connection.', 'error');
      return null; // Don't fallback to local - that would silently break everything
    }

    console.log('[generateCredentials] Device registered with server, pairingId:', result.data.pairingId.slice(0, 8) + '...');
    return {
      pairingId: result.data.pairingId,
      pairingSecret: result.data.pairingSecret,
      createdAt: Date.now()
    };
  } catch (error) {
    console.error('[generateCredentials] Network error:', error);
    showToast('Network error. Please check your connection and try again.', 'error');
    return null;
  }
}

// ============================================
// ONBOARDING WIZARD
// ============================================

function showOnboarding(pairingData: StoredPairingData | null) {
  const onboarding = document.getElementById('onboarding')!;
  const dashboard = document.getElementById('dashboard')!;
  onboarding.classList.remove('hidden');
  dashboard.classList.add('hidden');

  // If already paired, update UI to reflect that
  if (pairingData) {
    updatePairingUI(pairingData);
    // Pre-populate setup prompt
    const setupPrompt = buildSetupPrompt(pairingData);
    const promptCode = document.getElementById('prompt-code');
    if (promptCode) promptCode.textContent = setupPrompt;
  }

  setupWizardNavigation(pairingData);
  updatePWAStatus();
}

// Update pairing UI to show success state with ID
function updatePairingUI(pairingData: StoredPairingData) {
  const statusEl = document.getElementById('pairing-status');
  const icon = statusEl?.querySelector('.status-icon');
  const text = statusEl?.querySelector('.status-text');
  if (icon) icon.textContent = '✅';
  if (text) text.textContent = 'Paired successfully!';
  statusEl?.classList.add('success');

  // Show pairing ID
  const idDisplay = document.getElementById('pairing-id-display');
  const idCode = document.getElementById('pairing-id-code');
  if (idDisplay && idCode) {
    // Show first 8 and last 4 chars: ab3f1234...x2c9
    const id = pairingData.pairingId;
    const displayId = id.length > 12
      ? `${id.slice(0, 8)}...${id.slice(-4)}`
      : id;
    idCode.textContent = displayId;
    idDisplay.classList.remove('hidden');
  }

  // Enable continue button
  const nextBtn = document.getElementById('next-step-0') as HTMLButtonElement;
  if (nextBtn) nextBtn.disabled = false;

  // Update pair button to show success
  const pairBtn = document.getElementById('pair-device-btn');
  const btnText = pairBtn?.querySelector('.btn-text');
  const btnIcon = pairBtn?.querySelector('.btn-icon');
  if (btnText) btnText.textContent = 'Paired!';
  if (btnIcon) btnIcon.textContent = '✅';
  if (pairBtn) (pairBtn as HTMLButtonElement).disabled = true;
}

function setupWizardNavigation(initialPairingData: StoredPairingData | null) {
  const steps = ['step-0', 'step-1', 'step-2', 'step-3'];
  const progressSteps = document.querySelectorAll('.progress-step');

  // Track current pairing data (may be set during Step 0)
  let pairingData: StoredPairingData | null = initialPairingData;

  function goToStep(stepNum: number) {
    steps.forEach((stepId, index) => {
      const stepEl = document.getElementById(stepId);
      const progressEl = progressSteps[index];
      if (index === stepNum) {
        stepEl?.classList.add('active');
        progressEl?.classList.add('active');
        progressEl?.classList.remove('completed');
      } else if (index < stepNum) {
        stepEl?.classList.remove('active');
        progressEl?.classList.remove('active');
        progressEl?.classList.add('completed');
      } else {
        stepEl?.classList.remove('active');
        progressEl?.classList.remove('active', 'completed');
      }
    });
  }

  // Step 0: Pair Device (EXPLICIT pairing with visible ID)
  const nextStep0Btn = document.getElementById('next-step-0') as HTMLButtonElement;
  const pairBtn = document.getElementById('pair-device-btn');

  // If already paired, update UI
  if (pairingData) {
    updatePairingUI(pairingData);
  }

  pairBtn?.addEventListener('click', async () => {
    const statusEl = document.getElementById('pairing-status');
    const icon = statusEl?.querySelector('.status-icon');
    const text = statusEl?.querySelector('.status-text');
    const btnText = pairBtn.querySelector('.btn-text');

    // Show loading state
    if (icon) icon.textContent = '⏳';
    if (text) text.textContent = 'Connecting to server...';
    if (btnText) btnText.textContent = 'Pairing...';
    (pairBtn as HTMLButtonElement).disabled = true;

    try {
      const newPairingData = await generateCredentials();
      if (newPairingData) {
        await savePairingData(newPairingData);
        pairingData = newPairingData;
        updatePairingUI(newPairingData);
        setupSettingsDrawer(newPairingData);

        // Pre-populate setup prompt for Step 3
        const setupPrompt = buildSetupPrompt(newPairingData);
        const promptCode = document.getElementById('prompt-code');
        if (promptCode) promptCode.textContent = setupPrompt;

        // Setup copy button for Step 3
        const copyBtn = document.getElementById('copy-prompt-btn');
        copyBtn?.addEventListener('click', async () => {
          await copyToClipboard(setupPrompt);
          showToast('✓ Copied to clipboard', 'success');
          const copyBtnText = copyBtn.querySelector('.btn-text');
          if (copyBtnText) {
            copyBtnText.textContent = 'Copied!';
            setTimeout(() => { copyBtnText.textContent = 'Copy to Clipboard'; }, 2000);
          }
        });

        showToast('✓ Device paired successfully!', 'success');
      } else {
        // Failed - reset button
        if (icon) icon.textContent = '❌';
        if (text) text.textContent = 'Pairing failed - tap to retry';
        if (btnText) btnText.textContent = 'Retry Pairing';
        (pairBtn as HTMLButtonElement).disabled = false;
      }
    } catch (error) {
      if (icon) icon.textContent = '❌';
      if (text) text.textContent = 'Network error - tap to retry';
      if (btnText) btnText.textContent = 'Retry Pairing';
      (pairBtn as HTMLButtonElement).disabled = false;
      showToast('Pairing failed: network error', 'error');
    }
  });

  // Copy pairing ID button
  document.getElementById('copy-pairing-id')?.addEventListener('click', async () => {
    if (pairingData) {
      await copyToClipboard(pairingData.pairingId);
      showToast('✓ Pairing ID copied', 'success');
    }
  });

  nextStep0Btn?.addEventListener('click', () => goToStep(1));

  // Step 1: Enable Notifications
  const nextStep1Btn = document.getElementById('next-step-1') as HTMLButtonElement;
  document.getElementById('enable-notifications-btn')?.addEventListener('click', async () => {
    if (!pairingData) {
      showToast('Please pair device first', 'error');
      goToStep(0);
      return;
    }
    const success = await enablePushNotifications(pairingData);
    if (success) {
      const statusEl = document.getElementById('notification-status');
      const icon = statusEl?.querySelector('.status-icon');
      const text = statusEl?.querySelector('.status-text');
      if (icon) icon.textContent = '✅';
      if (text) text.textContent = 'Notifications enabled!';
      statusEl?.classList.add('success');
      nextStep1Btn.disabled = false;
    }
  });
  document.getElementById('prev-step-1')?.addEventListener('click', () => goToStep(0));
  nextStep1Btn?.addEventListener('click', () => goToStep(2));

  // Step 2: Test Notification
  const nextStep2Btn = document.getElementById('next-step-2') as HTMLButtonElement;
  document.getElementById('send-test-btn')?.addEventListener('click', async () => {
    if (!pairingData) {
      showToast('Please pair device first', 'error');
      goToStep(0);
      return;
    }
    const testStatus = document.getElementById('test-status');
    const icon = testStatus?.querySelector('.status-icon');
    const text = testStatus?.querySelector('.status-text');

    if (icon) icon.textContent = '⏳';
    if (text) text.textContent = 'Sending...';

    try {
      const result = await sendTestNotification(pairingData);
      if (result.success) {
        if (icon) icon.textContent = '✅';
        if (text) text.textContent = 'Test sent! Check your notification.';
        testStatus?.classList.add('success');
        nextStep2Btn.disabled = false;
        showToast('✓ Test notification sent!', 'success');
      } else {
        if (icon) icon.textContent = '❌';
        if (text) text.textContent = 'Failed: ' + (result.error || 'Unknown error');
        showToast('Test failed: ' + result.error, 'error');
      }
    } catch (error) {
      if (icon) icon.textContent = '❌';
      if (text) text.textContent = 'Network error';
      showToast('Network error', 'error');
    }
  });
  document.getElementById('prev-step-2')?.addEventListener('click', () => goToStep(1));
  nextStep2Btn?.addEventListener('click', () => goToStep(3));

  // Step 3: Copy Prompt
  document.getElementById('prev-step-3')?.addEventListener('click', () => goToStep(2));
  document.getElementById('finish-setup')?.addEventListener('click', () => {
    if (!pairingData) {
      showToast('Please pair device first', 'error');
      goToStep(0);
      return;
    }
    localStorage.setItem('onboarding-complete', 'true');
    showDashboard(pairingData);
  });

  // Check if notifications already enabled (e.g., returning user)
  if ('Notification' in window && Notification.permission === 'granted') {
    const statusEl = document.getElementById('notification-status');
    const icon = statusEl?.querySelector('.status-icon');
    const text = statusEl?.querySelector('.status-text');
    if (icon) icon.textContent = '✅';
    if (text) text.textContent = 'Notifications already enabled!';
    statusEl?.classList.add('success');
    nextStep1Btn.disabled = false;
  }

  // If already paired and came back, also setup copy button
  if (pairingData) {
    const setupPrompt = buildSetupPrompt(pairingData);
    const copyBtn = document.getElementById('copy-prompt-btn');
    copyBtn?.addEventListener('click', async () => {
      await copyToClipboard(setupPrompt);
      showToast('✓ Copied to clipboard', 'success');
      const copyBtnText = copyBtn.querySelector('.btn-text');
      if (copyBtnText) {
        copyBtnText.textContent = 'Copied!';
        setTimeout(() => { copyBtnText.textContent = 'Copy to Clipboard'; }, 2000);
      }
    });
  }
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
    console.log('[Settings] Copy button clicked');
    const prompt = buildSetupPrompt(pairingData);
    console.log('[Settings] Prompt length:', prompt?.length || 0);
    const success = await copyToClipboard(prompt);
    showToast(success ? '✓ Copied' : '✗ Copy failed', success ? 'success' : 'error');
  });

  document.getElementById('regenerate-btn')?.addEventListener('click', async () => {
    if (confirm('Regenerate credentials?\n\nThis will create new pairing credentials. You will need to copy the new setup prompt to Claude Code to re-pair.')) {
      // Generate new credentials
      const newPairingData = await generateCredentials();
      if (!newPairingData) {
        // Server registration failed - toast already shown
        return;
      }
      await savePairingData(newPairingData);

      // Update UI
      const idEl = document.getElementById('settings-pairing-id');
      if (idEl) idEl.textContent = newPairingData.pairingId.slice(0, 12) + '...';

      // Copy new prompt to clipboard
      const prompt = buildSetupPrompt(newPairingData);
      const success = await copyToClipboard(prompt);

      if (success) {
        showToast('✓ New credentials generated & copied!', 'success');
        // Close drawer
        document.getElementById('settings-drawer')?.classList.add('hidden');
      } else {
        showToast('Generated but copy failed - use Copy Setup Prompt', 'error');
      }
    }
  });

  document.getElementById('unpair-btn')?.addEventListener('click', async () => {
    if (confirm('Unpair device?\n\nThis will delete all credentials and reset the app. You will need to set up again from scratch.')) {
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

async function enablePushNotifications(pairingData: StoredPairingData): Promise<boolean> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Permission denied', 'error');
      return false;
    }
    const reg = await navigator.serviceWorker.ready;
    const vapid = await getVapidPublicKey();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) });
    const result = await registerPushSubscription(pairingData, sub);
    if (result.success) {
      showToast('✓ Notifications enabled', 'success');
      return true;
    } else {
      showToast('Failed: ' + result.error, 'error');
      return false;
    }
  } catch (e) {
    showToast('Failed to enable', 'error');
    return false;
  }
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
  console.log('[buildSetupPrompt] Called with pairingData:', {
    pairingId: p?.pairingId?.substring(0, 8) + '...',
    hasSecret: !!p?.pairingSecret,
    createdAt: p?.createdAt
  });

  if (!p || !p.pairingId || !p.pairingSecret) {
    console.error('[buildSetupPrompt] ERROR: Invalid pairing data!', p);
    return 'ERROR: No credentials found. Please reload the app or clear your browser data and try again.';
  }

  const url = deriveWorkerUrl();
  console.log('[buildSetupPrompt] Derived URL:', url);

  // Full hook script with all features: macOS dialog, remote push, session caching, local whitelist
  return `You are helping install Claude Code Approver - sends approval requests to iPhone via push notifications.

**Credentials embedded - execute these steps:**

## STEP 1: Check Dependencies
\`\`\`bash
for cmd in jq curl openssl xxd osascript; do command -v $cmd &>/dev/null && echo "✓ $cmd" || echo "✗ $cmd MISSING"; done
\`\`\`

## STEP 2: Create Hook
\`\`\`bash
cat > ~/.claude-approve-hook.sh << 'HOOKEOF'
#!/bin/bash
# Claude Code Approval Hook v2 - Pure Bash Implementation
# Uses header-based authentication with curl + openssl (no npm/npx dependencies)
#
# Focus Mode Routing:
# - "claude remote approve" → iPhone push notification (requires pairing)
# - "claude notification approval" → macOS native dialog (local only)
# - Any other Focus Mode → Falls back to CLI prompt

# Embedded credentials (no config file needed)
PAIRING_ID="${p.pairingId}"
PAIRING_SECRET="${p.pairingSecret}"
SERVER_URL="${url}"
REMOTE_FOCUS="claude remote approve"
MACOS_FOCUS="claude notification approval"

SESSION_CACHE="/tmp/claude-approve-cache-$PPID.json"

# Response formats for Claude Code hooks
ALLOW='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Approved via notification"}}'
DENY='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Denied via notification"}}'

# Fail open if missing dependencies
command -v jq &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v curl &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v openssl &> /dev/null || { echo "$ALLOW"; exit 0; }
command -v xxd &> /dev/null || { echo "$ALLOW"; exit 0; }

# Read input from Claude Code
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

# Focus Mode Check - use shortcuts CLI to get current Focus Mode
FOCUS_MODE=$(shortcuts run "Get Current Focus" 2>/dev/null | tr -d '\\n')

# Determine notification method based on Focus Mode
USE_REMOTE=false
USE_MACOS=false

if [[ "$FOCUS_MODE" == "$REMOTE_FOCUS" ]]; then
    USE_REMOTE=true
elif [[ "$FOCUS_MODE" == "$MACOS_FOCUS" ]]; then
    USE_MACOS=true
else
    # No matching Focus Mode - fall back to CLI prompt
    exit 1
fi

# Check local whitelist first to avoid unnecessary notifications
LOCAL_SETTINGS="$CWD/.claude/settings.local.json"
if [ -f "$LOCAL_SETTINGS" ]; then
    if [ "$TOOL" = "Bash" ]; then
        CMD=$(echo "$TOOL_INPUT" | jq -r '.command // ""')
        BASE_CMD=$(echo "$CMD" | awk '{print $1}')
        if jq -e ".permissions.allow[] | select(. == \\"Bash($BASE_CMD:*)\\" or . == \\"Bash($CMD)\\")" "$LOCAL_SETTINGS" &>/dev/null; then
            echo "$ALLOW"
            exit 0
        fi
    fi
fi

# Check session cache for previously approved scopes
if [ -f "$SESSION_CACHE" ]; then
    if jq -e '.approvals."session-all"' "$SESSION_CACHE" &>/dev/null; then
        echo "$ALLOW"
        exit 0
    fi
    if jq -e ".approvals.\\"tool:$TOOL\\"" "$SESSION_CACHE" &>/dev/null; then
        echo "$ALLOW"
        exit 0
    fi
fi

# Build details based on tool type
case "$TOOL" in
    Bash)
        CMD=$(echo "$TOOL_INPUT" | jq -r '.command // ""')
        DETAILS="$CMD"
        ;;
    Write)
        FILE=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""')
        CMD=""
        DETAILS="Write: $FILE"
        ;;
    Edit)
        FILE=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""')
        CMD=""
        DETAILS="Edit: $FILE"
        ;;
    *)
        CMD=""
        DETAILS=$(echo "$TOOL_INPUT" | jq -c '.' | head -c 200)
        ;;
esac

# Function: Show macOS approval dialog (always on top, clean UI)
show_macos_approval() {
    local TOOL="$1"
    local DETAILS="$2"
    local CWD="$3"

    # Escape special characters for AppleScript
    DETAILS=$(echo "$DETAILS" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
    CWD=$(echo "$CWD" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')

    # Compact dialog text
    local DIALOG_TEXT="Tool: $TOOL
Command: $DETAILS

Directory: $CWD"

    # Show dialog - activate System Events to bring to front
    DIALOG_RESULT=$(osascript 2>&1 <<APPLESCRIPT
tell application "System Events"
    activate
    display dialog "$DIALOG_TEXT" ¬
        buttons {"Deny", "Approve Once", "Approve Session"} ¬
        default button "Approve Once" ¬
        with title "Claude Code" ¬
        with icon caution ¬
        giving up after 120
end tell
APPLESCRIPT
)
    DIALOG_EXIT=$?

    # Parse result
    if [ $DIALOG_EXIT -ne 0 ]; then
        return 1
    fi

    if echo "$DIALOG_RESULT" | grep -q "gave up:true"; then
        return 1
    elif echo "$DIALOG_RESULT" | grep -q "button returned:Approve Session"; then
        echo "session-tool"
        return 0
    elif echo "$DIALOG_RESULT" | grep -q "button returned:Approve Once"; then
        echo "once"
        return 0
    else
        return 1
    fi
}

# Function: Create HMAC-SHA256 signature with header-based auth
create_signature() {
    local METHOD="$1"
    local API_PATH="$2"
    local BODY="$3"
    local TS="$4"
    local NONCE="$5"
    local SECRET="$6"

    # Hash body with SHA-256
    local BODY_HASH
    if [ -z "$BODY" ]; then
        BODY_HASH=$(printf '' | openssl dgst -sha256 -binary | openssl enc -base64 -A)
    else
        BODY_HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -binary | openssl enc -base64 -A)
    fi

    # Build canonical string
    local CANONICAL
    CANONICAL=$(printf '%s\\n%s\\n%s\\n%s\\n%s' "$METHOD" "$API_PATH" "$BODY_HASH" "$TS" "$NONCE")

    # Decode secret from base64 to hex for openssl HMAC
    local SECRET_HEX
    SECRET_HEX=$(printf '%s' "$SECRET" | openssl enc -d -base64 -A | xxd -p -c 256 | tr -d '\\n')

    # Create HMAC-SHA256 signature
    printf '%s' "$CANONICAL" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$SECRET_HEX" -binary | openssl enc -base64 -A
}

# Function: Send approval request via pure bash (curl + headers)
send_remote_request() {
    local TOOL="$1"
    local DETAILS="$2"
    local CWD="$3"

    # Generate request ID, nonce, and timestamp
    local REQUEST_ID NONCE TS
    REQUEST_ID=$(openssl rand -hex 16)
    NONCE=$(openssl rand -base64 16 | tr -d '\\n')
    TS=$(date +%s)

    # Build request body
    local BODY
    BODY=$(jq -c -n \\
        --arg requestId "$REQUEST_ID" \\
        --arg tool "$TOOL" \\
        --arg details "$DETAILS" \\
        --arg cwd "$CWD" \\
        '{requestId: $requestId, payload: {tool: $tool, details: $details, cwd: $cwd}}')

    # Create signature
    local SIGNATURE
    SIGNATURE=$(create_signature "POST" "/api/v2/request" "$BODY" "$TS" "$NONCE" "$PAIRING_SECRET")

    # Send request
    local HTTP_CODE RESPONSE_FILE
    RESPONSE_FILE="/tmp/claude-approve-response-$$.json"

    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$RESPONSE_FILE" \\
        -X POST "\${SERVER_URL}/api/v2/request" \\
        -H "Content-Type: application/json" \\
        -H "X-Pairing-ID: $PAIRING_ID" \\
        -H "X-Timestamp: $TS" \\
        -H "X-Nonce: $NONCE" \\
        -H "Authorization: HMAC-SHA256 $SIGNATURE" \\
        -d "$BODY" \\
        --connect-timeout 5 \\
        --max-time 10)

    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
        rm -f "$RESPONSE_FILE"
        echo "deny|once"
        return 1
    fi

    # Poll for decision
    local TIMEOUT=120
    local START ELAPSED
    START=$(date +%s)

    while true; do
        ELAPSED=$(($(date +%s) - START))
        if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
            rm -f "$RESPONSE_FILE"
            echo "deny|once"
            return 1
        fi

        sleep 1

        # Generate new nonce and timestamp for each poll
        NONCE=$(openssl rand -base64 16 | tr -d '\\n')
        TS=$(date +%s)

        # Sign GET request
        SIGNATURE=$(create_signature "GET" "/api/v2/decision/$REQUEST_ID" "" "$TS" "$NONCE" "$PAIRING_SECRET")

        # Poll for decision
        local DECISION_RESPONSE
        DECISION_RESPONSE=$(curl -s \\
            "\${SERVER_URL}/api/v2/decision/$REQUEST_ID" \\
            -H "X-Pairing-ID: $PAIRING_ID" \\
            -H "X-Timestamp: $TS" \\
            -H "X-Nonce: $NONCE" \\
            -H "Authorization: HMAC-SHA256 $SIGNATURE" \\
            --connect-timeout 5 \\
            --max-time 10)

        local STATUS SCOPE
        STATUS=$(echo "$DECISION_RESPONSE" | jq -r '.data.status // "pending"')
        SCOPE=$(echo "$DECISION_RESPONSE" | jq -r '.data.scope // "once"')

        if [ "$STATUS" = "allowed" ]; then
            rm -f "$RESPONSE_FILE"
            echo "allow|$SCOPE"
            return 0
        elif [ "$STATUS" = "denied" ] || [ "$STATUS" = "expired" ]; then
            rm -f "$RESPONSE_FILE"
            echo "deny|once"
            return 0
        fi
    done
}

# Route to appropriate notification method
DECISION="deny"
SCOPE="once"

if [ "$USE_REMOTE" = true ]; then
    RESULT=$(send_remote_request "$TOOL" "$DETAILS" "$CWD")
    DECISION=$(echo "$RESULT" | cut -d'|' -f1)
    SCOPE=$(echo "$RESULT" | cut -d'|' -f2)

elif [ "$USE_MACOS" = true ]; then
    APPROVAL_SCOPE=$(show_macos_approval "$TOOL" "$DETAILS" "$CWD")
    APPROVAL_EXIT=$?

    if [ $APPROVAL_EXIT -eq 0 ]; then
        DECISION="allow"
        SCOPE="$APPROVAL_SCOPE"
    fi
fi

# Process decision and update session cache
if [ "$DECISION" = "allow" ]; then
    if [ "$SCOPE" = "session-tool" ] || [ "$SCOPE" = "session-all" ]; then
        if [ ! -f "$SESSION_CACHE" ]; then
            jq -n --arg sessionId "$PPID" '{"sessionId": $sessionId, "approvals": {}}' > "$SESSION_CACHE"
        fi

        CURRENT_TS=$(date +%s)
        if [ "$SCOPE" = "session-all" ]; then
            jq --argjson ts "$CURRENT_TS" '.approvals."session-all" = {"approved": true, "timestamp": $ts}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
        elif [ "$SCOPE" = "session-tool" ]; then
            jq --arg tool "$TOOL" --argjson ts "$CURRENT_TS" '.approvals["tool:" + $tool] = {"approved": true, "timestamp": $ts}' "$SESSION_CACHE" > "$SESSION_CACHE.tmp" && mv "$SESSION_CACHE.tmp" "$SESSION_CACHE"
        fi
    fi

    echo "$ALLOW"
else
    echo "$DENY"
fi
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
(Optional: Also create "claude notification approval" for macOS-only dialogs)

## STEP 6: Restart Claude Code
Exit and restart for hook to activate.

---

**Important Notes:**
- Credentials are stored locally in \`~/.claude-approve-hook.sh\` (lines 2-4)
- To view your credentials, ask Claude Code: "Show me the credentials in my approve hook"
- To re-pair: Open the PWA → Settings → "Regenerate Credentials" → Copy new setup prompt
- To disconnect: Open the PWA → Settings → "Unpair Device"

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

async function copyToClipboard(text: string): Promise<boolean> {
  console.log('[copyToClipboard] Text length:', text?.length || 0);
  console.log('[copyToClipboard] First 100 chars:', text?.substring(0, 100));

  if (!text || text.length === 0) {
    console.error('[copyToClipboard] ERROR: Empty text!');
    alert('Error: Setup prompt is empty. Please reload the app.');
    return false;
  }

  // Try modern clipboard API first
  try {
    await navigator.clipboard.writeText(text);
    console.log('[copyToClipboard] Success via navigator.clipboard');
    return true;
  } catch (err) {
    console.warn('[copyToClipboard] navigator.clipboard failed:', err);
  }

  // Fallback for iOS Safari
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.cssText = 'position:fixed;left:-9999px;top:0;';
    textArea.setAttribute('readonly', ''); // Prevent keyboard popup on iOS
    document.body.appendChild(textArea);

    // iOS specific selection
    const range = document.createRange();
    range.selectNodeContents(textArea);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    textArea.setSelectionRange(0, text.length); // For iOS

    const success = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (success) {
      console.log('[copyToClipboard] Success via execCommand fallback');
      return true;
    } else {
      console.error('[copyToClipboard] execCommand returned false');
      alert('Copy failed. Please use the preview below and copy manually.');
      return false;
    }
  } catch (err) {
    console.error('[copyToClipboard] Fallback failed:', err);
    alert('Copy failed. Please use the preview below and copy manually.');
    return false;
  }
}

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  const c = document.getElementById('toast-container'); if (!c) return;
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 3000);
}

function escapeHtml(s: string): string { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

init();
