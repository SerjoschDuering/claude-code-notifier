// Main page logic
import { getPairingData, clearPairingData } from './storage';
import { getVapidPublicKey, registerPushSubscription, getPendingRequests, submitDecision } from './api';

async function init() {
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
    // Not paired
    notPairedSection.classList.remove('hidden');
    return;
  }

  // Paired - show paired view and settings button
  const settingsBtn = document.getElementById('settings-btn')!;
  const settingsModal = document.getElementById('settings-modal')!;
  const closeSettings = document.getElementById('close-settings')!;
  const modalBackdrop = settingsModal.querySelector('.modal-backdrop')!;

  statusDot.classList.add('connected');
  statusText.textContent = 'Connected';
  pairedView.classList.remove('hidden');
  settingsBtn.classList.remove('hidden');
  pairingIdDisplay.textContent = pairingData.pairingId.slice(0, 8) + '...';

  // Settings modal handlers
  settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
  modalBackdrop.addEventListener('click', () => settingsModal.classList.add('hidden'));

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

init();
