import type React from 'react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import authService from '../services/authService'

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const emailInputId = useId()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setMessage('')

    try {
      const response = await authService.forgotPassword(email)
      setMessage(response.message || 'Password reset link sent! Check your email.')
      setSubmitted(true)
    } catch (error: unknown) {
      const apiError = error as { response?: { status?: number; data?: { message?: string } } }
      if (apiError.response?.status === 429) {
        setError('Too many requests. Please wait before trying again.')
      } else {
        setError(apiError.response?.data?.message || 'Failed to send reset email')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center p-4">
      <div className="box1 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Forgot Password</h1>
          <p className="text-muted">
            {!submitted ? 'Enter your email to reset your password' : 'Check your email'}
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor={emailInputId} className="block text-muted text-sm font-medium mb-2">
                Email Address
              </label>
              <input
                type="email"
                id={emailInputId}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="form-input"
                placeholder="Enter your email address"
              />
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Check Your Email</h2>
            <p className="text-muted mb-6">{message}</p>
            <p className="text-sm text-muted mb-6">
              If you don't see the email, check your spam folder.
            </p>

            <button
              type="button"
              onClick={() => {
                setSubmitted(false)
                setEmail('')
                setMessage('')
              }}
              className="text-primary-soft hover:text-primary text-sm font-medium transition-colors"
            >
              Try another email
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-muted text-sm">
            Remember your password?{' '}
            <Link to="/login" className="text-primary-soft hover:text-primary transition-colors">
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
