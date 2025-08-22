import React, { ReactNode } from 'react';
import Header from './Header';

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

  return (
    <>
      <Header />
      
      {/* Page Content Container */}
      <div className="page-container">
        {/* Main Content with improved spacing */}
        <main className="main-content py-8 sm:py-12">
          {children}
        </main>
      </div>
    </>
  );
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