import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { logout } from '../store/authSlice'
import { sanitizeText } from '../utils/sanitizer'

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

  // Simplified flat menu structure
  const menuItems: MenuItem[] = [
    { path: '/lobby', label: 'Game Lobby', icon: '🎮' },
    { path: '/create', label: 'Create Game', icon: '➕' },
    { path: '/maps', label: 'Maps', icon: '🗺️' },
    { path: '/map-editor', label: 'Map Editor', icon: '✏️' },
    { path: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ]
  
  // Future community features (keeping track for later)
  const futureItems: MenuItem[] = [
    { path: '/profile', label: 'Profile', icon: '👤' },
    { path: '/achievements', label: 'Achievements', icon: '🎖️' },
    { path: '/history', label: 'Match History', icon: '📋' },
    { path: '/friends', label: 'Friends', icon: '👥' },
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
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 grid grid-cols-3 items-center relative">
          {/* Left */}
          <div className="flex items-center gap-3 justify-start">
            <button
              aria-label="Menu"
              className="p-2 rounded-lg hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
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
              <span className="text-xl">⚔️</span>
              <span className="hidden sm:inline">CONQUEST K</span>
              <span className="sm:hidden">CK</span>
            </Link>
          </div>

          {/* Center nav - hidden on mobile, visible on desktop */}
          <nav className="hidden lg:flex items-center gap-6 text-sm justify-center">
            {isAuthenticated ? (
              <>
                <Link
                  className={`transition ${location.pathname === '/lobby' ? 'text-white' : 'text-white/70 hover:text-white'}`}
                  to="/lobby"
                >
                  Play
                </Link>
                <Link
                  className={`transition ${location.pathname === '/maps' ? 'text-white' : 'text-white/70 hover:text-white'}`}
                  to="/maps"
                >
                  Maps
                </Link>
                <Link
                  className={`transition ${location.pathname === '/leaderboard' ? 'text-white' : 'text-white/70 hover:text-white'}`}
                  to="/leaderboard"
                >
                  Leaderboard
                </Link>
                <Link
                  className={`transition ${location.pathname === '/profile' ? 'text-white' : 'text-white/70 hover:text-white'}`}
                  to="/profile"
                >
                  Profile
                </Link>
              </>
            ) : (
              <>
                <Link className="text-white/70 hover:text-white transition" to="/">
                  Home
                </Link>
                <Link className="text-white/70 hover:text-white transition" to="/lobby">
                  Play Now
                </Link>
                <Link className="text-white/70 hover:text-white transition" to="/maps">
                  Browse Maps
                </Link>
                <Link className="text-white/70 hover:text-white transition" to="/leaderboard">
                  Leaderboard
                </Link>
              </>
            )}
          </nav>

          {/* Right auth */}
          <div className="flex items-center gap-2 justify-end">
            {isAuthenticated ? (
              <>
                <span className="hidden sm:inline text-sm text-white/70 mr-2">
                  {user?.username ? sanitizeText(user.username) : ''}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-md text-sm text-white/80 hover:text-white hover:bg-white/10 transition"
                >
                  Logout
                </button>
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
                  className="hidden sm:inline-block px-3 py-1.5 rounded-md text-sm bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition"
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
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 z-50 transform transition-transform duration-300 ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } border-r border-gray-800`}
      >
        {/* Menu Header */}
        <div className="bg-gray-950 px-6 py-4 flex items-center justify-between border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚔️</span>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              CONQUEST K
            </span>
          </div>
          <button
            onClick={() => setIsMenuOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className="fill-gray-400">
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
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-gray-300 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </div>

            {/* Coming Soon Section */}
            <div className="mt-8 pt-6 border-t border-gray-800">
              <div className="px-4 mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Coming Soon
              </div>
              <div className="space-y-1 opacity-50">
                {futureItems.map((item) => (
                  <div
                    key={item.path}
                    className="flex items-center gap-3 px-4 py-3 text-gray-500 cursor-not-allowed"
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
          <div className="px-4 py-4 border-t border-gray-800">
            {isAuthenticated ? (
              <div className="space-y-2">
                <div className="px-3 py-2 text-sm text-gray-400">
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
                <div className="text-sm text-gray-500 text-center mb-2">Login to play</div>
                <Link
                  to="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="block w-full px-4 py-2 text-center text-gray-400 hover:text-white transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  onClick={() => setIsMenuOpen(false)}
                  className="block w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-center font-medium"
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
