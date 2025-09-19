import type React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
  requireAdmin?: boolean
  allowUnverified?: boolean
}

const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  requireAuth = true,
  requireAdmin = false,
  allowUnverified = false,
}) => {
  const { isAuthenticated, user, isLoading, token, requiresEmailVerification } = useAppSelector(
    (state) => state.auth,
  )
  const location = useLocation()
  const isAuthEntryRoute = location.pathname === '/login' || location.pathname === '/register'
  const isUnverified = requiresEmailVerification && user && !user.emailVerified

  // If we have a token but haven't loaded user yet, show loading
  // This prevents the flash of "not authenticated" when refreshing
  if ((isLoading || (token && !user)) && requireAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900/20 to-black">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <div className="text-white text-lg">Loading...</div>
        </div>
      </div>
    )
  }

  // If route requires authentication and user is not authenticated
  if (requireAuth && !isAuthenticated) {
    // Save the attempted location for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Block unverified users from accessing protected routes unless explicitly allowed
  if (
    requireAuth &&
    isAuthenticated &&
    isUnverified &&
    !allowUnverified &&
    !location.pathname.startsWith('/verify-email')
  ) {
    return <Navigate to="/verify-email" replace />
  }

  // If route requires admin and user is not admin
  if (requireAdmin && (!user || !user.isAdmin)) {
    return <Navigate to="/" replace />
  }

  // If user is authenticated and trying to access login/register, redirect unless they're unverified
  if (isAuthenticated && isAuthEntryRoute && !isUnverified) {
    return <Navigate to="/profile" replace />
  }

  return <>{children}</>
}

export default AuthGuard
