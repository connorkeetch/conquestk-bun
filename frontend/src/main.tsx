import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { logger } from '@/utils/logger'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import InstallPrompt from './components/InstallPrompt'
import { store } from './store'
import './index.css'
import { preloadBattleOdds } from './bootstrap/preloadBattleOdds'
import { startVitalsRUM } from './utils/rum'

// Defer PWA registration until after window load to avoid blocking paint
// We'll lazily import the prompt component after the load event.

// Add comprehensive error logging
logger.info('[MAIN] Starting React app initialization...')
logger.debug('[MAIN] React version', React.version)

// Log any import errors
window.addEventListener('error', (e) => {
  logger.error('[MAIN] Global error', e.message, e.filename, e.lineno, e.colno)
})

window.addEventListener('unhandledrejection', (e) => {
  logger.error('[MAIN] Unhandled promise rejection', e.reason)
})

try {
  logger.debug('[MAIN] Looking for root element...')
  // Start minimal RUM for LCP before rendering
  startVitalsRUM()
  const rootElement = document.getElementById('root')

  if (!rootElement) {
    throw new Error('Root element not found!')
  }

  logger.debug('[MAIN] Root element found, creating React root...')
  const root = ReactDOM.createRoot(rootElement)

  // Preload optional data on idle (non-blocking)
  try {
    const schedule = (fn: () => void) => {
      const w = window as unknown as { requestIdleCallback?: (cb: () => void) => void }
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn)
      else setTimeout(fn, 100)
    }
    schedule(() => {
      preloadBattleOdds().catch(() => {
        /* ignore */
      })
    })
  } catch {
    /* ignore */
  }

  logger.info('[MAIN] Rendering React app without StrictMode...')
  // Restore full app
  root.render(
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <App />
          <InstallPrompt />
          <PWAUpdatePromptLoader />
          <Toaster position="top-right" />
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>,
  )

  logger.info('[MAIN] React render call completed')
} catch (error) {
  logger.error('[MAIN] Fatal error during app initialization', error)
  // Also display error in the DOM
  const rootElement = document.getElementById('root')
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="color: red; padding: 20px; font-family: monospace;">
        <h1>Failed to start application</h1>
        <pre>${error}</pre>
        <p>Check browser console for details</p>
      </div>
    `
  }
}

// Lazy loader for the PWA update prompt; imports and mounts after window 'load'
function PWAUpdatePromptLoader() {
  const [Comp, setComp] = React.useState<React.ComponentType | null>(null)
  React.useEffect(() => {
    const onLoad = () => {
      import('./components/PWAUpdatePrompt')
        .then((mod) => setComp(() => mod.default))
        .catch(() => {
          /* ignore */
        })
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })
    return () => window.removeEventListener('load', onLoad)
  }, [])
  return Comp ? <Comp /> : null
}
