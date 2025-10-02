import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import authService from '../services/authService'
import { logout } from '../store/authSlice'

export default function VerifyEmail() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const user = useAppSelector((state) => state.auth.user)
  const [resendMessage, setResendMessage] = useState('')
  const [isResending, setIsResending] = useState(false)

  const handleResendVerification = async () => {
    if (!user?.email || isResending) return

    setIsResending(true)
    try {
      await authService.resendVerification(user.email)
      setResendMessage('Verification email sent! Please check your inbox.')
      setTimeout(() => setResendMessage(''), 5000)
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } }
      setResendMessage(apiError.response?.data?.message || 'Failed to resend verification email')
      setTimeout(() => setResendMessage(''), 5000)
    } finally {
      setIsResending(false)
    }
  }

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <h1 className="text-4xl font-bold text-white mb-2 hover:opacity-80 transition-opacity">
              ⚔️ CONQUEST K
            </h1>
          </Link>
          <p className="text-muted">Email Verification Required</p>
        </div>

        {/* Card */}
        <div className="bg-surface-1/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 shadow-2xl">
          <div className="text-center">
            {/* Warning Icon */}
            <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-yellow-400"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">Verify Your Email</h2>
            <p className="text-purple-400 text-sm mb-6 font-medium italic">They always come back</p>
            <p className="text-muted mb-8">
              To access the game, please verify your email address. We've sent a verification link
              to <span className="text-yellow-400 font-medium">{user?.email}</span>
            </p>

            {/* Resend Message */}
            {resendMessage && (
              <div
                className={`${
                  resendMessage.includes('sent')
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                } border p-4 rounded-lg mb-6 text-sm`}
              >
                {resendMessage}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isResending}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-600/50 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isResending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
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
                    Resend Verification Email
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full bg-surface-2 hover:bg-gray-600 text-muted font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>

            {/* Help Text */}
            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-muted text-sm">
                Didn't receive the email? Check your spam folder or{' '}
                <button
                  type="button"
                  onClick={handleResendVerification}
                  className="text-yellow-400 hover:text-yellow-300 underline"
                  disabled={isResending}
                >
                  click here to resend
                </button>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
