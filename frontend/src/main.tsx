import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { logger } from '@/utils/logger'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { store } from './store'
import './index.css'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import { preloadBattleOdds } from './bootstrap/preloadBattleOdds'

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
  const rootElement = document.getElementById('root')

  if (!rootElement) {
    throw new Error('Root element not found!')
  }

  logger.debug('[MAIN] Root element found, creating React root...')
  const root = ReactDOM.createRoot(rootElement)

  // Preload optional data (non-blocking)
  preloadBattleOdds().catch(() => {})

  logger.info('[MAIN] Rendering React app without StrictMode...')
  // Restore full app
  root.render(
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <App />
          <PWAUpdatePrompt />
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
