import type { Metal, TreasureConfig, TreasureState } from '@shared/types'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { SimpleRiskGameBoard } from '../components/SimpleRiskGameBoard'
import { getPlayerColor } from '../constants/colors'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { gameService } from '../services/gameService'
import { socketService } from '../services/socketService'
import { tradeTreasureSet } from '../store/gameActions'
import { clearGame, fetchGameState, setError } from '../store/gameSlice'
import { setCurrentRoom } from '../store/roomSlice'

const GamePage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>()
  const [activeTab, setActiveTab] = useState<'board' | 'chat' | 'stats' | 'treasures'>('board')
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [isLoadingRoom, setIsLoadingRoom] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const isSpectator = searchParams.get('spectate') === 'true'

  const dispatch = useAppDispatch()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { currentGame, isLoading, error } = useAppSelector((state) => state.game)
  const authUser = useAppSelector((state) => state.auth.user)
  const { currentRoom } = useAppSelector((state) => state.room)

  useEffect(() => {
    if (!gameId) {
      setPageError('Missing game identifier in URL')
      return
    }

    let isSubscribed = true

    const joinRoom = () => {
      try {
        socketService.connect()
        if (!isSpectator) {
          socketService.joinRoom(gameId)
        }
      } catch (_error) {
        // Silently ignore socket errors during initial load
      }
    }

    const loadRoom = async () => {
      if (currentRoom && currentRoom.id === gameId) {
        return
      }

      setIsLoadingRoom(true)
      try {
        const response = await gameService.getRoomDetails(gameId)
        if (!isSubscribed) return
        dispatch(setCurrentRoom(response.room))
      } catch (loadError) {
        if (!isSubscribed) return
        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load game details'
        setPageError(message)
        dispatch(setError(message))
      } finally {
        if (isSubscribed) {
          setIsLoadingRoom(false)
        }
      }
    }

    joinRoom()
    void loadRoom()

    return () => {
      isSubscribed = false
      if (!isSpectator) {
        socketService.leaveRoom(gameId)
      }
      dispatch(clearGame())
      dispatch(setCurrentRoom(null))
    }
  }, [gameId, currentRoom, dispatch, isSpectator])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const handleFullScreenChange = () => {
      setIsFullScreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullScreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange)
    }
  }, [])

  useEffect(() => {
    if (!gameId) {
      return
    }

    if (currentGame && currentGame.roomId === gameId) {
      return
    }

    void dispatch(fetchGameState({ roomId: gameId, allowSpectate: isSpectator }))
  }, [currentGame, dispatch, gameId, isSpectator])

  const gameName = currentRoom?.name || 'Conquest Match'
  const formatRoomStatus = (status?: string) => {
    if (!status) {
      return 'Unknown status'
    }
    switch (status) {
      case 'lobby':
        return 'Waiting for players'
      case 'initializing':
        return 'Launching'
      case 'active':
        return 'In progress'
      case 'completed':
        return 'Completed'
      case 'paused':
        return 'Paused'
      case 'abandoned':
        return 'Abandoned'
      default:
        return status.replace(/_/g, ' ')
    }
  }
  const currentTurnPlayer = useMemo(() => {
    if (!currentGame) return null
    return currentGame.players.find((player) => player.id === currentGame.currentPlayer)
  }, [currentGame])

  const currentTurnPlayerId = currentTurnPlayer?.id

  const viewerPlayer = useMemo(() => {
    if (!currentGame || !authUser) {
      return null
    }

    return currentGame.players.find((player) => player.userId === authUser.id) ?? null
  }, [authUser, currentGame])

  // Hidden Treasures UI selection state
  const [selectedTreasureIndices, setSelectedTreasureIndices] = useState<number[]>([])
  const toggleTreasureIndex = (idx: number) => {
    setSelectedTreasureIndices((prev) => {
      if (prev.includes(idx)) return prev.filter((v) => v !== idx)
      if (prev.length >= 3) return prev
      return [...prev, idx]
    })
  }

  // Hidden Treasures helpers for UI
  const CLASSIC_SEQUENCE = [4, 6, 8, 10, 12, 15, 20, 25, 30, 35]
  const computeTriangularPayout = (index: number) => {
    if (index <= 0) return 4
    let payout = 4
    let delta = 2
    for (let i = 1; i <= index; i++) {
      payout += delta
      delta += 1
    }
    return payout
  }
  const getNextPayout = (config: TreasureConfig | undefined, state: TreasureState | undefined) => {
    const idx = state?.nextPayoutIndex ?? 0
    const mode = config?.payoutMode ?? 'triangular'
    if (!config || config.enabled === false) return 0
    switch (mode) {
      case 'classic': {
        if (idx < CLASSIC_SEQUENCE.length) return CLASSIC_SEQUENCE[idx]
        const overflowIndex = idx - CLASSIC_SEQUENCE.length + 1
        return CLASSIC_SEQUENCE[CLASSIC_SEQUENCE.length - 1] + overflowIndex * 5
      }
      case 'fixed':
        return Math.max(1, Math.min(50, Math.trunc(config.fixedValue ?? 8)))
      case 'none':
        return 0
      case 'triangular':
      default:
        return computeTriangularPayout(idx)
    }
  }
  const isThreeOfAKind = (a: Metal, b: Metal, c: Metal) => a === b && b === c && a !== 'diamond'
  const isOneOfEach = (a: Metal, b: Metal, c: Metal) => {
    const set = new Set([a, b, c])
    return set.size === 3 && set.has('bronze') && set.has('silver') && set.has('gold')
  }
  const includesDiamond = (a: Metal, b: Metal, c: Metal) =>
    a === 'diamond' || b === 'diamond' || c === 'diamond'
  const isValidSet = (metals: [Metal, Metal, Metal]) => {
    const [a, b, c] = metals
    if (includesDiamond(a, b, c)) return true
    if (isThreeOfAKind(a, b, c)) return true
    if (isOneOfEach(a, b, c)) return true
    return false
  }
  const findRedeemableSets = (
    hand: Metal[],
  ): Array<{ indices: [number, number, number]; hasDiamond: boolean }> => {
    const matches: Array<{ indices: [number, number, number]; hasDiamond: boolean }> = []
    for (let i = 0; i < hand.length - 2; i++) {
      for (let j = i + 1; j < hand.length - 1; j++) {
        for (let k = j + 1; k < hand.length; k++) {
          const metals: [Metal, Metal, Metal] = [hand[i], hand[j], hand[k]]
          if (!isValidSet(metals)) continue
          matches.push({ indices: [i, j, k], hasDiamond: includesDiamond(...metals) })
        }
      }
    }
    return matches
  }

  const isUsersTurn = Boolean(
    viewerPlayer && currentGame && viewerPlayer.id === currentGame.currentPlayer,
  )

  const currentPhase = currentGame?.phase ?? null
  const reinforcementArmies = currentGame?.reinforcementArmies ?? 0

  const phaseDetails = useMemo(() => {
    if (!currentPhase) {
      return {
        icon: '⏳',
        title: 'Setting up',
        description: 'We are preparing the battlefield. Sit tight while the match loads.',
        highlights: [] as string[],
      }
    }

    if (currentPhase === 'finished') {
      return {
        icon: '🏁',
        title: 'Match complete',
        description: currentGame?.winner
          ? `${currentGame.winner} claimed victory in this match.`
          : 'This battle has concluded.',
        highlights: ['Review the final map state or return to your games list.'],
      }
    }

    if (currentPhase === 'setup') {
      return {
        icon: '🧭',
        title: 'Drafting territories',
        description: isSpectator
          ? 'Players are drafting their starting territories.'
          : 'Select starting territories as they become available.',
        highlights: [
          'Starting positions determine early reinforcements.',
          'The game will advance automatically once everyone has drafted.',
        ],
      }
    }

    if (currentPhase === 'reinforcement') {
      return {
        icon: '➕',
        title: 'Reinforcement phase',
        description: isSpectator
          ? `${currentTurnPlayer?.username ?? 'A player'} is deploying new armies.`
          : isUsersTurn
            ? 'Place your reinforcements on territories you control to open new fronts.'
            : `${currentTurnPlayer?.username ?? 'An opponent'} is placing reinforcements.`,
        highlights: [
          reinforcementArmies > 0
            ? `${reinforcementArmies} armies remaining to deploy.`
            : 'All available armies have been placed for this phase.',
          'Capitals and continents grant bonus armies each turn.',
        ],
      }
    }

    if (currentPhase === 'attack') {
      return {
        icon: '⚔️',
        title: 'Attack phase',
        description: isSpectator
          ? `${currentTurnPlayer?.username ?? 'A player'} is attempting to conquer new territory.`
          : isUsersTurn
            ? 'Select one of your territories, then choose an adjacent enemy territory to attack.'
            : `Waiting while ${currentTurnPlayer?.username ?? 'an opponent'} resolves their attacks.`,
        highlights: [
          'Capturing at least one territory will earn a card.',
          'Armies must travel in from adjacent territories—plan your path carefully.',
        ],
      }
    }

    if (currentPhase === 'fortify') {
      return {
        icon: '🛡️',
        title: 'Fortify phase',
        description: isSpectator
          ? `${currentTurnPlayer?.username ?? 'A player'} is repositioning their armies.`
          : isUsersTurn
            ? 'Move armies between connected territories to secure your borders.'
            : `${currentTurnPlayer?.username ?? 'An opponent'} is fortifying their position.`,
        highlights: [
          'You can usually move armies along a continuous path you control.',
          'Strong borders make it harder for opponents to counter-attack next turn.',
        ],
      }
    }

    return {
      icon: '🎲',
      title: 'Taking actions',
      description: 'Gameplay is underway. Keep an eye on the board for updates.',
      highlights: [],
    }
  }, [
    currentGame?.winner,
    currentPhase,
    currentTurnPlayer?.username,
    isSpectator,
    isUsersTurn,
    reinforcementArmies,
  ])

  const viewerStatus = useMemo(() => {
    if (isSpectator) {
      return {
        tone: 'bg-surface-3 text-muted',
        label: 'Spectating',
        message: 'You are observing this match in real time.',
      }
    }

    if (!currentGame) {
      return {
        tone: 'bg-surface-3 text-muted',
        label: 'Preparing game',
        message: 'Game details will appear once the match finishes loading.',
      }
    }

    if (!viewerPlayer) {
      return {
        tone: 'bg-warning-soft text-warning',
        label: 'Not seated',
        message: 'You are not currently assigned a seat in this game.',
      }
    }

    if (isUsersTurn) {
      return {
        tone: 'bg-success-soft text-success',
        label: 'Your turn',
        message: 'All actions taken now will count for your empire—make them count!',
      }
    }

    return {
      tone: 'bg-surface-3 text-muted',
      label: 'Waiting for opponent',
      message: `Waiting for ${currentTurnPlayer?.username ?? 'the next player'} to finish their turn.`,
    }
  }, [currentGame, currentTurnPlayer?.username, isSpectator, isUsersTurn, viewerPlayer])

  const displayPlayers = useMemo(() => {
    if (currentGame?.players?.length) {
      return currentGame.players.map((player, index) => ({
        id: player.id,
        name: player.username,
        color: player.color || getPlayerColor(index),
        territories: player.territories?.length || 0,
        armies: player.armies ?? 0,
      }))
    }

    if (currentRoom?.players?.length) {
      return currentRoom.players.map((player, index) => ({
        id: player.userId,
        name: player.username,
        color: getPlayerColor(index),
        territories: 0,
        armies: 0,
      }))
    }

    return []
  }, [currentGame, currentRoom])

  const showLoadingState = isLoading || isLoadingRoom

  const handleBoardTerritoryClick = (territoryId: string) => {
    logger.debug('Territory clicked', territoryId)
    // TODO: wire this into game actions when gameplay interactions are enabled
  }

  if (pageError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-box-lg max-w-md text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">Unable to load game</h2>
          <p className="text-muted mb-6">{pageError}</p>
          <Link to="/games/active" className="btn-primary px-4 py-2 inline-flex justify-center">
            Return to My Games
          </Link>
        </div>
      </div>
    )
  }

  const toggleFullScreen = async () => {
    if (typeof document === 'undefined') {
      return
    }

    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen?.()
      } catch (toggleError) {
        logger.error('Failed to enter fullscreen mode', toggleError)
      }
    } else {
      try {
        await document.exitFullscreen?.()
      } catch (toggleError) {
        logger.error('Failed to exit fullscreen mode', toggleError)
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={`${isFullScreen ? 'fixed inset-0 z-50 bg-black' : 'min-h-screen'}`}
    >
      {/* Game Header - Minimal when full-screen */}
      <div className={`bg-surface-1 border-b border-border ${isFullScreen ? 'h-12' : 'h-16'}`}>
        <div className="container mx-auto px-4 h-full flex justify-between items-center">
          <div className="flex items-center gap-4">
            {!isFullScreen && (
              <Link to="/games/active" className="btn-secondary px-3 py-1 text-sm">
                ← My Games
              </Link>
            )}
            <div>
              <h1 className={`font-bold ${isFullScreen ? 'text-lg' : 'text-xl'}`}>{gameName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {!isFullScreen && (
                  <span className="text-muted">
                    {currentGame && currentTurnPlayer
                      ? `Turn ${currentGame.turn} • ${currentTurnPlayer.username}'s turn`
                      : currentRoom?.status
                        ? `Status: ${formatRoomStatus(currentRoom.status)}`
                        : 'Preparing game details...'}
                  </span>
                )}
                {isSpectator && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-1 font-medium text-[11px] uppercase tracking-wide text-muted">
                    👀 Spectating
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isFullScreen && (
              <div className="flex gap-1">
                <button
                  type="button"
                  className={`px-3 py-1 rounded text-sm ${
                    activeTab === 'board' ? 'bg-primary' : 'bg-surface-2'
                  }`}
                  onClick={() => setActiveTab('board')}
                >
                  Board
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 rounded text-sm ${
                    activeTab === 'chat' ? 'bg-primary' : 'bg-surface-2'
                  }`}
                  onClick={() => setActiveTab('chat')}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 rounded text-sm ${
                    activeTab === 'stats' ? 'bg-primary' : 'bg-surface-2'
                  }`}
                  onClick={() => setActiveTab('stats')}
                >
                  Stats
                </button>
              </div>
            )}

            <button type="button" className="btn-secondary px-3 py-1 text-sm">
              ⚙️
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-1 text-sm"
              onClick={toggleFullScreen}
            >
              {isFullScreen ? '🗗' : '🗖'}
            </button>
            <button
              type="button"
              className="px-3 py-1 bg-danger hover:brightness-110 text-white text-sm font-medium rounded-lg transition-colors"
            >
              🏳️
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-full">
        {!isFullScreen && (
          <div className="w-80 bg-surface-1 border-r border-border flex flex-col">
            <div className="flex border-b border-border">
              <button
                type="button"
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  activeTab === 'board' ? 'bg-primary text-white' : 'text-muted hover:text-white'
                }`}
                onClick={() => setActiveTab('board')}
              >
                Board
              </button>
              <button
                type="button"
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  activeTab === 'chat' ? 'bg-primary text-white' : 'text-muted hover:text-white'
                }`}
                onClick={() => setActiveTab('chat')}
              >
                Chat
              </button>
              <button
                type="button"
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  activeTab === 'stats' ? 'bg-primary text-white' : 'text-muted hover:text-white'
                }`}
                onClick={() => setActiveTab('stats')}
              >
                Stats
              </button>
              <button
                type="button"
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  activeTab === 'treasures'
                    ? 'bg-primary text-white'
                    : 'text-muted hover:text-white'
                }`}
                onClick={() => setActiveTab('treasures')}
              >
                Treasures
              </button>
            </div>

            <div className="flex-1 p-4">
              {showLoadingState && (
                <div className="text-center text-muted py-8">
                  <div className="text-4xl mb-2 animate-spin">🔄</div>
                  <p>Loading game details...</p>
                </div>
              )}

              {activeTab === 'board' && (
                <div className="space-y-4">
                  <div className="border border-border rounded-xl p-4 bg-surface-1 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl" aria-hidden>
                          {phaseDetails.icon}
                        </span>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted">
                            Current phase
                          </p>
                          <p className="text-lg font-semibold">{phaseDetails.title}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-muted">Turn</p>
                        <p className="text-sm font-semibold">{currentGame?.turn ?? '—'}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted mt-3">{phaseDetails.description}</p>
                    {phaseDetails.highlights.length > 0 && (
                      <ul className="mt-3 space-y-2 text-sm text-foreground/80">
                        {phaseDetails.highlights.map((highlight) => (
                          <li key={highlight} className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${viewerStatus.tone}`}
                      >
                        {viewerStatus.label}
                      </span>
                      {currentTurnPlayer && (
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span className="uppercase tracking-wide">Active player</span>
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-border"
                            style={{ backgroundColor: currentTurnPlayer.color }}
                          ></span>
                          <span className="font-medium text-foreground">
                            {currentTurnPlayer.username}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border border-dashed border-border/60 rounded-xl p-3 bg-surface-1">
                    <p className="text-xs uppercase tracking-wide text-muted mb-1">Status</p>
                    <p className="text-sm text-foreground/90">{viewerStatus.message}</p>
                  </div>
                </div>
              )}

              {!showLoadingState && activeTab === 'chat' && (
                <div>
                  <h3 className="font-bold mb-4">Game Chat</h3>
                  <div className="text-center text-muted py-8">
                    <div className="text-4xl mb-2">💬</div>
                    <p>Chat system will be implemented here</p>
                  </div>
                </div>
              )}

              {!showLoadingState && activeTab === 'stats' && (
                <div>
                  <h3 className="font-bold mb-4">Live Statistics</h3>
                  {displayPlayers.length === 0 ? (
                    <div className="text-center text-muted py-8">
                      <p>No player information available yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {displayPlayers.map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between p-2 bg-surface-2 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: player.color }}
                            ></div>
                            <span className="font-medium">{player.name}</span>
                          </div>
                          <div className="text-sm text-muted">
                            {player.territories} territories • {player.armies} armies
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!showLoadingState && activeTab === 'treasures' && (
                <div className="space-y-4">
                  <h3 className="font-bold mb-2">Treasure Hand</h3>
                  {!viewerPlayer ? (
                    <div className="text-sm text-muted">Join the game to view your treasures.</div>
                  ) : (
                    <div className="space-y-3">
                      {viewerPlayer.mustCashInTreasures && (
                        <div className="p-2 rounded bg-warning-soft text-warning text-sm">
                          You must cash in treasures before continuing your turn.
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {(viewerPlayer.treasures ?? []).length === 0 ? (
                          <span className="text-sm text-muted">No treasures yet.</span>
                        ) : (
                          (viewerPlayer.treasures ?? []).map((metal, idx) => {
                            const selected = selectedTreasureIndices.includes(idx)
                            const color =
                              metal === 'diamond'
                                ? 'bg-purple-600'
                                : metal === 'gold'
                                  ? 'bg-yellow-600'
                                  : metal === 'silver'
                                    ? 'bg-gray-400'
                                    : 'bg-amber-700'
                            return (
                              <button
                                key={`${metal}-${idx}`}
                                type="button"
                                onClick={() => toggleTreasureIndex(idx)}
                                className={`px-2 py-1 rounded text-xs font-medium border ${selected ? 'ring-2 ring-primary' : ''} ${color} text-white`}
                                title={`Index ${idx}`}
                              >
                                {metal}
                              </button>
                            )
                          })
                        )}
                      </div>
                      {/* Selection validity + payout preview */}
                      {selectedTreasureIndices.length > 0 && (
                        <div className="text-sm">
                          {selectedTreasureIndices.length === 3 ? (
                            (() => {
                              const hand = (viewerPlayer.treasures ?? []) as Metal[]
                              const [a, b, c] = selectedTreasureIndices
                              const metals = [hand[a], hand[b], hand[c]] as [Metal, Metal, Metal]
                              const valid = isValidSet(metals)
                              const hasDiamond = includesDiamond(...metals)
                              const base = getNextPayout(
                                currentGame?.gameConfig?.treasureConfig,
                                currentGame?.treasureState,
                              )
                              const bonus = hasDiamond
                                ? Math.max(
                                    0,
                                    Math.trunc(
                                      currentGame?.gameConfig?.treasureConfig?.diamondSetBonus ?? 0,
                                    ),
                                  )
                                : 0
                              return (
                                <div
                                  className={`p-2 rounded ${valid ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}
                                >
                                  {valid ? (
                                    <span>
                                      Valid set selected • Payout preview:{' '}
                                      <strong className="text-foreground">{base + bonus}</strong>
                                      {bonus > 0 ? (
                                        <span className="text-muted">
                                          {' '}
                                          (base {base} + diamond bonus {bonus})
                                        </span>
                                      ) : null}
                                    </span>
                                  ) : (
                                    <span>Not a valid set</span>
                                  )}
                                </div>
                              )
                            })()
                          ) : (
                            <div className="p-2 rounded bg-surface-2 text-muted">
                              Select 3 treasures to preview payout
                            </div>
                          )}
                        </div>
                      )}

                      {/* Suggested valid sets */}
                      {(() => {
                        const hand = (viewerPlayer.treasures ?? []) as Metal[]
                        const sets = findRedeemableSets(hand)
                        if (sets.length === 0) return null
                        const base = getNextPayout(
                          currentGame?.gameConfig?.treasureConfig,
                          currentGame?.treasureState,
                        )
                        return (
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-wide text-muted">
                              Suggested sets
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {sets.map(({ indices, hasDiamond }, i) => {
                                const bonus = hasDiamond
                                  ? Math.max(
                                      0,
                                      Math.trunc(
                                        currentGame?.gameConfig?.treasureConfig?.diamondSetBonus ??
                                          0,
                                      ),
                                    )
                                  : 0
                                const payout = base + bonus
                                return (
                                  <button
                                    key={`set-${i}-${indices.join('-')}`}
                                    type="button"
                                    className="px-2 py-1 rounded border border-border bg-surface-2 text-xs hover:border-primary"
                                    onClick={() => setSelectedTreasureIndices(indices as number[])}
                                    title={`Payout ${payout}${bonus > 0 ? ` (base ${base} + bonus ${bonus})` : ''}`}
                                  >
                                    [{indices.join(', ')}]{' '}
                                    <span className="text-muted">→ {payout}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={selectedTreasureIndices.length !== 3}
                          onClick={() => {
                            const sorted = [...selectedTreasureIndices]
                              .map((n) => Number(n))
                              .filter((n) => Number.isInteger(n))
                              .sort((a, b) => a - b) as [number, number, number]
                            dispatch(tradeTreasureSet(sorted))
                            setSelectedTreasureIndices([])
                          }}
                          className={`btn btn-primary btn-sm ${selectedTreasureIndices.length !== 3 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          Redeem Selected (3)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTreasureIndices([])}
                          className="btn btn-secondary btn-sm"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 relative">
          <div className="h-full relative overflow-hidden">
            <SimpleRiskGameBoard onTerritoryClick={handleBoardTerritoryClick} />

            {displayPlayers.length > 0 && (
              <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 flex-wrap justify-center gap-2 px-4">
                {displayPlayers.map((player) => {
                  const isCurrentTurn = player.id === currentTurnPlayerId
                  return (
                    <div
                      key={player.id}
                      className={`glass-box-sm flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium shadow-md transition-colors ${
                        isCurrentTurn
                          ? 'border-primary/70 bg-primary/20 text-primary'
                          : 'border-transparent bg-surface-2/80 text-muted'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: player.color }}
                      ></span>
                      <span className="whitespace-nowrap">{player.name}</span>
                      <span className="text-[11px] text-muted">
                        {player.territories} • {player.armies}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {isFullScreen && activeTab !== 'board' && !showLoadingState && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
                <div className="glass-box-lg max-w-md w-full mx-4">
                  {activeTab === 'chat' && (
                    <div>
                      <h3 className="text-xl font-bold mb-4">Game Chat</h3>
                      <div className="text-center text-muted py-8">
                        <div className="text-4xl mb-2">💬</div>
                        <p>Chat system will be implemented here</p>
                      </div>
                    </div>
                  )}

                  {activeTab === 'stats' && (
                    <div>
                      <h3 className="text-xl font-bold mb-4">Live Statistics</h3>
                      {displayPlayers.length === 0 ? (
                        <div className="text-center text-muted py-8">
                          <p>No player information available yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {displayPlayers.map((player) => (
                            <div
                              key={player.id}
                              className="flex items-center justify-between p-3 bg-surface-2 rounded"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-6 h-6 rounded-full"
                                  style={{ backgroundColor: player.color }}
                                ></div>
                                <span className="font-medium">{player.name}</span>
                              </div>
                              <div className="text-sm text-muted">
                                {player.territories} territories • {player.armies} armies
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && !showLoadingState && (
              <div className="absolute bottom-4 right-4 bg-danger-soft text-danger px-4 py-2 rounded-lg shadow-lg">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default GamePage
