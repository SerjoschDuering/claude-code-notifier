// Main page logic
import { getPairingData, clearPairingData } from './storage';
import { getVapidPublicKey, registerPushSubscription } from './api';

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
  const statusDot = document.querySelector('.status-dot') as HTMLElement;
  const statusText = document.querySelector('.status-text') as HTMLElement;
  const notPairedSection = document.getElementById('not-paired')!;
  const pairedSection = document.getElementById('paired')!;
  const pushSection = document.getElementById('push-permission')!;
  const pairingIdDisplay = document.getElementById('pairing-id-display')!;

  if (!pairingData) {
    // Not paired
    statusDot.classList.remove('connected');
    statusText.textContent = 'Not paired';
    notPairedSection.classList.remove('hidden');
    return;
  }

  // Paired
  statusDot.classList.add('connected');
  statusText.textContent = 'Connected';
  pairedSection.classList.remove('hidden');
  pairingIdDisplay.textContent = pairingData.pairingId.slice(0, 8) + '...';

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
