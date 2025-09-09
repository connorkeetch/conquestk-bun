import React from 'react'
import { Link, useLocation } from 'react-router-dom'

interface BreadcrumbItem {
  label: string
  path?: string
  link?: string // Support both 'path' and 'link' for compatibility
  icon?: string
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[]
  className?: string
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
  const location = useLocation()

  // Auto-generate breadcrumbs if no items provided
  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    const pathSegments = location.pathname.split('/').filter(Boolean)
    const breadcrumbs: BreadcrumbItem[] = [{ label: 'Home', path: '/', icon: '🏠' }]

    // Skip if we're on the home page
    if (pathSegments.length === 0) {
      return breadcrumbs
    }

    // Build breadcrumb path
    let currentPath = ''

    const breadcrumbMap: Record<string, BreadcrumbItem> = {
      // Main sections
      dashboard: { label: 'Dashboard', icon: '📊' },
      play: { label: 'Play', icon: '🎮' },
      maps: { label: 'Maps', icon: '🗺️' },
      'map-editor': { label: 'Map Editor', icon: '✏️' },
      community: { label: 'Community', icon: '👥' },
      leaderboard: { label: 'Leaderboard', icon: '🏆' },
      learn: { label: 'Learn', icon: '📚' },
      profile: { label: 'Profile', icon: '👤' },
      settings: { label: 'Settings', icon: '⚙️' },
      statistics: { label: 'Statistics', icon: '📈' },

      // Game related
      lobby: { label: 'Game Lobby', icon: '🎲' },
      game: { label: 'Game', icon: '🎯' },
      games: { label: 'Games', icon: '🎯' },
      create: { label: 'Create Game', icon: '➕' },
      join: { label: 'Join Game', icon: '🚪' },
      'quick-match': { label: 'Quick Match', icon: '⚡' },
      ranked: { label: 'Ranked', icon: '🏆' },
      browse: { label: 'Browse', icon: '🔍' },
      ai: { label: 'vs AI', icon: '🤖' },
      tutorial: { label: 'Tutorial', icon: '📖' },

      // Map related
      official: { label: 'Official Maps', icon: '🌍' },
      featured: { label: 'Featured', icon: '⭐' },
      'my-maps': { label: 'My Maps', icon: '📁' },
      workshop: { label: 'Workshop', icon: '🔧' },

      // Auth
      login: { label: 'Login', icon: '🔑' },
      register: { label: 'Register', icon: '📝' },

      // Admin
      admin: { label: 'Admin', icon: '👨‍💼' },
      users: { label: 'Users', icon: '👥' },
      content: { label: 'Content', icon: '📝' },
      reviews: { label: 'Reviews', icon: '📋' },
    }

    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`
      const item = breadcrumbMap[segment.toLowerCase()] || {
        label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
        icon: '📄',
      }

      // Don't add link to the last item (current page)
      if (index === pathSegments.length - 1) {
        breadcrumbs.push({ ...item })
      } else {
        breadcrumbs.push({ ...item, path: currentPath })
      }
    })

    return breadcrumbs
  }

  // Use provided items or auto-generate
  const breadcrumbItems = items || generateBreadcrumbs()

  // If only one item (Home) and we're on the home page, don't show breadcrumb
  if (breadcrumbItems.length === 1 && location.pathname === '/') {
    return null
  }

  return (
    <nav className={`flex items-center gap-2 text-sm ${className}`} aria-label="Breadcrumb">
      {breadcrumbItems.map((item, index) => {
        const isLast = index === breadcrumbItems.length - 1
        const linkPath = item.path || item.link // Support both properties

        return (
          <React.Fragment key={index}>
            {/* Breadcrumb Item */}
            <div className="flex items-center">
              {linkPath && !isLast ? (
                <Link
                  to={linkPath}
                  className="flex items-center space-x-1 text-muted hover:text-white transition-colors"
                >
                  {item.icon && <span>{item.icon}</span>}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <div className="flex items-center space-x-1 text-white">
                  {item.icon && <span>{item.icon}</span>}
                  <span>{item.label}</span>
                </div>
              )}
            </div>

            {/* Separator */}
            {!isLast && (
              <svg
                className="w-4 h-4 text-gray-600 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}

export default Breadcrumb
