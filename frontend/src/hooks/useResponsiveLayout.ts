import { useEffect, useState } from 'react'

/**
 * Responsive layout breakpoints matching Tailwind defaults
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

export type BreakpointKey = keyof typeof BREAKPOINTS
export type LayoutSize = 'mobile' | 'tablet' | 'desktop' | 'wide' | 'ultrawide'

/**
 * Maps viewport width to semantic layout size
 */
function getLayoutSize(width: number): LayoutSize {
  if (width < BREAKPOINTS.md) return 'mobile'
  if (width < BREAKPOINTS.lg) return 'tablet'
  if (width < BREAKPOINTS.xl) return 'desktop'
  if (width < BREAKPOINTS['2xl']) return 'wide'
  return 'ultrawide'
}

/**
 * Hook to detect current responsive layout mode
 * Returns semantic layout size and window dimensions
 */
export function useResponsiveLayout() {
  const [dimensions, setDimensions] = useState(() => {
    if (typeof window === 'undefined') {
      return { width: BREAKPOINTS.lg, height: 768 }
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    }
  })

  const layoutSize = getLayoutSize(dimensions.width)

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener('resize', handleResize)
    // Trigger once to get initial size
    handleResize()

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return {
    layoutSize,
    width: dimensions.width,
    height: dimensions.height,
    isMobile: layoutSize === 'mobile',
    isTablet: layoutSize === 'tablet',
    isDesktop: layoutSize === 'desktop',
    isWide: layoutSize === 'wide',
    isUltrawide: layoutSize === 'ultrawide',
    // Convenience checks
    isTabletOrLarger: dimensions.width >= BREAKPOINTS.md,
    isDesktopOrLarger: dimensions.width >= BREAKPOINTS.lg,
    isWideOrLarger: dimensions.width >= BREAKPOINTS.xl,
  }
}
