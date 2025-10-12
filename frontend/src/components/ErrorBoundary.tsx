import React from 'react'
import { logger } from '@/utils/logger'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
  errorCount: number
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  level?: 'app' | 'page' | 'section' | 'component'
  resetOnPropsChange?: boolean
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, errorCount: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('[ERROR_BOUNDARY] React error boundary captured an error', error, errorInfo)
    logger.error('[ERROR_BOUNDARY] Component stack trace', errorInfo.componentStack)

    this.setState((prevState) => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }))

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Auto-retry for component-level errors (first 3 attempts)
    if (this.props.level === 'component' && this.state.errorCount < 3) {
      this.resetTimeoutId = window.setTimeout(() => {
        this.resetErrorBoundary()
      }, 5000)
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Reset on props change if configured
    if (
      this.props.resetOnPropsChange &&
      this.state.hasError &&
      prevProps.children !== this.props.children
    ) {
      this.resetErrorBoundary()
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId)
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId)
      this.resetTimeoutId = null
    }

    this.setState((prevState) => ({
      hasError: false,
      errorCount: prevState.errorCount,
    }))
  }

  private navigateHome = () => {
    if (typeof window !== 'undefined') {
      window.location.assign('/')
    }
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>
      }

      const level = this.props.level || 'app'
      const isFullPage = level === 'app' || level === 'page'

      return (
        <div
          className={`${
            isFullPage ? 'min-h-screen' : level === 'section' ? 'min-h-[400px]' : 'min-h-[200px]'
          } flex items-center justify-center`}
        >
          <div className="text-center p-8 bg-danger-soft border border-red-500/30 rounded-lg max-w-lg">
            <div className="text-5xl mb-4">{isFullPage ? '💥' : '⚠️'}</div>
            <h2 className="text-2xl font-bold text-red-400 mb-4">
              {isFullPage ? 'Something went wrong' : 'Component Error'}
            </h2>
            <p className="text-white/80 mb-4">
              {isFullPage
                ? 'The application encountered an unexpected error. Please refresh the page to try again.'
                : 'This component encountered an error. The rest of the app should continue working.'}
            </p>

            {/* Show error details in development */}
            {typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'development' && (
              <details className="text-left text-sm text-muted mb-4">
                <summary className="cursor-pointer text-red-300 hover:text-red-200">
                  Error Details (Dev Only)
                </summary>
                <pre className="mt-2 p-2 bg-black/30 rounded overflow-auto text-xs">
                  {this.state.error?.toString()}
                  {this.state.error?.stack}
                </pre>
              </details>
            )}

            <div className="space-x-3">
              <button
                type="button"
                onClick={this.resetErrorBoundary}
                className="px-4 py-2 bg-primary hover:bg-primary text-white rounded-lg transition-colors"
              >
                Try Again
              </button>

              {isFullPage && (
                <button
                  type="button"
                  onClick={this.navigateHome}
                  className="px-4 py-2 bg-gray-600 hover:bg-surface-2 text-white rounded-lg transition-colors"
                >
                  Go Home
                </button>
              )}
            </div>

            {this.state.errorCount > 1 && level === 'component' && (
              <p className="text-sm text-red-400 mt-3">
                Retry attempt {this.state.errorCount} of 3
              </p>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
