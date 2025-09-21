import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'
import { type ProfileSummary, profileService } from '../../services/profileService'
import { logout } from '../../store/authSlice'

interface UserMenuProps {
  className?: string
}

const numberFormatter = new Intl.NumberFormat()
const percentFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const UserMenu: React.FC<UserMenuProps> = ({ className = '' }) => {
  const { user } = useAppSelector((state) => state.auth)
  const dispatch = useAppDispatch()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const userMenuItems = [
    { path: '/profile', label: 'Profile', icon: '📊' },
    { path: '/profile/stats', label: 'Statistics', icon: '📈' },
    { path: '/profile/achievements', label: 'Achievements', icon: '🏆' },
    { path: '/profile/history', label: 'Game History', icon: '🎮' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ]

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    dispatch(logout())
    setIsMenuOpen(false)
  }

  const getUserInitial = () => {
    return user?.username?.charAt(0).toUpperCase() || 'U'
  }

  useEffect(() => {
    if (!user?.id) {
      setProfileSummary(null)
      return
    }

    let isMounted = true
    const controller = new AbortController()

    const loadProfile = async () => {
      try {
        setIsLoadingProfile(true)
        setProfileError(null)
        const summary = await profileService.getMyProfile({ signal: controller.signal })
        if (!isMounted) {
          return
        }
        setProfileSummary(summary)
      } catch (_err) {
        if (!isMounted) {
          return
        }
        setProfileError('Stats unavailable')
        setProfileSummary(null)
      } finally {
        if (isMounted) {
          setIsLoadingProfile(false)
        }
      }
    }

    void loadProfile()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [user?.id])

  const stats = {
    wins: profileSummary?.wins ?? 0,
    winRate: profileSummary?.winRate ?? 0,
    rankName: profileSummary?.rank.name ?? 'Commander',
    elo: profileSummary?.elo ?? null,
  }

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      {/* User Avatar Button */}
      <button
        type="button"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-surface-2 transition-all duration-200"
      >
        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-lg">
          {getUserInitial()}
        </div>
        <div className="hidden lg:block text-left">
          <div className="text-sm font-medium text-white">{user?.username}</div>
          <div className="text-xs text-muted">
            {isLoadingProfile ? 'Loading stats…' : (profileError ?? `Rank ${stats.rankName}`)}
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-muted transition-transform duration-200 ${
            isMenuOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          role="img"
          aria-label="Toggle user menu"
        >
          <title>Toggle user menu</title>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-surface-1 rounded-xl shadow-2xl border border-border py-3 z-50">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-xl font-bold text-white">
                {getUserInitial()}
              </div>
              <div className="flex-1">
                <div className="font-medium text-white">{user?.username}</div>
                <div className="text-sm text-muted">{user?.email}</div>
                <div className="flex items-center space-x-4 mt-1 text-xs">
                  {profileSummary ? (
                    <>
                      <span className="text-green-400">Rank {profileSummary.rank.name}</span>
                      <span className="text-primary-soft">
                        {numberFormatter.format(profileSummary.wins)} wins
                      </span>
                      <span className="text-purple-400">
                        {percentFormatter.format(profileSummary.winRate)} rate
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">
                      {isLoadingProfile ? 'Loading stats…' : (profileError ?? 'Stats unavailable')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            {userMenuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center space-x-3 px-4 py-2.5 hover:bg-surface-2 transition-colors duration-150"
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium text-gray-200">{item.label}</span>
              </Link>
            ))}
          </div>

          {/* Logout Button */}
          <div className="border-t border-border pt-2 mt-2">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-danger-soft text-red-400 hover:text-red-300 transition-colors duration-150"
            >
              <span className="text-lg">🚪</span>
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserMenu
