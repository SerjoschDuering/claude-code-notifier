// Onboarding wizard - Steps 0-3

import { StoredPairingData, savePairingData } from '../storage';
import { generateCredentials, enablePushNotifications, updatePairingUI } from '../services/pairing';
import { buildSetupPrompt } from '../services/script-gen';
import { sendTestNotification } from '../api';
import { copyToClipboard, showToast } from '../utils';
import { NavigatorStandalone } from '../types';

/**
 * Show the onboarding screen
 * @param pairingData - Existing pairing data (null if not yet paired)
 * @param onComplete - Callback when onboarding completes (to show dashboard)
 * @param onPairingUpdate - Callback when pairing data changes (to update settings drawer)
 */
export function showOnboarding(
  pairingData: StoredPairingData | null,
  onComplete: (data: StoredPairingData) => void,
  onPairingUpdate?: (data: StoredPairingData) => void
): void {
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

  setupWizardNavigation(pairingData, onComplete, onPairingUpdate);
  updatePWAStatus();
}

/**
 * Update PWA status indicator
 */
export function updatePWAStatus(): void {
  const pwaCheck = document.getElementById('pwa-check');
  const pwaIcon = document.getElementById('pwa-icon');
  const pwaText = document.getElementById('pwa-text');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       (window.navigator as NavigatorStandalone).standalone === true;

  if (isStandalone) {
    pwaCheck?.classList.add('success');
    if (pwaIcon) pwaIcon.textContent = '\u2713';
    if (pwaText) pwaText.textContent = 'Added! Ready for notifications';
  }
}

/**
 * Setup wizard step navigation and handlers
 */
export function setupWizardNavigation(
  initialPairingData: StoredPairingData | null,
  onComplete: (data: StoredPairingData) => void,
  onPairingUpdate?: (data: StoredPairingData) => void
): void {
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

  // Step 0: Pair Device
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
    if (icon) icon.textContent = '\u23F3';
    if (text) text.textContent = 'Connecting to server...';
    if (btnText) btnText.textContent = 'Pairing...';
    (pairBtn as HTMLButtonElement).disabled = true;

    try {
      const newPairingData = await generateCredentials();
      if (newPairingData) {
        await savePairingData(newPairingData);
        pairingData = newPairingData;
        updatePairingUI(newPairingData);

        // Pre-populate setup prompt for Step 3
        const setupPrompt = buildSetupPrompt(newPairingData);
        const promptCode = document.getElementById('prompt-code');
        if (promptCode) promptCode.textContent = setupPrompt;

        // Setup copy button for Step 3
        setupCopyButton(setupPrompt);

        // Notify parent to update settings drawer
        if (onPairingUpdate) onPairingUpdate(newPairingData);

        showToast('Device paired successfully!', 'success');
      } else {
        // Failed - reset button
        if (icon) icon.textContent = '\u274C';
        if (text) text.textContent = 'Pairing failed - tap to retry';
        if (btnText) btnText.textContent = 'Retry Pairing';
        (pairBtn as HTMLButtonElement).disabled = false;
      }
    } catch (error) {
      if (icon) icon.textContent = '\u274C';
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
      showToast('Pairing ID copied', 'success');
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
      if (icon) icon.textContent = '\u2705';
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

    if (icon) icon.textContent = '\u23F3';
    if (text) text.textContent = 'Sending...';

    try {
      const result = await sendTestNotification(pairingData);
      if (result.success) {
        if (icon) icon.textContent = '\u2705';
        if (text) text.textContent = 'Test sent! Check your notification.';
        testStatus?.classList.add('success');
        nextStep2Btn.disabled = false;
        showToast('Test notification sent!', 'success');
      } else {
        if (icon) icon.textContent = '\u274C';
        if (text) text.textContent = 'Failed: ' + (result.error || 'Unknown error');
        showToast('Test failed: ' + result.error, 'error');
      }
    } catch (error) {
      if (icon) icon.textContent = '\u274C';
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
    onComplete(pairingData);
  });

  // Check if notifications already enabled (e.g., returning user)
  if ('Notification' in window && Notification.permission === 'granted') {
    const statusEl = document.getElementById('notification-status');
    const icon = statusEl?.querySelector('.status-icon');
    const text = statusEl?.querySelector('.status-text');
    if (icon) icon.textContent = '\u2705';
    if (text) text.textContent = 'Notifications already enabled!';
    statusEl?.classList.add('success');
    nextStep1Btn.disabled = false;
  }

  // If already paired, also setup copy button
  if (pairingData) {
    const setupPrompt = buildSetupPrompt(pairingData);
    setupCopyButton(setupPrompt);
  }
}

/**
 * Setup copy button handler
 */
function setupCopyButton(setupPrompt: string): void {
  const copyBtn = document.getElementById('copy-prompt-btn');
  copyBtn?.addEventListener('click', async () => {
    await copyToClipboard(setupPrompt);
    showToast('Copied to clipboard', 'success');
    const copyBtnText = copyBtn.querySelector('.btn-text');
    if (copyBtnText) {
      copyBtnText.textContent = 'Copied!';
      setTimeout(() => { copyBtnText.textContent = 'Copy to Clipboard'; }, 2000);
    }
  });
}
