import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import TabbedGameChat from '../components/chat/TabbedGameChat'
import { RiskGameBoard } from '../components/RiskGameBoard'
import TeamAssignment from '../components/TeamAssignment'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import audioService from '../services/audioService'
import { gameService } from '../services/gameService'
import { socketService } from '../services/socketService'
import { clearGame, fetchGameState } from '../store/gameSlice'
import { setCurrentRoom } from '../store/roomSlice'
import type { AIDifficulty } from '../types/game'
import type { GameRoom as GameRoomType } from '../types/gameRoom'

const AI_DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  recruit: 'Recruit',
  commander: 'Commander',
  grandmaster: 'Grandmaster',
}

const AI_DIFFICULTY_DESCRIPTIONS: Record<AIDifficulty, string> = {
  recruit: 'Fast, forgiving baseline opponent',
  commander: 'Balanced with threat awareness',
  grandmaster: 'Advanced tactics and deeper lookahead',
}

const AI_DIFFICULTY_ORDER: AIDifficulty[] = ['recruit', 'commander', 'grandmaster']

export default function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { currentRoom } = useAppSelector((state) => state.room)
  const {
    currentGame,
    isLoading: isGameLoading,
    error: gameError,
  } = useAppSelector((state) => state.game)
  const { user } = useAppSelector((state) => state.auth)
  const [searchParams] = useSearchParams()
  const isSpectator = searchParams.get('spectate') === 'true'
  const [isRoomLoading, setIsRoomLoading] = useState(false)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(audioService.isMutedState())
  const [teamUpdating, setTeamUpdating] = useState(false)
  const [teamUpdateError, setTeamUpdateError] = useState<string | null>(null)
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  // AI opponents generally available in non-ranked lobbies (no flags)
  const [aiDraftCounts, setAiDraftCounts] = useState<Record<AIDifficulty, number>>({
    recruit: 0,
    commander: 0,
    grandmaster: 0,
  })
  const [aiDraftDirty, setAiDraftDirty] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null)

  const getStatusLabel = (status: GameRoomType['status']) => {
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
        return status
    }
  }

  const currentPlayer = useMemo(() => {
    if (!currentRoom?.players || !user?.id) {
      return undefined
    }
    return currentRoom.players.find((player) => player.userId === user.id)
  }, [currentRoom?.players, user?.id])

  const isMember = Boolean(currentPlayer)

  const joinSummary = useMemo(() => {
    const total = currentRoom?.maxPlayers ?? 0
    const joined = currentRoom?.players?.length ?? 0
    return { joined, total }
  }, [currentRoom?.players, currentRoom?.maxPlayers])

  const isHost = currentRoom?.hostId === user?.id

  const lobbyFull = Boolean(
    currentRoom && (currentRoom.players?.length ?? 0) >= currentRoom.maxPlayers,
  )

  const showTeamAssignment = useMemo(() => {
    if (!currentRoom) {
      return false
    }

    if (!currentRoom.allowTeamPlay) {
      return false
    }

    if (currentRoom.teamMode !== 'teams') {
      return false
    }

    return (currentRoom.numberOfTeams ?? 0) > 1
  }, [currentRoom])

  // Expiration display for lobby/initializing
  const expiresAtDate = useMemo(() => {
    if (!currentRoom) return null
    if (currentRoom.expiresAt) return new Date(currentRoom.expiresAt)
    const created = new Date(currentRoom.createdAt)
    return new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
  }, [currentRoom])

  const formatTimeUntil = useCallback((target?: Date | null) => {
    if (!target) return ''
    const ms = target.getTime() - Date.now()
    if (ms <= 0) return 'Expired'
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    if (days >= 1) return `Expires in ${days} day${days === 1 ? '' : 's'}`
    const hours = Math.floor(ms / (60 * 60 * 1000))
    if (hours >= 1) return `Expires in ${hours}h`
    const minutes = Math.floor(ms / (60 * 1000))
    return `Expires in ${minutes}m`
  }, [])

  const treasureSummary = useMemo(() => {
    const cfg = currentRoom?.treasureConfig
    if (!cfg) return null
    if (cfg.enabled === false) return 'Treasures: Off'
    const mode = cfg.payoutMode || 'triangular'
    if (mode === 'fixed') {
      const fixed = Math.max(1, Math.min(50, Math.trunc(cfg.fixedValue ?? 8)))
      return `Treasures: Fixed (${fixed}) · Hand ${cfg.handCap} · Diamond +${cfg.diamondSetBonus}`
    }
    const label = mode === 'triangular' ? 'Triangular' : mode === 'classic' ? 'Classic' : 'None'
    return `Treasures: ${label} · Hand ${cfg.handCap} · Diamond +${cfg.diamondSetBonus}`
  }, [currentRoom?.treasureConfig])

  const lobbyTeamPlayers = useMemo(
    () =>
      (currentRoom?.players || []).map((player) => ({
        id: player.id,
        username: player.username,
        teamId: player.teamId ?? null,
        isAi: player.isAi,
        aiDifficulty: player.aiDifficulty ?? undefined,
      })),
    [currentRoom?.players],
  )

  const aiPlayersInRoom = useMemo(
    () => (currentRoom?.players ?? []).filter((player) => player.isAi),
    [currentRoom?.players],
  )

  const existingAiCounts = useMemo(() => {
    const counts: Record<AIDifficulty, number> = {
      recruit: 0,
      commander: 0,
      grandmaster: 0,
    }
    aiPlayersInRoom.forEach((player) => {
      const difficulty = (player.aiDifficulty ?? 'recruit') as AIDifficulty
      if (AI_DIFFICULTY_ORDER.includes(difficulty)) {
        counts[difficulty] += 1
      }
    })
    return counts
  }, [aiPlayersInRoom])

  const flaggedAiDifficulties = useMemo(
    () => ['recruit', 'commander', 'grandmaster'] as AIDifficulty[],
    [],
  )

  const allowedAiDifficulties = useMemo(() => {
    const allowed = new Set<AIDifficulty>(flaggedAiDifficulties)
    AI_DIFFICULTY_ORDER.forEach((difficulty) => {
      if (existingAiCounts[difficulty] > 0) {
        allowed.add(difficulty)
      }
    })
    return Array.from(allowed)
  }, [flaggedAiDifficulties, existingAiCounts])

  const humanPlayersCount = useMemo(
    () => currentRoom?.players?.filter((player) => !player.isAi)?.length ?? 0,
    [currentRoom?.players],
  )

  const roomMaxPlayers = currentRoom?.maxPlayers ?? 0
  const maxAiCapacity = useMemo(
    () => Math.max(0, roomMaxPlayers - humanPlayersCount),
    [roomMaxPlayers, humanPlayersCount],
  )

  // In-room AI controls are disabled; AI should be set at creation time
  const showAiControls = false

  const normalizeAiDraftCounts = useCallback(
    (counts: Record<AIDifficulty, number>): Record<AIDifficulty, number> => {
      const baseline: Record<AIDifficulty, number> = {
        recruit: 0,
        commander: 0,
        grandmaster: 0,
      }

      if (!showAiControls || allowedAiDifficulties.length === 0) {
        return baseline
      }

      const sanitized: Record<AIDifficulty, number> = { ...baseline }
      let total = 0

      allowedAiDifficulties.forEach((difficulty) => {
        const raw = counts[difficulty] ?? 0
        const value = Math.max(0, Math.trunc(raw))
        sanitized[difficulty] = value
        total += value
      })

      let overflow = total - maxAiCapacity
      if (overflow > 0) {
        const reductionOrder = [...AI_DIFFICULTY_ORDER].reverse()
        while (overflow > 0) {
          const target = reductionOrder.find(
            (difficulty) => allowedAiDifficulties.includes(difficulty) && sanitized[difficulty] > 0,
          )
          if (!target) {
            break
          }
          sanitized[target] -= 1
          overflow -= 1
        }
      }

      return sanitized
    },
    [allowedAiDifficulties, maxAiCapacity],
  )

  useEffect(() => {
    setAiDraftCounts((previous) => normalizeAiDraftCounts(previous))
  }, [normalizeAiDraftCounts])

  useEffect(() => {
    if (!showAiControls) {
      if (aiDraftDirty || aiPlayersInRoom.length === 0) {
        setAiDraftCounts({ recruit: 0, commander: 0, grandmaster: 0 })
        setAiDraftDirty(false)
        setAiErrorMessage(null)
      }
      return
    }

    if (!aiDraftDirty) {
      setAiDraftCounts(normalizeAiDraftCounts(existingAiCounts))
    }
  }, [aiDraftDirty, aiPlayersInRoom.length, existingAiCounts, normalizeAiDraftCounts])

  const draftTotalAi = allowedAiDifficulties.reduce(
    (sum, difficulty) => sum + (aiDraftCounts[difficulty] ?? 0),
    0,
  )
  const aiSlotsRemaining = Math.max(0, maxAiCapacity - draftTotalAi)

  const hasAiChanges = useMemo(() => {
    if (!showAiControls) {
      return false
    }
    return AI_DIFFICULTY_ORDER.some(
      (difficulty) => (aiDraftCounts[difficulty] ?? 0) !== (existingAiCounts[difficulty] ?? 0),
    )
  }, [aiDraftCounts, existingAiCounts])

  const buildAiOpponentPayload = useCallback(
    (counts: Record<AIDifficulty, number>) => {
      const payload: Array<{ difficulty: AIDifficulty; personalitySeed?: number | null }> = []
      allowedAiDifficulties.forEach((difficulty) => {
        const count = counts[difficulty] ?? 0
        for (let index = 0; index < count; index += 1) {
          payload.push({ difficulty })
        }
      })
      return payload
    },
    [allowedAiDifficulties],
  )

  const updateAiCount = useCallback(
    (difficulty: AIDifficulty, value: number) => {
      setAiDraftDirty(true)
      setAiErrorMessage(null)
      setAiDraftCounts((previous) => normalizeAiDraftCounts({ ...previous, [difficulty]: value }))
    },
    [normalizeAiDraftCounts],
  )

  const stepAiCount = useCallback(
    (difficulty: AIDifficulty, delta: number) => {
      setAiDraftDirty(true)
      setAiErrorMessage(null)
      setAiDraftCounts((previous) =>
        normalizeAiDraftCounts({ ...previous, [difficulty]: (previous[difficulty] ?? 0) + delta }),
      )
    },
    [normalizeAiDraftCounts],
  )

  const resetAiDraft = useCallback(() => {
    setAiDraftCounts(normalizeAiDraftCounts(existingAiCounts))
    setAiDraftDirty(false)
    setAiErrorMessage(null)
  }, [existingAiCounts, normalizeAiDraftCounts])

  const handleAiSave = useCallback(async () => {
    if (!currentRoom) {
      return
    }
    setAiSaving(true)
    setAiErrorMessage(null)
    try {
      const payload = buildAiOpponentPayload(normalizeAiDraftCounts(aiDraftCounts))
      const response = await gameService.updateAiOpponents(currentRoom.id, payload)
      if (response?.room) {
        dispatch(setCurrentRoom(response.room))
      }
      setAiDraftDirty(false)
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'response' in error) {
        const apiError = error as { response?: { data?: { message?: string } } }
        setAiErrorMessage(apiError.response?.data?.message ?? 'Failed to update AI opponents')
      } else if (error instanceof Error) {
        setAiErrorMessage(error.message)
      } else {
        setAiErrorMessage('Failed to update AI opponents')
      }
    } finally {
      setAiSaving(false)
    }
  }, [aiDraftCounts, buildAiOpponentPayload, currentRoom, dispatch, normalizeAiDraftCounts])

  const joinActionDisabled =
    joinSubmitting || !currentRoom || currentRoom.status !== 'lobby' || lobbyFull

  const joinButtonLabel = (() => {
    if (joinSubmitting) {
      return 'Joining...'
    }
    if (!currentRoom || currentRoom.status !== 'lobby') {
      return 'Spectate only'
    }
    if (lobbyFull) {
      return 'Lobby full'
    }
    return 'Join Game'
  })()

  const joinButtonTitle = (() => {
    if (joinSubmitting) {
      return 'Joining game...'
    }
    if (!currentRoom || currentRoom.status !== 'lobby') {
      return 'Game has already started'
    }
    if (lobbyFull) {
      return 'Lobby is full'
    }
    return 'Join this lobby'
  })()

  // Ready-check removed; joining implies ready

  useEffect(() => {
    if (!roomId) {
      navigate('/lobby')
      return
    }

    socketService.connect()
    if (!isSpectator) {
      socketService.joinRoom(roomId)
    }

    return () => {
      if (!isSpectator) {
        socketService.leaveRoom(roomId)
      }
      dispatch(clearGame())
      dispatch(setCurrentRoom(null))
    }
  }, [dispatch, isSpectator, navigate, roomId])

  useEffect(() => {
    if (!roomId) {
      return
    }

    if (currentRoom && currentRoom.id === roomId) {
      setRoomError(null)
      return
    }

    let isMounted = true

    const loadRoomDetails = async () => {
      setIsRoomLoading(true)
      try {
        const response = await gameService.getRoomDetails(roomId)
        if (!isMounted) {
          return
        }
        dispatch(setCurrentRoom(response.room))
        setRoomError(null)
      } catch (error: unknown) {
        if (!isMounted) {
          return
        }
        let message = 'Failed to load room details'
        if (typeof error === 'object' && error && 'response' in error) {
          const apiError = error as { response?: { data?: { message?: string } } }
          message = apiError.response?.data?.message ?? message
        } else if (error instanceof Error) {
          message = error.message
        }
        setRoomError(message)
      } finally {
        if (isMounted) {
          setIsRoomLoading(false)
        }
      }
    }

    void loadRoomDetails()

    return () => {
      isMounted = false
    }
  }, [currentRoom, dispatch, roomId])

  useEffect(() => {
    if (isMember) {
      setJoinError(null)
    }
  }, [isMember])

  useEffect(() => {
    if (!roomId) {
      return
    }

    if (currentGame && currentGame.roomId === roomId) {
      return
    }

    void dispatch(fetchGameState({ roomId, allowSpectate: isSpectator }))
  }, [currentGame, dispatch, isSpectator, roomId])

  const handleLeaveRoom = () => {
    navigate('/lobby')
  }

  const handleToggleMute = () => {
    audioService.toggleMute()
    setIsMuted(audioService.isMutedState())
  }

  // No ready toggle; start triggers when lobby is full

  const handleJoinLobby = useCallback(async () => {
    if (!roomId || isMember || !currentRoom || currentRoom.status !== 'lobby' || lobbyFull) {
      return
    }

    try {
      setJoinSubmitting(true)
      setJoinError(null)

      const response = await gameService.joinRoom(roomId)

      if (response.room) {
        dispatch(setCurrentRoom(response.room))
      } else {
        const refreshed = await gameService.getRoomDetails(roomId)
        dispatch(setCurrentRoom(refreshed.room))
      }

      await dispatch(fetchGameState({ roomId, allowSpectate: false }))
    } catch (error: unknown) {
      let message = 'Failed to join game'
      if (typeof error === 'object' && error !== null) {
        if ('response' in error) {
          const apiError = error as { response?: { data?: { message?: string } } }
          message = apiError.response?.data?.message ?? message
        } else if (
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
        ) {
          message = (error as { message: string }).message
        }
      } else if (error instanceof Error) {
        message = error.message
      }
      setJoinError(message)
    } finally {
      setJoinSubmitting(false)
    }
  }, [roomId, isMember, currentRoom, lobbyFull, dispatch])

  const handleTeamChange = useCallback(
    async (playerId: string, teamId: number) => {
      if (!roomId || !isHost) {
        return
      }

      const existingTeamId =
        currentRoom?.players?.find((player) => player.id === playerId)?.teamId ?? null

      if (existingTeamId === teamId) {
        return
      }

      try {
        setTeamUpdating(true)
        setTeamUpdateError(null)
        const response = await gameService.assignPlayerTeam(roomId, playerId, teamId)
        if (response?.room) {
          dispatch(setCurrentRoom(response.room))
        }
      } catch (error: unknown) {
        let message = 'Failed to update team assignment'
        if (typeof error === 'object' && error !== null) {
          if ('response' in error) {
            const apiError = error as { response?: { data?: { message?: string } } }
            message = apiError.response?.data?.message ?? message
          } else if (
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
          ) {
            message = (error as { message: string }).message
          }
        } else if (error instanceof Error) {
          message = error.message
        }

        setTeamUpdateError(message)
      } finally {
        setTeamUpdating(false)
      }
    },
    [roomId, dispatch, isHost, currentRoom],
  )

  if (roomError) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="max-w-md space-y-4 text-center">
          <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)] text-[color:var(--color-danger)]">
            {roomError}
          </div>
          <button type="button" onClick={() => navigate('/lobby')} className="btn btn-primary">
            Return to Lobby
          </button>
        </div>
      </div>
    )
  }

  if (isRoomLoading || !currentRoom) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="panel space-y-2 text-center">
          <div className="text-lg font-semibold text-[color:var(--heading)]">Loading room...</div>
          <p className="text-sm text-muted">Hang tight while we fetch the latest state.</p>
        </div>
      </div>
    )
  }

  if (isGameLoading && !currentGame) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="panel space-y-2 text-center">
          <div className="text-lg font-semibold text-[color:var(--heading)]">
            Loading game state...
          </div>
          <p className="text-sm text-muted">Preparing the board...</p>
        </div>
      </div>
    )
  }

  if (gameError && !currentGame) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)] text-center text-[color:var(--color-danger)]">
          {gameError}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-[color:var(--heading)]">{currentRoom.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="chip text-xs uppercase tracking-wide">
              Status: {getStatusLabel(currentRoom.status)}
            </span>
            <span className="chip text-xs">
              Joined {joinSummary.joined}/{joinSummary.total}
            </span>
            <span className="chip text-xs">
              Players {currentRoom.players?.length || 0}/{currentRoom.maxPlayers}
            </span>
            {(currentRoom.status === 'lobby' || currentRoom.status === 'initializing') && (
              <span
                className="chip text-xs"
                title={expiresAtDate ? `Expires ${expiresAtDate.toLocaleString()}` : undefined}
              >
                {formatTimeUntil(expiresAtDate)}
              </span>
            )}
            {treasureSummary && (
              <span className="chip text-xs" title="Hidden Treasures configuration">
                {treasureSummary}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isMember && (
            <button
              onClick={() => void handleJoinLobby()}
              disabled={joinActionDisabled}
              type="button"
              title={joinButtonTitle}
              className="btn btn-primary"
            >
              {joinButtonLabel}
            </button>
          )}
          {/* Ready control removed; joining implies ready */}
          <button
            onClick={handleToggleMute}
            className="btn btn-ghost"
            type="button"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🔊'} {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button onClick={handleLeaveRoom} type="button" className="btn btn-danger">
            Leave Room
          </button>
        </div>
      </div>

      {joinError && (
        <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)] text-sm text-[color:var(--color-danger)]">
          {joinError}
        </div>
      )}

      {/* No ready errors expected */}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Game Board */}
        <div className="lg:col-span-3">
          <div className="panel h-[600px] p-0">
            {currentGame ? (
              <RiskGameBoard
                onTerritoryClick={(_territoryId) => {
                  // TODO: Handle territory interactions based on game phase
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-[color:var(--heading)]">
                    Waiting for game to start...
                  </h2>
                  <p className="text-sm text-muted">
                    {(() => {
                      const total = currentRoom.maxPlayers
                      const joined = currentRoom.players?.length || 0
                      const needed = Math.max(0, total - joined)
                      return needed > 0
                        ? `Need ${needed} more ${needed === 1 ? 'player' : 'players'} to begin`
                        : `All players present • ${joined}/${total}`
                    })()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Players */}
          <div className="panel space-y-4">
            <h3 className="text-lg font-semibold text-[color:var(--heading)]">
              Players ({currentRoom.players?.length || 0}/{currentRoom.maxPlayers})
            </h3>
            <ul className="list">
              {currentRoom.players?.map((player) => {
                const isCurrentUser = player.userId === user?.id
                return (
                  <li key={player.id} className="list-item flex items-center gap-3 last:border-b-0">
                    <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-success)]"></span>
                    <span
                      className={`text-sm ${
                        isCurrentUser ? 'font-semibold text-[color:var(--heading)]' : ''
                      }`}
                    >
                      {player.username}
                    </span>
                    {player.isAi && player.aiDifficulty && (
                      <span className="badge border-[color:var(--color-accent)] text-[color:var(--color-accent)]">
                        AI - {AI_DIFFICULTY_LABELS[player.aiDifficulty]}
                      </span>
                    )}
                    {player.userId === currentRoom.hostId && (
                      <span className="badge border-[color:var(--color-warning)] text-[color:var(--color-warning)]">
                        Host
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {showAiControls && (
            <div className="panel space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold text-[color:var(--heading)]">AI Opponents</h3>
                <span className="badge border-[color:var(--panel-border)] text-muted">
                  {aiPlayersInRoom.length}/{Math.max(0, maxAiCapacity)} slots filled
                </span>
              </div>
              {allowedAiDifficulties.length === 0 ? (
                <p className="text-xs text-muted">
                  No AI tiers are currently available. Enable an AI difficulty flag to add computer
                  opponents to this lobby.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted">
                    Reserve seats for AI.{' '}
                    {aiSlotsRemaining > 0
                      ? `${aiSlotsRemaining} open slot${aiSlotsRemaining === 1 ? '' : 's'} remaining.`
                      : 'All available AI slots are reserved. Remove one or free a player seat to add more.'}
                  </p>
                  <div className="space-y-3">
                    {allowedAiDifficulties.map((difficulty) => {
                      const label = AI_DIFFICULTY_LABELS[difficulty]
                      const description = AI_DIFFICULTY_DESCRIPTIONS[difficulty]
                      const count = aiDraftCounts[difficulty] ?? 0
                      const canDecrease = count > 0 && !aiSaving
                      const canIncrease = aiSlotsRemaining > 0 && !aiSaving
                      return (
                        <div
                          key={difficulty}
                          className="panel-outline flex items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-[color:var(--heading)]">
                              {label}
                            </div>
                            <p className="text-xs text-muted">{description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => stepAiCount(difficulty, -1)}
                              disabled={!canDecrease}
                              className="btn btn-secondary btn-icon"
                              aria-label={`Remove ${label} AI opponent`}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={maxAiCapacity}
                              value={count}
                              onChange={(event) => {
                                const nextValue = Number.parseInt(event.target.value, 10)
                                updateAiCount(
                                  difficulty,
                                  Number.isNaN(nextValue) ? 0 : Math.max(0, nextValue),
                                )
                              }}
                              className="form-input w-16 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => stepAiCount(difficulty, 1)}
                              disabled={!canIncrease}
                              className="btn btn-secondary btn-icon"
                              aria-label={`Add ${label} AI opponent`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {aiErrorMessage && (
                    <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)] text-xs text-[color:var(--color-danger)]">
                      {aiErrorMessage}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={resetAiDraft}
                      disabled={aiSaving || (!aiDraftDirty && !hasAiChanges)}
                      className="btn btn-secondary btn-sm"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={handleAiSave}
                      disabled={aiSaving || !hasAiChanges}
                      className="btn btn-primary btn-sm"
                    >
                      {aiSaving ? 'Saving...' : 'Save AI Slots'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {showTeamAssignment && currentRoom.numberOfTeams && currentRoom.numberOfTeams > 0 && (
            <div className="panel space-y-3">
              <TeamAssignment
                players={lobbyTeamPlayers}
                numberOfTeams={currentRoom.numberOfTeams}
                isHost={Boolean(isHost) && !teamUpdating}
                onTeamChange={handleTeamChange}
              />
              {teamUpdating && (
                <p className="text-xs text-[color:var(--color-primary-soft)]">
                  Updating team assignments...
                </p>
              )}
              {teamUpdateError && (
                <p className="text-xs text-[color:var(--color-danger)]">{teamUpdateError}</p>
              )}
            </div>
          )}

          {/* Game Controls */}
          {currentGame && (
            <div className="panel space-y-2">
              <h3 className="text-lg font-semibold text-[color:var(--heading)]">Game Controls</h3>
              <button type="button" className="btn btn-primary w-full">
                Deploy Armies
              </button>
              <button type="button" className="btn btn-danger w-full">
                Attack
              </button>
              <button type="button" className="btn btn-success w-full">
                Fortify
              </button>
              <button type="button" className="btn btn-secondary w-full">
                End Turn
              </button>
            </div>
          )}

          {/* Chat */}
          <div className="panel p-0 overflow-hidden" style={{ height: '400px' }}>
            {roomId && user && (
              <TabbedGameChat
                gameId={roomId}
                players={(currentRoom.players || []).map((p) => ({
                  userId: p.userId ?? p.id,
                  username: p.username,
                  teamId: p.teamId ?? null,
                }))}
                currentUserId={user.id}
                userTeamId={currentGame?.players?.find((p) => p.userId === user.id)?.teamId}
                className="h-full"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
