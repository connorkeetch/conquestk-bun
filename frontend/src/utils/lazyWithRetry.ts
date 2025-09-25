import { type ComponentType, type LazyExoticComponent, lazy } from 'react'

type ModuleFactory<T extends ComponentType<unknown>> = () => Promise<{ default: T }>

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isChunkLoadError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  return chunkErrorSignatures.some((signature) => error.message.includes(signature))
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: ModuleFactory<T>,
  options: LazyWithRetryOptions = {},
): LazyExoticComponent<T> {
  const { retries = 1, retryDelayMs = 300 } = options

  const attemptImport = async (attempt = 0): Promise<{ default: T }> => {
    try {
      return await factory()
    } catch (error) {
      if (isChunkLoadError(error)) {
        if (attempt < retries) {
          await sleep(retryDelayMs)
          return attemptImport(attempt + 1)
        }

        if (typeof window !== 'undefined') {
          // Clear registered caches (best effort) to avoid serving stale bundles
          if ('caches' in window) {
            try {
              const cacheNames = await caches.keys()
              await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
            } catch (_cacheError) {
              // Ignore cache deletion failures; we'll still reload below
            }
          }

          window.location.reload()
        }
      }

      throw error
    }
  }

  return lazy(() => attemptImport())
}
