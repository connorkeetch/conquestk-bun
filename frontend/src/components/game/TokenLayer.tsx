import { useMemo } from 'react'
import { getColorValue, type PlayerColor } from '@/constants/colors'

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
        const color =
          typeof t.ownerColor === 'string'
            ? getColorValue(t.ownerColor as PlayerColor)
            : t.ownerColor
        const baseSize = 28 // base size at scale 1 (stage will scale tokens)
        const border = isValid ? 3 : 2
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
                backgroundColor: color || 'rgba(148,163,184,0.8)',
                opacity: dimmed ? 0.5 : isSelected ? 0.95 : 0.8,
                clipPath: 'polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)',
                border: `${border}px solid ${isValid ? '#38bdf8' : 'rgba(255,255,255,0.4)'}`,
                boxShadow: isSelected
                  ? '0 0 18px rgba(255,255,255,0.7), 0 2px 6px rgba(0,0,0,0.35)'
                  : isValid
                    ? '0 0 14px rgba(56,189,248,0.7), 0 2px 4px rgba(0,0,0,0.3)'
                    : '0 2px 4px rgba(0,0,0,0.3)',
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
