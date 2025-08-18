import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  path?: string;
  icon?: string;
}

const Breadcrumb: React.FC = () => {
  const location = useLocation();
  
  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [
      { label: 'Home', path: '/', icon: '🏠' }
    ];

    // Build breadcrumbs based on current route
    let currentPath = '';
    
    for (let i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i];
      currentPath += `/${segment}`;
      
      // Define breadcrumb mappings
      const breadcrumbMap: Record<string, BreadcrumbItem> = {
        // Main sections
        'lobby': { label: 'Game Lobby', path: currentPath, icon: '🎯' },
        'games': { label: 'My Games', path: currentPath, icon: '🎮' },
        'game': { label: 'Game', icon: '⚔️' },
        'create': { label: 'Create Game', path: currentPath, icon: '➕' },
        'editor': { label: 'Map Editor', path: currentPath, icon: '✏️' },
        'maps': { label: 'Maps', path: currentPath, icon: '🗺️' },
        'community': { label: 'Community', path: currentPath, icon: '👥' },
        'profile': { label: 'Profile', path: currentPath, icon: '👤' },
        'leaderboard': { label: 'Leaderboard', path: currentPath, icon: '🏆' },
        'learn': { label: 'Learn & Help', path: currentPath, icon: '📚' },
        
        // Lobby subsections
        'browse': { label: 'Browse Games', path: currentPath, icon: '🌍' },
        'private': { label: 'Private Games', path: currentPath, icon: '🔒' },
        'tournaments': { label: 'Tournaments', path: currentPath, icon: '🏆' },
        
        // Games subsections
        'active': { label: 'Active Games', path: currentPath, icon: '⚡' },
        'completed': { label: 'Completed', path: currentPath, icon: '✅' },
        'spectate': { label: 'Spectate', path: currentPath, icon: '👁️' },
        
        // Editor subsections
        'new': { label: 'New Map', path: currentPath, icon: '🆕' },
        
        // Community subsections
        'forum': { label: 'Forum', path: currentPath, icon: '💬' },
        'clans': { label: 'Clans', path: currentPath, icon: '⚔️' },
        'events': { label: 'Events', path: currentPath, icon: '🎉' },
        
        // Profile subsections
        'stats': { label: 'Statistics', path: currentPath, icon: '📈' },
        'achievements': { label: 'Achievements', path: currentPath, icon: '🎖️' },
        
        // Learn subsections
        'tutorial': { label: 'Tutorial', path: currentPath, icon: '🎯' },
        'rules': { label: 'Rules', path: currentPath, icon: '📜' },
        'strategies': { label: 'Strategies', path: currentPath, icon: '🧠' },
        'videos': { label: 'Videos', path: currentPath, icon: '📹' },
        'map-creation': { label: 'Map Creation Guide', path: currentPath, icon: '🎓' },
        
        // Create game types
        'quick': { label: 'Quick Match', path: currentPath, icon: '⚡' },
        'custom': { label: 'Custom Game', path: currentPath, icon: '🎨' },
        'tournament': { label: 'Tournament', path: currentPath, icon: '🏆' },
        
        // Auth pages
        'login': { label: 'Login', path: currentPath, icon: '🔑' },
        'register': { label: 'Register', path: currentPath, icon: '📝' },
        
        // Legacy routes
        'dashboard': { label: 'Dashboard', path: currentPath, icon: '📊' },
        'play': { label: 'Play', path: currentPath, icon: '🎮' },
        'map-editor': { label: 'Map Editor', path: currentPath, icon: '✏️' },
        'simple-map': { label: 'Simple Map Demo', path: currentPath, icon: '🏰' },
        'risk-map': { label: 'Risk Map Demo', path: currentPath, icon: '🌍' },
        'room': { label: 'Game Room', icon: '🏠' }
      };
      
      // Handle dynamic segments (IDs)
      if (breadcrumbMap[segment]) {
        breadcrumbs.push(breadcrumbMap[segment]);
      } else {
        // Handle dynamic IDs
        const previousSegment = pathSegments[i - 1];
        
        if (previousSegment === 'game') {
          breadcrumbs.push({ label: `Game #${segment.slice(0, 8)}`, icon: '⚔️' });
        } else if (previousSegment === 'room') {
          breadcrumbs.push({ label: `Room #${segment.slice(0, 8)}`, icon: '🏠' });
        } else if (previousSegment === 'profile' && segment !== 'stats' && segment !== 'achievements') {
          breadcrumbs.push({ label: segment, icon: '👤' });
        } else if (previousSegment === 'editor' && segment !== 'new' && segment !== 'browse') {
          breadcrumbs.push({ label: `Map #${segment.slice(0, 8)}`, icon: '🗺️' });
        } else if (previousSegment === 'leaderboard') {
          const typeMap: Record<string, string> = {
            'weekly': 'Weekly Rankings',
            'monthly': 'Monthly Rankings',
            'alltime': 'All-Time Rankings',
            'tournament': 'Tournament Rankings'
          };
          breadcrumbs.push({ 
            label: typeMap[segment] || segment, 
            path: currentPath, 
            icon: '🏆' 
          });
        } else {
          // Fallback for unknown segments
          breadcrumbs.push({ 
            label: segment.charAt(0).toUpperCase() + segment.slice(1), 
            path: currentPath 
          });
        }
      }
    }
    
    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();
  
  // Don't show breadcrumbs on home page or if only one level deep
  if (location.pathname === '/' || breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav className="breadcrumb bg-gray-900/50 border-b border-gray-700 px-6 py-3">
      <ol className="flex items-center space-x-2 text-sm">
        {breadcrumbs.map((item, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && (
              <span className="mx-2 text-gray-500 select-none">/</span>
            )}
            
            {item.path && index < breadcrumbs.length - 1 ? (
              <Link
                to={item.path}
                className="flex items-center gap-1.5 text-gray-400 hover:text-blue-400 transition-colors"
              >
                {item.icon && <span className="text-xs">{item.icon}</span>}
                <span>{item.label}</span>
              </Link>
            ) : (
              <span className="flex items-center gap-1.5 text-white font-medium">
                {item.icon && <span className="text-xs">{item.icon}</span>}
                <span>{item.label}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumb;