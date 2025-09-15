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

      {/* Main Content - theme-specific gradient background */}
      <main className="flex-1 relative" style={{ background: 'var(--ck-bg-gradient)' }}>
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
                <stop offset="0%" stopColor={CORE_COLORS.violet} stopOpacity=".12" />
                <stop offset="100%" stopColor={CORE_COLORS.ink} stopOpacity="0" />
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
