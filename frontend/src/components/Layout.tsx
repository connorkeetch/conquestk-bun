import React, { ReactNode, useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../hooks/redux';
import { logout } from '../store/authSlice';
import SettingsModal from './SettingsModal';
import Breadcrumb from './Breadcrumb';

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
        { path: '/simple-map', label: 'Practice vs AI', icon: '🤖' }
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
        { path: '/simple-map', label: 'Simple Demo', icon: '🏰' },
        { path: '/risk-map', label: 'Risk Demo', icon: '🌍' }
      ]
    }
  ];

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Settings shortcut: Cmd/Ctrl + ,
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault();
        setIsSettingsOpen(true);
      }
      // Close modals with Escape
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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
              ⚔️ CONQUEST
            </Link>
          </div>

          {/* Right Side - Quick Actions */}
          <div className="nav-links">
            {isAuthenticated ? (
              <>
                <button 
                  onClick={() => setIsSettingsOpen(true)}
                  className="btn btn-ghost"
                  title="Settings (Cmd/Ctrl + ,)"
                >
                  ⚙️
                </button>
                <Link to="/lobby" className="btn btn-secondary">Quick Match</Link>
                <Link to="/create" className="btn btn-primary">Create Game</Link>
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
          <div className="logo" style={{ fontSize: '1.25rem' }}>⚔️ CONQUEST</div>
          <div className="menu-close" onClick={toggleMenu}>✕</div>
        </div>

        {/* User Profile Section (if authenticated) */}
        {isAuthenticated && (
          <div className="user-profile">
            <div className="user-avatar">{getUserInitial()}</div>
            <div className="user-name">{user?.username}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Rank: Field Marshal
            </div>
            <div className="user-stats">
              <div className="stat-item">
                <div className="stat-value">147</div>
                <div className="stat-label">WINS</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">82%</div>
                <div className="stat-label">WIN RATE</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">2,341</div>
                <div className="stat-label">RATING</div>
              </div>
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
          <div 
            className="menu-section-header"
            onClick={() => {
              setIsSettingsOpen(true);
              setIsMenuOpen(false);
            }}
          >
            <div className="menu-section-title">
              <span className="menu-icon">⚙️</span>
              <span>Settings</span>
            </div>
            <span className="chevron">→</span>
          </div>
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
        {/* Breadcrumb Navigation */}
        <Breadcrumb />
        
        {/* Main Content */}
        <main className="main-content">
          {children}
        </main>
      </div>

      {/* Settings Modal (Global Access) */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </>
  );
}