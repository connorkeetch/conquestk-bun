import React, { ReactNode, useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../hooks/redux';
import { logout } from '../store/authSlice';
// import Breadcrumb from './Breadcrumb';
import { gameService, GameRoom } from '../services/gameService';

interface LayoutProps {
  children: ReactNode;
}

interface MenuSection {
  id: string;
  title: string;
  icon: string;
  items: MenuItem[];
}

interface MenuItem {
  path: string;
  label: string;
  icon: string;
}

export default function Layout({ children }: LayoutProps) {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set());
  const [isGamesDropdownOpen, setIsGamesDropdownOpen] = useState(false);
  const [activeGames, setActiveGames] = useState<GameRoom[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  // Menu sections
  const menuSections: MenuSection[] = [
    {
      id: 'game',
      title: 'Game',
      icon: '🎮',
      items: [
        { path: '/lobby', label: 'Quick Match', icon: '🎯' },
        { path: '/create', label: 'Create Private Room', icon: '🏠' },
        { path: '/lobby/browse', label: 'Browse Public Games', icon: '🌍' },
        { path: '/community', label: 'Find Friends', icon: '👥' },
        { path: '/learn/tutorial', label: 'Tutorial', icon: '📚' },
      ]
    },
    {
      id: 'stats',
      title: 'Stats & Progress', 
      icon: '📊',
      items: [
        { path: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
        { path: '/games/completed', label: 'Match History', icon: '📈' },
        { path: '/profile/achievements', label: 'Achievements', icon: '🎖️' },
        { path: '/profile/stats', label: 'Personal Stats', icon: '📊' },
        { path: '/maps', label: 'Territory Heatmap', icon: '🗺️' }
      ]
    },
    {
      id: 'maps',
      title: 'Maps & Editor',
      icon: '🗺️',
      items: [
        { path: '/editor/browse', label: 'Browse Maps', icon: '🖼️' },
        { path: '/editor/new', label: 'Create Map', icon: '✏️' },
        { path: '/maps', label: 'My Maps', icon: '📁' },
      ]
    }
  ];

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Close modals with Escape
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
        setIsGamesDropdownOpen(false);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      // Close dropdowns when clicking outside
      if (isGamesDropdownOpen && !(event.target as Element).closest('.relative')) {
        setIsGamesDropdownOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isGamesDropdownOpen]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleDropdown = (sectionId: string) => {
    const newOpenDropdowns = new Set(openDropdowns);
    if (newOpenDropdowns.has(sectionId)) {
      newOpenDropdowns.delete(sectionId);
    } else {
      newOpenDropdowns.add(sectionId);
    }
    setOpenDropdowns(newOpenDropdowns);
  };

  const handleLogout = () => {
    dispatch(logout());
    setIsMenuOpen(false);
  };

  const getUserInitial = () => {
    return user?.username?.charAt(0).toUpperCase() || 'U';
  };

  const loadActiveGames = async () => {
    if (!isAuthenticated) return;
    setGamesLoading(true);
    try {
      const games = await gameService.getUserGames();
      // Filter for games the user is in that are active or waiting
      const userGames = games.filter((game: GameRoom) => 
        game.status === 'active' || game.status === 'waiting'
      );
      setActiveGames(userGames);
    } catch (error) {
      console.error('Failed to load active games:', error);
      setActiveGames([]);
    } finally {
      setGamesLoading(false);
    }
  };

  const toggleGamesDropdown = () => {
    if (!isGamesDropdownOpen) {
      loadActiveGames();
    }
    setIsGamesDropdownOpen(!isGamesDropdownOpen);
  };

  return (
    <>
      {/* Navigation - Fixed at top */}
      <nav className="nav-bar">
        <div className="nav-container">
          {/* Left Side - Hamburger + Logo */}
          <div className="nav-left">
            <div className={`hamburger ${isMenuOpen ? 'active' : ''}`} onClick={toggleMenu}>
              <span></span>
              <span></span>
              <span></span>
            </div>
            
            <Link to="/" className="logo">
              ⚔️ CONQUEST K
            </Link>
          </div>

          {/* Right Side - Quick Actions */}
          <div className="nav-links">
            {isAuthenticated ? (
              <>
                <Link to="/lobby" className="btn btn-secondary">🎯 Find Game</Link>
                
                {/* Active Games Dropdown */}
                <div className="relative">
                  <button 
                    onClick={toggleGamesDropdown}
                    className="btn btn-secondary flex items-center gap-1"
                  >
                    🎮 Active Games
                    <span className="text-xs opacity-75">▼</span>
                  </button>
                  
                  {isGamesDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50">
                      <div className="p-3 border-b border-slate-600">
                        <h3 className="font-semibold text-sm text-slate-200">Your Active Games</h3>
                      </div>
                      
                      <div className="max-h-64 overflow-y-auto">
                        {gamesLoading ? (
                          <div className="p-3 text-center text-slate-400 text-sm">
                            <div className="animate-spin w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full mx-auto mb-2"></div>
                            Loading...
                          </div>
                        ) : activeGames.length > 0 ? (
                          activeGames.map((game) => (
                            <Link
                              key={game.id}
                              to={`/game/${game.id}`}
                              className="block p-3 hover:bg-slate-700 border-b border-slate-700 last:border-b-0 transition-colors"
                              onClick={() => setIsGamesDropdownOpen(false)}
                            >
                              <div className="text-sm font-medium text-slate-100">{game.name}</div>
                              <div className="text-xs text-slate-400 mt-1">
                                {game.status === 'active' ? '🟢' : '🟡'} {game.currentPlayers}/{game.maxPlayers} players
                                {game.mapName && ` • ${game.mapName}`}
                              </div>
                            </Link>
                          ))
                        ) : (
                          <div className="p-3 text-center text-slate-400 text-sm">
                            No active games
                            <Link 
                              to="/lobby" 
                              className="block mt-2 text-blue-400 hover:text-blue-300 transition-colors"
                              onClick={() => setIsGamesDropdownOpen(false)}
                            >
                              → Find Games
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                <Link to="/create" className="btn btn-primary">+ Create Game</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-secondary">Login</Link>
                <Link to="/register" className="btn btn-primary">Register</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Slide-out Menu */}
      <div className={`slide-menu ${isMenuOpen ? 'active' : ''}`}>
        {/* Menu Header */}
        <div className="menu-header">
          <Link to="/" className="logo" style={{ fontSize: '1.25rem' }} onClick={() => setIsMenuOpen(false)}>⚔️ CONQUEST K</Link>
          <div className="menu-close" onClick={toggleMenu}>✕</div>
        </div>

        {/* User Profile Section (if authenticated) */}
        {isAuthenticated && (
          <div className="user-profile">
            <div className="user-avatar">{getUserInitial()}</div>
            <div className="user-name">{user?.username}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Welcome back!
            </div>
          </div>
        )}

        {/* Menu Sections */}
        {menuSections.map((section) => (
          <div key={section.id} className="menu-section">
            <div 
              className="menu-section-header" 
              onClick={() => toggleDropdown(section.id)}
            >
              <div className="menu-section-title">
                <span className="menu-icon">{section.icon}</span>
                <span>{section.title}</span>
              </div>
              <span className={`chevron ${openDropdowns.has(section.id) ? 'open' : ''}`}>
                ▼
              </span>
            </div>
            
            <div className={`menu-dropdown ${openDropdowns.has(section.id) ? 'open' : ''}`}>
              {section.items.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="menu-item"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <span>{item.icon} {item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* Settings Section */}
        <div className="menu-section">
          <Link
            to="/settings"
            className="menu-section-header"
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="menu-section-title">
              <span className="menu-icon">⚙️</span>
              <span>Settings</span>
            </div>
            <span className="chevron">→</span>
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

      {/* Page Content Container */}
      <div className="page-container">
        {/* Breadcrumb Navigation removed - was causing display issues */}
        
        {/* Main Content */}
        <main className="main-content">
          {children}
        </main>
      </div>

    </>
  );
}