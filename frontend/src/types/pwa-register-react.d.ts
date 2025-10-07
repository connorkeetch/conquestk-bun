declare module 'virtual:pwa-register/react' {
  export function useRegisterSW(_options?: {
    onRegistered?: (reg?: ServiceWorkerRegistration) => void
  }): {
    offlineReady: boolean
    needRefresh: boolean
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  }
}
