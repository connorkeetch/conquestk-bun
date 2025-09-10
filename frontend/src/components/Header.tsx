import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { logout } from '../store/authSlice'
import { sanitizeText } from '../utils/sanitizer'
import NotificationDropdown from './NotificationDropdown'
import ActiveGamesDropdown from './ActiveGamesDropdown'
import audioService from '../services/audioService'
import MountainLogo from './MountainLogo'
import { GRADIENTS, CORE_COLORS } from '../constants/colors'

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
  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    // Check initial mute state
    setIsMuted(audioService.isMutedState())
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
    ...(user?.isAdmin ? [{ path: '/admin', label: 'Admin', icon: '🛡️' }] : []),
  ]

  // Future features (keeping track for later)
  const futureItems: MenuItem[] = [
    { path: '/tournaments', label: 'Tournaments', icon: '🏅' },
  ]

  const handleLogout = () => {
    dispatch(logout())
    setIsMenuOpen(false)
  }

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  return (
    <>
      <header className="sticky top-0 z-50 glass border-b border-white/10">
        <div className="w-full container-padding h-14 flex items-center justify-between relative">
          {/* Left */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Menu"
              className="p-2 rounded-lg hover:bg-white/5 transition-colors focus-ring"
              onClick={toggleMenu}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" className="fill-white/70">
                <path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z" />
              </svg>
            </button>
            <Link
              to="/"
              className="text-white/90 font-semibold tracking-wide flex items-center gap-2"
            >
              <MountainLogo width={24} height={24} />
              <span className="hidden sm:inline">
                CONQUEST <span className="font-bold" style={{ 
                  background: GRADIENTS.goldK, 
                  backgroundClip: 'text', 
                  textFillColor: 'transparent',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>K</span>
              </span>
              <span className="sm:hidden">
                C<span className="font-bold" style={{ 
                  background: GRADIENTS.goldK, 
                  backgroundClip: 'text', 
                  textFillColor: 'transparent',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>K</span>
              </span>
            </Link>
          </div>

          {/* Center nav - hidden on mobile, visible on desktop */}
          <nav className="hidden lg:flex items-center component-gap text-body-sm absolute left-1/2 transform -translate-x-1/2">
            {isAuthenticated ? (
              <>
                <Link
                  className={`transition nav-link ${location.pathname === '/lobby' ? 'nav-link-active' : 'nav-link-inactive'}`}
                  to="/lobby"
                >
                  Play
                </Link>
                <Link
                  className={`transition nav-link ${location.pathname === '/maps' ? 'nav-link-active' : 'nav-link-inactive'}`}
                  to="/maps"
                >
                  Maps
                </Link>
                <Link
                  className={`transition nav-link ${location.pathname === '/community' ? 'nav-link-active' : 'nav-link-inactive'}`}
                  to="/community"
                >
                  Community
                </Link>
                <Link
                  className={`transition nav-link ${location.pathname === '/tutorial' ? 'nav-link-active' : 'nav-link-inactive'}`}
                  to="/tutorial"
                >
                  How to Play
                </Link>
                {user?.isAdmin && (
                  <Link
                    className={`transition nav-link ${location.pathname === '/admin' ? 'nav-link-active' : 'nav-link-inactive'}`}
                    to="/admin"
                  >
                    Admin
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link className="nav-link nav-link-inactive transition" to="/">
                  Home
                </Link>
                <Link className="nav-link nav-link-inactive transition" to="/lobby">
                  Play Now
                </Link>
                <Link className="nav-link nav-link-inactive transition" to="/maps">
                  Browse Maps
                </Link>
                <Link className="nav-link nav-link-inactive transition" to="/community">
                  Community
                </Link>
                <Link className="nav-link nav-link-inactive transition" to="/tutorial">
                  How to Play
                </Link>
              </>
            )}
          </nav>

          {/* Right auth */}
          <div className="flex items-center gap-1 sm:gap-2">
            {isAuthenticated ? (
              <>
                {/* Audio Mute Button */}
                <button
                  onClick={handleToggleMute}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors relative group"
                  title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                  aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-colors ${
                      isMuted ? 'text-accent' : 'text-success'
                    }`}
                  >
                    {isMuted ? (
                      <>
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                      </>
                    ) : (
                      <>
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </>
                    )}
                  </svg>
                  
                  {/* Tooltip */}
                  <div className="tooltip">
                    {isMuted ? 'Audio Muted' : 'Audio Enabled'}
                  </div>
                </button>
                
                {/* Active Games Dropdown */}
                <ActiveGamesDropdown />
                
                {/* Notification Dropdown */}
                <NotificationDropdown />

                {/* User Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-white/80 hover:text-white hover:bg-white/10 transition"
                  >
                    <span className="hidden sm:inline">
                      {user?.username ? sanitizeText(user.username) : ''}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" className="fill-current">
                      <path d="M7 10l5 5 5-5z" />
                    </svg>
                  </button>

                  {/* User Dropdown Menu */}
                  {isUserDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsUserDropdownOpen(false)}
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
                          onClick={() => {
                            handleLogout()
                            setIsUserDropdownOpen(false)
                          }}
                          className="dropdown-item text-accent hover:brightness-110"
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
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setIsMenuOpen(false)} />
      )}

      {/* Comprehensive Side Menu */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-surface-1 z-50 transform transition-transform duration-300 ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } border-r border-border`}
      >
        {/* Menu Header */}
        <div className="nav-menu-header">
          <div className="flex items-center gap-2">
            <MountainLogo width={24} height={24} />
            <span className="text-xl font-bold">
              <span className="text-white">CONQUEST </span>
              <span className="font-bold" style={{
                background: GRADIENTS.goldK,
                backgroundClip: 'text',
                textFillColor: 'transparent',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>K</span>
            </span>
          </div>
          <button
            onClick={() => setIsMenuOpen(false)}
            className="p-2 hover:bg-surface-2 rounded-lg transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className="fill-muted">
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    location.pathname === item.path
                      ? 'bg-violet text-white shadow-lg'
                      : 'text-muted hover:text-white hover:bg-surface-2'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </div>

            {/* Coming Soon Section */}
            <div className="mt-8 pt-6 border-t border-border">
              <div className="px-4 mb-3 text-xs font-semibold text-muted uppercase tracking-wider">
                Coming Soon
              </div>
              <div className="space-y-1 opacity-50">
                {futureItems.map((item) => (
                  <div
                    key={item.path}
                    className="flex items-center gap-3 px-4 py-3 text-muted cursor-not-allowed"
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                    <span className="ml-auto text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded">
                      Soon
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Auth Section */}
          <div className="px-4 py-4 border-t border-border">
            {isAuthenticated ? (
              <div className="space-y-2">
                <div className="px-3 py-2 text-sm text-muted">
                  Logged in as{' '}
                  <span className="text-white font-medium">
                    {user?.username ? sanitizeText(user.username) : ''}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-muted text-center mb-2">Login to play</div>
                <Link
                  to="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="block w-full px-4 py-2 text-center text-muted hover:text-white transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  onClick={() => setIsMenuOpen(false)}
                  className="block w-full px-4 py-3 bg-violet hover:brightness-110 text-white rounded-lg transition-colors text-center font-medium"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
