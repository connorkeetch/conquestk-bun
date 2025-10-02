import { type ComponentType, type LazyExoticComponent, lazy } from 'react'

// Use ComponentType<any> for factory compatibility across pages with props
// biome-ignore lint/suspicious/noExplicitAny: generic wrapper mirrors React.lazy typing
type ModuleFactory<T extends ComponentType<any>> = () => Promise<{ default: T }>

type LazyWithRetryOptions = {
  retries?: number
  retryDelayMs?: number
}

const chunkErrorSignatures = [
  'ChunkLoadError',
  'Loading chunk',
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
]

const reloadMarkerKey = '__lazyWithRetry:lastReload'

const markReloadAttempt = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return
  }
  try {
    window.sessionStorage.setItem(reloadMarkerKey, String(Date.now()))
  } catch {
    // Ignore storage quota/security errors – reload fallback still proceeds
  }
}

const hasRecentReloadAttempt = (thresholdMs = 60_000) => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return false
  }
  try {
    const raw = window.sessionStorage.getItem(reloadMarkerKey)
    if (!raw) {
      return false
    }
    const timestamp = Number.parseInt(raw, 10)
    if (!Number.isFinite(timestamp)) {
      return false
    }
    return Date.now() - timestamp < thresholdMs
  } catch {
    return false
  }
}

const clearReloadMarker = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return
  }
  try {
    window.sessionStorage.removeItem(reloadMarkerKey)
  } catch {
    // Ignore storage access issues
  }
}

const unregisterServiceWorkers = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(
      registrations.map(async (registration) => {
        try {
          await registration.unregister()
        } catch {
          // Ignore unregister failures and continue best-effort cleanup
        }
      }),
    )
  } catch {
    // Ignore service worker lookup failures (e.g., unsupported environments)
  }
}

const clearCaches = async () => {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return
  }
  try {
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames.map(async (cacheName) => {
        try {
          await caches.delete(cacheName)
        } catch {
          // Ignore cache deletion failures; we still attempt a reload afterwards
        }
      }),
    )
  } catch {
    // Ignore cache API failures silently
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isChunkLoadError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  return chunkErrorSignatures.some((signature) => error.message.includes(signature))
}

// biome-ignore lint/suspicious/noExplicitAny: generic wrapper mirrors React.lazy typing
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: ModuleFactory<T>,
  options: LazyWithRetryOptions = {},
): LazyExoticComponent<T> {
  const { retries = 1, retryDelayMs = 300 } = options

  const attemptImport = async (attempt = 0): Promise<{ default: T }> => {
    try {
      const module = await factory()
      clearReloadMarker()
      return module
    } catch (error) {
      if (isChunkLoadError(error)) {
        if (attempt < retries) {
          await sleep(retryDelayMs)
          return attemptImport(attempt + 1)
        }

        if (typeof window !== 'undefined') {
          if (!hasRecentReloadAttempt()) {
            markReloadAttempt()
            await Promise.all([clearCaches(), unregisterServiceWorkers()])
            window.location.reload()
          } else {
            const informativeError = new Error(
              'Failed to load critical resources even after a hard refresh. Please clear your cache or try again later.',
            )
            informativeError.name = 'ChunkReloadFailed'
            ;(informativeError as Error & { cause?: unknown }).cause = error
            throw informativeError
          }
        }
      }

      throw error
    }
  }

  return lazy(() => attemptImport())
}
