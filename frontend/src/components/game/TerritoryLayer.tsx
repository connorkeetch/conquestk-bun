import { getColorValue, type PlayerColor } from '@/constants/colors'

export interface TerritoryPoint {
  id: string
  name?: string
  x: number
  y: number
  owner?: string | null
  ownerColor?: string | PlayerColor
}

interface TerritoryLayerProps {
  mapWidth: number
  mapHeight: number
  territories: TerritoryPoint[]
  selectedId?: string | null
  validTargets?: string[]
  hoveredId?: string | null
  invalidShakeId?: string | null
}

export default function TerritoryLayer({
  mapWidth,
  mapHeight,
  territories,
  selectedId = null,
  validTargets = [],
  hoveredId = null,
  invalidShakeId = null,
}: TerritoryLayerProps) {
  const valid = new Set(validTargets)
  return (
    <div
      className="absolute left-0 top-0 pointer-events-none"
      style={{ width: mapWidth, height: mapHeight }}
    >
      {territories.map((t) => {
        const left = (t.x / Math.max(1, mapWidth)) * 100
        const top = (t.y / Math.max(1, mapHeight)) * 100
        const isSelected = t.id === selectedId
        const isValid = valid.has(t.id)
        const isHovered = t.id === hoveredId
        const color = getColorValue((t.ownerColor as PlayerColor) ?? 'blue')
        return (
          <div
            key={`tl-${t.id}`}
            className="absolute"
            style={{ left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)' }}
          >
            {/* Selected Glow */}
            {isSelected && (
              <span
                aria-hidden
                className="block rounded-full"
                style={{
                  width: 44,
                  height: 44,
                  boxShadow: `0 0 0 3px ${color}, 0 0 28px ${color}`,
                  opacity: 0.9,
                }}
              />
            )}
            {/* Valid Target Ring */}
            {isValid && !isSelected && (
              <span
                aria-hidden
                className={`block rounded-full ${invalidShakeId === t.id ? 'ck-shake' : ''}`}
                style={{
                  width: isHovered ? 40 : 36,
                  height: isHovered ? 40 : 36,
                  boxShadow: `0 0 0 3px rgba(239,68,68,0.9), 0 0 ${isHovered ? 26 : 18}px rgba(239,68,68,0.5)`,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
