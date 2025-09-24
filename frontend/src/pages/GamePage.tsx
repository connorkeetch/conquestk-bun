import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { SimpleRiskGameBoard } from '../components/SimpleRiskGameBoard'
import { getPlayerColor } from '../constants/colors'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { gameService } from '../services/gameService'
import { socketService } from '../services/socketService'
import { clearGame, fetchGameState, setError } from '../store/gameSlice'
import { setCurrentRoom } from '../store/roomSlice'

const GamePage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>()
  const [activeTab, setActiveTab] = useState<'board' | 'chat' | 'stats'>('board')
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [isLoadingRoom, setIsLoadingRoom] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const isSpectator = searchParams.get('spectate') === 'true'

  const dispatch = useAppDispatch()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { currentGame, isLoading, error } = useAppSelector((state) => state.game)
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
              {!isFullScreen && (
                <p className="text-sm text-muted">
                  {currentGame && currentTurnPlayer
                    ? `Turn ${currentGame.turn} • ${currentTurnPlayer.username}'s turn`
                    : currentRoom?.status
                      ? `Status: ${formatRoomStatus(currentRoom.status)}`
                      : 'Preparing game details...'}
                </p>
              )}
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
            </div>

            <div className="flex-1 p-4">
              {showLoadingState && (
                <div className="text-center text-muted py-8">
                  <div className="text-4xl mb-2 animate-spin">🔄</div>
                  <p>Loading game details...</p>
                </div>
              )}

              {activeTab === 'board' && (
                <div>
                  <h3 className="font-bold mb-4">Game Controls</h3>
                  <div className="space-y-3">
                    <div className="text-center p-3 bg-primary rounded">
                      <div className="font-bold">ATTACK PHASE</div>
                      <div className="text-sm">Click territories to attack</div>
                    </div>
                    <button
                      type="button"
                      className="w-full px-4 py-2 bg-primary hover:bg-primary text-white font-medium rounded-lg transition-colors"
                    >
                      End Attack Phase
                    </button>
                    <button type="button" className="btn-secondary w-full px-4 py-2">
                      View Help
                    </button>
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
            </div>
          </div>
        )}

        <div className="flex-1 relative">
          <div className="h-full relative overflow-hidden">
            <SimpleRiskGameBoard onTerritoryClick={handleBoardTerritoryClick} />

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
