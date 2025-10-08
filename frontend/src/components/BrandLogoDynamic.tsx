import React from 'react'

type Props = {
  width?: number
  height?: number
  className?: string
  title?: string
  rounded?: number
  withShadow?: boolean
}

/**
 * Theme-aware wrapper around the new brand SVG (Conquest_K_Logo.svg).
 * - Crops to a square using preserveAspectRatio slice
 * - Adds a theme-aware background using CSS variables
 * - Keeps the original SVG artwork intact
 */
export default function BrandLogoDynamic({
  width = 28,
  height = 28,
  className = '',
  title = 'ConquestK logo',
  rounded = 6,
  withShadow = true,
}: Props) {
  const w = width
  const h = height
  const titleId = React.useId()

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 192 192"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={titleId}
      className={className}
      style={
        withShadow
          ? {
              filter:
                'drop-shadow(0 0 1px rgba(255, 255, 255, 0.6)) drop-shadow(0 0 2px var(--color-primary))',
            }
          : undefined
      }
    >
      <title id={titleId}>{title}</title>
      {/* Background driven by theme CSS variables */}
      <rect
        width="192"
        height="192"
        rx={rounded}
        fill="var(--surface-3, #111827)"
      />
      {/* Center-cropped brand artwork */}
      <image
        href="/Conquest_K_Logo.svg"
        x="0"
        y="0"
        width="192"
        height="192"
        preserveAspectRatio="xMidYMid slice"
      />
    </svg>
  )
}

