import type React from 'react'
import { useCallback, useMemo } from 'react'
import type { GamePlayer } from '@/types/game'
import CustomMapDisplay from '../CustomMapDisplay'
import ResponsiveMapContainer from '../ResponsiveMapContainer'
import type { TerritoryModifier as IconTerritoryModifier } from '../TerritoryModifierIcon'
import { TerritoryModifierIcon } from '../TerritoryModifierIcon'
import { TerritoryModifierLegend } from '../TerritoryModifierLegend'
import { WorldMapSVG } from '../WorldMapSVG'
import type { TerritoryDisplayMap } from './territoryDisplay'

const CLASSIC_MAP_WIDTH = 800
const CLASSIC_MAP_HEIGHT = 500

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

  const getTerritoryColor = useCallback(
    (territoryId: string): string => {
      const territory = territories[territoryId]
      if (!territory || !territory.owner) {
        return '#D1D5DB'
      }

      return playerColors[territory.owner] ?? '#D1D5DB'
    },
    [territories, playerColors],
  )

  const territoryEntries = useMemo(() => Object.entries(territories), [territories])

  return (
    <div className="game-board flex-1 relative bg-blue-100 p-4">
      <div className="relative w-full h-full">
        {mapId === 'classic' ? (
          <ResponsiveMapContainer mapWidth={CLASSIC_MAP_WIDTH} mapHeight={CLASSIC_MAP_HEIGHT}>
            <WorldMapSVG
              territories={territories}
              onTerritoryClick={onTerritoryClick}
              onTerritoryHover={onTerritoryHover}
              getTerritoryColor={getTerritoryColor}
              hoveredTerritory={hoveredTerritory}
              selectedTerritory={selectedTerritory}
              selectedTargetTerritory={selectedTargetTerritory}
              validTargets={validTargets}
              pendingAction={pendingAction}
            />
          </ResponsiveMapContainer>
        ) : (
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
            selectedTerritoryId={selectedTerritory}
            playerColors={playerColors}
          />
        )}

        {mapId === 'classic' &&
          territoryEntries.map(([territoryId, territory]) => {
            if (!territory.armies) return null
            const modifier = territoryModifierMap?.get(territoryId)

            return (
              <div
                key={`army-${territoryId}`}
                className="absolute pointer-events-none"
                style={{
                  left: `${(territory.armyPosition.x / CLASSIC_MAP_WIDTH) * 100}%`,
                  top: `${(territory.armyPosition.y / CLASSIC_MAP_HEIGHT) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="bg-white border-2 border-gray-800 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg">
                    {territory.armies}
                  </div>
                  {modifier && (
                    <TerritoryModifierIcon modifier={modifier} size="small" showTooltip={true} />
                  )}
                </div>
              </div>
            )
          })}
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
