import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { TerritoryModifier as RawTerritoryModifier, Territory } from '@/types/game'
import type { AppDispatch, RootState } from '../store'
import { endTurn } from '../store/gameActions'
import {
  selectTargetTerritory,
  selectTerritory,
  setError,
  setPendingAction,
} from '../store/gameSlice'
import {
  calculateAllPlayersContinentStatus,
  resolveContinentDefinitions,
} from '../utils/continentBonuses'
import { isFriendlyTerritoryOwner } from '../utils/teamHelpers'
import CustomMapDisplay from './CustomMapDisplay'
import { GamePhaseControls } from './GamePhaseControls'
import { GameHeader } from './game/GameHeader'
import { TerritoryInfoPanel } from './game/TerritoryInfoPanel'
import ResponsiveMapContainer from './ResponsiveMapContainer'
import type { TerritoryModifier as IconTerritoryModifier } from './TerritoryModifierIcon'
import { TerritoryModifierIcon } from './TerritoryModifierIcon'
import { TerritoryModifierLegend } from './TerritoryModifierLegend'
import { WorldMapSVG } from './WorldMapSVG'

export interface TerritoryDisplay {
  id: string
  name: string
  continent: string
  adjacentTerritories: string[]
  armyPosition: { x: number; y: number }
  owner?: string
  ownerId?: string
  armies?: number
  [key: string]: unknown
}

export type TerritoryDisplayMap = Record<string, TerritoryDisplay>

interface RiskGameBoardProps {
  onTerritoryClick?: (territoryId: string) => void
  mapId?: string
}

// Helper function to convert Redux territories to display format
const createTerritoryDisplayMap = (territories: Territory[]): TerritoryDisplayMap => {
  const displayMap: TerritoryDisplayMap = {}

  territories.forEach((territory) => {
    const coordinates = territory.coordinates
    const armyPosition = coordinates ? { x: coordinates.x, y: coordinates.y } : { x: 0, y: 0 }

    displayMap[territory.id] = {
      id: territory.id,
      name: territory.name,
      continent: territory.continent ?? territory.continentId ?? 'unknown',
      adjacentTerritories: territory.adjacentTerritories,
      armyPosition,
      owner: territory.ownerId ?? undefined,
      ownerId: territory.ownerId ?? undefined,
      armies: territory.armies,
    }
  })

  return displayMap
}

const normalizeModifier = (modifier: RawTerritoryModifier): IconTerritoryModifier => ({
  name: modifier.name ?? modifier.type ?? 'Modifier',
  icon: modifier.icon ?? '✨',
  color: modifier.color ?? '#a855f7',
  defense_bonus: modifier.defense_bonus ?? 0,
  attack_bonus: modifier.attack_bonus ?? 0,
  troop_generation_bonus: modifier.troop_generation_bonus ?? 0,
  movement_restriction: modifier.movement_restriction ?? false,
  supply_line_bonus: modifier.supply_line_bonus ?? false,
})

const normaliseModifierMap = (
  modifiers: Map<string, RawTerritoryModifier> | Record<string, RawTerritoryModifier>,
): Map<string, IconTerritoryModifier> => {
  const entries =
    modifiers instanceof Map ? Array.from(modifiers.entries()) : Object.entries(modifiers)
  return new Map(
    entries.map(([territoryId, modifier]) => [territoryId, normalizeModifier(modifier)]),
  )
}

export const RiskGameBoard: React.FC<RiskGameBoardProps> = ({
  onTerritoryClick,
  mapId = 'classic',
}) => {
  const dispatch = useDispatch<AppDispatch>()
  const gameState = useSelector((state: RootState) => state.game.currentGame)
  const selectedTerritory = useSelector((state: RootState) => state.game.selectedTerritory)
  const selectedTargetTerritory = useSelector(
    (state: RootState) => state.game.selectedTargetTerritory,
  )
  const validTargets = useSelector((state: RootState) => state.game.validTargets)
  const pendingAction = useSelector((state: RootState) => state.game.pendingAction)

  const [hoveredTerritory, setHoveredTerritory] = useState<string | null>(null)

  const board = gameState?.board ?? []
  const players = gameState?.players ?? []
  const currentPlayer = gameState?.currentPlayer ?? ''
  const currentPhase = gameState?.phase ?? 'reinforcement'

  const territories = useMemo(() => createTerritoryDisplayMap(board), [board])
  const continentDefinitions = useMemo(
    () => resolveContinentDefinitions(gameState?.gameConfig?.continentBonuses),
    [gameState?.gameConfig?.continentBonuses],
  )

  const allPlayersContinentStatus = useMemo(
    () => calculateAllPlayersContinentStatus(players, board, continentDefinitions),
    [players, board, continentDefinitions],
  )

  const getTerritoryColor = useCallback(
    (territoryId: string): string => {
      const territory = territories[territoryId]
      if (!territory || !territory.owner) {
        return '#D1D5DB'
      }

      const player = players.find((p) => p.id === territory.owner)
      return player?.color || '#D1D5DB'
    },
    [territories, players],
  )

  const handleTerritoryClick = useCallback(
    (territoryId: string) => {
      if (!gameState) {
        return
      }

      const territory = territories[territoryId]
      if (!territory) {
        return
      }

      const territoryOwnerId = territory.owner ?? null

      if (currentPhase === 'reinforcement') {
        const isFriendly = isFriendlyTerritoryOwner(gameState, territoryOwnerId, currentPlayer)

        if (!isFriendly) {
          const message = gameState.gameConfig?.allowTeamPlay
            ? 'You can only deploy armies to territories owned by your team'
            : 'You can only deploy armies to your own territories'
          dispatch(setError(message))
          dispatch(selectTerritory(null))
          dispatch(selectTargetTerritory(null))
          dispatch(setPendingAction(null))
          return
        }
      }

      if (selectedTerritory === territoryId) {
        dispatch(selectTerritory(null))
        return
      }

      if (selectedTerritory && validTargets.includes(territoryId)) {
        dispatch(selectTargetTerritory(territoryId))
        if (currentPhase === 'reinforcement') {
          dispatch(setPendingAction('deploy'))
        } else if (currentPhase === 'attack') {
          dispatch(setPendingAction('attack'))
        } else if (currentPhase === 'fortify') {
          dispatch(setPendingAction('fortify'))
        }
      } else {
        dispatch(selectTerritory(territoryId))
        dispatch(selectTargetTerritory(null))
      }

      onTerritoryClick?.(territoryId)
    },
    [
      currentPhase,
      currentPlayer,
      dispatch,
      gameState,
      onTerritoryClick,
      selectedTerritory,
      territories,
      validTargets,
    ],
  )

  const handleEndTurn = useCallback(() => {
    dispatch(endTurn())
  }, [dispatch])

  const handleTerritoryHover = useCallback((territoryId: string | null) => {
    setHoveredTerritory(territoryId)
  }, [])

  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-full bg-blue-50 rounded-lg">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-600 mb-2">No Game in Progress</h2>
          <p className="text-muted">Join a game room to start playing!</p>
        </div>
      </div>
    )
  }

  const currentPlayerInfo = players.find((p) => p.id === currentPlayer)
  const headerPlayerInfo = currentPlayerInfo
    ? {
        id: currentPlayerInfo.id,
        username: currentPlayerInfo.username,
        color: currentPlayerInfo.color,
        troops: gameState?.reinforcementArmies ?? 0,
      }
    : undefined

  const territoryModifierMap = useMemo(() => {
    if (!gameState?.territoryModifiers) return null
    return normaliseModifierMap(gameState.territoryModifiers)
  }, [gameState?.territoryModifiers])

  return (
    <div className="flex flex-col h-full bg-blue-50 rounded-lg overflow-hidden">
      {/* Header */}
      <GameHeader
        currentPhase={currentPhase}
        turn={gameState.turn}
        currentPlayerInfo={headerPlayerInfo}
      />

      {/* Main Game Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map Area */}
        <div className="game-board flex-1 relative bg-blue-100 p-4">
          <div className="relative w-full h-full">
            {mapId === 'classic' ? (
              <ResponsiveMapContainer mapWidth={800} mapHeight={500}>
                <WorldMapSVG
                  territories={territories}
                  onTerritoryClick={handleTerritoryClick}
                  onTerritoryHover={handleTerritoryHover}
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
                territories={Object.values(territories).map((t) => ({
                  id: t.id,
                  name: t.name,
                  x: t.armyPosition.x,
                  y: t.armyPosition.y,
                  armies: t.armies,
                  owner: t.owner,
                  continent: t.continent,
                }))}
                onTerritoryClick={handleTerritoryClick}
                selectedTerritoryId={selectedTerritory}
                playerColors={Object.fromEntries(players.map((p) => [p.id, p.color]))}
              />
            )}

            {/* Army Count Overlays - only for classic map, custom maps handle their own */}
            {mapId === 'classic' &&
              Object.entries(territories).map(([territoryId, territory]) => {
                if (!territory.armies) return null
                const modifier = territoryModifierMap?.get(territoryId)

                return (
                  <div
                    key={`army-${territoryId}`}
                    className="absolute pointer-events-none"
                    style={{
                      left: `${(territory.armyPosition.x / 800) * 100}%`,
                      top: `${(territory.armyPosition.y / 500) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <div className="bg-white border-2 border-gray-800 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg">
                        {territory.armies}
                      </div>
                      {modifier && (
                        <TerritoryModifierIcon
                          modifier={modifier}
                          size="small"
                          showTooltip={true}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
          </div>

          {/* Territory Modifiers Legend */}
          {territoryModifierMap && territoryModifierMap.size > 0 && (
            <TerritoryModifierLegend
              modifiers={territoryModifierMap}
              position="bottom-right"
              collapsible={true}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-white border-l border-gray-300 flex flex-col">
          {/* Game Phase Controls */}
          <div className="p-4 border-b border-gray-200">
            <GamePhaseControls onEndTurn={handleEndTurn} />
          </div>

          {/* Players Legend */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold mb-3">Players</h3>
            <div className="space-y-2">
              {players.map((player) => {
                const territoriesOwned = Object.values(territories).filter(
                  (t) => t.owner === player.id,
                ).length
                const totalArmies = Object.values(territories)
                  .filter((t) => t.owner === player.id)
                  .reduce((sum, t) => sum + (t.armies || 0), 0)

                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-2 rounded ${
                      player.id === currentPlayer ? 'bg-blue-100 border border-blue-300' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-4 h-4 rounded-full border border-gray-400"
                        style={{ backgroundColor: player.color }}
                      ></div>
                      <span className="font-medium">{player.username}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span>{territoriesOwned} territories</span>
                      <br />
                      <span>{totalArmies} armies</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Game Actions */}
          {(selectedTerritory || pendingAction) && (
            <div className="p-4 border-b border-gray-200 bg-blue-50">
              <h3 className="text-lg font-semibold mb-2">Current Action</h3>
              {selectedTerritory && (
                <div className="mb-2">
                  <span className="text-sm font-medium">Selected: </span>
                  <span className="text-sm">{territories[selectedTerritory]?.name}</span>
                </div>
              )}
              {selectedTargetTerritory && (
                <div className="mb-2">
                  <span className="text-sm font-medium">Target: </span>
                  <span className="text-sm">{territories[selectedTargetTerritory]?.name}</span>
                </div>
              )}
              {pendingAction && (
                <div className="mb-2">
                  <span className="text-sm font-medium">Action: </span>
                  <span className="text-sm capitalize bg-yellow-200 px-2 py-1 rounded">
                    {pendingAction}
                  </span>
                </div>
              )}
              {validTargets.length > 0 && (
                <div className="text-xs text-gray-600">
                  {validTargets.length} valid target(s) available
                </div>
              )}
            </div>
          )}

          {/* Territory Info */}
          <TerritoryInfoPanel
            hoveredTerritory={hoveredTerritory}
            selectedTerritory={selectedTerritory}
            territories={territories}
            players={players}
            territoryModifiers={territoryModifierMap ?? undefined}
          />

          {/* Continent Control Status */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-3">Continent Control</h3>
            <div className="space-y-3">
              {continentDefinitions.map((continent) => {
                const continentId = continent.id
                const controllingPlayer = allPlayersContinentStatus.find((playerStatus) =>
                  playerStatus.controlledContinents.some(
                    (cc) => cc.continent.id === continentId && cc.controlled,
                  ),
                )

                return (
                  <div
                    key={continentId}
                    className={`p-3 rounded-lg border ${
                      controllingPlayer
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-200 bg-gray-50'
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

                    {controllingPlayer ? (
                      <div className="flex items-center text-sm">
                        <div
                          className="w-3 h-3 rounded-full mr-2 border border-gray-400"
                          style={{
                            backgroundColor: players.find(
                              (p) => p.id === controllingPlayer.playerId,
                            )?.color,
                          }}
                        />
                        <span className="font-medium">
                          Controlled by{' '}
                          {players.find((p) => p.id === controllingPlayer.playerId)?.username}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-muted">
                        <div className="mb-1">Not controlled by any player</div>
                        <div className="text-xs">
                          {/* Show partial control status */}
                          {allPlayersContinentStatus.map((playerStatus) => {
                            const partialControl = playerStatus.controlledContinents.find(
                              (cc) =>
                                cc.continent.id === continentId &&
                                !cc.controlled &&
                                cc.controlledTerritories > 0,
                            )

                            if (!partialControl) return null

                            const player = players.find((p) => p.id === playerStatus.playerId)
                            return (
                              <div key={playerStatus.playerId} className="flex items-center mb-1">
                                <div
                                  className="w-2 h-2 rounded-full mr-1 border border-gray-400"
                                  style={{ backgroundColor: player?.color }}
                                />
                                <span>
                                  {player?.username}: {partialControl.controlledTerritories}/
                                  {partialControl.totalTerritories}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Total Bonuses Summary */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-800 mb-2">Current Turn Bonuses</h4>
              <div className="space-y-1 text-sm">
                {allPlayersContinentStatus
                  .filter((playerStatus) => playerStatus.totalBonusArmies > 0)
                  .map((playerStatus) => {
                    const player = players.find((p) => p.id === playerStatus.playerId)
                    return (
                      <div
                        key={playerStatus.playerId}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center">
                          <div
                            className="w-3 h-3 rounded-full mr-2 border border-gray-400"
                            style={{ backgroundColor: player?.color }}
                          />
                          <span>{player?.username}</span>
                        </div>
                        <span className="font-semibold text-green-600">
                          +{playerStatus.totalBonusArmies}
                        </span>
                      </div>
                    )
                  })}
                {allPlayersContinentStatus.every((ps) => ps.totalBonusArmies === 0) && (
                  <div className="text-muted italic">No continent bonuses this turn</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
