import { useMemo } from 'react'
import { getColorValue, type PlayerColor } from '@/constants/colors'
import {
  extractFirstHexColor,
  getRelativeLuminance,
  hexToRgba,
  lightenColor,
  mixColors,
} from '@/utils/color'

export interface TokenSpec {
  id: string
  name: string
  xPx: number
  yPx: number
  owner?: string | null
  ownerColor?: string | PlayerColor
  armies?: number
}

interface TokenLayerProps {
  width: number
  height: number
  tokens: TokenSpec[]
  selectedId?: string | null
  validTargets?: string[]
  dimNonTargets?: boolean
  onClick?: (id: string) => void
  onHover?: (id: string | null) => void
}

export function TokenLayer({
  width,
  height,
  tokens,
  selectedId = null,
  validTargets = [],
  dimNonTargets = false,
  onClick,
  onHover,
}: TokenLayerProps) {
  const tokenMap = useMemo(() => new Set(validTargets), [validTargets])

  return (
    <div className="absolute left-0 top-0" style={{ width, height }}>
      {tokens.map((t) => {
        const isSelected = selectedId === t.id
        const isValid = tokenMap.has(t.id)
        const dimmed = dimNonTargets && selectedId && !isSelected && !isValid
        const colorValue =
          typeof t.ownerColor === 'string'
            ? getColorValue(t.ownerColor as PlayerColor)
            : t.ownerColor
        // Normalize to a hex color for gradient math (supports premium gradients)
        const color =
          (String(colorValue).startsWith('#')
            ? String(colorValue)
            : extractFirstHexColor(String(colorValue))) || '#94A3B8'
        const baseSize = 28 // base size at scale 1 (stage will scale tokens)
        // Determine a high-contrast edge color derived from the token color
        const luminance = getRelativeLuminance(String(color))
        const edgeStroke =
          luminance < 0.5
            ? lightenColor(String(color), 0.25)
            : mixColors(String(color), '#000000', 0.3)
        const ringWidth = isSelected ? 4 : 3
        const border = ringWidth
        const colorGlow = hexToRgba(String(color), dimmed ? 0.3 : 0.5)
        const innerFill = lightenColor(String(color), 0.15)
        // Edge-opaque → center-transparent radial gradient
        const edgeAlpha = dimmed ? 0.85 : 1
        const midAlpha = dimmed ? 0.5 : 0.7
        // formerly used for an inner alpha stop; no longer needed
        // Wider opaque edge and smoother ramp to center transparency
        const gradient = `radial-gradient(circle at center,
          ${hexToRgba(innerFill, 0.9)} 0%,
          ${hexToRgba(innerFill, 0.85)} 45%,
          ${hexToRgba(String(color), midAlpha)} 65%,
          ${hexToRgba(String(color), edgeAlpha)} 85%,
          ${hexToRgba(String(color), edgeAlpha)} 100%
        )`
        // Subtle inner halo to boost number legibility on busy maps
        const halo = `radial-gradient(circle at center,
          rgba(0,0,0,0.35) 0%,
          rgba(0,0,0,0.25) 35%,
          rgba(0,0,0,0.0) 60%
        )`
        return (
          <button
            key={t.id}
            type="button"
            className="absolute focus:outline-none"
            style={{
              left: t.xPx,
              top: t.yPx,
              transform: 'translate(-50%, -50%)',
            }}
            title={t.name}
            aria-label={`Territory: ${t.name}`}
            onClick={(e) => {
              // Prevent background click handlers from firing when clicking a token
              e.stopPropagation()
              onClick?.(t.id)
            }}
            onMouseEnter={() => onHover?.(t.id)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(t.id)}
            onBlur={() => onHover?.(null)}
          >
            <span
              className="block"
              style={{
                width: baseSize,
                height: baseSize,
                // Layer halo on top of token gradient for better number contrast
                background: `${halo}, ${gradient}`,
                opacity: dimmed ? 0.6 : 1,
                borderRadius: '50%',
                border: `${border}px solid ${isValid ? '#38bdf8' : edgeStroke}`,
                boxShadow: isSelected
                  ? `0 2px 8px rgba(0,0,0,0.55), 0 0 8px ${colorGlow}`
                  : isValid
                    ? `0 2px 6px rgba(0,0,0,0.45), 0 0 8px ${hexToRgba('#38bdf8', 0.5)}`
                    : `0 2px 6px rgba(0,0,0,0.4), 0 0 6px ${colorGlow}`,
                filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.35))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {t.armies && t.armies > 0 ? (
                <span
                  style={{
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 700,
                    textShadow: '0 1px 2px rgba(0,0,0,0.85)',
                    lineHeight: 1,
                  }}
                >
                  {t.armies}
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default TokenLayer
