import { Activity, FileText, Gamepad2, Map as MapIcon, Shield, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { useAppSelector } from '../hooks/redux'
import api from '../services/api'

const AdminLayout: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const checkAdminStatus = useCallback(async () => {
    try {
      const response = await api.get('/admin/status')
      setIsAdmin(response.data.isAdmin)
      if (!response.data.isAdmin) {
        navigate('/')
      }
    } catch (error) {
      logger.error('Failed to verify admin status', error)
      navigate('/')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    checkAdminStatus()
  }, [checkAdminStatus])

  const navItems = [
    {
      path: '/admin',
      label: 'Dashboard',
      icon: <Activity className="w-4 h-4" />,
      exact: true,
    },
    {
      path: '/admin/users',
      label: 'Users',
      icon: <Users className="w-4 h-4" />,
      exact: false,
    },
    {
      path: '/admin/content',
      label: 'Content',
      icon: <FileText className="w-4 h-4" />,
      exact: false,
    },
    {
      path: '/admin/maps',
      label: 'Maps',
      icon: <MapIcon className="w-4 h-4" />,
      exact: false,
    },
    {
      path: '/admin/games',
      label: 'Games',
      icon: <Gamepad2 className="w-4 h-4" />,
      exact: false,
    },
    {
      path: '/admin/reliability',
      label: 'Reliability',
      icon: <Activity className="w-4 h-4" />,
      exact: false,
    },
    {
      path: '/admin/health',
      label: 'Health',
      icon: <Activity className="w-4 h-4" />,
      exact: false,
    },
  ]

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
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8" />
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>
          <div className="text-sm">Logged in as: {user?.username}</div>
        </div>
      </div>

      {/* Secondary Navigation */}
      <div className="bg-surface-2 border-b border-border">
        <div className="max-w-screen-2xl mx-auto">
          <nav className="flex gap-1 p-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={({ isActive }) => `
                  flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                  ${
                    isActive
                      ? 'bg-purple-600 text-white'
                      : 'text-muted hover:bg-surface-2 hover:text-white'
                  }
                `}
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Page Content */}
      <div className="max-w-screen-2xl mx-auto">
        <Outlet />
      </div>
    </div>
  )
}

export default AdminLayout
