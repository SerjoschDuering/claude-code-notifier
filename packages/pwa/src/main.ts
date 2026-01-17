// Main PWA entry point - App orchestrator

import { NavigatorStandalone } from './types';
import { getPairingData } from './storage';
import { showWelcome, setupWelcomeFlow, showAddToHomeScreen } from './ui/welcome';
import { showOnboarding } from './ui/onboarding';
import { showDashboard } from './ui/dashboard';
import { setupSettingsDrawer } from './ui/settings';

/**
 * Initialize the PWA
 */
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

  // ROUTING LOGIC:
  // - If paired AND onboarding complete AND standalone → Dashboard
  // - If NOT standalone (browser) → Welcome → Add to Home instructions
  // - If standalone AND not paired → Welcome → Onboarding
  // - If paired AND standalone BUT onboarding incomplete → Continue Onboarding

  if (isPaired && onboardingComplete && isStandalone) {
    // Fully set up and running from homescreen → Dashboard
    showDashboard(pairingData);
    setupSettingsDrawer(pairingData);
    return;
  }

  if (!isStandalone) {
    // In browser - show welcome with add-to-home instructions
    showWelcome();
    setupWelcomeFlow(
      false,
      // onShowOnboarding callback (won't be called in browser mode)
      (data) => {
        if (data) {
          showOnboarding(data, (freshData) => {
            showDashboard(freshData);
            setupSettingsDrawer(freshData);
          }, (updatedData) => {
            setupSettingsDrawer(updatedData);
          });
          setupSettingsDrawer(data);
        }
      },
      // onShowAddToHome callback
      () => {
        showAddToHomeScreen((data) => {
          showOnboarding(data, (freshData) => {
            showDashboard(freshData);
            setupSettingsDrawer(freshData);
          }, (updatedData) => {
            setupSettingsDrawer(updatedData);
          });
          setupSettingsDrawer(data);
        });
      }
    );
    return;
  }

  // Running from homescreen (standalone)
  if (!isPaired) {
    // First time in PWA - show welcome, then generate creds
    showWelcome();
    setupWelcomeFlow(
      true,
      // onShowOnboarding callback
      (data) => {
        showOnboarding(data, (freshData) => {
          showDashboard(freshData);
          setupSettingsDrawer(freshData);
        }, (updatedData) => {
          setupSettingsDrawer(updatedData);
        });
        if (data) setupSettingsDrawer(data);
      },
      // onShowAddToHome callback (won't be called in standalone mode)
      () => {}
    );
    return;
  }

  // Paired but onboarding not complete - continue onboarding
  showOnboarding(pairingData, (freshData) => {
    showDashboard(freshData);
    setupSettingsDrawer(freshData);
  }, (updatedData) => {
    setupSettingsDrawer(updatedData);
  });
  setupSettingsDrawer(pairingData);
}

// Start the app
init();
