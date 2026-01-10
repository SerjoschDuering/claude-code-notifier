// Pairing page logic
import QrScanner from 'qr-scanner';
import { savePairingData, getPairingData } from './storage';
import { getVapidPublicKey, registerPushSubscription } from './api';

let scanner: QrScanner | null = null;

async function init() {
  try {
    // Check if already paired
    const existing = await getPairingData();
    if (existing) {
      if (!confirm('Device is already paired. Do you want to pair a new device?')) {
        window.location.href = '/';
        return;
      }
    }

    // Setup scanner buttons
    const video = document.getElementById('scanner-video') as HTMLVideoElement;
    const startBtn = document.getElementById('start-scan')!;
    const stopBtn = document.getElementById('stop-scan')!;

    startBtn.addEventListener('click', async () => {
      try {
        // Initialize scanner only when needed
        if (!scanner) {
          scanner = new QrScanner(
            video,
            (result) => handleQRResult(result.data),
            {
              highlightScanRegion: true,
              highlightCodeOutline: true,
            }
          );
        }
        await scanner.start();
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
      } catch (error) {
        console.error('Camera error:', error);
        alert('Could not access camera: ' + error);
      }
    });

    stopBtn.addEventListener('click', () => {
      scanner?.stop();
      startBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
    });

  // Manual pairing form
  const form = document.getElementById('manual-pair-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pairingId = (document.getElementById('pairing-id') as HTMLInputElement).value.trim();
    const pairingSecret = (document.getElementById('pairing-secret') as HTMLInputElement).value.trim();

    if (pairingId && pairingSecret) {
      await handlePairing(pairingId, pairingSecret);
    }
  });

  // Retry button
  const retryBtn = document.getElementById('retry-pair')!;
  retryBtn.addEventListener('click', () => {
    showScanSection();
  });
  } catch (error) {
    console.error('Init error:', error);
  }
}

async function handleQRResult(data: string) {
  scanner?.stop();

  try {
    // Expected format: {"pairingId": "...", "pairingSecret": "..."}
    // or URL with params: https://app.example.com/pair?id=...&secret=...
    let pairingId: string;
    let pairingSecret: string;

    if (data.startsWith('{')) {
      const parsed = JSON.parse(data);
      pairingId = parsed.pairingId;
      pairingSecret = parsed.pairingSecret;
    } else if (data.startsWith('http')) {
      const url = new URL(data);
      pairingId = url.searchParams.get('id') || '';
      pairingSecret = url.searchParams.get('secret') || '';
    } else {
      throw new Error('Invalid QR code format');
    }

    if (!pairingId || !pairingSecret) {
      throw new Error('Missing pairing data');
    }

    await handlePairing(pairingId, pairingSecret);
  } catch (error) {
    console.error('QR parse error:', error);
    showError('Invalid QR code. Please try again.');
  }
}

async function handlePairing(pairingId: string, pairingSecret: string) {
  showPairingProgress();

  try {
    // Save pairing data
    await savePairingData({
      pairingId,
      pairingSecret,
      createdAt: Date.now(),
    });

    // Try to setup push notifications
    if ('Notification' in window && 'serviceWorker' in navigator) {
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const vapidPublicKey = await getVapidPublicKey();

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        await registerPushSubscription({ pairingId, pairingSecret }, subscription);
      }
    }

    showSuccess();
  } catch (error) {
    console.error('Pairing error:', error);
    showError('Failed to pair: ' + error);
  }
}

function showScanSection() {
  document.getElementById('scan-section')!.classList.remove('hidden');
  document.getElementById('manual-section')!.classList.remove('hidden');
  document.getElementById('pairing-status')!.classList.add('hidden');
  document.getElementById('pairing-progress')!.classList.remove('hidden');
  document.getElementById('pairing-success')!.classList.add('hidden');
  document.getElementById('pairing-error')!.classList.add('hidden');
}

function showPairingProgress() {
  document.getElementById('scan-section')!.classList.add('hidden');
  document.getElementById('manual-section')!.classList.add('hidden');
  document.getElementById('pairing-status')!.classList.remove('hidden');
  document.getElementById('pairing-progress')!.classList.remove('hidden');
  document.getElementById('pairing-success')!.classList.add('hidden');
  document.getElementById('pairing-error')!.classList.add('hidden');
}

function showSuccess() {
  document.getElementById('pairing-progress')!.classList.add('hidden');
  document.getElementById('pairing-success')!.classList.remove('hidden');
}

function showError(message: string) {
  document.getElementById('pairing-progress')!.classList.add('hidden');
  document.getElementById('pairing-error')!.classList.remove('hidden');
  document.getElementById('error-message')!.textContent = message;
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
