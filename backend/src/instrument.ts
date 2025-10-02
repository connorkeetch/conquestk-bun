import * as Sentry from '@sentry/node'
import dotenv from 'dotenv'
import { logger } from './utils/logger'

// Load environment variables for development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config()
}

// Initialize Sentry only if DSN is provided
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Release tracking (helpful for tracking which version has issues)
    release: process.env.npm_package_version,

    // Security - don't send PII in production unless explicitly needed
    sendDefaultPii: process.env.NODE_ENV !== 'production',

    // Set sample rate for profiling
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Configure error filtering
    beforeSend(event, hint) {
      // Filter out non-critical errors in production
      if (process.env.NODE_ENV === 'production') {
        const originalException = hint?.originalException
        const errorMessage =
          originalException instanceof Error
            ? originalException.message
            : typeof originalException === 'string'
              ? originalException
              : null
        // Don't send validation errors
        if (errorMessage?.includes('Validation')) {
          return null
        }
        // Don't send 404 errors
        if (event.exception?.values?.[0]?.value?.includes('404')) {
          return null
        }
      }
      return event
    },

    // Configure transaction filtering
    beforeSendTransaction(event) {
      // Don't send health check transactions
      if (event.transaction === 'GET /health') {
        return null
      }
      if (event.transaction === 'GET /test') {
        return null
      }
      return event
    },
  })

  logger.info('✅ Sentry initialized for Sentry error tracking', {
    environment: process.env.NODE_ENV,
  })
} else {
  logger.info('ℹ️  Sentry DSN not provided - error tracking disabled')
}

export default Sentry
