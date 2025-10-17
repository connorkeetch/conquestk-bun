import type React from 'react'
import { useMemo } from 'react'
import type { GamePlayer } from '@/types/game'
import type { TerritoryModifier as IconTerritoryModifier } from '../TerritoryModifierIcon'
import { TerritoryModifierLegend } from '../TerritoryModifierLegend'
import UnifiedMapDisplay from '../UnifiedMapDisplay'
import type { TerritoryDisplayMap } from './territoryDisplay'

interface ConquestKMapProps {
  mapId: string
  territories: TerritoryDisplayMap
  players: GamePlayer[]
  selectedTerritory: string | null
  selectedTargetTerritory: string | null
  validTargets: string[]
  pendingAction: string | null
  optimisticMarkers: Record<string, { actionIds: string[]; label?: string }>
  territoryModifierMap: Map<string, IconTerritoryModifier> | null
  onTerritoryClick: (territoryId: string) => void
  onTerritoryHover: (territoryId: string | null) => void
}

export const ConquestKMap: React.FC<ConquestKMapProps> = ({
  mapId,
  territories,
  players,
  selectedTerritory,
  selectedTargetTerritory,
  validTargets,
  pendingAction,
  optimisticMarkers,
  territoryModifierMap,
  onTerritoryClick,
  onTerritoryHover,
}) => {
  const playerColors = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player.color])),
    [players],
  )

  const territoryEntries = useMemo(() => Object.entries(territories), [territories])

  // Focus coordinates handled by higher-level view logic

  return (
    <div className="game-board flex-1 min-w-0 bg-surface-2 p-0 sm:p-2">
      <UnifiedMapDisplay
        mapId={mapId}
        territories={territoryEntries.map(([, territory]) => ({
          id: territory.id,
          name: territory.name,
          x: territory.armyPosition.x,
          y: territory.armyPosition.y,
          ...(typeof territory.armies === 'number' ? { armies: territory.armies } : {}),
          ...(territory.owner ? { owner: territory.owner } : {}),
          ...(territory.sector ? { sector: territory.sector } : {}),
        }))}
        onTerritoryClick={onTerritoryClick}
        onTerritoryHover={onTerritoryHover}
        selectedTerritoryId={selectedTerritory}
        selectedTargetTerritoryId={selectedTargetTerritory}
        playerColors={playerColors}
        pendingAction={pendingAction}
        optimisticMarkers={optimisticMarkers}
        validTargets={validTargets}
        // focus centering handled elsewhere
        adjacency={Object.fromEntries(
          territoryEntries.map(([id, t]) => [
            id,
            Array.isArray(t.adjacentTerritories) ? t.adjacentTerritories : [],
          ]),
        )}
      />

      {territoryModifierMap && territoryModifierMap.size > 0 && (
        <TerritoryModifierLegend
          modifiers={territoryModifierMap}
          position="bottom-right"
          collapsible={true}
        />
      )}
    </div>
  )
}
