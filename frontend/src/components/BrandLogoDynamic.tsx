import React from 'react'
import brandUrl from '@/assets/brand/conquest_k_logo.svg?url'

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
 * Renders a theme-aware, dynamically scalable, and croppable version of the brand logo SVG.
 *
 * This component provides several advantages over a static image:
 * - **Theme-aware Glow**: Applies a glow effect that adapts to the current theme using CSS variables.
 * - **Dynamic Sizing and Cropping**: Allows for custom width, height, scaling, and vertical cropping bias.
 * - **Accessibility**: Includes `role="img"` and an `aria-labelledby` attribute for screen readers.
 *
 * @param {Props} props - The component props.
 * @param {number} [props.width=28] - The width of the SVG.
 * @param {number} [props.height=28] - The height of the SVG.
 * @param {string} [props.className=''] - Additional CSS classes to apply to the SVG.
 * @param {string} [props.title='ConquestK logo'] - The title of the SVG for accessibility.
 * @param {boolean} [props.withGlow=true] - Whether to apply the theme-aware glow effect.
 * @param {number} [props.scale=1.25] - The scale of the brand artwork (>1 zooms in).
 * @param {number} [props.yBias=0] - The vertical crop bias for extra top visibility (0..1). 0.5 = center.
 * @returns {JSX.Element} The rendered SVG component.
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
              href={brandUrl}
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
