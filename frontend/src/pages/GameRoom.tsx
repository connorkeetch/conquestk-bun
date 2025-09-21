import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TabbedGameChat from '../components/chat/TabbedGameChat'
import { RiskGameBoard } from '../components/RiskGameBoard'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import audioService from '../services/audioService'
import { socketService } from '../services/socketService'
import { gameService } from '../services/gameService'
import type { GameRoom as GameRoomType } from '../types/gameRoom'
import { clearGame, fetchGameState } from '../store/gameSlice'

export default function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { currentRoom } = useAppSelector((state) => state.room)
  const { currentGame, isLoading: isGameLoading, error: gameError } = useAppSelector(
    (state) => state.game,
  )
  const { user } = useAppSelector((state) => state.auth)
  const [isMuted, setIsMuted] = useState(audioService.isMutedState())
  const [readySubmitting, setReadySubmitting] = useState(false)
  const [readyError, setReadyError] = useState<string | null>(null)

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

  const readySummary = useMemo(() => {
    const total = currentRoom?.players?.length ?? 0
    const ready = currentRoom?.players?.filter((player) => player.isReady).length ?? 0
    return { ready, total }
  }, [currentRoom?.players])

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
    socketService.joinRoom(roomId)

    if (!currentGame || currentGame.roomId !== roomId) {
      void dispatch(fetchGameState(roomId))
    }

    return () => {
      if (roomId) {
        socketService.leaveRoom(roomId)
      }
      dispatch(clearGame())
    }
  }, [roomId, navigate, dispatch, currentGame])

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
    } catch (error: any) {
      const message =
        error?.response?.data?.message || error?.message || 'Failed to update ready status'
      setReadyError(message)
    } finally {
      setReadySubmitting(false)
    }
  }

  if (!currentRoom) {
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
            <span>• Ready {readySummary.ready}/{readySummary.total}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canToggleReady && (
            <button
              onClick={handleToggleReady}
              disabled={readySubmitting}
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
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🔊'} {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button
            onClick={handleLeaveRoom}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
          >
            Leave Room
          </button>
        </div>
      </div>

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
                    <RiskGameBoard onTerritoryClick={(_territoryId) => {}} />
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
                  <div key={player.userId} className="flex items-center gap-2 text-sm">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        isReady ? 'bg-green-500' : 'bg-gray-600'
                      }`}
                    ></div>
                    <span className={isCurrentUser ? 'font-bold' : ''}>{player.username}</span>
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

          {/* Game Controls */}
          {currentGame && (
            <div className="bg-surface-1 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">Game Controls</h3>
              <div className="space-y-2">
                <button className="w-full bg-primary hover:brightness-110 px-3 py-2 rounded text-sm">
                  Deploy Armies
                </button>
                <button className="w-full bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm">
                  Attack
                </button>
                <button className="w-full bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm">
                  Fortify
                </button>
                <button className="w-full bg-surface-2 hover:brightness-110 px-3 py-2 rounded text-sm">
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
