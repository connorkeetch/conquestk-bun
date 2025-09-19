import { Navigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'

interface VerificationGuardProps {
  children: React.ReactNode
}

export default function VerificationGuard({ children }: VerificationGuardProps) {
  const { user, requiresEmailVerification } = useAppSelector((state) => state.auth)

  // If user exists but email is not verified, redirect to verification page
  if (requiresEmailVerification && user && !user.emailVerified) {
    return <Navigate to="/verify-email" replace />
  }

  // Otherwise, render the children
  return <>{children}</>
}
