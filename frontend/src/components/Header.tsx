import { Bell, MessageSquare } from 'lucide-react'
import { Activity, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { getColorValue, PLAYER_COLORS, type PlayerColor } from '@/constants/colors'
// Clans are now generally available; no feature flag gating
import friendsService from '@/services/friendsService'
import { notificationService } from '@/services/notificationService'
import { socketService } from '@/services/socketService'
import { closeInbox, openInbox } from '@/store/uiSlice'
import { extractFirstHexColor, isGradientValue, pickTextOnColor } from '@/utils/color'

import { useAppDispatch, useAppSelector } from '../hooks/redux'
// import audioService from '../services/audioService'
import { logout } from '../store/authSlice'
import { selectTotalUnreadDirectGroup } from '../store/messagesSlice'
import { sanitizeText } from '../utils/sanitizer'
import ActiveGamesDropdown from './ActiveGamesDropdown'
import BrandLogoDynamic from './BrandLogoDynamic'
// Consolidated inbox drawer (messages + notifications)
import InboxDrawer from './messages/InboxDrawer'
import NotificationDropdown from './notifications/NotificationDropdown'

interface MenuItem {
  path: string
  label: string
  icon: string
}

export default function Header() {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)
  const preferredColor: PlayerColor = useAppSelector(
    (s) => s.settings.game?.preferredColor || PLAYER_COLORS[0],
  )
  const inboxOpen = useAppSelector((s) => s.ui.inboxOpen)
  const dispatch = useAppDispatch()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false)
  const notifBtnRef = useRef<HTMLButtonElement | null>(null)
  // Inbox is globally controlled via Redux
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [pendingFriends, setPendingFriends] = useState(0)
  // const [isMuted, setIsMuted] = useState(false)
  const menuTitleId = useId()
  const unreadMessages = useAppSelector(selectTotalUnreadDirectGroup)

  // Derive a small bubble style using the user's preferred color
  const resolvedPreferred = getColorValue(preferredColor)
  const bubbleBaseHex = isGradientValue(resolvedPreferred)
    ? extractFirstHexColor(resolvedPreferred) || '#000000'
    : resolvedPreferred
  const bubbleText = pickTextOnColor(bubbleBaseHex)
  const userBubbleStyle: React.CSSProperties = isGradientValue(resolvedPreferred)
    ? ({ backgroundImage: resolvedPreferred, color: bubbleText } as React.CSSProperties)
    : ({ backgroundColor: resolvedPreferred, color: bubbleText } as React.CSSProperties)

  // Navbar-level mute control removed; use in-context controls instead

  useEffect(() => {
    const unsub = notificationService.subscribe(() => {
      setUnreadNotifications(notificationService.getUnreadCount())
    })
    setUnreadNotifications(notificationService.getUnreadCount())
    return unsub
  }, [])

  // Pending friend requests counter (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) {
      setPendingFriends(0)
      return
    }

    let mounted = true
    const load = async () => {
      try {
        const reqs = await friendsService.listRequests()
        if (mounted) setPendingFriends(reqs.incoming.length)
      } catch {
        if (mounted) setPendingFriends(0)
      }
    }
    void load()
    const refresh = () => void load()
    socketService.on('friend.request.received', refresh)
    socketService.on('friend.request.accepted', refresh)
    socketService.on('friend.request.declined', refresh)
    socketService.on('friend.request.cancelled', refresh)
    socketService.on('friend.added', refresh)
    socketService.on('friend.removed', refresh)
    return () => {
      mounted = false
      socketService.off('friend.request.received', refresh)
      socketService.off('friend.request.accepted', refresh)
      socketService.off('friend.request.declined', refresh)
      socketService.off('friend.request.cancelled', refresh)
      socketService.off('friend.added', refresh)
      socketService.off('friend.removed', refresh)
    }
  }, [isAuthenticated])

  // const handleToggleMute = () => {}

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

  if (user?.isAdmin) {
    menuItems.push({ path: '/admin', label: 'Admin', icon: '🛡️' })
  }

  const handleLogout = () => {
    dispatch(logout())
    setIsMenuOpen(false)
  }

  // Close notification dropdown on route change
  useEffect(() => {
    setIsNotifDropdownOpen(false)
    // Only depends on path changes
  }, [location])

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const navTabClass = (active: boolean) =>
    `nav-tab${active ? ' is-active' : ''} text-sm md:text-base px-3 md:px-4`

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

      // Clans moved under Community hub; remove from primary nav

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

      // Clans moved under Community hub; remove from primary nav

      base.push({
        to: '/tutorial',
        label: 'How to Play',
        icon: '📚',
        isActive: location.pathname.startsWith('/tutorial'),
      })
    }

    return base
  }, [isAuthenticated, location.pathname, user?.isAdmin])

  const sanitizedUsername = user?.username ? sanitizeText(user.username) : ''
  const userInitial = sanitizedUsername ? sanitizedUsername.charAt(0).toUpperCase() : '👤'

  // Show mute only in game/editor contexts
  // const showMute = false

  return (
    <>
      <header className="sticky top-0 z-50 top-nav">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between relative">
          {/* Left */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="Menu"
              className="p-2 rounded-lg hover:bg-[color:var(--hover-bg)] transition-colors focus-ring"
              onClick={toggleMenu}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="opacity-70 text-[color:var(--text)]"
                role="img"
                aria-labelledby={menuTitleId}
              >
                <title id={menuTitleId}>Menu</title>
                <path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z" />
              </svg>
            </button>
            <Link
              to="/"
              className="text-[color:var(--text)] font-semibold tracking-wide flex items-center gap-2"
            >
              <BrandLogoDynamic width={28} height={28} />
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
            <nav className="hidden xl:flex nav-tabs text-body-sm" aria-label="Primary">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  className={navTabClass(link.isActive)}
                  to={link.to}
                  aria-current={link.isActive ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right auth */}
          <div className="flex items-center gap-1 sm:gap-2">
            {isAuthenticated ? (
              <>
                {/* Audio Mute Button removed from navbar; use in-context controls instead */}

                {/* Active Games Dropdown */}
                <ActiveGamesDropdown />

                {/* Notifications (bell) */}
                <button
                  ref={notifBtnRef}
                  type="button"
                  onClick={() => {
                    setIsNotifDropdownOpen((v) => !v)
                    setIsUserDropdownOpen(false)
                  }}
                  className="btn-ghost btn-icon relative"
                  aria-label="Open notifications"
                >
                  <Bell className="w-6 h-6 text-muted" />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] px-1 py-0.5 rounded-full bg-[color:var(--color-primary)] text-[10px] font-semibold text-white text-center">
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </span>
                  )}
                </button>
                <NotificationDropdown
                  isOpen={isNotifDropdownOpen}
                  onClose={() => setIsNotifDropdownOpen(false)}
                  onOpenMessages={() => {
                    setIsNotifDropdownOpen(false)
                    dispatch(openInbox())
                  }}
                  triggerRef={notifBtnRef}
                />

                {/* Messages (chat) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsNotifDropdownOpen(false)
                    if (inboxOpen) dispatch(closeInbox())
                    else dispatch(openInbox())
                    setIsUserDropdownOpen(false)
                  }}
                  className="btn-ghost btn-icon relative"
                  aria-label="Open messages"
                >
                  <MessageSquare className="w-6 h-6 text-muted" />
                  {unreadMessages > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] px-1 py-0.5 rounded-full bg-[color:var(--color-primary)] text-[10px] font-semibold text-white text-center">
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </span>
                  )}
                </button>

                {/* User Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                    className="btn-ghost flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-[color:var(--text)] hover:text-[color:var(--text)] transition"
                    aria-label={sanitizedUsername ? `${sanitizedUsername} menu` : 'Account menu'}
                  >
                    <span className="hidden sm:inline">{sanitizedUsername}</span>
                    <span
                      className="sm:hidden flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold shadow-inner"
                      style={userBubbleStyle}
                    >
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
                  className="px-3 py-1.5 rounded-md text-sm text-[color:var(--text)] hover:bg-[color:var(--hover-bg)] transition"
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
            <BrandLogoDynamic width={32} height={32} />
            <span className="text-xl font-bold text-[color:var(--text)]">
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
            className="p-2 hover:bg-[color:var(--hover-bg)] rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="opacity-70 text-[color:var(--text)]"
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
                  <span className="font-medium flex items-center gap-2">
                    <span>{item.label}</span>
                    {item.path === '/community' && pendingFriends > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/80 text-white">
                        {pendingFriends}
                      </span>
                    )}
                  </span>
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
                  <span className="text-[color:var(--text)] font-medium">
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

      <Activity mode={inboxOpen ? 'visible' : 'hidden'}>
        <InboxDrawer isOpen={inboxOpen} onClose={() => dispatch(closeInbox())} />
      </Activity>
    </>
  )
}
