import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, RefreshCw, CheckCircle } from 'lucide-react'
import { authService } from '../services/authService'

interface EmailVerificationPendingProps {
  email: string
  username: string
}

export default function EmailVerificationPending({ email, username }: EmailVerificationPendingProps) {
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleResend = async () => {
    setResending(true)
    setError(null)
    try {
      await authService.resendVerification(email)
      setResent(true)
      setTimeout(() => setResent(false), 5000) // Reset after 5 seconds
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <h1 className="text-4xl font-bold text-white mb-2 hover:opacity-80 transition-opacity">
              ⚔️ CONQUEST K
            </h1>
          </Link>
        </div>

        <div className="bg-surface-1/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 shadow-2xl">
          <div className="text-center">
            {/* Success Icon */}
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
                <Mail className="w-10 h-10 text-green-400" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white mb-4">Verify Your Email</h2>
            
            <p className="text-muted mb-2">
              Welcome, <span className="font-semibold text-white">{username}</span>!
            </p>
            
            <p className="text-muted mb-6">
              We've sent a verification email to:
              <br />
              <span className="font-mono text-violet-soft">{email}</span>
            </p>

            <div className="bg-violet/10 border border-violet/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-violet-soft">
                Please check your email and click the verification link to activate your account.
                The link will expire in 24 hours.
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}

            {resent && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-4 rounded-lg mb-6 text-sm flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Verification email resent successfully!
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleResend}
                disabled={resending}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-700 disabled:to-gray-800 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
              >
                {resending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Resending...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Resend Verification Email
                  </>
                )}
              </button>

              <Link
                to="/login"
                className="block w-full py-2.5 bg-surface-2 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all duration-200 text-center"
              >
                Back to Login
              </Link>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-muted">
                Didn't receive the email? Check your spam folder or try resending.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}