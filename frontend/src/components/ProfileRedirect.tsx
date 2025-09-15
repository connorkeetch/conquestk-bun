import type React from 'react'
import { Navigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'

const ProfileRedirect: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)

  if (!user || !user.username) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={`/profile/${user.username}`} replace />
}

export default ProfileRedirect
