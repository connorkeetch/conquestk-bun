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
import type { GameRoom as GameRoomType } from '../types/gameRoom'

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
  const [readySubmitting, setReadySubmitting] = useState(false)
  const [readyError, setReadyError] = useState<string | null>(null)
  const [teamUpdating, setTeamUpdating] = useState(false)
  const [teamUpdateError, setTeamUpdateError] = useState<string | null>(null)
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

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

  const readySummary = useMemo(() => {
    const total = currentRoom?.players?.length ?? 0
    const ready = currentRoom?.players?.filter((player) => player.isReady).length ?? 0
    return { ready, total }
  }, [currentRoom?.players])

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

  const canToggleReady = Boolean(
    currentRoom &&
      currentPlayer &&
      (currentRoom.status === 'lobby' || currentRoom.status === 'initializing'),
  )

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

  const handleToggleReady = async () => {
    if (!roomId || !currentPlayer) {
      return
    }

    try {
      setReadySubmitting(true)
      setReadyError(null)
      await gameService.setReadyState(roomId, !currentPlayer.isReady)
    } catch (error: unknown) {
      let message = 'Failed to update ready status'
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

      setReadyError(message)
    } finally {
      setReadySubmitting(false)
    }
  }

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
      <div className="text-center space-y-4">
        <div className="text-xl text-red-400">{roomError}</div>
        <button
          type="button"
          onClick={() => navigate('/lobby')}
          className="bg-primary px-4 py-2 rounded text-white"
        >
          Return to Lobby
        </button>
      </div>
    )
  }

  if (isRoomLoading || !currentRoom) {
    return (
      <div className="text-center">
        <div className="text-xl">Loading room...</div>
      </div>
    )
  }

  if (isGameLoading && !currentGame) {
    return (
      <div className="text-center">
        <div className="text-xl">Loading game state...</div>
      </div>
    )
  }

  if (gameError && !currentGame) {
    return (
      <div className="text-center">
        <div className="text-xl">{gameError}</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">{currentRoom.name}</h1>
          <div className="text-sm text-muted mt-1 flex flex-wrap items-center gap-2">
            <span>Status: {getStatusLabel(currentRoom.status)}</span>
            <span>
              • Ready {readySummary.ready}/{readySummary.total}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isMember && (
            <button
              onClick={() => void handleJoinLobby()}
              disabled={joinActionDisabled}
              type="button"
              title={joinButtonTitle}
              className="px-4 py-2 rounded bg-primary text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {joinButtonLabel}
            </button>
          )}
          {canToggleReady && (
            <button
              onClick={handleToggleReady}
              disabled={readySubmitting}
              type="button"
              className={`px-4 py-2 rounded ${
                currentPlayer?.isReady ? 'bg-green-600 hover:bg-green-700' : 'bg-primary'
              } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {readySubmitting
                ? 'Updating...'
                : currentPlayer?.isReady
                  ? '✅ Ready'
                  : '🔔 Mark Ready'}
            </button>
          )}
          <button
            onClick={handleToggleMute}
            className="bg-surface-2 hover:brightness-110 px-4 py-2 rounded flex items-center gap-2"
            type="button"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🔊'} {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button
            onClick={handleLeaveRoom}
            type="button"
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
          >
            Leave Room
          </button>
        </div>
      </div>

      {joinError && (
        <div className="mb-4 rounded bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 text-sm">
          {joinError}
        </div>
      )}

      {readyError && (
        <div className="mb-4 rounded bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 text-sm">
          {readyError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Game Board */}
        <div className="lg:col-span-3">
          <div className="h-[600px]">
            {currentGame ? (
              <RiskGameBoard
                onTerritoryClick={(_territoryId) => {
                  // TODO: Handle territory interactions based on game phase
                }}
              />
            ) : (
              <div className="bg-surface-1 rounded-lg p-6 h-full flex items-center justify-center">
                <div className="text-center text-muted">
                  <h2 className="text-xl font-bold mb-4">Waiting for game to start...</h2>
                  <p>Need at least 2 players to begin</p>
                  <div className="mt-6">
                    <RiskGameBoard
                      onTerritoryClick={(_territoryId) => {
                        /* noop */
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Players */}
          <div className="bg-surface-1 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">
              Players ({currentRoom.players?.length || 0}/{currentRoom.maxPlayers})
            </h3>
            <div className="space-y-2">
              {currentRoom.players?.map((player) => {
                const isReady = Boolean(player.isReady)
                const isCurrentUser = player.userId === user?.id
                return (
                  <div key={player.id} className="flex items-center gap-2 text-sm">
                    <div
                      className={`w-3 h-3 rounded-full ${isReady ? 'bg-green-500' : 'bg-gray-600'}`}
                    ></div>
                    <span className={isCurrentUser ? 'font-bold' : ''}>{player.username}</span>
                    {player.isAi && player.aiDifficulty && (
                      <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">
                        AI – {player.aiDifficulty.charAt(0).toUpperCase() + player.aiDifficulty.slice(1)}
                      </span>
                    )}
                    {player.userId === currentRoom.hostId && (
                      <span className="text-xs bg-yellow-600 px-2 py-0.5 rounded">HOST</span>
                    )}
                    <span
                      className={`ml-auto text-xs ${isReady ? 'text-green-400' : 'text-muted'}`}
                    >
                      {isReady ? 'Ready' : 'Not ready'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {showTeamAssignment && currentRoom.numberOfTeams && currentRoom.numberOfTeams > 0 && (
            <div className="bg-surface-1 rounded-lg p-4 space-y-3">
              <TeamAssignment
                players={lobbyTeamPlayers}
                numberOfTeams={currentRoom.numberOfTeams}
                isHost={Boolean(isHost) && !teamUpdating}
                onTeamChange={handleTeamChange}
              />
              {teamUpdating && (
                <p className="text-xs text-primary-soft">Updating team assignments...</p>
              )}
              {teamUpdateError && <p className="text-xs text-red-400">{teamUpdateError}</p>}
            </div>
          )}

          {/* Game Controls */}
          {currentGame && (
            <div className="bg-surface-1 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">Game Controls</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  className="w-full bg-primary hover:brightness-110 px-3 py-2 rounded text-sm"
                >
                  Deploy Armies
                </button>
                <button
                  type="button"
                  className="w-full bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm"
                >
                  Attack
                </button>
                <button
                  type="button"
                  className="w-full bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm"
                >
                  Fortify
                </button>
                <button
                  type="button"
                  className="w-full bg-surface-2 hover:brightness-110 px-3 py-2 rounded text-sm"
                >
                  End Turn
                </button>
              </div>
            </div>
          )}

          {/* Chat */}
          <div className="bg-surface-1 rounded-lg overflow-hidden" style={{ height: '400px' }}>
            {roomId && user && (
              <TabbedGameChat
                gameId={roomId}
                players={currentRoom.players || []}
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
