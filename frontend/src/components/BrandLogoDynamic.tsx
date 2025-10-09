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
 * Theme-aware wrapper around the brand SVG.
 * - Crops to a square using preserveAspectRatio slice
 * - Applies a theme-aware glow using CSS variable `--ck-glow` with a neutral fallback
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
      style={{
        // Theme-aware glow using CSS variable; fall back to a neutral slate glow
        filter: withGlow ? 'drop-shadow(0 0 8px var(--ck-glow, #cbd5e1))' : undefined,
      }}
    >
      <title id={titleId}>{title}</title>
      <defs></defs>

      {(() => {
        const base = 192
        const scaled = base * scale
        const extra = scaled - base
        const x = -extra / 2
        const y = -extra * yBias
        return (
          <g>
            <image
              href="/conquest_k_logo.svg"
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
