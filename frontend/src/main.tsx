import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import TestApp from './test-app'
import ErrorBoundary from './components/ErrorBoundary'
import { store } from './store'
import './index.css'

// Add comprehensive error logging
console.log('[MAIN] Starting React app initialization...')
console.log('[MAIN] React version:', React.version)

// Log any import errors
window.addEventListener('error', (e) => {
  console.error('[MAIN] Global error:', e.message, e.filename, e.lineno, e.colno)
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('[MAIN] Unhandled promise rejection:', e.reason)
})

try {
  console.log('[MAIN] Looking for root element...')
  const rootElement = document.getElementById('root')
  
  if (!rootElement) {
    throw new Error('Root element not found!')
  }
  
  console.log('[MAIN] Root element found, creating React root...')
  const root = ReactDOM.createRoot(rootElement)
  
  console.log('[MAIN] Rendering React app without StrictMode...')
  // Restore full app
  root.render(
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <App />
          <Toaster position="top-right" />
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>,
  )
  
  console.log('[MAIN] React render call completed')
} catch (error) {
  console.error('[MAIN] Fatal error during app initialization:', error)
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