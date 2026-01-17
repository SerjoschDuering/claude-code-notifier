// Dashboard - Request list, approvals, countdown timer

import { getPendingRequests, submitDecision } from '../api';
import { StoredPairingData } from '../storage';
import { showToast, escapeHtml } from '../utils';
import { enablePushNotifications } from '../services/pairing';

// Module-level state for countdown timer
let countdownInterval: number | null = null;

/**
 * Show the dashboard screen and start polling for requests
 */
export function showDashboard(pairingData: StoredPairingData): void {
  document.getElementById('onboarding')?.classList.add('hidden');
  document.getElementById('dashboard')?.classList.remove('hidden');
  document.getElementById('connection-dot')?.classList.add('connected');

  // Show push banner if notifications not enabled
  if ('Notification' in window && Notification.permission !== 'granted') {
    const pushBanner = document.getElementById('push-banner');
    pushBanner?.classList.remove('hidden');
    document.getElementById('banner-enable-push')?.addEventListener('click', async () => {
      await enablePushNotifications(pairingData);
      pushBanner?.classList.add('hidden');
    });
  }

  // Initial load and setup polling
  loadPendingRequests(pairingData);
  document.getElementById('refresh-btn')?.addEventListener('click', () => loadPendingRequests(pairingData));
  setInterval(() => loadPendingRequests(pairingData), 5000);
}

/**
 * Load and render pending approval requests
 */
export async function loadPendingRequests(pairingData: StoredPairingData): Promise<void> {
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
        return `<div class="request-card expired" data-request-id="${escapeHtml(req.requestId)}">
          <div class="request-meta"><span class="tool-badge expired">EXPIRED</span></div>
          <div class="expired-message">Timed out</div>
          <div class="request-buttons"><button class="btn-dismiss">Dismiss</button></div>
        </div>`;
      }

      return `<div class="request-card" data-request-id="${escapeHtml(req.requestId)}" data-expires="${expiresAt}">
        <div class="request-meta">
          <span class="tool-badge">${escapeHtml(req.payload.tool)}</span>
          <span class="expires-countdown" data-expires="${expiresAt}">${remainingSecs}s</span>
        </div>
        ${req.payload.command ? `<div class="request-command"><label>Command</label><pre>${escapeHtml(req.payload.command)}</pre></div>` : ''}
        ${req.payload.details ? `<div class="request-details"><label>Details</label><p>${escapeHtml(req.payload.details)}</p></div>` : ''}
        <div class="request-buttons">
          <button class="btn-deny" data-request-id="${escapeHtml(req.requestId)}"><span>✕</span> Deny</button>
          <button class="btn-approve-once" data-request-id="${escapeHtml(req.requestId)}"><span>✓</span> Approve</button>
          <button class="btn-approve-tool" data-request-id="${escapeHtml(req.requestId)}"><span>⚡</span> All ${escapeHtml(req.payload.tool)}</button>
          <button class="btn-approve-all" data-request-id="${escapeHtml(req.requestId)}"><span>⚡⚡</span> Session</button>
        </div>
      </div>`;
    }).join('');

    setupRequestButtons(pairingData);
    startCountdownTimer();
  } catch (error) {
    requestsList.innerHTML = '<div class="empty-state"><span class="empty-icon">⚠️</span><p class="empty-text">Error</p></div>';
  }
}

/**
 * Setup event handlers for request action buttons
 */
export function setupRequestButtons(pairingData: StoredPairingData): void {
  const list = document.getElementById('requests-list')!;

  list.querySelectorAll('.btn-approve-once').forEach(btn =>
    btn.addEventListener('click', e => {
      const id = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id');
      if (id) handleDecision(pairingData, id, 'allow', 'once');
    })
  );

  list.querySelectorAll('.btn-approve-tool').forEach(btn =>
    btn.addEventListener('click', e => {
      const id = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id');
      if (id) handleDecision(pairingData, id, 'allow', 'session-tool');
    })
  );

  list.querySelectorAll('.btn-approve-all').forEach(btn =>
    btn.addEventListener('click', e => {
      const id = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id');
      if (id) handleDecision(pairingData, id, 'allow', 'session-all');
    })
  );

  list.querySelectorAll('.btn-deny').forEach(btn =>
    btn.addEventListener('click', e => {
      const id = (e.target as HTMLElement).closest('[data-request-id]')?.getAttribute('data-request-id');
      if (id) handleDecision(pairingData, id, 'deny', 'once');
    })
  );

  list.querySelectorAll('.btn-dismiss').forEach(btn =>
    btn.addEventListener('click', e => {
      const card = (e.target as HTMLElement).closest('.request-card');
      card?.classList.add('denying');
      setTimeout(() => card?.remove(), 300);
    })
  );
}

/**
 * Handle approve/deny decision submission
 */
export async function handleDecision(
  pairingData: StoredPairingData,
  requestId: string,
  decision: 'allow' | 'deny',
  scope?: 'once' | 'session-tool' | 'session-all'
): Promise<void> {
  const card = document.querySelector(`[data-request-id="${requestId}"]`) as HTMLElement;
  card?.querySelectorAll('button').forEach(btn => (btn as HTMLButtonElement).disabled = true);

  try {
    const result = await submitDecision(pairingData, requestId, decision, scope);

    if (result.success) {
      card?.classList.add(decision === 'allow' ? 'approving' : 'denying');
      setTimeout(() => card?.remove(), 300);
      showToast(decision === 'allow' ? 'Approved' : 'Denied', decision === 'allow' ? 'success' : 'error');
    } else {
      showToast('Failed: ' + result.error, 'error');
      card?.querySelectorAll('button').forEach(btn => (btn as HTMLButtonElement).disabled = false);
    }
  } catch (error) {
    showToast('Error', 'error');
    card?.querySelectorAll('button').forEach(btn => (btn as HTMLButtonElement).disabled = false);
  }
}

/**
 * Start countdown timer that updates every second
 */
export function startCountdownTimer(): void {
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
