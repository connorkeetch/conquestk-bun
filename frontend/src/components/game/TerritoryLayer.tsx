// Presentational layer only; legacy highlight effects were removed in favor of InteractionOverlay
import type { PlayerColor } from '@/constants/colors'

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
  territories: _territories,
  selectedId: _selectedId = null,
  validTargets: _validTargets = [],
  hoveredId: _hoveredId = null,
  invalidShakeId: _invalidShakeId = null,
}: TerritoryLayerProps) {
  // Legacy highlight effects removed; visuals now handled by InteractionOverlay
  return (
    <div
      className="absolute left-0 top-0 pointer-events-none"
      style={{ width: mapWidth, height: mapHeight }}
    />
  )
}
