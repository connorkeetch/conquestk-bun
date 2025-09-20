import { API_URL } from '../config'

interface SubscriptionChangeResult {
  success: boolean
  message?: string
}

class PushNotificationService {
  private registration: ServiceWorkerRegistration | null = null
  private subscription: PushSubscription | null = null
  private backendEnabled = false
  private remotePublicKey: string | null = null
  private lastError: string | null = null

  async initialize(): Promise<boolean> {
    this.lastError = null

    try {
      if (
        !('Notification' in window) ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        this.backendEnabled = false
        this.lastError = 'Push notifications are not supported in this browser'
        return false
      }

      await this.loadBackendConfiguration()

      this.registration = await navigator.serviceWorker.ready
      this.subscription = await this.registration.pushManager.getSubscription()

      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to initialize push notifications'
      // biome-ignore lint/suspicious/noConsole: surface initialization errors during development
      console.error('Push notification initialization failed', error)
      this.lastError = message
      return false
    }
  }

  isEnabled(): boolean {
    return Notification.permission === 'granted' && this.subscription !== null
  }

  isBackendEnabled(): boolean {
    return this.backendEnabled
  }

  getPermissionStatus(): NotificationPermission {
    return Notification.permission
  }

  getLastError(): string | null {
    return this.lastError
  }

  async subscribe(): Promise<SubscriptionChangeResult> {
    try {
      if (!this.registration) {
        const supported = await this.initialize()
        if (!supported) {
          return {
            success: false,
            message: this.lastError || 'Push notifications are not supported on this device',
          }
        }
      }

      if (!this.backendEnabled) {
        await this.loadBackendConfiguration()
      }

      if (!this.backendEnabled) {
        const message = 'Push notifications are currently disabled by the server'
        // biome-ignore lint/suspicious/noConsole: communicate backend availability changes during development
        console.warn(message)
        this.lastError = message
        return { success: false, message }
      }

      if (!this.registration) {
        const message = 'Service worker registration is not ready yet'
        this.lastError = message
        return { success: false, message }
      }

      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          const message = 'Notification permission was not granted'
          this.lastError = message
          return { success: false, message }
        }
      }

      const existingSubscription = await this.registration.pushManager.getSubscription()
      if (existingSubscription) {
        this.subscription = existingSubscription
        await this.sendSubscriptionToServer(existingSubscription)
        return { success: true }
      }

      const vapidKey = await this.resolveVapidKey()
      if (!vapidKey) {
        const message = 'Missing VAPID public key for push notifications'
        this.lastError = message
        return { success: false, message }
      }

      const convertedVapidKey = this.urlBase64ToUint8Array(vapidKey)
      const newSubscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      })

      this.subscription = newSubscription
      await this.sendSubscriptionToServer(newSubscription)

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enable push notifications'
      // biome-ignore lint/suspicious/noConsole: surface subscription failures for troubleshooting
      console.error('Error subscribing to push notifications', error)
      this.lastError = message
      return { success: false, message }
    }
  }

  async unsubscribe(): Promise<SubscriptionChangeResult> {
    try {
      if (!this.registration) {
        await this.initialize()
      }

      const currentSubscription =
        this.subscription || (await this.registration?.pushManager.getSubscription())

      if (!currentSubscription) {
        return { success: false, message: 'No push subscription to unsubscribe' }
      }

      const subscriptionPayload = currentSubscription.toJSON()
      await this.removeSubscriptionFromServer(subscriptionPayload)
      await currentSubscription.unsubscribe()

      this.subscription = null
      return { success: true }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to disable push notifications'
      // biome-ignore lint/suspicious/noConsole: surface unsubscribe failures for troubleshooting
      console.error('Error unsubscribing from push notifications', error)
      this.lastError = message
      return { success: false, message }
    }
  }

  async testNotification(): Promise<void> {
    if (Notification.permission !== 'granted') {
      return
    }

    const notification = new Notification('Risk Game Test', {
      body: 'This is a test notification!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
      tag: 'test-notification',
    })

    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  }

  private async loadBackendConfiguration(): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/notifications/vapid-public-key`)
      if (!response.ok) {
        throw new Error(`Failed to load push configuration (${response.status})`)
      }

      const data: { publicKey?: string; enabled?: boolean } = await response.json()
      this.backendEnabled = data.enabled ?? false

      if (data.publicKey) {
        this.remotePublicKey = data.publicKey
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to fetch push notification configuration'
      // biome-ignore lint/suspicious/noConsole: expose configuration load failures to developers
      console.error('Failed to load push notification configuration', error)
      this.backendEnabled = false
      this.lastError = message
    }
  }

  private async resolveVapidKey(): Promise<string | null> {
    if (import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      return import.meta.env.VITE_VAPID_PUBLIC_KEY
    }

    if (!this.remotePublicKey) {
      await this.loadBackendConfiguration()
    }

    return this.remotePublicKey
  }

  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    const token = localStorage.getItem('token')
    if (!token) {
      throw new Error('No authentication token available')
    }

    const response = await fetch(`${API_URL}/notifications/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
      }),
    })

    if (!response.ok) {
      const errorBody = await this.parseErrorResponse(response)
      throw new Error(errorBody || 'Failed to register push subscription')
    }
  }

  private async removeSubscriptionFromServer(subscription: PushSubscriptionJSON): Promise<void> {
    const token = localStorage.getItem('token')
    if (!token) {
      throw new Error('No authentication token available')
    }

    const response = await fetch(`${API_URL}/notifications/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription }),
    })

    if (!response.ok && response.status !== 404) {
      const errorBody = await this.parseErrorResponse(response)
      throw new Error(errorBody || 'Failed to unregister push subscription')
    }
  }

  private async parseErrorResponse(response: Response): Promise<string | undefined> {
    try {
      const data = await response.json()
      if (data.error) return data.error
      if (data.message) return data.message
      return undefined
    } catch (_error) {
      return response.statusText
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }
}

export const pushNotificationService = new PushNotificationService()
export default pushNotificationService
