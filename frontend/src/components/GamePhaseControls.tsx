import type React from 'react'
import { useId, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import {
  deployArmies,
  executeAttack,
  executeFortify,
  goBackToReinforcement,
} from '../store/gameActions'
import {
  selectTargetTerritory,
  selectTerritory,
  setBattleResult,
  setPendingAction,
} from '../store/gameSlice'
import type { BattleResult } from '../types/game'
import {
  calculatePlayerContinentStatus,
  getContinentBonusArmies,
  resolveContinentDefinitions,
} from '../utils/continentBonuses'
import { isFriendlyTerritoryOwner } from '../utils/teamHelpers'
import { BattleModal } from './BattleModal'

interface GamePhaseControlsProps {
  onEndTurn: () => void
}

export const GamePhaseControls: React.FC<GamePhaseControlsProps> = ({ onEndTurn }) => {
  const dispatch = useDispatch<AppDispatch>()
  const gameState = useSelector((state: RootState) => state.game.currentGame)
  const selectedTerritory = useSelector((state: RootState) => state.game.selectedTerritory)
  const selectedTargetTerritory = useSelector(
    (state: RootState) => state.game.selectedTargetTerritory,
  )
  const pendingAction = useSelector((state: RootState) => state.game.pendingAction)
  const validTargets = useSelector((state: RootState) => state.game.validTargets)
  const battleResult = useSelector((state: RootState) => state.game.battleResult)
  const reinforcementArmiesFromStore = useSelector(
    (state: RootState) => state.game.reinforcementArmies,
  )
  const currentUser = useSelector((state: RootState) => state.auth.user)

  const [reinforcementArmies, setReinforcementArmies] = useState(1)
  const [fortifyArmies, setFortifyArmies] = useState(1)
  const deployInputId = useId()
  const fortifyInputId = useId()

  const continentDefinitions = useMemo(
    () =>
      resolveContinentDefinitions(
        gameState?.gameConfig?.sectorBonuses || gameState?.gameConfig?.continentBonuses,
      ),
    [gameState?.gameConfig],
  )

  if (!gameState || !currentUser) return null

  const isCurrentPlayerTurn = gameState.currentPlayer === currentUser.id
  const currentPlayer = gameState.players.find((p) => p.id === currentUser.id)

  // Calculate reinforcement armies
  const calculateReinforcementArmies = () => {
    if (reinforcementArmiesFromStore > 0) {
      return reinforcementArmiesFromStore
    }

    if (!currentPlayer) return 0

    const territoryCount = gameState.board.filter((t) => t.ownerId === currentPlayer.id).length
    const baseArmies = Math.max(3, Math.floor(territoryCount / 3))

    // Add sector bonuses
    const continentBonuses = getContinentBonusArmies(
      currentPlayer.id,
      gameState.board,
      continentDefinitions,
    )

    return baseArmies + continentBonuses
  }

  // Get detailed continent status for current player
  const currentPlayerContinentStatus = currentPlayer
    ? calculatePlayerContinentStatus(currentPlayer.id, gameState.board, continentDefinitions)
    : null

  const selectedTerritoryData = selectedTerritory
    ? gameState.board.find((t) => t.id === selectedTerritory)
    : null
  const selectedTargetData = selectedTargetTerritory
    ? gameState.board.find((t) => t.id === selectedTargetTerritory)
    : null
  const selectedTerritoryOwner = selectedTerritoryData
    ? gameState.players.find((p) => p.id === selectedTerritoryData.ownerId)
    : null
  const isTeammateReinforcement =
    !!selectedTerritoryData &&
    !!currentPlayer &&
    selectedTerritoryData.ownerId !== currentPlayer.id &&
    isFriendlyTerritoryOwner(gameState, selectedTerritoryData.ownerId, currentPlayer.id)

  const resolveBattleTerritory = (
    territory: BattleResult['fromTerritory'],
  ): { id: string; name: string; armies: number; ownerId: string | null } => {
    if (typeof territory === 'string') {
      const territoryData = gameState.board.find((t) => t.id === territory)
      return {
        id: territory,
        name: territoryData?.name ?? territory,
        armies: territoryData?.armies ?? 0,
        ownerId: territoryData?.ownerId ?? null,
      }
    }

    const fallback = gameState.board.find((t) => t.id === territory.id)

    return {
      id: territory.id,
      name: territory.name ?? fallback?.name ?? territory.id,
      armies: territory.armies ?? fallback?.armies ?? 0,
      ownerId: territory.ownerId ?? fallback?.ownerId ?? null,
    }
  }

  type ResolvedBattleResult = Omit<BattleResult, 'fromTerritory' | 'toTerritory'> & {
    fromTerritory: ReturnType<typeof resolveBattleTerritory>
    toTerritory: ReturnType<typeof resolveBattleTerritory>
  }

  const resolvedBattleResult: ResolvedBattleResult | null = battleResult
    ? {
        ...battleResult,
        fromTerritory: resolveBattleTerritory(battleResult.fromTerritory),
        toTerritory: resolveBattleTerritory(battleResult.toTerritory),
      }
    : null

  const handleDeploy = () => {
    if (selectedTerritory && reinforcementArmies > 0) {
      dispatch(deployArmies({ territoryId: selectedTerritory, armies: reinforcementArmies }))
    }
  }

  const handleAttack = () => {
    if (selectedTerritory && selectedTargetTerritory) {
      dispatch(
        executeAttack({
          fromTerritoryId: selectedTerritory,
          toTerritoryId: selectedTargetTerritory,
        }),
      )
    }
  }

  const handleFortify = () => {
    if (selectedTerritory && selectedTargetTerritory && fortifyArmies > 0) {
      dispatch(
        executeFortify({
          fromTerritoryId: selectedTerritory,
          toTerritoryId: selectedTargetTerritory,
          armies: fortifyArmies,
        }),
      )
    }
  }

  const handleClearSelection = () => {
    dispatch(selectTerritory(null))
    dispatch(selectTargetTerritory(null))
    dispatch(setPendingAction(null))
  }

  if (!isCurrentPlayerTurn) {
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2 text-muted">Waiting for Turn</h3>
        <p className="text-sm text-muted">
          It's {gameState.players.find((p) => p.id === gameState.currentPlayer)?.username}'s turn
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">
          {gameState.phase.charAt(0).toUpperCase() + gameState.phase.slice(1)} Phase
        </h3>
        <button
          type="button"
          onClick={onEndTurn}
          className="bg-primary hover:bg-primary text-white px-4 py-2 rounded font-medium"
          disabled={!isCurrentPlayerTurn}
        >
          End Turn
        </button>
      </div>

      {/* Phase stepper */}
      <div className="flex items-center justify-between text-xs text-muted">
        {['reinforcement', 'attack', 'fortify'].map((p, idx, arr) => {
          const isActive = gameState.phase === p
          const isCompleted =
            (p === 'reinforcement' &&
              (gameState.phase === 'attack' || gameState.phase === 'fortify')) ||
            (p === 'attack' && gameState.phase === 'fortify')
          return (
            <div key={p} className="flex-1 flex items-center">
              <div
                className={`flex items-center gap-2 px-2 py-1 rounded ${
                  isActive ? 'bg-slate-700 text-white' : isCompleted ? 'opacity-70' : 'opacity-60'
                }`}
                title={p}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isActive ? 'bg-primary' : isCompleted ? 'bg-green-500' : 'bg-slate-500'
                  }`}
                />
                <span className="capitalize">{p}</span>
              </div>
              {idx < arr.length - 1 && <div className="flex-1 h-px bg-slate-600 mx-2" />}
            </div>
          )
        })}
      </div>

      {/* Reinforcement Phase Controls */}
      {gameState.phase === 'reinforcement' && (
        <div className="space-y-3">
          <div className="bg-success-soft border border-green-600/50 p-3 rounded">
            <h4 className="font-medium text-green-300 mb-2">Deploy New Armies</h4>
            <div className="text-sm text-green-200 mb-3">
              <p className="font-medium mb-2">
                You have {calculateReinforcementArmies()} new armies to deploy this turn
              </p>

              {/* Army breakdown */}
              <div className="text-xs space-y-1 bg-green-800/30 p-2 rounded">
                {(() => {
                  if (!currentPlayer) return null
                  const territoryCount = gameState.board.filter(
                    (t) => t.ownerId === currentPlayer.id,
                  ).length
                  const baseArmies = Math.max(3, Math.floor(territoryCount / 3))
                  const continentBonuses = getContinentBonusArmies(
                    currentPlayer.id,
                    gameState.board,
                    continentDefinitions,
                  )

                  return (
                    <>
                      <div className="flex justify-between">
                        <span>Base armies ({territoryCount} territories):</span>
                        <span>+{baseArmies}</span>
                      </div>
                      {continentBonuses > 0 && (
                        <div className="flex justify-between">
                          <span>Sector bonuses:</span>
                          <span>+{continentBonuses}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium border-t border-green-600/50 pt-1">
                        <span>Total:</span>
                        <span>{baseArmies + continentBonuses}</span>
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Sector control details */}
              {currentPlayerContinentStatus &&
                currentPlayerContinentStatus.totalBonusArmies > 0 && (
                  <div className="mt-2 text-xs">
                    <div className="font-medium text-green-300 mb-1">Controlled Sectors:</div>
                    <div className="space-y-1">
                      {currentPlayerContinentStatus.controlledContinents
                        .filter((cc) => cc.controlled)
                        .map((cc) => (
                          <div key={cc.continent.id} className="flex justify-between items-center">
                            <span className="flex items-center">
                              <div
                                className="w-3 h-3 rounded-full mr-2"
                                style={{ backgroundColor: cc.continent.color }}
                              />
                              {cc.continent.name}
                            </span>
                            <span className="font-medium">+{cc.continent.bonusArmies}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
            </div>

            {selectedTerritory ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Deploying to: <strong>{selectedTerritoryData?.name}</strong>
                  (Current: {selectedTerritoryData?.armies} armies)
                </p>
                {isTeammateReinforcement && selectedTerritoryOwner && (
                  <div className="text-xs text-yellow-200 bg-yellow-900/40 border border-yellow-500/50 rounded p-2">
                    Team boost: {selectedTerritoryOwner.username} will control these armies.
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <label className="text-sm" htmlFor={deployInputId}>
                    Armies to deploy:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={calculateReinforcementArmies()}
                    value={reinforcementArmies}
                    id={deployInputId}
                    onChange={(e) => setReinforcementArmies(parseInt(e.target.value, 10) || 1)}
                    className="w-20 px-2 py-1 border border-slate-600 bg-slate-700 text-white rounded text-center"
                  />
                  <button
                    type="button"
                    onClick={handleDeploy}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Deploy
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-green-400">
                Click on a friendly territory (yours or a teammate's) to deploy armies
              </p>
            )}
          </div>
        </div>
      )}

      {/* Attack Phase Controls */}
      {gameState.phase === 'attack' && (
        <div className="space-y-3">
          {/* Go Back Button - Only show if no attacks made yet */}
          {!gameState.hasAttackedThisTurn && (
            <div className="bg-warning-soft border border-yellow-600/50 p-2 rounded">
              <button
                type="button"
                onClick={() => dispatch(goBackToReinforcement())}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm w-full"
              >
                ← Go Back to Reinforcement Phase
              </button>
              <p className="text-xs text-yellow-300 mt-1">
                You can return to deploy more armies before attacking
              </p>
            </div>
          )}

          <div className="bg-danger-soft border border-red-600/50 p-3 rounded">
            <h4 className="font-medium text-red-300 mb-2">Attack Territories</h4>

            {!selectedTerritory ? (
              <p className="text-sm text-red-400">
                Select one of your territories with 2+ armies to attack from
              </p>
            ) : !selectedTargetTerritory ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Attacking from: <strong>{selectedTerritoryData?.name}</strong>(
                  {selectedTerritoryData?.armies} armies)
                </p>
                <p className="text-sm text-red-400">
                  {validTargets.length > 0
                    ? `Select a target territory (${validTargets.length} available)`
                    : 'No adjacent enemy territories to attack'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>{selectedTerritoryData?.name}</strong> ({selectedTerritoryData?.armies}{' '}
                  armies) attacking <strong>{selectedTargetData?.name}</strong> (
                  {selectedTargetData?.armies} armies)
                </p>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={handleAttack}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Attack!
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fortification Phase Controls */}
      {gameState.phase === 'fortify' && (
        <div className="space-y-3">
          {/* Movement Type Info */}
          <div className="bg-indigo-900/30 border border-indigo-600/50 p-2 rounded">
            <div className="text-xs font-medium text-indigo-300 mb-1">Movement Rules:</div>
            <div className="text-xs text-indigo-200">
              {gameState.gameConfig?.movementType === 'classic_adjacent' &&
                'One territory → Adjacent only (1 move per turn)'}
              {gameState.gameConfig?.movementType === 'adjacent_multi' &&
                'Multiple territories → Adjacent only'}
              {gameState.gameConfig?.movementType === 'path_single' &&
                'One territory → Any connected territory (1 move per turn)'}
              {gameState.gameConfig?.movementType === 'path_multi' &&
                'Multiple territories → Any connected territories'}
            </div>
          </div>

          <div className="bg-primary-soft-bg border border-primary/50 p-3 rounded">
            <h4 className="font-medium text-primary-soft mb-2">Fortify Territories</h4>

            {/* Show movement restrictions */}
            {(gameState.gameConfig?.movementType === 'classic_adjacent' ||
              gameState.gameConfig?.movementType === 'path_single') &&
              Object.keys(gameState.movementTracking || {}).length > 0 && (
                <div className="bg-warning-soft border border-yellow-600/50 rounded p-2 mb-3">
                  <p className="text-xs text-yellow-300 font-medium">
                    ⚠️ Only one move allowed per fortify phase (already used)
                  </p>
                </div>
              )}

            {!selectedTerritory ? (
              <div className="space-y-2">
                <p className="text-sm text-primary-soft">
                  Select one of your territories with 2+ armies to move armies from
                </p>
                {Object.keys(gameState.movementTracking || {}).length > 0 && (
                  <div className="text-xs text-muted">
                    <strong>Already moved:</strong>{' '}
                    {Object.keys(gameState.movementTracking || {})
                      .map((territoryId) => {
                        const territory = gameState.board.find((t) => t.id === territoryId)
                        return territory?.name
                      })
                      .join(', ')}
                  </div>
                )}
              </div>
            ) : !selectedTargetTerritory ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Moving from: <strong>{selectedTerritoryData?.name}</strong>(
                  {selectedTerritoryData?.armies} armies)
                  {gameState.movementTracking?.[selectedTerritory] && (
                    <span className="ml-2 text-xs bg-yellow-200 px-1 rounded">Already moved</span>
                  )}
                </p>
                <p className="text-sm text-primary-soft">
                  {validTargets.length > 0
                    ? `Select a destination territory (${validTargets.length} available)`
                    : gameState.gameConfig?.movementType?.includes('path')
                      ? 'No connected territories to fortify'
                      : 'No adjacent territories to fortify'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">
                  Moving from <strong>{selectedTerritoryData?.name}</strong> (
                  {selectedTerritoryData?.armies} armies) to{' '}
                  <strong>{selectedTargetData?.name}</strong> ({selectedTargetData?.armies} armies)
                </p>
                <div className="flex items-center space-x-2">
                  <label className="text-sm" htmlFor={fortifyInputId}>
                    Armies to move:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={(selectedTerritoryData?.armies || 1) - 1}
                    value={fortifyArmies}
                    id={fortifyInputId}
                    onChange={(e) => setFortifyArmies(parseInt(e.target.value, 10) || 1)}
                    className="w-20 px-2 py-1 border border-slate-600 bg-slate-700 text-white rounded text-center"
                  />
                  <button
                    type="button"
                    onClick={handleFortify}
                    className="bg-primary hover:bg-primary text-white px-3 py-1 rounded text-sm"
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Battle Modal */}
      <BattleModal
        isOpen={!!resolvedBattleResult}
        battleResult={resolvedBattleResult}
        onClose={() => dispatch(setBattleResult(null))}
        onContinueAttack={
          selectedTerritory &&
          selectedTargetTerritory &&
          resolvedBattleResult &&
          resolvedBattleResult.fromTerritory.armies > 1 &&
          !resolvedBattleResult.conquered
            ? handleAttack
            : undefined
        }
      />

      {/* Current Selection Info */}
      {(selectedTerritory || selectedTargetTerritory) && (
        <div className="text-xs text-muted pt-2 border-t border-slate-600">
          {selectedTerritory && <p>Selected: {selectedTerritoryData?.name}</p>}
          {selectedTargetTerritory && <p>Target: {selectedTargetData?.name}</p>}
          {pendingAction && <p>Action: {pendingAction}</p>}
        </div>
      )}
    </div>
  )
}
