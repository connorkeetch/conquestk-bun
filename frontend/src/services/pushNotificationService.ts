// Push Notification Service
import { API_URL } from '../config';

class PushNotificationService {
  private registration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;

  // Initialize the service
  async initialize(): Promise<boolean> {
    try {
      // Check if browser supports notifications
      if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return false;
      }

      if (!('serviceWorker' in navigator)) {
        console.log('Service Workers are not supported');
        return false;
      }

      if (!('PushManager' in window)) {
        console.log('Push notifications are not supported');
        return false;
      }

      // Get service worker registration
      this.registration = await navigator.serviceWorker.ready;
      
      // Check current subscription
      this.subscription = await this.registration.pushManager.getSubscription();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
      return false;
    }
  }

  // Request permission for notifications
  async requestPermission(): Promise<NotificationPermission> {
    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
    return permission;
  }

  // Check if notifications are enabled
  isEnabled(): boolean {
    return Notification.permission === 'granted' && this.subscription !== null;
  }

  // Get current permission status
  getPermissionStatus(): NotificationPermission {
    return Notification.permission;
  }

  // Subscribe to push notifications
  async subscribe(): Promise<boolean> {
    try {
      // First ensure we have permission
      if (Notification.permission !== 'granted') {
        const permission = await this.requestPermission();
        if (permission !== 'granted') {
          console.log('Notification permission denied');
          return false;
        }
      }

      if (!this.registration) {
        await this.initialize();
      }

      if (!this.registration) {
        console.error('No service worker registration available');
        return false;
      }

      // Get public VAPID key from server
      const response = await fetch(`${API_URL}/notifications/vapid-public-key`);
      const { publicKey } = await response.json();

      // Convert the public key to Uint8Array
      const convertedVapidKey = this.urlBase64ToUint8Array(publicKey);

      // Subscribe to push notifications
      this.subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });

      // Send subscription to backend
      await this.sendSubscriptionToServer(this.subscription);

      console.log('Successfully subscribed to push notifications');
      return true;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      return false;
    }
  }

  // Unsubscribe from push notifications
  async unsubscribe(): Promise<boolean> {
    try {
      if (!this.subscription) {
        console.log('No subscription to unsubscribe from');
        return false;
      }

      // Unsubscribe from push manager
      await this.subscription.unsubscribe();

      // Remove subscription from backend
      await this.removeSubscriptionFromServer();

      this.subscription = null;
      console.log('Successfully unsubscribed from push notifications');
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
      return false;
    }
  }

  // Send subscription to backend
  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token available');
    }

    await fetch(`${API_URL}/notifications/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
      }),
    });
  }

  // Remove subscription from backend
  private async removeSubscriptionFromServer(): Promise<void> {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token available');
    }

    await fetch(`${API_URL}/notifications/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  // Test notification (local only, doesn't go through push service)
  async testNotification(): Promise<void> {
    if (Notification.permission !== 'granted') {
      console.log('Notifications not permitted');
      return;
    }

    const notification = new Notification('Risk Game Test', {
      body: 'This is a test notification!',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      vibrate: [100, 50, 100],
      tag: 'test-notification',
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }

  // Utility function to convert VAPID key
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
export default pushNotificationService;