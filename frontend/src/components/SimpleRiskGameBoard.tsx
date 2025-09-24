import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Territory } from '@/types/game'
import type { AppDispatch, RootState } from '../store'
import { endTurn } from '../store/gameActions'
import {
  selectTargetTerritory,
  selectTerritory,
  setError,
  setPendingAction,
} from '../store/gameSlice'
import { isFriendlyTerritoryOwner } from '../utils/teamHelpers'
import { GameOverModal } from './GameOverModal'
import { GamePhaseControls } from './GamePhaseControls'
import type { TerritoryDisplayMap } from './RiskGameBoard'
import { SimpleMapSVG } from './SimpleMapSVG'
import { TestMapSVG } from './TestMapSVG'

interface SimpleRiskGameBoardProps {
  onTerritoryClick?: (territoryId: string) => void
}

const TRAINING_GROUNDS_CONTINENTS: Record<string, { name: string; bonus: number; color: string }> =
  {
    'northern-lands': { name: 'Northern Lands', bonus: 3, color: '#4CAF50' },
    'central-kingdoms': { name: 'Central Kingdoms', bonus: 4, color: '#2196F3' },
    'southern-realms': { name: 'Southern Realms', bonus: 2, color: '#FF9800' },
    'eastern-empire': { name: 'Eastern Empire', bonus: 3, color: '#9C27B0' },
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
      armies: territory.armies,
    }
  })

  return displayMap
}

export const SimpleRiskGameBoard: React.FC<SimpleRiskGameBoardProps> = ({ onTerritoryClick }) => {
  const dispatch = useDispatch<AppDispatch>()
  const gameState = useSelector((state: RootState) => state.game.currentGame)
  const selectedTerritory = useSelector((state: RootState) => state.game.selectedTerritory)
  const selectedTargetTerritory = useSelector(
    (state: RootState) => state.game.selectedTargetTerritory,
  )
  const validTargets = useSelector((state: RootState) => state.game.validTargets)
  const pendingAction = useSelector((state: RootState) => state.game.pendingAction)

  const [hoveredTerritory, setHoveredTerritory] = useState<string | null>(null)
  const [showGameOverModal, setShowGameOverModal] = useState(false)

  // Monitor for game end state
  useEffect(() => {
    if (gameState?.phase === 'finished') {
      setShowGameOverModal(true)
    }
  }, [gameState?.phase])

  const board = gameState?.board ?? []
  const players = gameState?.players ?? []
  const currentPlayer = gameState?.currentPlayer ?? ''
  const currentPhase = gameState?.phase ?? 'reinforcement'

  const territories = useMemo(() => createTerritoryDisplayMap(board), [board])

  const continentDefinitions = useMemo(() => {
    const bonuses = gameState?.gameConfig?.continentBonuses
    if (bonuses && bonuses.length > 0) {
      const fallbackColors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#FFEB3B']
      return bonuses.map((bonus, index) => ({
        id: bonus.id,
        name: bonus.name,
        bonusArmies: bonus.bonusArmies,
        color: fallbackColors[index % fallbackColors.length],
      }))
    }

    return Object.entries(TRAINING_GROUNDS_CONTINENTS).map(([id, meta]) => ({
      id,
      name: meta.name,
      bonusArmies: meta.bonus,
      color: meta.color,
    }))
  }, [gameState?.gameConfig?.continentBonuses])

  const continentLookup = useMemo(
    () => Object.fromEntries(continentDefinitions.map((continent) => [continent.id, continent])),
    [continentDefinitions],
  )

  const getTerritoryColor = useCallback(
    (territoryId: string): string => {
      const territory = territories[territoryId]
      if (!territory || !territory.owner) {
        return '#E5E7EB'
      }

      const player = players.find((p) => p.id === territory.owner)
      return player?.color || '#E5E7EB'
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

  const handleCloseGameOverModal = useCallback(() => {
    setShowGameOverModal(false)
  }, [])

  const handleNewGame = useCallback(() => {
    setShowGameOverModal(false)
  }, [])

  const handleBackToMenu = useCallback(() => {
    setShowGameOverModal(false)
  }, [])

  // Early return if no game state
  if (!gameState) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-blue-50 to-green-50 rounded-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-700 mb-4">🏰 Training Grounds</h2>
          <p className="text-gray-600 mb-2">No Game in Progress</p>
          <p className="text-muted text-sm">Join a game room to start conquering the realms!</p>
        </div>
      </div>
    )
  }

  const currentPlayerInfo = players.find((p) => p.id === currentPlayer)

  // Determine which map to use based on mapId in game config
  const mapId = gameState.gameConfig?.mapId
  const isTestMap = mapId === 'test-simple-world' || mapId === 'test-mini-risk'
  const mapType = mapId === 'test-mini-risk' ? 'mini-risk' : 'simple-world'
  const mapTitle =
    mapId === 'test-mini-risk'
      ? 'Mini Risk'
      : mapId === 'test-simple-world'
        ? 'Simple World'
        : '🏰 Training Grounds'

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg overflow-hidden shadow-lg">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white p-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">{mapTitle}</h2>
            <div className="text-sm opacity-75 mt-1">
              Phase: {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)} | Turn:{' '}
              {gameState.turn}
            </div>
          </div>
          {currentPlayerInfo && (
            <div className="flex items-center space-x-3">
              <span className="text-sm">Current Turn:</span>
              <div
                className="w-5 h-5 rounded-full border-2 border-white shadow-md"
                style={{ backgroundColor: currentPlayerInfo.color }}
              ></div>
              <span className="font-semibold text-lg">{currentPlayerInfo.username}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map Area */}
        <div className="game-board flex-1 relative p-4">
          <div className="relative w-full h-full">
            {isTestMap ? (
              <TestMapSVG
                territories={territories}
                onTerritoryClick={handleTerritoryClick}
                onTerritoryHover={handleTerritoryHover}
                getTerritoryColor={getTerritoryColor}
                hoveredTerritory={hoveredTerritory}
                selectedTerritory={selectedTerritory}
                selectedTargetTerritory={selectedTargetTerritory}
                validTargets={validTargets}
                pendingAction={pendingAction}
                mapType={mapType as 'simple-world' | 'mini-risk'}
              />
            ) : (
              <SimpleMapSVG
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
            )}

            {/* Army Count Overlays - Disabled since SVG components render armies */}
            {/* {Object.entries(territories).map(([territoryId, territory]) => {
              if (!territory.armies) return null;
              
              const hasMoved = gameState.movementTracking?.[territoryId] || false;
              
              return (
                <div
                  key={`army-${territoryId}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${(territory.armyPosition.x / 600) * 100}%`,
                    top: `${(territory.armyPosition.y / 450) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className={`bg-white border-2 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg ${
                    hasMoved ? 'border-yellow-500 bg-yellow-100' : 'border-gray-800'
                  }`}>
                    {territory.armies}
                    {hasMoved && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full border border-white">
                        <div className="text-xs text-white font-bold leading-none">✓</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })} */}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-white border-l border-gray-300 flex flex-col shadow-lg">
          {/* Game Phase Controls */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <GamePhaseControls onEndTurn={handleEndTurn} />
          </div>

          {/* Players Legend */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">👥 Players</h3>
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
                    className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                      player.id === currentPlayer
                        ? 'bg-gradient-to-r from-blue-100 to-purple-100 border-2 border-blue-300'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-5 h-5 rounded-full border-2 border-gray-400 shadow-sm"
                        style={{ backgroundColor: player.color }}
                      ></div>
                      <span className="font-medium">{player.username}</span>
                    </div>
                    <div className="text-sm text-gray-600 text-right">
                      <span className="font-medium">{territoriesOwned}</span> realms
                      <br />
                      <span className="font-medium">{totalArmies}</span> armies
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Current Action */}
          {(selectedTerritory || pendingAction) && (
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-yellow-50 to-orange-50">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                ⚔️ Current Action
              </h3>
              {selectedTerritory && (
                <div className="mb-2 p-2 bg-white rounded border">
                  <span className="text-sm font-medium text-blue-600">Selected: </span>
                  <span className="text-sm font-semibold">
                    {territories[selectedTerritory]?.name}
                  </span>
                </div>
              )}
              {selectedTargetTerritory && (
                <div className="mb-2 p-2 bg-white rounded border">
                  <span className="text-sm font-medium text-red-600">Target: </span>
                  <span className="text-sm font-semibold">
                    {territories[selectedTargetTerritory]?.name}
                  </span>
                </div>
              )}
              {pendingAction && (
                <div className="mb-2">
                  <span className="text-sm font-medium">Action: </span>
                  <span className="text-sm font-bold capitalize bg-yellow-200 px-2 py-1 rounded">
                    {pendingAction}
                  </span>
                </div>
              )}
              {validTargets.length > 0 && (
                <div className="text-xs text-gray-600 bg-green-100 p-2 rounded">
                  {validTargets.length} valid target(s) available
                </div>
              )}
            </div>
          )}

          {/* Territory Info */}
          {(hoveredTerritory || selectedTerritory) && (
            <div className="p-4 border-b border-gray-200 bg-blue-50">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                🏯 Territory Info
              </h3>
              {(() => {
                const territoryId = hoveredTerritory || selectedTerritory
                if (!territoryId) {
                  return null
                }
                const territory = territories[territoryId]
                const owner = players.find((p) => p.id === territory?.owner)
                const continentKey = territory?.continent ?? ''
                const continentInfo = continentLookup[continentKey]

                return (
                  <div className="space-y-3">
                    <div className="p-3 bg-white rounded-lg">
                      <span className="font-bold text-lg">{territory?.name}</span>
                    </div>
                    <div className="text-sm text-gray-700 p-2 bg-white rounded">
                      <strong>Continent:</strong> {continentInfo?.name}
                      <span className="text-green-600 font-semibold">
                        {' '}
                        (+{continentInfo?.bonusArmies} bonus)
                      </span>
                    </div>
                    {owner && (
                      <div className="flex items-center space-x-2 p-2 bg-white rounded">
                        <span className="text-sm font-medium">Ruler:</span>
                        <div
                          className="w-4 h-4 rounded-full border border-gray-400"
                          style={{ backgroundColor: owner.color }}
                        ></div>
                        <span className="text-sm font-bold">{owner.username}</span>
                      </div>
                    )}
                    <div className="flex justify-between p-2 bg-white rounded">
                      <span className="text-sm">
                        <strong>Armies:</strong> {territory?.armies || 0}
                      </span>
                      <span className="text-sm text-gray-600">
                        <strong>Borders:</strong> {territory?.adjacentTerritories.length}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Continent Bonuses */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">🏆 Realm Bonuses</h3>
            <div className="space-y-3">
              {continentDefinitions.map((continent) => (
                <div
                  key={continent.id}
                  className="p-3 rounded-lg border-2 border-gray-200 bg-gradient-to-r from-white to-gray-50"
                >
                  <div className="font-medium text-gray-800">{continent.name}</div>
                  <div className="text-sm text-green-600 font-semibold">
                    +{continent.bonusArmies} armies per turn
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Game Over Modal */}
      {gameState && (
        <GameOverModal
          isOpen={showGameOverModal}
          winner={gameState.players.find((p) => !p.isEliminated) || null}
          eliminatedPlayers={gameState.players.filter((p) => p.isEliminated).map((p) => p.id)}
          onClose={handleCloseGameOverModal}
          onNewGame={handleNewGame}
          onBackToMenu={handleBackToMenu}
        />
      )}
    </div>
  )
}
