import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import friendsService from '@/services/friendsService'
import { socketService } from '@/services/socketService'

// AI menu entries are now generally visible

interface NavItem {
  path: string
  label: string
  icon: string
  dropdown?: DropdownItem[]
  activePrefixes?: string[]
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
  const [pendingFriends, setPendingFriends] = useState(0)

  // Fetch pending friend requests and subscribe to realtime changes
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const reqs = await friendsService.listRequests()
        if (mounted) setPendingFriends(reqs.incoming.length)
      } catch {
        if (mounted) setPendingFriends(0)
      }
    }
    void load()
    const refresh = () => void load()
    socketService.on('friend.request.received', refresh)
    socketService.on('friend.request.accepted', refresh)
    socketService.on('friend.request.declined', refresh)
    socketService.on('friend.request.cancelled', refresh)
    socketService.on('friend.added', refresh)
    socketService.on('friend.removed', refresh)
    return () => {
      mounted = false
      socketService.off('friend.request.received', refresh)
      socketService.off('friend.request.accepted', refresh)
      socketService.off('friend.request.declined', refresh)
      socketService.off('friend.request.cancelled', refresh)
      socketService.off('friend.added', refresh)
      socketService.off('friend.removed', refresh)
    }
  }, [])

  // Navigation items with dropdowns
  const navItems: NavItem[] = useMemo(() => {
    const playDropdown: DropdownItem[] = [
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
      { path: '/tutorial', label: 'Tutorial', icon: '📚', description: 'Learn to play' },
    ]

    playDropdown.splice(4, 0, {
      path: '/play/ai',
      label: 'vs AI',
      icon: '🤖',
      description: 'Single player practice',
      comingSoon: true,
    })

    const nav: NavItem[] = [
      {
        path: '/dashboard',
        label: 'Dashboard',
        icon: '🏠',
      },
      {
        path: '/lobby',
        label: 'Play',
        icon: '🎮',
        dropdown: playDropdown,
        activePrefixes: ['/lobby', '/play'],
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
          {
            path: '/maps/trending',
            label: 'Trending',
            icon: '🔥',
            description: 'Popular this week',
          },
          { path: '/maps/recent', label: 'Recent', icon: '🆕', description: 'Newest uploads' },
          {
            path: '/maps/my-maps',
            label: 'My Maps',
            icon: '💝',
            description: 'Created & favorites',
          },
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
            path: '/community/clans',
            label: 'Clans',
            icon: '🛡️',
            description: 'Find and join clans',
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

    return nav
  }, [])

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

  const isActive = (item: NavItem) => {
    const prefixes = item.activePrefixes ?? [item.path]

    if (prefixes.includes('/dashboard')) {
      return location.pathname === '/' || location.pathname === '/dashboard'
    }
    return prefixes.some((prefix) => location.pathname.startsWith(prefix))
  }

  const getNavItemClass = (item: NavItem) => {
    const baseClass =
      'nav-tab flex items-center gap-2 text-sm font-medium transition-colors duration-200 cursor-pointer'

    if (isActive(item)) {
      return `${baseClass} is-active`
    }
    return baseClass
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
    <div
      className="hidden lg:flex nav-tabs items-center gap-1 xl:gap-2 px-1 py-0.5 rounded-full bg-white/5 backdrop-blur supports-[backdrop-filter]:bg-white/10"
      ref={dropdownRef}
    >
      {navItems.map((item) => (
        <div key={item.path} className="relative">
          {item.dropdown ? (
            <button
              type="button"
              className={`${getNavItemClass(item)} justify-center xl:justify-start`}
              onClick={(e) => handleNavItemClick(item, e)}
              aria-haspopup="true"
              aria-expanded={activeDropdown === item.path}
              aria-label={item.label}
            >
              <span className="text-lg" aria-hidden="true">
                {item.icon}
              </span>
              <span className="hidden xl:inline">{item.label}</span>
              <span className="sr-only xl:hidden">{item.label}</span>
              <svg
                className={`hidden xl:block w-4 h-4 transition-transform duration-200 ${
                  activeDropdown === item.path ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                role="img"
              >
                <title>{`${item.label} menu`}</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          ) : (
            <Link
              to={item.path}
              className={`${getNavItemClass(item)} justify-center xl:justify-start`}
              onClick={() => setActiveDropdown(null)}
              aria-label={item.label}
            >
              <span className="text-lg" aria-hidden="true">
                {item.icon}
              </span>
              <span className="hidden xl:inline">{item.label}</span>
              <span className="sr-only xl:hidden">{item.label}</span>
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
                      <div className="font-medium text-[color:var(--text)] flex items-center gap-2">
                        <span>{dropdownItem.label}</span>
                        {dropdownItem.path === '/community/friends' && pendingFriends > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-primary/80 text-white">
                            {pendingFriends}
                          </span>
                        )}
                      </div>
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
