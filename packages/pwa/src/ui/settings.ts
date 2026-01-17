// Settings drawer functionality

import { StoredPairingData, savePairingData, clearPairingData } from '../storage';
import { buildSetupPrompt } from '../services/script-gen';
import { generateCredentials } from '../services/pairing';
import { copyToClipboard, showToast } from '../utils';

/**
 * Setup the settings drawer with all button handlers
 */
export function setupSettingsDrawer(pairingData: StoredPairingData): void {
  const drawer = document.getElementById('settings-drawer')!;

  // Open/close handlers
  document.getElementById('settings-trigger')?.addEventListener('click', () => {
    drawer.classList.remove('hidden');
  });

  document.getElementById('close-drawer')?.addEventListener('click', () => {
    drawer.classList.add('hidden');
  });

  drawer.querySelector('.drawer-backdrop')?.addEventListener('click', () => {
    drawer.classList.add('hidden');
  });

  // Display pairing ID
  const idEl = document.getElementById('settings-pairing-id');
  if (idEl) idEl.textContent = pairingData.pairingId.slice(0, 12) + '...';

  // Test notification button
  document.getElementById('test-notification-btn')?.addEventListener('click', () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Test', { body: 'Notifications work!', icon: '/icon-192.png' });
      showToast('Sent', 'success');
    } else {
      showToast('Enable notifications first', 'error');
    }
  });

  // Copy setup prompt button
  document.getElementById('copy-prompt-settings')?.addEventListener('click', async () => {
    console.log('[Settings] Copy button clicked');
    const prompt = buildSetupPrompt(pairingData);
    console.log('[Settings] Prompt length:', prompt?.length || 0);
    const success = await copyToClipboard(prompt);
    showToast(success ? 'Copied' : 'Copy failed', success ? 'success' : 'error');
  });

  // Regenerate credentials button
  document.getElementById('regenerate-btn')?.addEventListener('click', async () => {
    if (confirm('Regenerate credentials?\n\nThis will create new pairing credentials. You will need to copy the new setup prompt to Claude Code to re-pair.')) {
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
        showToast('New credentials generated & copied!', 'success');
        document.getElementById('settings-drawer')?.classList.add('hidden');
      } else {
        showToast('Generated but copy failed - use Copy Setup Prompt', 'error');
      }
    }
  });

  // Unpair device button
  document.getElementById('unpair-btn')?.addEventListener('click', async () => {
    if (confirm('Unpair device?\n\nThis will delete all credentials and reset the app. You will need to set up again from scratch.')) {
      await clearPairingData();
      localStorage.removeItem('onboarding-complete');
      localStorage.removeItem('welcome-seen');
      location.reload();
    }
  });
}
