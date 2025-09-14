import { lazy, Suspense } from 'react'
import { Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import api from '../services/api'

// Lazy load the AdminMaps component
const AdminMaps = lazy(() => import('./AdminMaps'))

const AdminPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAdminStatus()
  }, [])

  const checkAdminStatus = async () => {
    try {
      const response = await api.get('/admin/status')
      setIsAdmin(response.data.isAdmin)
      if (!response.data.isAdmin) {
        navigate('/')
      }
    } catch (error) {
      console.error('Failed to check admin status:', error)
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-1 flex items-center justify-center">
        <div className="text-white">Loading admin panel...</div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-surface-1">
      {/* Admin Header */}
      <div className="bg-gradient-to-r from-purple-800 to-red-800 text-white p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8" />
            <h1 className="text-2xl font-bold">Admin Dashboard - Map Management</h1>
          </div>
          <div className="text-sm">
            Logged in as: {user?.username}
          </div>
        </div>
      </div>

      {/* Direct Maps Content */}
      <div className="max-w-7xl mx-auto">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <div className="text-white">Loading map management...</div>
          </div>
        }>
          <AdminMaps />
        </Suspense>
      </div>
    </div>
  )
}

export default AdminPage