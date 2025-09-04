import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GameCardSkeleton, SkeletonGroup } from '../components/ui/Skeleton'
import { useAppSelector } from '../hooks/redux'
import authService from '../services/authService'
import { type GameRoom, gameService } from '../services/gameService'
import api from '../services/api'
import { Clock, Trophy, Gamepad2 } from 'lucide-react'

interface GameInfo {
  id: string
  name: string
  status: 'active' | 'finished' | 'waiting'
  playerCount: number
  maxPlayers: number
  isYourTurn?: boolean
  winner?: string
  createdAt: string
}

const LobbyPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [activeTab, setActiveTab] = useState<'browse' | 'my-games' | 'private' | 'tournaments'>('browse')
  const [publicGames, setPublicGames] = useState<GameRoom[]>([])
  const [myGames, setMyGames] = useState<GameInfo[]>([])
  const [myGamesFilter, setMyGamesFilter] = useState<'all' | 'active' | 'waiting' | 'finished'>('all')
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
    } catch (err: any) {
      console.error('Failed to load public games:', err)
      
      // Provide helpful error messages based on error type
      if (err.code === 'ECONNREFUSED' || err.message?.includes('Network Error')) {
        setError('Cannot connect to server. Make sure the backend is running.')
      } else if (err.response?.status === 404) {
        setError('Game service not available. Please try again later.')
      } else if (err.response?.status >= 500) {
        setError('Server error. Please try again later.')
      } else {
        setError(`Failed to load games: ${err.response?.data?.message || err.message || 'Unknown error'}`)
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
    } catch (err: any) {
      console.error('Failed to load user games:', err)
      
      // Provide helpful error messages based on error type
      if (err.code === 'ECONNREFUSED' || err.message?.includes('Network Error')) {
        setError('Cannot connect to server. Make sure the backend is running.')
      } else if (err.response?.status === 404) {
        setError('User games service not available. Please try again later.')
      } else if (err.response?.status >= 500) {
        setError('Server error. Please try again later.')
      } else {
        setError(`Failed to load your games: ${err.response?.data?.message || err.message || 'Unknown error'}`)
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
      } catch (_error) {}
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
    } catch (error: any) {
      setResendMessage(error.response?.data?.message || 'Failed to resend verification email')
      setTimeout(() => setResendMessage(''), 5000)
    }
  }

  const handleJoinGame = async (roomId: string) => {
    try {
      const response = await gameService.joinRoom(roomId)
      if (response.room) {
        navigate(`/room/${roomId}`)
      }
    } catch (err: any) {
      setError(`Failed to join game: ${err.response?.data?.message || err.message}`)
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
      }
    } catch (err: any) {
      // Provide specific error messages based on the error
      if (err.response?.status === 404) {
        setError(`No game found with code "${trimmedCode}". Please check the code and try again.`)
      } else if (err.response?.status === 403) {
        setError('This game is full or already started.')
      } else if (err.response?.status === 401) {
        setError('You need to be logged in to join games.')
      } else {
        setError(err.response?.data?.message || 'Failed to join game. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const getGameStatusColor = (status: string) => {
    switch (status) {
      case 'waiting':
        return 'text-green-400'
      case 'active':
        return 'text-yellow-400'
      case 'completed':
        return 'text-gray-400'
      default:
        return 'text-gray-400'
    }
  }

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
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h3 className="text-yellow-300 font-medium">Verify Your Email</h3>
                <p className="text-gray-300 text-sm mt-1">
                  Please verify your email address to access all features. Check your inbox for the
                  verification link.
                </p>
                {resendMessage && <p className="text-green-400 text-sm mt-2">{resendMessage}</p>}
              </div>
            </div>
            <button
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
          <h1 className="text-4xl font-bold gradient-text mb-2">Game Lobby</h1>
          <p className="text-gray-400">Find and join games, or create your own</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/create"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            🎮 Create Game
          </Link>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            🔍 Filter Games
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="mb-6 p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">Filter Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="flex items-center space-x-2 text-white">
                <input
                  type="checkbox"
                  checked={filters.showFull}
                  onChange={(e) => setFilters((prev) => ({ ...prev, showFull: e.target.checked }))}
                  className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
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
                  className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
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
                  className="w-full mt-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
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
                  className="w-full mt-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-8 border-b border-gray-700 overflow-x-auto">
        <button
          className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'browse'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('browse')}
        >
          🌍 Browse Games
        </button>
        {user && (
          <button
            className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'my-games'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('my-games')}
          >
            🎮 My Games
          </button>
        )}
        <button
          className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'private'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('private')}
        >
          🔒 Private Game
        </button>
        <button
          className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'tournaments'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('tournaments')}
        >
          🏆 Tournaments
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-red-400">❌</span>
              <span className="text-red-400">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
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
                onClick={loadPublicGames}
                disabled={loading}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? '🔄 Loading...' : '🔄 Refresh'}
              </button>
            </div>

            {loading ? (
              <SkeletonGroup count={6} className="grid gap-4">
                {() => <GameCardSkeleton />}
              </SkeletonGroup>
            ) : publicGames.length === 0 ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-6xl mb-4">🎲</div>
                <p className="text-lg mb-2">No public games available</p>
                <p className="text-sm mb-6">Be the first to create a game for others to join!</p>
                <Link
                  to="/create"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors inline-block"
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
                    if (!filters.showInProgress && game.status !== 'waiting') return false
                    if (
                      game.maxPlayers < filters.minPlayers ||
                      game.maxPlayers > filters.maxPlayers
                    )
                      return false
                    return true
                  })

                  if (filteredGames.length === 0) {
                    return (
                      <div className="text-center text-gray-400 py-16">
                        <div className="text-6xl mb-4">🔍</div>
                        <p className="text-lg mb-2 text-gray-300">No games match your filters</p>
                        <p className="text-sm mb-6">
                          Try adjusting your filter settings or create a new game
                        </p>
                        <button
                          onClick={() =>
                            setFilters({
                              showFull: true,
                              showInProgress: true,
                              minPlayers: 2,
                              maxPlayers: 12,
                            })
                          }
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                        >
                          Reset Filters
                        </button>
                      </div>
                    )
                  }

                  return filteredGames.map((game) => (
                    <div
                      key={game.id}
                      className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white">{game.name}</h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-400">
                            <span>
                              {game.currentPlayers}/{game.maxPlayers} players
                            </span>
                            {game.mapName && <span>• {game.mapName}</span>}
                            <span className={getGameStatusColor(game.status)}>• {game.status}</span>
                            <span>• Created {formatTimeAgo(game.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {game.hostUsername && (
                            <div className="text-sm text-gray-400">by {game.hostUsername}</div>
                          )}
                          <button
                            onClick={() => handleJoinGame(game.id)}
                            disabled={
                              game.currentPlayers >= game.maxPlayers || game.status !== 'waiting'
                            }
                            className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                              game.currentPlayers >= game.maxPlayers || game.status !== 'waiting'
                                ? 'bg-gray-700 text-gray-400 opacity-50 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            {game.currentPlayers >= game.maxPlayers
                              ? '🚫 Full'
                              : game.status !== 'waiting'
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
                onClick={loadMyGames}
                disabled={loading}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? '🔄 Loading...' : '🔄 Refresh'}
              </button>
            </div>

            {/* Filter buttons for My Games */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setMyGamesFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  myGamesFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                All Games
              </button>
              <button
                onClick={() => setMyGamesFilter('active')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  myGamesFilter === 'active'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Gamepad2 className="inline w-4 h-4 mr-1" />
                Active
              </button>
              <button
                onClick={() => setMyGamesFilter('waiting')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  myGamesFilter === 'waiting'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Clock className="inline w-4 h-4 mr-1" />
                Waiting
              </button>
              <button
                onClick={() => setMyGamesFilter('finished')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  myGamesFilter === 'finished'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Trophy className="inline w-4 h-4 mr-1" />
                Finished
              </button>
            </div>

            {loading ? (
              <SkeletonGroup count={6} className="grid gap-4">
                {() => <GameCardSkeleton />}
              </SkeletonGroup>
            ) : myGames.length === 0 ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-6xl mb-4">🎮</div>
                <p className="text-lg mb-2">No games yet</p>
                <p className="text-sm mb-6">Join or create a game to get started!</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setActiveTab('browse')}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                  >
                    🌍 Browse Games
                  </button>
                  <Link
                    to="/create"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors inline-block"
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
                      <div className="text-center text-gray-400 py-16">
                        <div className="text-6xl mb-4">
                          {myGamesFilter === 'active' ? '🎮' : myGamesFilter === 'waiting' ? '⏰' : '🏆'}
                        </div>
                        <p className="text-lg mb-2 text-gray-300">
                          No {myGamesFilter === 'all' ? '' : myGamesFilter} games
                        </p>
                        <button
                          onClick={() => setMyGamesFilter('all')}
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                        >
                          Show All Games
                        </button>
                      </div>
                    )
                  }

                  return filteredGames.map((game) => (
                    <div
                      key={game.id}
                      className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white">{game.name}</h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-400">
                            <span>
                              {game.playerCount}/{game.maxPlayers} players
                            </span>
                            <span className={getGameStatusColor(game.status)}>• {game.status}</span>
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
                          {game.status === 'waiting' ? (
                            <Link
                              to={`/room/${game.id}`}
                              className="px-3 py-1 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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
                              className="px-3 py-1 text-sm font-medium bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
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
              <p className="text-lg text-gray-300 mb-2">Enter game code to join private game</p>
              <p className="text-sm text-gray-400 mb-6">
                You'll need the invite code from the game host
              </p>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="ENTER CODE (e.g., GAME123)"
                  value={privateGameCode}
                  onChange={(e) => setPrivateGameCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinPrivateGame()}
                  className="w-full text-center text-lg bg-gray-700 text-white placeholder-gray-400 rounded-lg px-4 py-3 border border-gray-600 focus:border-blue-500 focus:outline-none tracking-wider font-mono"
                />
                <button
                  onClick={handleJoinPrivateGame}
                  disabled={!privateGameCode.trim()}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🎮 Join Game
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tournaments' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Tournaments</h2>
            <div className="text-center text-gray-400 py-16">
              <div className="text-6xl mb-4">🏆</div>
              <p className="text-lg text-gray-300">Tournament system coming soon!</p>
              <p className="text-sm mt-2">
                This will show active tournaments, brackets, and registration
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LobbyPage
