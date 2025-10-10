declare module 'virtual:pwa-register/react' {
  export interface RegisterSWOptions {
    immediate?: boolean
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (error: Error) => void
    onNeedRefresh?: () => void
    onOfflineReady?: () => void
  }
  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [boolean, (v: boolean) => void]
    offlineReady: [boolean, (v: boolean) => void]
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  }
}
