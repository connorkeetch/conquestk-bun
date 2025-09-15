import type React from 'react'
import { Navigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'

const Statistics: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)

  // Redirect to profile page with stats tab
  // In the future, we could pass state to open the stats tab directly
  if (user?.username) {
    return <Navigate to={`/profile/${user.username}`} replace />
  }

  return <Navigate to="/login" replace />
}

export default Statistics
