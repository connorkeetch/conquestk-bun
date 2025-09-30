import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { mapService } from '@/services/mapService'
import { socketService } from '@/services/socketService'
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
  lobbyMode?: boolean
  lobbyPlayers?: Array<{ id: string; username: string; color: string }>
}

export const RiskGameBoard: React.FC<RiskGameBoardProps> = ({
  onTerritoryClick,
  mapId = 'classic',
  lobbyMode = false,
  lobbyPlayers = [],
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
  const [lobbyMapData, setLobbyMapData] = useState<any>(null)
  const roomId = useSelector((state: RootState) => state.room.currentRoom?.id)
  const lastClickRef = useRef<{ id: string; ts: number } | null>(null)

  // Load map data for lobby mode
  useEffect(() => {
    if (lobbyMode && mapId) {
      mapService
        .getMap(mapId)
        .then((data) => setLobbyMapData(data))
        .catch(() => {
          // Map loading failed, will show loading spinner
        })
    }
  }, [lobbyMode, mapId])

  // Use lobby map data or game state data
  const board = lobbyMode && lobbyMapData ? lobbyMapData.territories : (gameState?.board ?? [])
  const players = lobbyMode ? lobbyPlayers : (gameState?.players ?? [])
  const currentPlayer = lobbyMode ? '' : (gameState?.currentPlayer ?? '')
  const currentPhase = lobbyMode ? 'lobby' : (gameState?.phase ?? 'reinforcement')

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

      // Double-tap/double-click detection for pings
      const now = Date.now()
      const last = lastClickRef.current
      if (last && last.id === territoryId && now - last.ts < 350) {
        if (roomId) {
          socketService.emit('ping:territory', { roomId, territoryId })
        }
        lastClickRef.current = null
      } else {
        lastClickRef.current = { id: territoryId, ts: now }
      }
    },
    [
      currentPhase,
      currentPlayer,
      dispatch,
      gameState,
      onTerritoryClick,
      roomId,
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

  // Show loading or empty state only when NOT in lobby mode
  if (!gameState && !lobbyMode) {
    return (
      <div className="flex items-center justify-center h-full panel">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[color:var(--heading)] mb-2">
            No Game in Progress
          </h2>
          <p className="text-muted">Join a game room to start playing!</p>
        </div>
      </div>
    )
  }

  // Lobby mode: wait for map data to load
  if (lobbyMode && !lobbyMapData) {
    return (
      <div className="flex items-center justify-center h-full panel">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--color-accent)] border-t-transparent mb-3"></div>
          <p className="text-muted">Loading map...</p>
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
    <div className="flex flex-col w-full h-full panel p-0 overflow-hidden">
      {lobbyMode ? (
        <div className="bg-[color:var(--surface-2)] border-b border-[color:var(--panel-border)] px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[color:var(--heading)]">
              Waiting for Game to Start
            </h2>
            <span className="badge">Lobby</span>
          </div>
          <p className="text-sm text-muted mt-1">
            {lobbyPlayers.length} {lobbyPlayers.length === 1 ? 'player' : 'players'} ready
          </p>
        </div>
      ) : (
        <GameHeader
          currentPhase={currentPhase}
          turn={gameState?.turn ?? 0}
          currentPlayerInfo={headerPlayerInfo}
        />
      )}

      <div className="flex flex-1 overflow-hidden min-h-0">
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

        <div className="hidden lg:flex w-80 border-l border-border bg-surface-1 flex-col gap-3 p-3 overflow-y-auto">
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
