// Service Worker for Claude Code Approver PWA

const CACHE_NAME = 'claude-approver-v4';
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip API requests and non-GET requests
  if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
    return;
  }

  // Skip navigation requests to avoid redirect issues
  if (event.request.mode === 'navigate') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request).then((fetchResponse) => {
        // Don't cache redirects or errors
        if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type === 'opaqueredirect') {
          return fetchResponse;
        }
        return fetchResponse;
      });
    })
  );
});

// Push event - show notification
self.addEventListener('push', (event) => {
  console.log('Push received:', event);

  let data = {
    title: 'Claude needs approval',
    body: 'Action required',
    data: {},
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.data?.requestId || 'claude-request',
    requireInteraction: true,
    data: data.data,
    actions: [
      { action: 'approve', title: 'Approve' },
      { action: 'deny', title: 'Deny' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event - open approve page or handle action
self.addEventListener('notificationclick', (event) => {
  console.log('Notification click:', event);
  event.notification.close();

  const requestId = event.notification.data?.requestId;

  if (event.action === 'approve' || event.action === 'deny') {
    // Quick action from notification
    event.waitUntil(
      handleQuickAction(requestId, event.action === 'approve' ? 'allow' : 'deny')
    );
  } else {
    // Open the main page (pending requests list)
    const url = '/';
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((windowClients) => {
        // Check if there's already a window open
        for (const client of windowClients) {
          if ('focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open a new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

async function handleQuickAction(requestId, decision) {
  if (!requestId) return;

  // Get stored credentials
  const pairingData = await getStoredPairingData();
  if (!pairingData) {
    console.error('No pairing data found');
    return;
  }

  try {
    // This would need the signing logic - for now just open the page
    const url = `/approve.html?id=${requestId}&action=${decision}`;
    const windowClients = await clients.matchAll({ type: 'window' });
    if (windowClients.length > 0) {
      windowClients[0].navigate(url);
      windowClients[0].focus();
    } else if (clients.openWindow) {
      await clients.openWindow(url);
    }
  } catch (error) {
    console.error('Quick action failed:', error);
  }
}

async function getStoredPairingData() {
  // Service workers can access IndexedDB
  return new Promise((resolve) => {
    const request = indexedDB.open('claude-approver', 1);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('pairing')) {
        resolve(null);
        return;
      }
      const tx = db.transaction('pairing', 'readonly');
      const store = tx.objectStore('pairing');
      const getRequest = store.get('current');
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => resolve(null);
    };
  });
}
