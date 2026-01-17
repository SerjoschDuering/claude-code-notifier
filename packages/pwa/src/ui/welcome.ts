// Welcome screen and Add to Home Screen flow

import { getPairingData, savePairingData, StoredPairingData } from '../storage';
import { generateCredentials } from '../services/pairing';

/**
 * Show the welcome modal
 */
export function showWelcome(): void {
  const modal = document.getElementById('welcome-modal');
  if (modal) {
    modal.classList.remove('hidden', 'hiding');
  }
}

/**
 * Hide the welcome modal with animation
 */
export async function hideWelcome(): Promise<void> {
  const modal = document.getElementById('welcome-modal');
  if (modal) {
    modal.classList.add('hiding');
    await new Promise(resolve => setTimeout(resolve, 300));
    modal.classList.add('hidden');
  }
}

/**
 * Setup welcome flow with button handlers
 * @param isStandalone - Whether running as installed PWA
 * @param onShowOnboarding - Callback to show onboarding (avoids circular import)
 * @param onShowAddToHome - Callback when Add to Home should be shown
 */
export function setupWelcomeFlow(
  isStandalone: boolean,
  onShowOnboarding: (pairingData: StoredPairingData | null) => void,
  onShowAddToHome: () => void
): void {
  document.getElementById('welcome-start')?.addEventListener('click', async () => {
    await hideWelcome();

    if (isStandalone) {
      // Running from homescreen - go to onboarding
      const existingData = await getPairingData();
      onShowOnboarding(existingData);
    } else {
      // In browser - show Add to Home Screen instructions
      onShowAddToHome();
    }
  });
}

/**
 * Show Add to Home Screen instructions
 * @param onContinue - Callback when user skips PWA install and continues to onboarding
 */
export function showAddToHomeScreen(
  onContinue: (pairingData: StoredPairingData) => void
): void {
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
        <div class="aths-step"><span class="step-num">1</span><span class="step-text">Tap <strong>Share</strong> \u2B06\uFE0F at bottom</span></div>
        <div class="aths-step"><span class="step-num">2</span><span class="step-text">Scroll right \u2192 tap <strong>More</strong></span></div>
        <div class="aths-step"><span class="step-num">3</span><span class="step-text">Tap <strong>Add to Home Screen</strong></span></div>
        <div class="aths-step"><span class="step-num">4</span><span class="step-text">Tap <strong>Add</strong> \u2192 Open from home</span></div>
      `;
    } else {
      instructionsEl.innerHTML = `
        <div class="aths-step"><span class="step-num">1</span><span class="step-text">Tap menu <strong>\u22EE</strong> (3 dots)</span></div>
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
    onContinue(pairingData);
  });
}
