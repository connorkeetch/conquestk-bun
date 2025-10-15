import { useMemo } from 'react'
import {
  getColorValue,
  getPremiumColorMeta,
  isPureWhiteColor,
  type PlayerColor,
} from '@/constants/colors'
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
        const premiumMeta = getPremiumColorMeta(t.ownerColor ?? color)
        const isDragonfire = premiumMeta?.key === 'Dragonfire'
        const premiumEffectClass = premiumMeta?.effect
          ? ` premium-effect premium-effect-${premiumMeta.effect}`
          : ''
        const pureWhite = isPureWhiteColor(t.ownerColor ?? color)
        const baseSize = 28 // base size at scale 1 (stage will scale tokens)
        // Determine a high-contrast edge color derived from the token color
        const luminance = getRelativeLuminance(String(color))
        const edgeStroke = isDragonfire
          ? '#B45309' // warm metallic ring for Dragonfire
          : pureWhite
            ? '#FFFFFF'
            : luminance < 0.5
              ? lightenColor(String(color), 0.25)
              : mixColors(String(color), '#000000', 0.3)
        // Neutral token edge width (selection/eligibility visuals live in overlay)
        const border = Math.max(2, Math.round(0.12 * baseSize))
        const colorGlow = isDragonfire
          ? `rgba(251, 146, 60, ${dimmed ? 0.35 : 0.7})`
          : pureWhite
            ? `rgba(255,255,255,${dimmed ? 0.3 : 0.65})`
            : hexToRgba(String(color), dimmed ? 0.3 : 0.5)
        const innerFill = isDragonfire
          ? '#FDBA74' // softer orange to simulate molten middle
          : lightenColor(String(color), 0.15)
        // Edge-opaque → center-transparent radial gradient
        const edgeAlpha = dimmed ? 0.85 : 1
        const midAlpha = dimmed ? 0.5 : 0.7
        // formerly used for an inner alpha stop; no longer needed
        // Wider opaque edge and smoother ramp to center transparency
        const gradient = pureWhite
          ? `radial-gradient(circle at center,
              rgba(255,255,255,0.7) 0%,
              rgba(255,255,255,0.45) 45%,
              rgba(255,255,255,0.25) 70%,
              rgba(255,255,255,0.12) 85%,
              rgba(255,255,255,0.08) 100%
            )`
          : isDragonfire
            ? `radial-gradient(circle at 50% 42%,
                rgba(253,224,71,0.9) 0%,
                rgba(251,146,60,0.85) 45%,
                rgba(220,38,38,${midAlpha}) 70%,
                rgba(220,38,38,${edgeAlpha}) 88%,
                rgba(220,38,38,${edgeAlpha}) 100%
              ),
              conic-gradient(from 0deg at 50% 50%,
                rgba(253,224,71,0.15),
                rgba(251,146,60,0.12),
                rgba(220,38,38,0.1),
                rgba(253,224,71,0.15)
              )`
            : `radial-gradient(circle at center,
                ${hexToRgba(innerFill, 0.9)} 0%,
                ${hexToRgba(innerFill, 0.85)} 45%,
                ${hexToRgba(String(color), midAlpha)} 65%,
                ${hexToRgba(String(color), edgeAlpha)} 85%,
                ${hexToRgba(String(color), edgeAlpha)} 100%
              )`
        // Subtle inner halo to boost number legibility on busy maps
        const halo = pureWhite
          ? null
          : `radial-gradient(circle at center,
            rgba(0,0,0,0.35) 0%,
            rgba(0,0,0,0.25) 35%,
            rgba(0,0,0,0.0) 60%
          )`
        const backgroundLayers = halo ? `${halo}, ${gradient}` : gradient
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
              className={`block${premiumEffectClass}`}
              style={{
                width: baseSize,
                height: baseSize,
                // Layer halo on top of token gradient for better number contrast
                background: backgroundLayers,
                opacity: dimmed ? 0.6 : 1,
                borderRadius: '50%',
                border: `${border}px solid ${edgeStroke}`,
                boxShadow: `0 2px 6px rgba(0,0,0,0.4), 0 0 6px ${colorGlow}`,
                filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.35))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {t.armies && t.armies > 0 ? (
                <span
                  style={{
                    color: pureWhite ? '#111827' : 'white',
                    fontSize: Math.max(10, Math.round(baseSize * 0.45)),
                    fontWeight: 700,
                    textShadow: pureWhite
                      ? '0 1px 2px rgba(255,255,255,0.75)'
                      : '0 1px 2px rgba(0,0,0,0.85)',
                    lineHeight: 1,
                    position: 'relative',
                    zIndex: 2,
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
