import React from 'react'

type Props = {
  width?: number
  height?: number
  className?: string
  title?: string
  withGlow?: boolean
  /** Scale the brand artwork (>1 zooms in). */
  scale?: number
  /** Bias of vertical crop for extra top visibility (0..1). 0.5 = center */
  yBias?: number
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
  withGlow = true,
  scale = 1.25,
  yBias = 0,
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
    >
      <title id={titleId}>{title}</title>
      <defs>
        {withGlow ? (
          <filter id="brandGlow" x="-50%" y="-50%" width="200%" height="200%">
            <!-- neutral outer glow -->
            <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#cbd5e1" flood-opacity="0.85" />
          </filter>
        ) : null}
      </defs>

      {(() => {
        const base = 192
        const scaled = base * scale
        const extra = scaled - base
        const x = -extra / 2
        const y = -extra * yBias
        return (
          <g filter={withGlow ? 'url(#brandGlow)' : undefined}>
            <image
              href="/Conquest_K_Logo.svg"
              x={x}
              y={y}
              width={scaled}
              height={scaled}
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
        )
      })()}
    </svg>
  )
}
