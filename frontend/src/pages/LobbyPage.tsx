import { Clock, Gamepad2, Trophy } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { GameCardSkeleton, SkeletonGroup } from '../components/ui/Skeleton'
import { useAppSelector } from '../hooks/redux'
import api from '../services/api'
import authService from '../services/authService'
import { gameService } from '../services/gameService'
import type { GameRoom } from '../types/gameRoom'

interface GameInfo {
  id: string
  name: string
  status: GameRoom['status']
  playerCount: number
  maxPlayers: number
  isYourTurn?: boolean
  winner?: string | null
  createdAt: string
}

const LobbyPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [activeTab, setActiveTab] = useState<'browse' | 'my-games' | 'private'>('browse')
  const [publicGames, setPublicGames] = useState<GameRoom[]>([])
  const [myGames, setMyGames] = useState<GameInfo[]>([])
  const [myGamesFilter, setMyGamesFilter] = useState<'all' | 'active' | 'lobby' | 'completed'>(
    'all',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [privateGameCode, setPrivateGameCode] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [resendMessage, setResendMessage] = useState('')
  const [filters, setFilters] = useState({
    showFull: true,
    showInProgress: true,
    minPlayers: 2,
    maxPlayers: 12,
  })

  // Memoize the loadPublicGames function to prevent infinite re-renders
  const loadPublicGames = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await gameService.getPublicGames()
      setPublicGames(response.rooms || [])
    } catch (err: unknown) {
      logger.error('Failed to load public games', err)

      // Provide helpful error messages based on error type
      const errorObject = err as {
        code?: string
        message?: string
        response?: { status?: number; data?: { message?: string } }
      }

      if (errorObject.code === 'ECONNREFUSED' || errorObject.message?.includes('Network Error')) {
        setError('Cannot connect to server. Make sure the backend is running.')
      } else if (errorObject.response?.status === 404) {
        setError('Game service not available. Please try again later.')
      } else if ((errorObject.response?.status ?? 0) >= 500) {
        setError('Server error. Please try again later.')
      } else {
        setError(
          `Failed to load games: ${
            errorObject.response?.data?.message || errorObject.message || 'Unknown error'
          }`,
        )
      }
      setPublicGames([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Load user's games
  const loadMyGames = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/game/my-games')
      setMyGames(response.data.games || [])
    } catch (err: unknown) {
      logger.error('Failed to load user games', err)

      // Provide helpful error messages based on error type
      const errorObject = err as {
        code?: string
        message?: string
        response?: { status?: number; data?: { message?: string } }
      }

      if (errorObject.code === 'ECONNREFUSED' || errorObject.message?.includes('Network Error')) {
        setError('Cannot connect to server. Make sure the backend is running.')
      } else if (errorObject.response?.status === 404) {
        setError('User games service not available. Please try again later.')
      } else if ((errorObject.response?.status ?? 0) >= 500) {
        setError('Server error. Please try again later.')
      } else {
        setError(
          `Failed to load your games: ${
            errorObject.response?.data?.message || errorObject.message || 'Unknown error'
          }`,
        )
      }
      setMyGames([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (activeTab === 'browse') {
      loadPublicGames()
    } else if (activeTab === 'my-games') {
      loadMyGames()
    }
  }, [activeTab, loadPublicGames, loadMyGames])

  useEffect(() => {
    // Check email verification status
    const checkVerificationStatus = async () => {
      try {
        const response = await authService.getProfile()
        setEmailVerified(response.user?.emailVerified)
      } catch (error) {
        logger.error('Failed to fetch profile for verification status', error)
      }
    }

    if (user) {
      checkVerificationStatus()
    }
  }, [user])

  const handleResendVerification = async () => {
    if (!user?.email) return

    try {
      await authService.resendVerification(user.email)
      setResendMessage('Verification email sent! Please check your inbox.')
      setTimeout(() => setResendMessage(''), 5000)
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } }
      setResendMessage(apiError.response?.data?.message || 'Failed to resend verification email')
      setTimeout(() => setResendMessage(''), 5000)
    }
  }

  const handleJoinGame = async (roomId: string) => {
    try {
      const response = await gameService.joinRoom(roomId)
      if (response.room) {
        navigate(`/room/${roomId}`)
        return
      }
      navigate(`/room/${roomId}`)
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } }; message?: string }
      setError(
        `Failed to join game: ${apiError.response?.data?.message || apiError.message || 'Unknown error'}`,
      )
    }
  }

  const handleJoinPrivateGame = async () => {
    const trimmedCode = privateGameCode.trim().toUpperCase()

    if (!trimmedCode) {
      setError('Please enter a game code')
      return
    }

    if (trimmedCode.length < 4) {
      setError('Game code must be at least 4 characters')
      return
    }

    try {
      setError(null)
      setLoading(true)

      // Try to join the room with the provided code
      const response = await gameService.joinRoom(trimmedCode)
      if (response.room) {
        navigate(`/room/${trimmedCode}`)
      } else {
        navigate(`/room/${trimmedCode}`)
      }
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } }
      // Provide specific error messages based on the error
      if (apiError.response?.status === 404) {
        setError(`No game found with code "${trimmedCode}". Please check the code and try again.`)
      } else if (apiError.response?.status === 403) {
        setError('This game is full or already started.')
      } else if (apiError.response?.status === 401) {
        setError('You need to be logged in to join games.')
      } else {
        setError(apiError.response?.data?.message || 'Failed to join game. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const getGameStatusColor = (status: GameRoom['status']) => {
    switch (status) {
      case 'lobby':
        return 'text-green-400'
      case 'initializing':
        return 'text-blue-300'
      case 'active':
        return 'text-yellow-400'
      case 'completed':
        return 'text-muted'
      case 'paused':
        return 'text-orange-300'
      case 'abandoned':
        return 'text-muted'
      default:
        return 'text-muted'
    }
  }

  const getStatusLabel = (status: GameRoom['status']) => {
    switch (status) {
      case 'lobby':
        return 'Waiting for players'
      case 'initializing':
        return 'Launching game'
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

  const isLobbyStatus = (status: GameRoom['status']) => status === 'lobby'
  const isInProgressStatus = (status: GameRoom['status']) => status === 'active'

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Email Verification Banner */}
      {emailVerified === false && (
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-yellow-400 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h3 className="text-yellow-300 font-medium">Verify Your Email</h3>
                <p className="text-muted text-sm mt-1">
                  Please verify your email address to access all features. Check your inbox for the
                  verification link.
                </p>
                {resendMessage && <p className="text-green-400 text-sm mt-2">{resendMessage}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={handleResendVerification}
              className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-sm font-medium rounded-lg transition-colors"
            >
              Resend Email
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-primary-soft mb-2">Game Lobby</h1>
          <p className="text-muted">Find and join games, or create your own</p>
        </div>
        <div className="flex gap-3">
          <Link to="/create" className="btn-primary">
            🎮 Create Game
          </Link>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-tertiary ${showFilters ? 'is-active' : ''}`}
            aria-pressed={showFilters}
          >
            🔍 Filter Games
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="mb-6 glass-box-lg">
          <h3 className="text-lg font-semibold text-white mb-4">Filter Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="flex items-center space-x-2 text-white">
                <input
                  type="checkbox"
                  checked={filters.showFull}
                  onChange={(e) => setFilters((prev) => ({ ...prev, showFull: e.target.checked }))}
                  className="rounded border-border bg-surface-2 text-blue-600 focus:ring-primary"
                />
                <span>Show Full Games</span>
              </label>
            </div>
            <div>
              <label className="flex items-center space-x-2 text-white">
                <input
                  type="checkbox"
                  checked={filters.showInProgress}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, showInProgress: e.target.checked }))
                  }
                  className="rounded border-border bg-surface-2 text-blue-600 focus:ring-primary"
                />
                <span>Show In Progress</span>
              </label>
            </div>
            <div>
              <label className="block text-white mb-1">
                <span className="text-sm">Min Players</span>
                <input
                  type="number"
                  min="2"
                  max="12"
                  value={filters.minPlayers}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      minPlayers: parseInt(e.target.value, 10) || 2,
                    }))
                  }
                  className="w-full mt-1 px-2 py-1 bg-surface-2 text-white rounded border border-border focus:border-primary focus:outline-none"
                />
              </label>
            </div>
            <div>
              <label className="block text-white mb-1">
                <span className="text-sm">Max Players</span>
                <input
                  type="number"
                  min="2"
                  max="12"
                  value={filters.maxPlayers}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      maxPlayers: parseInt(e.target.value, 10) || 12,
                    }))
                  }
                  className="w-full mt-1 px-2 py-1 bg-surface-2 text-white rounded border border-border focus:border-primary focus:outline-none"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tabs mb-8">
        <button
          type="button"
          className={`tab ${activeTab === 'browse' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('browse')}
        >
          🌍 Browse Games
        </button>
        {user && (
          <button
            type="button"
            className={`tab ${activeTab === 'my-games' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('my-games')}
          >
            🎮 My Games
          </button>
        )}
        <button
          type="button"
          className={`tab ${activeTab === 'private' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('private')}
        >
          🔒 Private Game
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-danger/10 border border-danger/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-red-400">❌</span>
              <span className="text-red-400">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="min-h-96">
        {activeTab === 'browse' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Public Games</h2>
              <button
                type="button"
                onClick={loadPublicGames}
                disabled={loading}
                className="px-3 py-1 glass-box-sm hover:brightness-110 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '🔄 Loading...' : '🔄 Refresh'}
              </button>
            </div>

            {loading ? (
              <SkeletonGroup count={6} className="grid gap-4">
                {() => <GameCardSkeleton />}
              </SkeletonGroup>
            ) : publicGames.length === 0 ? (
              <div className="text-center text-muted py-16">
                <div className="text-6xl mb-4">🎲</div>
                <p className="text-lg mb-2">No public games available</p>
                <p className="text-sm mb-6">Be the first to create a game for others to join!</p>
                <Link
                  to="/create"
                  className="px-4 py-2 bg-primary hover:brightness-110 text-white font-medium rounded-lg transition-colors inline-block"
                >
                  🎮 Create Game
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {(() => {
                  const filteredGames = publicGames.filter((game) => {
                    // Apply filters
                    if (!filters.showFull && game.currentPlayers >= game.maxPlayers) return false
                    if (!filters.showInProgress && !isLobbyStatus(game.status)) return false
                    if (
                      game.maxPlayers < filters.minPlayers ||
                      game.maxPlayers > filters.maxPlayers
                    )
                      return false
                    return true
                  })

                  if (filteredGames.length === 0) {
                    return (
                      <div className="text-center text-muted py-16">
                        <div className="text-6xl mb-4">🔍</div>
                        <p className="text-lg mb-2 text-muted">No games match your filters</p>
                        <p className="text-sm mb-6">
                          Try adjusting your filter settings or create a new game
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setFilters({
                              showFull: true,
                              showInProgress: true,
                              minPlayers: 2,
                              maxPlayers: 12,
                            })
                          }
                          className="px-4 py-2 glass-box-sm hover:brightness-110 text-white font-medium transition-all"
                        >
                          Reset Filters
                        </button>
                      </div>
                    )
                  }

                  return filteredGames.map((game) => (
                    <div
                      key={game.id}
                      className="bg-surface-1 border border-border rounded-lg p-4 hover:border-border transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white">{game.name}</h3>
                          <div className="flex items-center space-x-4 text-sm text-muted">
                            <span>
                              {game.currentPlayers}/{game.maxPlayers} players
                            </span>
                            {game.mapName && <span>• {game.mapName}</span>}
                            <span className={getGameStatusColor(game.status)}>
                              • {getStatusLabel(game.status)}
                            </span>
                            <span>• Created {formatTimeAgo(game.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {game.hostUsername && (
                            <div className="text-sm text-muted">by {game.hostUsername}</div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleJoinGame(game.id)}
                            disabled={
                              game.currentPlayers >= game.maxPlayers || !isLobbyStatus(game.status)
                            }
                            className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                              game.currentPlayers >= game.maxPlayers || !isLobbyStatus(game.status)
                                ? 'bg-surface-2 text-muted opacity-50 cursor-not-allowed'
                                : 'bg-primary hover:brightness-110 text-white'
                            }`}
                          >
                            {game.currentPlayers >= game.maxPlayers
                              ? '🚫 Full'
                              : !isLobbyStatus(game.status)
                                ? '👁️ Spectate'
                                : '🎮 Join Game'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>
        )}

        {activeTab === 'my-games' && user && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">My Games</h2>
              <button
                type="button"
                onClick={loadMyGames}
                disabled={loading}
                className="px-3 py-1 glass-box-sm hover:brightness-110 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '🔄 Loading...' : '🔄 Refresh'}
              </button>
            </div>

            {/* Filter buttons for My Games - Using Segmented Control */}
            <div className="segmented-control mb-6">
              <button
                type="button"
                onClick={() => setMyGamesFilter('all')}
                className={myGamesFilter === 'all' ? 'segmented-active' : ''}
              >
                All Games
              </button>
              <button
                type="button"
                onClick={() => setMyGamesFilter('active')}
                className={myGamesFilter === 'active' ? 'segmented-active' : ''}
              >
                <Gamepad2 className="inline w-4 h-4 mr-1" />
                Active
              </button>
              <button
                type="button"
                onClick={() => setMyGamesFilter('lobby')}
                className={myGamesFilter === 'lobby' ? 'segmented-active' : ''}
              >
                <Clock className="inline w-4 h-4 mr-1" />
                Lobby
              </button>
              <button
                type="button"
                onClick={() => setMyGamesFilter('completed')}
                className={myGamesFilter === 'completed' ? 'segmented-active' : ''}
              >
                <Trophy className="inline w-4 h-4 mr-1" />
                Completed
              </button>
            </div>

            {loading ? (
              <SkeletonGroup count={6} className="grid gap-4">
                {() => <GameCardSkeleton />}
              </SkeletonGroup>
            ) : myGames.length === 0 ? (
              <div className="text-center text-muted py-16">
                <div className="text-6xl mb-4">🎮</div>
                <p className="text-lg mb-2">No games yet</p>
                <p className="text-sm mb-6">Join or create a game to get started!</p>
                <div className="flex gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('browse')}
                    className="btn-secondary px-4 py-2"
                  >
                    🌍 Browse Games
                  </button>
                  <Link
                    to="/create"
                    className="px-4 py-2 bg-primary hover:brightness-110 text-white font-medium rounded-lg transition-colors inline-block"
                  >
                    ➕ Create Game
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                {(() => {
                  const filteredGames = myGames.filter((game) => {
                    if (myGamesFilter === 'all') return true
                    return game.status === myGamesFilter
                  })

                  if (filteredGames.length === 0) {
                    return (
                      <div className="text-center text-muted py-16">
                        <div className="text-6xl mb-4">
                          {myGamesFilter === 'active'
                            ? '🎮'
                            : myGamesFilter === 'lobby'
                              ? '⏰'
                              : '🏆'}
                        </div>
                        <p className="text-lg mb-2 text-muted">
                          No {myGamesFilter === 'all' ? '' : myGamesFilter} games
                        </p>
                        <button
                          type="button"
                          onClick={() => setMyGamesFilter('all')}
                          className="px-4 py-2 glass-box-sm hover:brightness-110 text-white font-medium transition-all"
                        >
                          Show All Games
                        </button>
                      </div>
                    )
                  }

                  return filteredGames.map((game) => (
                    <div
                      key={game.id}
                      className="bg-surface-1 border border-border rounded-lg p-4 hover:border-border transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white">{game.name}</h3>
                          <div className="flex items-center space-x-4 text-sm text-muted">
                            <span>
                              {game.playerCount}/{game.maxPlayers} players
                            </span>
                            <span className={getGameStatusColor(game.status)}>
                              • {getStatusLabel(game.status)}
                            </span>
                            {game.isYourTurn && (
                              <span className="text-red-500 font-semibold animate-pulse">
                                • Your Turn!
                              </span>
                            )}
                            {game.winner && (
                              <span className="text-yellow-400">• Winner: {game.winner}</span>
                            )}
                            <span>• Created {formatTimeAgo(game.createdAt)}</span>
                          </div>
                        </div>
                        <div>
                          {game.status === 'lobby' || game.status === 'initializing' ? (
                            <Link
                              to={`/room/${game.id}`}
                              className="px-3 py-1 text-sm font-medium bg-primary hover:brightness-110 text-white rounded-lg transition-colors"
                            >
                              📋 View Lobby
                            </Link>
                          ) : game.status === 'active' ? (
                            <Link
                              to={`/game/${game.id}`}
                              className="px-3 py-1 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                            >
                              {game.isYourTurn ? '🎯 Play Turn' : '👁️ View Game'}
                            </Link>
                          ) : (
                            <Link
                              to={`/game/${game.id}`}
                              className="btn-secondary px-3 py-1 text-sm"
                            >
                              📊 View Results
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>
        )}

        {activeTab === 'private' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Join Private Game</h2>
            <div className="max-w-md mx-auto text-center py-16">
              <div className="text-6xl mb-4">🔐</div>
              <p className="text-lg text-muted mb-2">Enter game code to join private game</p>
              <p className="text-sm text-muted mb-6">
                You'll need the invite code from the game host
              </p>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="ENTER CODE (e.g., GAME123)"
                  value={privateGameCode}
                  onChange={(e) => setPrivateGameCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinPrivateGame()}
                  className="w-full text-center text-lg bg-surface-2 text-white placeholder-gray-400 rounded-lg px-4 py-3 border border-border focus:border-primary focus:outline-none tracking-wider font-mono"
                />
                <button
                  type="button"
                  onClick={handleJoinPrivateGame}
                  disabled={!privateGameCode.trim()}
                  className="w-full px-4 py-2 bg-primary hover:brightness-110 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🎮 Join Game
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LobbyPage
