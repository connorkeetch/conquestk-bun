import type React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
  requireAdmin?: boolean
}

const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  requireAuth = true,
  requireAdmin = false,
}) => {
  const { isAuthenticated, user, isLoading } = useAppSelector((state) => state.auth)
  const location = useLocation()

  // If auth is still loading, show a loading state
  if (isLoading) {
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

  // If route requires admin and user is not admin
  if (requireAdmin && (!user || !user.isAdmin)) {
    return <Navigate to="/" replace />
  }

  // If user is authenticated and trying to access login/register, redirect to dashboard
  if (isAuthenticated && (location.pathname === '/login' || location.pathname === '/register')) {
    return <Navigate to="/lobby" replace />
  }

  return <>{children}</>
}

export default AuthGuard
