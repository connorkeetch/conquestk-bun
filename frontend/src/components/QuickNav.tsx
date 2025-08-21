import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const QuickNav: React.FC = () => {
  const location = useLocation();
  
  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { path: '/lobby', label: 'Find Game', icon: '🎯' },
    { path: '/create', label: 'Create', icon: '➕' },
    { path: '/maps', label: 'Maps', icon: '🗺️' },
    { path: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
    { path: '/profile', label: 'Profile', icon: '👤' },
  ];

  return (
    <nav className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12">
          {/* Quick Navigation Links */}
          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || 
                               location.pathname.startsWith(item.path + '/');
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200
                    ${isActive 
                      ? 'bg-gray-900 text-white' 
                      : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
                    }
                  `}
                >
                  <span className="mr-1.5">{item.icon}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>
          
          {/* Optional: Quick Stats or User Info */}
          <div className="hidden lg:flex items-center space-x-4 text-sm">
            <div className="text-gray-400">
              <span className="text-green-400">●</span> Online
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default QuickNav;