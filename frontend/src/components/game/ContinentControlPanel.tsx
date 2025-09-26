import type React from 'react'
import type { GamePlayer } from '@/types/game'
import type { ContinentDefinition, PlayerContinentStatus } from '@/utils/continentBonuses'

interface ContinentControlPanelProps {
  continents: ContinentDefinition[]
  playerStatuses: PlayerContinentStatus[]
  players: GamePlayer[]
}

export const ContinentControlPanel: React.FC<ContinentControlPanelProps> = ({
  continents,
  playerStatuses,
  players,
}) => {
  const playersById = new Map(players.map((player) => [player.id, player]))

  const renderPartialControl = (continentId: string) =>
    playerStatuses.map((playerStatus) => {
      const partialControl = playerStatus.controlledContinents.find(
        (control) =>
          control.continent.id === continentId &&
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
            style={{ backgroundColor: player.color }}
          />
          <span>
            {player.username}: {partialControl.controlledTerritories}/
            {partialControl.totalTerritories}
          </span>
        </div>
      )
    })

  return (
    <div className="p-4 flex-1 overflow-y-auto">
      <h3 className="text-lg font-semibold mb-3">Continent Control</h3>
      <div className="space-y-3">
        {continents.map((continent) => {
          const controllingPlayer = playerStatuses.find((status) =>
            status.controlledContinents.some(
              (control) => control.continent.id === continent.id && control.controlled,
            ),
          )

          const controller = controllingPlayer
            ? playersById.get(controllingPlayer.playerId)
            : undefined

          return (
            <div
              key={continent.id}
              className={`p-3 rounded-lg border ${
                controller ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <div
                    className="w-4 h-4 rounded-full mr-2 border border-gray-300"
                    style={{ backgroundColor: continent.color }}
                  />
                  <span className="font-medium">{continent.name}</span>
                </div>
                <span className="text-sm font-semibold text-green-600">
                  +{continent.bonusArmies} armies
                </span>
              </div>

              {controller ? (
                <div className="flex items-center text-sm">
                  <div
                    className="w-3 h-3 rounded-full mr-2 border border-gray-400"
                    style={{ backgroundColor: controller.color }}
                  />
                  <span className="font-medium">Controlled by {controller.username}</span>
                </div>
              ) : (
                <div className="text-sm text-muted">
                  <div className="mb-1">Not controlled by any player</div>
                  <div className="text-xs">{renderPartialControl(continent.id)}</div>
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
                      style={{ backgroundColor: player.color }}
                    />
                    <span>{player.username}</span>
                  </div>
                  <span className="font-semibold text-green-600">+{status.totalBonusArmies}</span>
                </div>
              )
            })}
          {playerStatuses.every((status) => status.totalBonusArmies === 0) && (
            <div className="text-muted italic">No continent bonuses this turn</div>
          )}
        </div>
      </div>
    </div>
  )
}
