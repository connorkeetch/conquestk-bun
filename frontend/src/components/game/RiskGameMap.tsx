import type React from 'react'
import { useMemo } from 'react'
import { getColorValue, type PlayerColor } from '@/constants/colors'
import type { GamePlayer } from '@/types/game'
import CustomMapDisplay from '../CustomMapDisplay'
import type { TerritoryModifier as IconTerritoryModifier } from '../TerritoryModifierIcon'
import { TerritoryModifierLegend } from '../TerritoryModifierLegend'
import type { TerritoryDisplayMap } from './territoryDisplay'

interface RiskGameMapProps {
  mapId: string
  territories: TerritoryDisplayMap
  players: GamePlayer[]
  hoveredTerritory: string | null
  selectedTerritory: string | null
  selectedTargetTerritory: string | null
  validTargets: string[]
  pendingAction: string | null
  territoryModifierMap: Map<string, IconTerritoryModifier> | null
  onTerritoryClick: (territoryId: string) => void
  onTerritoryHover: (territoryId: string | null) => void
}

export const RiskGameMap: React.FC<RiskGameMapProps> = ({
  mapId,
  territories,
  players,
  hoveredTerritory,
  selectedTerritory,
  selectedTargetTerritory,
  validTargets,
  pendingAction,
  territoryModifierMap,
  onTerritoryClick,
  onTerritoryHover,
}) => {
  const playerColors = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player.color])),
    [players],
  )

  const territoryEntries = useMemo(() => Object.entries(territories), [territories])

  const focusCoords = useMemo(() => {
    const id = selectedTargetTerritory || selectedTerritory
    if (!id) return null
    const t = territories[id]
    if (!t) return null
    return { x: t.armyPosition.x, y: t.armyPosition.y }
  }, [selectedTargetTerritory, selectedTerritory, territories])

  return (
    <div className="game-board flex-1 relative bg-surface-2 p-2 sm:p-4">
      <div className="relative w-full h-full">
        <CustomMapDisplay
          mapId={mapId}
          territories={territoryEntries.map(([, territory]) => ({
            id: territory.id,
            name: territory.name,
            x: territory.armyPosition.x,
            y: territory.armyPosition.y,
            armies: territory.armies,
            owner: territory.owner,
            continent: territory.continent,
          }))}
          onTerritoryClick={onTerritoryClick}
          onTerritoryHover={onTerritoryHover}
          selectedTerritoryId={selectedTerritory}
          playerColors={playerColors}
          pendingAction={pendingAction}
          validTargets={validTargets}
          focus={focusCoords}
          adjacency={Object.fromEntries(
            territoryEntries.map(([id, t]) => [
              id,
              Array.isArray(t.adjacentTerritories) ? t.adjacentTerritories : [],
            ]),
          )}
        />
      </div>

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
