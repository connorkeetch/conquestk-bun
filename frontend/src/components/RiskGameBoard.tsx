import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useDispatch, useSelector } from 'react-redux'
import type { FullMapData } from '@/services/mapService'
import { mapService } from '@/services/mapService'
import { socketService } from '@/services/socketService'
import type { GamePlayer, PlayerColor, Territory } from '@/types/game'
import type { ZoomControls } from '@/types/zoom'
import type { AppDispatch, RootState } from '../store'
// import { endTurn } from '../store/gameActions'
import {
  selectTargetTerritory,
  selectTerritory,
  setError,
  setPendingAction,
} from '../store/gameSlice'
import { isFriendlyTerritoryOwner } from '../utils/teamHelpers'
import { AssassinationContract } from './game/AssassinationContract'
import { GameActionBar } from './game/GameActionBar'
// import { GamePhaseControls } from './GamePhaseControls'
import { GameHeader } from './game/GameHeader'
import { KingOfTheHillPanel } from './game/KingOfTheHillPanel'
import { MapHeaderBar } from './game/MapHeaderBar'
import { MapSidebar } from './game/MapSidebar'
import { MapToolbar } from './game/MapToolbar'
import { RiskGameMap } from './game/RiskGameMap'
import type { TerritoryDisplay, TerritoryDisplayMap } from './game/territoryDisplay'
import { createTerritoryDisplayMap, normaliseModifierMap } from './game/territoryDisplay'

type OwnedTerritory = { id: string; ownerId?: string | null; armies?: number }

export type { TerritoryDisplay, TerritoryDisplayMap }

interface RiskGameBoardProps {
  onTerritoryClick?: (territoryId: string) => void
  mapId?: string
  lobbyMode?: boolean
  lobbyPlayers?: Array<{ id: string; username: string; color: string }>
}

export const RiskGameBoard: React.FC<RiskGameBoardProps> = ({
  onTerritoryClick,
  mapId = 'world',
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
  const viewerId = useSelector((state: RootState) => state.auth.user?.id ?? null)

  const [_hoveredTerritory, setHoveredTerritory] = useState<string | null>(null)
  const [lobbyMapData, setLobbyMapData] = useState<FullMapData | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('ui.mapSidebarCollapsed')
      return stored === 'true'
    } catch {
      return false
    }
  })
  const [zoomControls, setZoomControls] = useState<ZoomControls | null>(null)
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

  const lobbyTerritories = useMemo<Territory[] | null>(() => {
    if (!lobbyMode || !lobbyMapData) {
      return null
    }

    const adjacency = new Map<string, Set<string>>()
    for (const edge of lobbyMapData.adjacencies ?? []) {
      const from = edge.fromTerritoryId
      const to = edge.toTerritoryId
      if (!from || !to) {
        continue
      }

      const addEdge = (source: string, target: string) => {
        if (!adjacency.has(source)) {
          adjacency.set(source, new Set())
        }
        adjacency.get(source)?.add(target)
      }
      addEdge(from, to)
      if (edge.isBidirectional !== false) {
        addEdge(to, from)
      }
    }

    return lobbyMapData.territories.map((territory) => {
      const id = territory.territoryId || territory.id
      const connections = adjacency.get(id) ?? new Set<string>()

      return {
        id,
        name: territory.name,
        ownerId: null,
        armies: territory.startingArmies ?? 0,
        continent: territory.continentId,
        sector: territory.continentId,
        sectorId: territory.continentId,
        adjacentTerritories: Array.from(connections),
        coordinates: territory.armyPosition
          ? { x: territory.armyPosition.x, y: territory.armyPosition.y }
          : undefined,
      }
    })
  }, [lobbyMapData, lobbyMode])

  // Use lobby map data or game state data
  const board = lobbyTerritories ?? gameState?.board ?? []
  const players: GamePlayer[] = useMemo(() => {
    if (lobbyMode) {
      return lobbyPlayers.map((p) => ({
        id: p.id,
        userId: p.id,
        username: p.username,
        color: p.color as unknown as PlayerColor,
        territories: [],
        armies: 0,
        cards: [],
        isEliminated: false,
      }))
    }
    return gameState?.players ?? []
  }, [gameState?.players, lobbyMode, lobbyPlayers])
  const currentPlayer = lobbyMode ? '' : (gameState?.currentPlayer ?? '')
  const currentPhase = lobbyMode ? 'lobby' : (gameState?.phase ?? 'reinforcement')

  const isSpectator = useMemo(() => {
    if (!viewerId) return true
    return !players.some((player) => player.id === viewerId)
  }, [players, viewerId])

  const assassinationMode = Boolean(
    !lobbyMode && gameState?.gameConfig?.gameMode === 'assassination',
  )
  const contractTargetId = viewerId ? gameState?.assassinationTargets?.[viewerId] : undefined
  const targetPlayer = contractTargetId
    ? players.find((player) => player.id === contractTargetId)
    : undefined
  const targetTerritories = useMemo<OwnedTerritory[]>(() => {
    if (!contractTargetId || !Array.isArray(board)) return []
    return (board as OwnedTerritory[]).filter((territory) => territory.ownerId === contractTargetId)
  }, [board, contractTargetId])
  const targetArmyCount = useMemo(
    () => targetTerritories.reduce((sum, territory) => sum + (territory.armies ?? 0), 0),
    [targetTerritories],
  )
  const awaitingContract = Boolean(
    assassinationMode && !isSpectator && viewerId && !contractTargetId,
  )
  const targetEliminated = Boolean(
    targetPlayer?.isEliminated ||
      (contractTargetId && targetTerritories.length === 0 && !awaitingContract),
  )
  const targetName = targetPlayer?.username ?? null
  const canPingContract = Boolean(!targetEliminated && roomId && targetTerritories.length > 0)
  const handlePingContract = useCallback(() => {
    if (!roomId || targetTerritories.length === 0) {
      toast.error('Target currently controls no territories to ping.')
      return
    }

    const first = targetTerritories[0]
    socketService.emit('ping:territory', { roomId, territoryId: first.id })
    toast.success(
      targetName ? `Pinged ${targetName}'s last known position.` : 'Pinged your contract target.',
    )
  }, [roomId, targetName, targetTerritories])

  const kingOfTheHillState = !lobbyMode ? gameState?.kingOfTheHillState : undefined
  const kingOfTheHillMode = Boolean(
    !lobbyMode && gameState?.gameConfig?.gameMode === 'king_of_the_hill' && kingOfTheHillState,
  )
  const hillTerritoryId = kingOfTheHillState?.currentHillTerritoryId ?? null
  const canPingHill = Boolean(!isSpectator && roomId && hillTerritoryId)
  const handlePingHill = useCallback(() => {
    if (!roomId || !hillTerritoryId) {
      toast.error('Hill territory unavailable to ping right now.')
      return
    }

    socketService.emit('ping:territory', { roomId, territoryId: hillTerritoryId })
    toast.success('Pinged the active hill for your team.')
  }, [roomId, hillTerritoryId])

  const territories = useMemo(() => createTerritoryDisplayMap(board), [board])

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

  const _currentPlayerInfo = players.find((player) => player.id === currentPlayer)

  return (
    <div className="flex flex-col w-full h-full min-h-[420px] sm:min-h-[520px] lg:min-h-[640px] xl:min-h-[720px] panel p-0 overflow-hidden">
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
        <>
          <GameHeader currentPhase={currentPhase} />
          {assassinationMode && (
            <AssassinationContract
              target={targetPlayer}
              territoryCount={targetTerritories.length}
              armyCount={targetArmyCount}
              awaiting={awaitingContract}
              eliminated={targetEliminated}
              isSpectator={isSpectator}
              canPing={canPingContract}
              onPing={handlePingContract}
            />
          )}
          {kingOfTheHillMode && kingOfTheHillState && (
            <KingOfTheHillPanel
              state={kingOfTheHillState}
              players={players}
              territories={gameState?.board ?? []}
              viewerId={viewerId}
              isSpectator={isSpectator}
              canPingHill={canPingHill}
              onPingHill={handlePingHill}
            />
          )}
        </>
      )}

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 min-w-0 flex flex-col">
          {!lobbyMode && (
            <MapHeaderBar
              zoom={zoomControls ?? undefined}
              settingsContent={
                <MapToolbar
                  layout="vertical"
                  zoom={zoomControls ?? undefined}
                  showOverlayToggles={false}
                  showZoomPresets={false}
                />
              }
            />
          )}
          <div className="relative flex-1 min-h-0">
            <RiskGameMap
              mapId={mapId}
              territories={territories}
              players={players}
              selectedTerritory={selectedTerritory}
              selectedTargetTerritory={selectedTargetTerritory}
              validTargets={validTargets}
              pendingAction={pendingAction}
              territoryModifierMap={territoryModifierMap}
              onTerritoryClick={handleTerritoryClick}
              onTerritoryHover={handleTerritoryHover}
              onZoomControlsReady={setZoomControls}
            />
            {/* In-board action bar overlay (always visible above map) */}
            {!lobbyMode && (
              <div className="pointer-events-none absolute left-0 right-0 bottom-0 z-20">
                <div className="pointer-events-auto p-2 sm:p-3">
                  <GameActionBar mode="inline" hidePhaseChip hideTreasures hideEndPhase />
                </div>
              </div>
            )}
          </div>
        </div>
        {!lobbyMode && (
          <MapSidebar
            zoom={zoomControls ?? undefined}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => {
              const newValue = !sidebarCollapsed
              setSidebarCollapsed(newValue)
              try {
                localStorage.setItem('ui.mapSidebarCollapsed', String(newValue))
              } catch {
                // ignore storage errors
              }
            }}
          />
        )}
      </div>
    </div>
  )
}
