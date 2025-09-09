import type React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import authService from '../services/authService'

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setMessage('')

    try {
      const response = await authService.forgotPassword(email)
      setMessage(response.message || 'Password reset link sent! Check your email.')
      setSubmitted(true)
    } catch (error: any) {
      if (error.response?.status === 429) {
        setError('Too many requests. Please wait before trying again.')
      } else {
        setError(error.response?.data?.message || 'Failed to send reset email')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-surface-2 rounded-xl shadow-2xl p-8 max-w-md w-full border border-border">
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
              <label htmlFor="email" className="block text-muted text-sm font-medium mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="w-full px-4 py-3 bg-surface-1/70 border border-border rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-violet focus:border-violet transition-all duration-200"
                placeholder="Enter your email address"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-violet hover:brightness-110 disabled:bg-surface-2 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
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
              onClick={() => {
                setSubmitted(false)
                setEmail('')
                setMessage('')
              }}
              className="text-violet-soft hover:text-violet-soft text-sm font-medium transition-colors"
            >
              Try another email
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-muted text-sm">
            Remember your password?{' '}
            <Link to="/login" className="text-violet-soft hover:text-violet-soft transition-colors">
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
