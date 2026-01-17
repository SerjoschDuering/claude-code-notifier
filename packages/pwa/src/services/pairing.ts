// Pairing and push notification services

import { initPairing, getVapidPublicKey, registerPushSubscription } from '../api';
import { StoredPairingData } from '../storage';
import { showToast, urlBase64ToUint8Array } from '../utils';

/**
 * Generate new pairing credentials via server
 * Returns null if server registration fails (no silent fallback)
 */
export async function generateCredentials(): Promise<StoredPairingData | null> {
  try {
    const result = await initPairing();

    if (!result.success || !result.data) {
      console.error('[generateCredentials] Server registration failed:', result.error);
      showToast('Failed to connect to server. Check your internet connection.', 'error');
      return null;
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

/**
 * Enable push notifications for this device
 */
export async function enablePushNotifications(pairingData: StoredPairingData): Promise<boolean> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Permission denied', 'error');
      return false;
    }

    const reg = await navigator.serviceWorker.ready;
    const vapid = await getVapidPublicKey();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid)
    });

    const result = await registerPushSubscription(pairingData, sub);
    if (result.success) {
      showToast('Notifications enabled', 'success');
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

/**
 * Update pairing UI to show success state with ID
 */
export function updatePairingUI(pairingData: StoredPairingData): void {
  const statusEl = document.getElementById('pairing-status');
  const icon = statusEl?.querySelector('.status-icon');
  const text = statusEl?.querySelector('.status-text');
  if (icon) icon.textContent = '\u2705';
  if (text) text.textContent = 'Paired successfully!';
  statusEl?.classList.add('success');

  // Show pairing ID
  const idDisplay = document.getElementById('pairing-id-display');
  const idCode = document.getElementById('pairing-id-code');
  if (idDisplay && idCode) {
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
  if (btnIcon) btnIcon.textContent = '\u2705';
  if (pairBtn) (pairBtn as HTMLButtonElement).disabled = true;
}
