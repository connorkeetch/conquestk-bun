import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

interface NavItem {
  path: string
  label: string
  icon: string
  dropdown?: DropdownItem[]
}

interface DropdownItem {
  path: string
  label: string
  icon: string
  description?: string
  comingSoon?: boolean
}

const PrimaryNav: React.FC = () => {
  const location = useLocation()
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Navigation items with dropdowns
  const navItems: NavItem[] = [
    {
      path: '/dashboard',
      label: 'Dashboard',
      icon: '🏠',
    },
    {
      path: '/play',
      label: 'Play',
      icon: '🎮',
      dropdown: [
        { path: '/play/casual', label: 'Casual', icon: '🎮', description: 'Find a relaxed match' },
        { path: '/play/ranked', label: 'Ranked', icon: '🏆', description: 'Competitive play' },
        {
          path: '/create',
          label: 'Create Lobby',
          icon: '➕',
          description: 'Host custom game',
        },
        {
          path: '/lobby',
          label: 'Browse Lobbies',
          icon: '🔍',
          description: 'Join existing games',
        },
        {
          path: '/play/ai',
          label: 'vs AI',
          icon: '🤖',
          description: 'Single player practice',
          comingSoon: true,
        },
        { path: '/tutorial', label: 'Tutorial', icon: '📚', description: 'Learn to play' },
      ],
    },
    {
      path: '/maps',
      label: 'Maps',
      icon: '🗺️',
      dropdown: [
        {
          path: '/maps/official',
          label: 'Official Maps',
          icon: '🌎',
          description: 'Classic Risk territories',
        },
        {
          path: '/maps/featured',
          label: 'Featured',
          icon: '⭐',
          description: 'Community highlights',
        },
        { path: '/maps/trending', label: 'Trending', icon: '🔥', description: 'Popular this week' },
        { path: '/maps/recent', label: 'Recent', icon: '🆕', description: 'Newest uploads' },
        { path: '/maps/my-maps', label: 'My Maps', icon: '💝', description: 'Created & favorites' },
        { path: '/map-editor', label: 'Map Editor', icon: '✏️', description: 'Create new maps' },
      ],
    },
    {
      path: '/community',
      label: 'Community',
      icon: '👥',
      dropdown: [
        {
          path: '/community/leaderboards',
          label: 'Leaderboards',
          icon: '🏆',
          description: 'Top players',
        },
        {
          path: '/community/friends',
          label: 'Friends',
          icon: '👫',
          description: 'Friend management',
        },
        {
          path: '/community/chat',
          label: 'Chat Rooms',
          icon: '💬',
          description: 'General discussion',
        },
        {
          path: '/community/news',
          label: 'News',
          icon: '📰',
          description: 'Updates & announcements',
        },
        {
          path: '/community/support',
          label: 'Support',
          icon: '🆘',
          description: 'Help & feedback',
        },
      ],
    },
  ]

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard'
    }
    return location.pathname.startsWith(path)
  }

  const getNavItemClass = (path: string) => {
    const baseClass =
      'relative px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm flex items-center space-x-2 cursor-pointer'

    if (isActive(path)) {
      return `${baseClass} bg-primary text-white shadow-lg`
    }
    return `${baseClass} text-muted hover:text-white hover:bg-surface-2`
  }

  const handleNavItemClick = (item: NavItem, e: React.MouseEvent) => {
    if (item.dropdown) {
      e.preventDefault()
      setActiveDropdown(activeDropdown === item.path ? null : item.path)
    } else {
      setActiveDropdown(null)
    }
  }

  return (
    <div className="hidden md:flex items-center space-x-1" ref={dropdownRef}>
      {navItems.map((item) => (
        <div key={item.path} className="relative">
          {item.dropdown ? (
            <div
              className={getNavItemClass(item.path)}
              onClick={(e) => handleNavItemClick(item, e)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${
                  activeDropdown === item.path ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          ) : (
            <Link
              to={item.path}
              className={getNavItemClass(item.path)}
              onClick={() => setActiveDropdown(null)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )}

          {/* Dropdown Menu */}
          {item.dropdown && activeDropdown === item.path && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-surface-1 rounded-xl shadow-2xl border border-border py-2 z-50">
              {item.dropdown.map((dropdownItem) =>
                dropdownItem.comingSoon ? (
                  <div
                    key={dropdownItem.path}
                    className="flex items-start space-x-3 px-4 py-3 opacity-60 cursor-not-allowed relative"
                  >
                    <span className="text-lg mt-0.5">{dropdownItem.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-muted flex items-center">
                        {dropdownItem.label}
                        <span className="ml-2 bg-yellow-600/80 text-yellow-100 px-2 py-0.5 rounded-full text-xs font-medium">
                          Coming Soon
                        </span>
                      </div>
                      {dropdownItem.description && (
                        <div className="text-xs text-muted mt-0.5">{dropdownItem.description}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <Link
                    key={dropdownItem.path}
                    to={dropdownItem.path}
                    className="flex items-start space-x-3 px-4 py-3 hover:bg-surface-2 transition-colors duration-150"
                    onClick={() => setActiveDropdown(null)}
                  >
                    <span className="text-lg mt-0.5">{dropdownItem.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-white">{dropdownItem.label}</div>
                      {dropdownItem.description && (
                        <div className="text-xs text-muted mt-0.5">{dropdownItem.description}</div>
                      )}
                    </div>
                  </Link>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default PrimaryNav
