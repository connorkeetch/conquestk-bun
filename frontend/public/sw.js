// Service Worker for Push Notifications
self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);
  
  if (!event.data) {
    console.log('No data in push notification');
    return;
  }

  let notificationData;
  try {
    notificationData = event.data.json();
  } catch (e) {
    notificationData = {
      title: 'Risk Game',
      body: event.data.text(),
    };
  }

  const options = {
    body: notificationData.body || 'You have a new notification',
    icon: '/icon.svg',
    badge: '/vite.svg',
    vibrate: [100, 50, 100],
    data: {
      gameId: notificationData.gameId,
      url: notificationData.url || '/',
      timestamp: new Date().toISOString(),
    },
    actions: notificationData.actions || [
      {
        action: 'view',
        title: 'View Game',
      },
      {
        action: 'close',
        title: 'Dismiss',
      },
    ],
    tag: notificationData.tag || 'risk-game-notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(
      notificationData.title || 'Risk Game Notification',
      options
    )
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();

  let targetUrl = '/';
  
  if (event.notification.data) {
    if (event.action === 'view' && event.notification.data.gameId) {
      targetUrl = `/game/${event.notification.data.gameId}`;
    } else if (event.notification.data.url) {
      targetUrl = event.notification.data.url;
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open
      for (const client of clientList) {
        if (client.url.includes('localhost:5173') || client.url.includes('conquestk.com')) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // If no window is open, open a new one
      return clients.openWindow(targetUrl);
    })
  );
});

// Background sync for offline notification queue
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

async function syncNotifications() {
  // This will be called when connectivity is restored
  console.log('Syncing offline notifications...');
  // Implementation will be added when we have the backend ready
}