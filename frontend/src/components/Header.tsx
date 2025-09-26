import { MessageSquare, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FEATURE_FLAGS } from '@/constants/featureFlags'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { notificationService } from '@/services/notificationService'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import audioService from '../services/audioService'
import { logout } from '../store/authSlice'
import { selectTotalUnreadMessages } from '../store/messagesSlice'
import { sanitizeText } from '../utils/sanitizer'
import ActiveGamesDropdown from './ActiveGamesDropdown'
import MountainLogo from './MountainLogo'
// Consolidated inbox drawer (messages + notifications)
import InboxDrawer from './messages/InboxDrawer'

interface MenuItem {
  path: string
  label: string
  icon: string
}

export default function Header() {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)
  const dispatch = useAppDispatch()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const [isInboxOpen, setIsInboxOpen] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const menuTitleId = useId()
  const clansEnabled = useFeatureFlag(FEATURE_FLAGS.CLANS_CORE)
  const unreadMessages = useAppSelector(selectTotalUnreadMessages)

  useEffect(() => {
    // Check initial mute state
    setIsMuted(audioService.isMutedState())
  }, [])

  useEffect(() => {
    const unsub = notificationService.subscribe(() => {
      setUnreadNotifications(notificationService.getUnreadCount())
    })
    setUnreadNotifications(notificationService.getUnreadCount())
    return unsub
  }, [])

  const handleToggleMute = () => {
    audioService.toggleMute()
    setIsMuted(!isMuted)
  }

  // Simplified flat menu structure
  const menuItems: MenuItem[] = [
    { path: '/lobby', label: 'Game Lobby', icon: '🎮' },
    { path: '/create', label: 'Create Game', icon: '➕' },
    { path: '/maps', label: 'Maps', icon: '🗺️' },
    { path: '/map-editor', label: 'Map Editor', icon: '✏️' },
    { path: '/community', label: 'Community', icon: '👥' },
    { path: '/tutorial', label: 'How to Play', icon: '📚' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ]

  if (clansEnabled) {
    menuItems.splice(5, 0, { path: '/clans', label: 'Clans', icon: '🛡️' })
  }

  if (user?.isAdmin) {
    menuItems.push({ path: '/admin', label: 'Admin', icon: '🛡️' })
  }

  const handleLogout = () => {
    dispatch(logout())
    setIsMenuOpen(false)
  }

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const navTabClass = (active: boolean) => `nav-tab${active ? ' is-active' : ''}`

  interface PrimaryNavLink {
    to: string
    label: string
    icon: string
    isActive: boolean
  }

  const navLinks = useMemo<PrimaryNavLink[]>(() => {
    const base: PrimaryNavLink[] = []

    if (isAuthenticated) {
      base.push(
        {
          to: '/lobby',
          label: 'Play',
          icon: '🎮',
          isActive: location.pathname.startsWith('/lobby'),
        },
        {
          to: '/maps',
          label: 'Maps',
          icon: '🗺️',
          isActive: location.pathname.startsWith('/maps'),
        },
        {
          to: '/community',
          label: 'Community',
          icon: '👥',
          isActive: location.pathname.startsWith('/community'),
        },
      )

      if (clansEnabled) {
        base.push({
          to: '/clans',
          label: 'Clans',
          icon: '🛡️',
          isActive: location.pathname.startsWith('/clans'),
        })
      }

      base.push({
        to: '/tutorial',
        label: 'How to Play',
        icon: '📚',
        isActive: location.pathname.startsWith('/tutorial'),
      })

      if (user?.isAdmin) {
        base.push({
          to: '/admin',
          label: 'Admin',
          icon: '🛡️',
          isActive: location.pathname.startsWith('/admin'),
        })
      }
    } else {
      base.push(
        {
          to: '/',
          label: 'Home',
          icon: '🏠',
          isActive: location.pathname === '/',
        },
        {
          to: '/lobby',
          label: 'Play Now',
          icon: '🎮',
          isActive: location.pathname === '/lobby' || location.pathname.startsWith('/play'),
        },
        {
          to: '/maps',
          label: 'Browse Maps',
          icon: '🗺️',
          isActive: location.pathname.startsWith('/maps'),
        },
        {
          to: '/community',
          label: 'Community',
          icon: '👥',
          isActive: location.pathname.startsWith('/community'),
        },
      )

      if (clansEnabled) {
        base.push({
          to: '/clans',
          label: 'Clans',
          icon: '🛡️',
          isActive: location.pathname.startsWith('/clans'),
        })
      }

      base.push({
        to: '/tutorial',
        label: 'How to Play',
        icon: '📚',
        isActive: location.pathname.startsWith('/tutorial'),
      })
    }

    return base
  }, [clansEnabled, isAuthenticated, location.pathname, user?.isAdmin])

  const sanitizedUsername = user?.username ? sanitizeText(user.username) : ''
  const userInitial = sanitizedUsername ? sanitizedUsername.charAt(0).toUpperCase() : '👤'

  // Show mute only in game/editor contexts
  const showMute =
    location.pathname.startsWith('/room') ||
    location.pathname.startsWith('/game') ||
    location.pathname.startsWith('/map-editor')

  return (
    <>
      <header className="sticky top-0 z-50 top-nav">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between relative">
          {/* Left */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="Menu"
              className="p-2 rounded-lg hover:bg-white/5 transition-colors focus-ring"
              onClick={toggleMenu}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                className="fill-white/70"
                role="img"
                aria-labelledby={menuTitleId}
              >
                <title id={menuTitleId}>Menu</title>
                <path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z" />
              </svg>
            </button>
            <Link
              to="/"
              className="text-white/90 font-semibold tracking-wide flex items-center gap-2"
            >
              <MountainLogo width={24} height={24} />
              <span className="hidden sm:inline">
                CONQUEST{' '}
                <span
                  className="font-bold"
                  style={
                    {
                      background: 'linear-gradient(135deg, #FBBF24, #F59E0B, #D97706)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    } as React.CSSProperties
                  }
                >
                  K
                </span>
              </span>
              <span className="sm:hidden">
                C
                <span
                  className="font-bold"
                  style={
                    {
                      background: 'linear-gradient(135deg, #FBBF24, #F59E0B, #D97706)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    } as React.CSSProperties
                  }
                >
                  K
                </span>
              </span>
            </Link>
          </div>

          {/* Center nav - compact icons for large screens, full nav for extra large */}
          <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 flex-col items-center gap-2">
            <nav className="hidden xl:flex nav-tabs text-body-sm">
              {navLinks.map((link) => (
                <Link key={link.to} className={navTabClass(link.isActive)} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </nav>
            <nav className="hidden lg:flex xl:hidden nav-tabs items-center gap-1 rounded-full bg-white/5 px-2 py-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/10">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  className={`${navTabClass(link.isActive)} flex h-9 w-9 items-center justify-center rounded-full`}
                  to={link.to}
                  aria-label={link.label}
                >
                  <span aria-hidden="true" className="text-lg">
                    {link.icon}
                  </span>
                </Link>
              ))}
            </nav>
          </div>

          {/* Right auth */}
          <div className="flex items-center gap-1 sm:gap-2">
            {isAuthenticated ? (
              <>
                {/* Audio Mute Button */}
                {showMute && (
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="btn-ghost btn-icon"
                    title={isMuted ? 'Unmute audio' : 'Mute audio'}
                    aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                  >
                    {isMuted ? (
                      <VolumeX className="w-6 h-6 text-[color:var(--color-danger)]" />
                    ) : (
                      <Volume2 className="w-6 h-6 text-muted" />
                    )}
                  </button>
                )}

                {/* Active Games Dropdown */}
                <ActiveGamesDropdown />

                {/* Inbox (Messages + Notifications) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsInboxOpen(true)
                    setIsUserDropdownOpen(false)
                  }}
                  className="btn-ghost btn-icon relative"
                  aria-label="Open inbox"
                >
                  <MessageSquare className="w-6 h-6 text-muted" />
                  {unreadMessages + unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] px-1 py-0.5 rounded-full bg-[color:var(--color-primary)] text-[10px] font-semibold text-white text-center">
                      {unreadMessages + unreadNotifications > 99
                        ? '99+'
                        : unreadMessages + unreadNotifications}
                    </span>
                  )}
                </button>

                {/* User Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-white/80 hover:text-white hover:bg-white/10 transition"
                    aria-label={sanitizedUsername ? `${sanitizedUsername} menu` : 'Account menu'}
                  >
                    <span className="hidden sm:inline">{sanitizedUsername}</span>
                    <span className="sm:hidden flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                      {userInitial}
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      className="fill-current"
                      aria-hidden="true"
                    >
                      <path d="M7 10l5 5 5-5z" />
                    </svg>
                  </button>

                  {/* User Dropdown Menu */}
                  {isUserDropdownOpen && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-40 bg-transparent border-none cursor-default"
                        onClick={() => setIsUserDropdownOpen(false)}
                        onKeyDown={(e) => e.key === 'Escape' && setIsUserDropdownOpen(false)}
                        aria-label="Close dropdown"
                      />
                      <div className="dropdown-menu">
                        <Link
                          to="/profile"
                          onClick={() => setIsUserDropdownOpen(false)}
                          className="dropdown-item"
                        >
                          <span>👤</span> View Profile
                        </Link>
                        <Link
                          to="/settings"
                          onClick={() => setIsUserDropdownOpen(false)}
                          className="dropdown-item"
                        >
                          <span>⚙️</span> Settings
                        </Link>
                        <hr className="dropdown-separator" />
                        <button
                          type="button"
                          onClick={() => {
                            handleLogout()
                            setIsUserDropdownOpen(false)
                          }}
                          className="dropdown-item text-red-400 hover:text-red-300"
                        >
                          <span>🚪</span> Logout
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-3 py-1.5 rounded-md text-sm text-white/80 hover:text-white hover:bg-white/10 transition"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="hidden sm:inline-block btn-primary text-sm shadow-lg hover:shadow-lg transition-all"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Side Menu Overlay */}
      {isMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 border-none cursor-default"
          onClick={() => setIsMenuOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsMenuOpen(false)}
          aria-label="Close menu"
        />
      )}

      {/* Comprehensive Side Menu */}
      <div
        className={`fixed top-0 left-0 h-full w-80 sidebar-menu z-50 transform transition-transform duration-300 ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Menu Header with Glass Effect */}
        <div className="sidebar-header px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MountainLogo width={28} height={28} />
            <span className="text-xl font-bold text-white">
              CONQUEST{' '}
              <span
                className="font-bold"
                style={
                  {
                    background:
                      'linear-gradient(135deg, var(--color-accent), var(--color-primary), var(--color-secondary))',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  } as React.CSSProperties
                }
              >
                K
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsMenuOpen(false)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              className="fill-white/70"
              aria-hidden="true"
            >
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Menu Content */}
        <div className="flex flex-col h-[calc(100%-5rem)]">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {/* Main Navigation - Flat structure */}
            <div className="space-y-1">
              {menuItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={`sidebar-item ${
                    location.pathname === item.path ? 'sidebar-item-active' : ''
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Bottom Auth Section */}
          <div className="px-4 py-4 border-t border-border-muted">
            {isAuthenticated ? (
              <div className="space-y-2">
                <div className="px-3 py-2 text-sm text-muted">
                  Logged in as{' '}
                  <span className="text-white font-medium">
                    {user?.username ? sanitizeText(user.username) : ''}
                  </span>
                </div>
                <button type="button" onClick={handleLogout} className="w-full btn-danger">
                  🚪 Logout
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <Link
                  to="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="btn-secondary block w-full text-center"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  onClick={() => setIsMenuOpen(false)}
                  className="btn-primary block w-full text-center"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <InboxDrawer isOpen={isInboxOpen} onClose={() => setIsInboxOpen(false)} />
    </>
  )
}
