import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
// import { endTurn } from '../store/gameActions'
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
// import { GamePhaseControls } from './GamePhaseControls'
import { ContinentControlPanel } from './game/ContinentControlPanel'
import { GameHeader } from './game/GameHeader'
import type { PlayerSummary } from './game/PlayersLegend'
import { PlayersLegend } from './game/PlayersLegend'
import { RiskGameMap } from './game/RiskGameMap'
import { TerritoryInfoPanel } from './game/TerritoryInfoPanel'
import type { TerritoryDisplay, TerritoryDisplayMap } from './game/territoryDisplay'
import { createTerritoryDisplayMap, normaliseModifierMap } from './game/territoryDisplay'

export type { TerritoryDisplay, TerritoryDisplayMap }

interface RiskGameBoardProps {
  onTerritoryClick?: (territoryId: string) => void
  mapId?: string
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
  const territoryValues = useMemo(() => Object.values(territories), [territories])

  const continentDefinitions = useMemo(
    () =>
      resolveContinentDefinitions(
        gameState?.gameConfig?.sectorBonuses || gameState?.gameConfig?.continentBonuses,
      ),
    [gameState?.gameConfig],
  )

  const playerContinentStatuses = useMemo(
    () => calculateAllPlayersContinentStatus(players, board, continentDefinitions),
    [players, board, continentDefinitions],
  )

  const playerSummaries = useMemo<PlayerSummary[]>(() => {
    const statsByPlayer = new Map<string, { territoriesOwned: number; totalArmies: number }>()

    territoryValues.forEach((territory) => {
      const ownerId = territory.owner
      if (!ownerId) return

      const existing = statsByPlayer.get(ownerId) ?? { territoriesOwned: 0, totalArmies: 0 }
      existing.territoriesOwned += 1
      existing.totalArmies += territory.armies ?? 0
      statsByPlayer.set(ownerId, existing)
    })

    return players.map((player) => {
      const stats = statsByPlayer.get(player.id) ?? { territoriesOwned: 0, totalArmies: 0 }
      return {
        id: player.id,
        username: player.username,
        color: player.color,
        territoriesOwned: stats.territoriesOwned,
        totalArmies: stats.totalArmies,
        isCurrentPlayer: player.id === currentPlayer,
      }
    })
  }, [players, territoryValues, currentPlayer])

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

  // Phase controls moved to action bar

  const handleTerritoryHover = useCallback((territoryId: string | null) => {
    setHoveredTerritory(territoryId)
  }, [])

  const territoryModifierMap = useMemo(() => {
    if (!gameState?.territoryModifiers) return null
    return normaliseModifierMap(gameState.territoryModifiers)
  }, [gameState?.territoryModifiers])

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

  const currentPlayerInfo = players.find((player) => player.id === currentPlayer)
  const headerPlayerInfo = currentPlayerInfo
    ? {
        id: currentPlayerInfo.id,
        username: currentPlayerInfo.username,
        color: currentPlayerInfo.color,
        troops: gameState?.reinforcementArmies ?? 0,
      }
    : undefined

  return (
    <div className="flex flex-col h-full bg-blue-50 rounded-lg overflow-hidden">
      <GameHeader
        currentPhase={currentPhase}
        turn={gameState.turn}
        currentPlayerInfo={headerPlayerInfo}
      />

      <div className="flex flex-1 overflow-hidden">
        <RiskGameMap
          mapId={mapId}
          territories={territories}
          players={players}
          hoveredTerritory={hoveredTerritory}
          selectedTerritory={selectedTerritory}
          selectedTargetTerritory={selectedTargetTerritory}
          validTargets={validTargets}
          pendingAction={pendingAction}
          territoryModifierMap={territoryModifierMap}
          onTerritoryClick={handleTerritoryClick}
          onTerritoryHover={handleTerritoryHover}
        />

        <div className="w-80 border-l border-border bg-surface-1 flex flex-col gap-3 p-3 overflow-y-auto">
          {/* Phase controls moved to bottom action bar */}

          <PlayersLegend players={playerSummaries} />

          {/* CurrentActionPanel consolidated into bottom action bar */}

          <TerritoryInfoPanel
            hoveredTerritory={hoveredTerritory}
            selectedTerritory={selectedTerritory}
            territories={territories}
            players={players}
            territoryModifiers={territoryModifierMap ?? undefined}
          />

          <ContinentControlPanel
            continents={continentDefinitions}
            playerStatuses={playerContinentStatuses}
            players={players}
          />
        </div>
      </div>
    </div>
  )
}
