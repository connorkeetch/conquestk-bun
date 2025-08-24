import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../hooks/redux';
import { logout } from '../store/authSlice';

export default function Header() {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = () => {
    dispatch(logout());
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      <header className="sticky top-0 z-50 glass border-b border-white/10">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Left */}
          <div className="flex items-center gap-3">
            <button 
              aria-label="Menu" 
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              onClick={toggleMenu}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" className="fill-white/70">
                <path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/>
              </svg>
            </button>
            <Link to="/" className="text-white/90 font-semibold tracking-wide flex items-center gap-2">
              <span className="text-xl">⚔️</span>
              <span>CONQUEST K</span>
            </Link>
          </div>

          {/* Center nav - always visible for now due to Tailwind v4 responsive issue */}
          <nav className="flex items-center gap-6 text-sm">
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
                <Link className="text-white/70 hover:text-white transition" to="/">Home</Link>
                <Link className="text-white/70 hover:text-white transition" to="/lobby">Play Now</Link>
                <Link className="text-white/70 hover:text-white transition" to="/maps">Browse Maps</Link>
                <Link className="text-white/70 hover:text-white transition" to="/leaderboard">Leaderboard</Link>
              </>
            )}
          </nav>

          {/* Right auth */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <span className="hidden sm:inline text-sm text-white/70 mr-2">
                  {user?.username}
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
                  className="px-3 py-1.5 rounded-md text-sm bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Slide-out Menu (keeping existing functionality) */}
      <div className={`slide-menu ${isMenuOpen ? 'active' : ''}`}>
        <div className="menu-header">
          <Link to="/" className="logo" style={{ fontSize: '1.25rem' }} onClick={() => setIsMenuOpen(false)}>
            ⚔️ CONQUEST K
          </Link>
          <div className="menu-close" onClick={toggleMenu}>✕</div>
        </div>

        {/* User Profile Section (if authenticated) */}
        {isAuthenticated && (
          <div className="user-profile">
            <div className="user-avatar">{user?.username?.charAt(0).toUpperCase() || 'U'}</div>
            <div className="user-name">{user?.username}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Welcome back!
            </div>
          </div>
        )}

        {/* Menu items */}
        <div className="menu-section">
          <Link to="/lobby" className="menu-item" onClick={() => setIsMenuOpen(false)}>
            🎮 Quick Match
          </Link>
          <Link to="/create" className="menu-item" onClick={() => setIsMenuOpen(false)}>
            🏠 Create Game
          </Link>
          <Link to="/maps" className="menu-item" onClick={() => setIsMenuOpen(false)}>
            🗺️ Browse Maps
          </Link>
          <Link to="/leaderboard" className="menu-item" onClick={() => setIsMenuOpen(false)}>
            🏆 Leaderboard
          </Link>
          <Link to="/profile" className="menu-item" onClick={() => setIsMenuOpen(false)}>
            👤 Profile
          </Link>
        </div>

        {/* Sign Out / Auth */}
        <div style={{ padding: '1rem' }}>
          {isAuthenticated ? (
            <button onClick={handleLogout} className="btn btn-danger" style={{ width: '100%' }}>
              🚪 Sign Out
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Link to="/login" className="btn btn-secondary" style={{ width: '100%' }}>
                Login
              </Link>
              <Link to="/register" className="btn btn-primary" style={{ width: '100%' }}>
                Register
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Menu Overlay */}
      <div 
        className={`menu-overlay ${isMenuOpen ? 'active' : ''}`}
        onClick={toggleMenu}
      />
    </>
  );
}