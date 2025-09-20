self.addEventListener('install', (_event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) {
    return
  }

  let notificationData
  try {
    notificationData = event.data.json()
  } catch (_e) {
    notificationData = {
      title: 'Risk Game',
      body: event.data.text(),
    }
  }

  const payloadData =
    typeof notificationData.data === 'object' && notificationData.data !== null
      ? notificationData.data
      : {}
  const targetUrl = notificationData.url || payloadData.url || '/'
  const mergedData = {
    ...payloadData,
    gameId: notificationData.gameId ?? payloadData.gameId,
    url: targetUrl,
    timestamp: new Date().toISOString(),
  }

  const options = {
    body: notificationData.body || 'You have a new notification',
    icon: notificationData.icon || '/icon-192.png',
    badge: notificationData.badge || '/icon-192.png',
    vibrate: notificationData.vibrate || [100, 50, 100],
    data: mergedData,
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
    renotify: notificationData.renotify ?? true,
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title || 'Risk Game Notification', options),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}

  let destination = '/'
  if (event.action === 'view' && data.gameId) {
    destination = `/game/${data.gameId}`
  } else if (typeof data.url === 'string' && data.url.length > 0) {
    destination = data.url
  }

  let targetHref
  try {
    targetHref = new URL(destination, self.location.origin).href
  } catch (_error) {
    targetHref = self.location.origin
  }

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      const targetOrigin = new URL(targetHref).origin

      for (const client of allClients) {
        try {
          const clientOrigin = new URL(client.url).origin
          if (clientOrigin === targetOrigin) {
            await client.focus()
            if ('navigate' in client && client.url !== targetHref) {
              try {
                await client.navigate(targetHref)
              } catch (_navigateError) {
                // ignore navigate errors and fall back to openWindow
              }
            }
            return
          }
        } catch (_urlError) {
          // ignore invalid client URLs
        }
      }

      await clients.openWindow(targetHref)
    })(),
  )
})
