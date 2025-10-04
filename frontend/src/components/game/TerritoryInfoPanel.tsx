import type React from 'react'
import { memo, useMemo } from 'react'
import type { Player } from '@/types/game'
import type { TerritoryModifier as IconTerritoryModifier } from '../TerritoryModifierIcon'
import type { TerritoryDisplayMap } from './territoryDisplay'

interface TerritoryInfoPanelProps {
  hoveredTerritory: string | null
  selectedTerritory: string | null
  territories: TerritoryDisplayMap
  players: Player[]
  territoryModifiers?: Map<string, IconTerritoryModifier>
}

export const TerritoryInfoPanel: React.FC<TerritoryInfoPanelProps> = memo(
  ({ hoveredTerritory, selectedTerritory, territories, players, territoryModifiers }) => {
    const territoryId = hoveredTerritory || selectedTerritory

    // Memoize territory data lookup
    const territoryData = useMemo(() => {
      if (!territoryId) return null
      const territory = territories[territoryId]
      if (!territory) return null

      return {
        territory,
        owner: players.find((p) => p.id === territory.owner),
        modifier: territoryModifiers?.get(territoryId),
      }
    }, [territoryId, territories, players, territoryModifiers])

    if (!territoryData) {
      return null
    }

    const { territory, owner, modifier } = territoryData

    return (
      <div className="panel-outline p-3">
        <h3 className="text-lg font-semibold mb-2">Territory Info</h3>
        <div className="space-y-1 text-sm">
          <div>
            <span className="font-medium">Name:</span> {territory.name}
          </div>
          <div>
            <span className="font-medium">Sector:</span> {territory.continent}
          </div>
          <div>
            <span className="font-medium">Owner:</span>{' '}
            {owner ? (
              <span style={{ color: owner.color }}>{owner.username}</span>
            ) : (
              <span className="text-muted">Neutral</span>
            )}
          </div>
          <div>
            <span className="font-medium">Armies:</span> {territory.armies || 0}
          </div>
          {modifier && (
            <div>
              <span className="font-medium">Modifier:</span>{' '}
              <span className="text-purple-600">{modifier.name}</span>
            </div>
          )}
          <div>
            <span className="font-medium">Adjacent ({territory.adjacentTerritories.length}):</span>
            <div className="text-xs text-gray-600 mt-1">
              {territory.adjacentTerritories
                .slice(0, 5)
                .map((adjId) => territories[adjId]?.name || adjId)
                .join(', ')}
              {territory.adjacentTerritories.length > 5 && '...'}
            </div>
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if the displayed territory or its data changes
    const prevId = prevProps.hoveredTerritory || prevProps.selectedTerritory
    const nextId = nextProps.hoveredTerritory || nextProps.selectedTerritory

    return (
      prevId === nextId &&
      prevProps.territories === nextProps.territories &&
      prevProps.players === nextProps.players &&
      prevProps.territoryModifiers === nextProps.territoryModifiers
    )
  },
)
