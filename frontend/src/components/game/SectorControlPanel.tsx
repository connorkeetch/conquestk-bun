import type React from 'react'
import { memo, useCallback, useMemo } from 'react'
import { getColorValue } from '@/constants/colors'
import type { GamePlayer } from '@/types/game'
import type { PlayerSectorStatus, SectorDefinition } from '@/utils/sectorBonuses'

interface SectorControlPanelProps {
  sectors: SectorDefinition[]
  playerStatuses: PlayerSectorStatus[]
  players: GamePlayer[]
}

export const SectorControlPanel: React.FC<SectorControlPanelProps> = memo(
  ({ sectors, playerStatuses, players }) => {
    // Memoize player lookup map
    const playersById = useMemo(
      () => new Map(players.map((player) => [player.id, player])),
      [players],
    )

    // Memoize partial control rendering function
    const renderPartialControl = useCallback(
      (sectorId: string) =>
        playerStatuses.map((playerStatus) => {
          const partialControl = playerStatus.controlledSectors.find(
            (control) =>
              control.sector.id === sectorId &&
              !control.controlled &&
              control.controlledTerritories > 0,
          )

          if (!partialControl) return null

          const player = playersById.get(playerStatus.playerId)
          if (!player) return null

          return (
            <div key={playerStatus.playerId} className="flex items-center mb-1">
              <div
                className="w-2 h-2 rounded-full mr-1 border border-gray-400"
                style={{ backgroundColor: getColorValue(player.color) }}
              />
              <span>
                {player.username}: {partialControl.controlledTerritories}/
                {partialControl.totalTerritories}
              </span>
            </div>
          )
        }),
      [playerStatuses, playersById],
    )

    return (
      <div className="p-4 flex-1 overflow-y-auto">
        <h3 className="text-lg font-semibold mb-3">Sector Control</h3>
        <div className="space-y-3">
          {sectors.map((sector) => {
            const controllingPlayer = playerStatuses.find((status) =>
              status.controlledSectors.some(
                (control) => control.sector.id === sector.id && control.controlled,
              ),
            )

            const controller = controllingPlayer
              ? playersById.get(controllingPlayer.playerId)
              : undefined

            return (
              <div
                key={sector.id}
                className={`p-3 rounded-lg border ${
                  controller ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <div
                      className="w-4 h-4 rounded-full mr-2 border border-gray-300"
                      style={{ backgroundColor: sector.color }}
                    />
                    <span className="font-medium">{sector.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-green-600">
                    +{sector.bonusArmies} armies
                  </span>
                </div>

                {controller ? (
                  <div className="flex items-center text-sm">
                    <div
                      className="w-3 h-3 rounded-full mr-2 border border-gray-400"
                      style={{ backgroundColor: getColorValue(controller.color) }}
                    />
                    <span className="font-medium">Controlled by {controller.username}</span>
                  </div>
                ) : (
                  <div className="text-sm text-muted">
                    <div className="mb-1">Not controlled by any player</div>
                    <div className="text-xs">{renderPartialControl(sector.id)}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-800 mb-2">Current Turn Bonuses</h4>
          <div className="space-y-1 text-sm">
            {playerStatuses
              .filter((status) => status.totalBonusArmies > 0)
              .map((status) => {
                const player = playersById.get(status.playerId)
                if (!player) return null

                return (
                  <div key={status.playerId} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div
                        className="w-3 h-3 rounded-full mr-2 border border-gray-400"
                        style={{ backgroundColor: getColorValue(player.color) }}
                      />
                      <span>{player.username}</span>
                    </div>
                    <span className="font-semibold text-green-600">+{status.totalBonusArmies}</span>
                  </div>
                )
              })}
            {playerStatuses.every((status) => status.totalBonusArmies === 0) && (
              <div className="text-muted italic">No sector bonuses this turn</div>
            )}
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison for better memoization
    return (
      prevProps.sectors === nextProps.sectors &&
      prevProps.playerStatuses === nextProps.playerStatuses &&
      prevProps.players === nextProps.players
    )
  },
)
