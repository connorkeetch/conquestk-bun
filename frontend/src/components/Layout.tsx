import type { ReactNode } from 'react'
import Header from './Header'
import Footer from './Footer'
import { CORE_COLORS } from '../constants/colors'

interface LayoutProps {
  children: ReactNode
}

interface MenuSection {
  id: string
  title: string
  icon: string
  items: MenuItem[]
}

interface MenuItem {
  path: string
  label: string
  icon: string
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Main Content with consistent background */}
      <main className="flex-1 relative bg-gradient-to-br from-surface-1 via-violet/20 to-black">
        {/* Grid pattern overlay - consistent across all pages */}
        <div className="fixed inset-0 z-0 opacity-50 pointer-events-none">
          <svg
            className="absolute inset-0 w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke={`${CORE_COLORS.white}14`}
                  strokeWidth="1"
                />
              </pattern>
              <radialGradient id="glow" cx="50%" cy="40%" r="80%">
                <stop offset="0%" stopColor={CORE_COLORS.cyan} stopOpacity=".12" />
                <stop offset="100%" stopColor={CORE_COLORS.black} stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <rect width="100%" height="100%" fill="url(#glow)" />
          </svg>
        </div>

        {/* Content with proper z-index */}
        <div className="relative z-10">{children}</div>
      </main>

      <Footer />
    </div>
  )
}

/* Original menu sections kept for reference
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

*/
