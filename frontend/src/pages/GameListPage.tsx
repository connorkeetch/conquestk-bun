import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { gameService } from '../services/gameService'
import type { GameRoom } from '../types/gameRoom'

const GameListPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'spectate'>('active')
  const [userGames, setUserGames] = useState<GameRoom[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadUserGames = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await gameService.getUserGames()
      setUserGames(response.games || [])
    } catch (_error: unknown) {
      setError('Failed to load your games')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUserGames()
  }, [loadUserGames])

  const getGameStatusColor = (status: GameRoom['status']) => {
    switch (status) {
      case 'lobby':
        return 'text-yellow-400'
      case 'initializing':
        return 'text-blue-300'
      case 'active':
        return 'text-green-400'
      case 'completed':
        return 'text-primary-soft'
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
        return 'Waiting for Players'
      case 'initializing':
        return 'Launching'
      case 'active':
        return 'In Progress'
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

  const formatTimeAgo = (dateString?: string | null) => {
    if (!dateString) {
      return 'Unknown'
    }
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

  const activeGames = userGames.filter(
    (game) => game.status === 'lobby' || game.status === 'initializing' || game.status === 'active',
  )
  const completedGames = userGames.filter((game) => game.status === 'completed')

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">My Games</h1>
          <p className="text-muted">Manage your active and completed games</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/lobby"
            className="px-4 py-2 bg-primary hover:bg-primary text-white font-medium rounded-lg transition-colors"
          >
            🎮 New Game
          </Link>
          <button
            type="button"
            onClick={loadUserGames}
            disabled={loading}
            className="px-4 py-2 glass-box-sm hover:brightness-110 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '🔄 Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg">
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

      {/* Navigation Tabs */}
      <div className="tabs mb-8">
        <button
          type="button"
          className={`tab ${activeTab === 'active' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          ⚡ Active Games
          {activeGames.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
              {activeGames.length}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'completed' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          ✅ Completed
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'spectate' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('spectate')}
        >
          👁️ Spectate
        </button>
      </div>

      {/* Content Area */}
      <div className="min-h-96">
        {activeTab === 'active' && (
          <div>
            {loading ? (
              <div className="text-center text-muted py-16">
                <div className="text-4xl mb-4">🔄</div>
                <p className="text-lg">Loading your games...</p>
              </div>
            ) : activeGames.length === 0 ? (
              <div className="text-center text-muted py-16">
                <div className="text-6xl mb-4">🎮</div>
                <p className="text-lg mb-2">No active games</p>
                <p className="text-sm mb-6">Create or join a game to get started!</p>
                <Link
                  to="/lobby"
                  className="inline-block px-4 py-2 bg-primary hover:bg-primary text-white font-medium rounded-lg transition-colors"
                >
                  🎮 Find Games
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {activeGames.map((game) => (
                  <div key={game.id} className="card">
                    <div className="card-header">
                      <div className="flex-1">
                        <h3 className="card-title">{game.name}</h3>
                        <div className="flex items-center space-x-4 text-sm text-muted">
                          <span>
                            {game.currentPlayers}/{game.maxPlayers} players
                          </span>
                          {game.mapName && <span>• {game.mapName}</span>}
                          <span className={getGameStatusColor(game.status)}>
                            • {getStatusLabel(game.status)}
                          </span>
                          <span>• Updated {formatTimeAgo(game.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className={`text-lg font-bold ${getGameStatusColor(game.status)}`}>
                            {game.status === 'lobby'
                              ? 'Waiting for Players'
                              : game.status === 'initializing'
                                ? 'Launching Soon'
                                : getStatusLabel(game.status)}
                          </div>
                          <div className="text-sm text-muted">
                            Created {formatTimeAgo(game.createdAt)}
                          </div>
                        </div>
                        <Link
                          to={
                            game.status === 'active'
                              ? `/game/${game.roomCode ?? game.id}`
                              : `/room/${game.roomCode ?? game.id}`
                          }
                          className={`btn ${game.status === 'lobby' ? 'btn-primary' : 'btn-secondary'}`}
                        >
                          {game.status === 'lobby'
                            ? '🎮 Enter Lobby'
                            : game.status === 'active'
                              ? '👁️ View Game'
                              : 'Open Game'}
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'completed' && (
          <div>
            {loading ? (
              <div className="text-center text-muted py-16">
                <div className="text-4xl mb-4">🔄</div>
                <p className="text-lg">Loading completed games...</p>
              </div>
            ) : completedGames.length === 0 ? (
              <div className="text-center text-muted py-16">
                <div className="text-6xl mb-4">📚</div>
                <p className="text-lg">No completed games yet</p>
                <p className="text-sm mt-2">
                  Your game history will appear here once you finish games
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {completedGames.map((game) => (
                  <div key={game.id} className="card opacity-75">
                    <div className="card-header">
                      <div className="flex-1">
                        <h3 className="card-title">{game.name}</h3>
                        <div className="flex items-center space-x-4 text-sm text-muted">
                          <span>
                            {game.currentPlayers}/{game.maxPlayers} players
                          </span>
                          {game.mapName && <span>• {game.mapName}</span>}
                          <span className={getGameStatusColor(game.status)}>
                            • {getStatusLabel(game.status)}
                          </span>
                          <span>• Completed {formatTimeAgo(game.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className={`text-lg font-bold ${getGameStatusColor(game.status)}`}>
                            {getStatusLabel(game.status)}
                          </div>
                          <div className="text-sm text-muted">
                            Duration: {formatTimeAgo(game.createdAt)}
                          </div>
                        </div>
                        <Link
                          to={`/room/${game.roomCode ?? game.id}`}
                          className="px-3 py-1 text-muted hover:text-white hover:bg-surface-2 rounded transition-colors text-sm"
                        >
                          📊 View Results
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'spectate' && (
          <div className="text-center text-muted py-16">
            <div className="text-6xl mb-4">👁️</div>
            <p className="text-lg">Live game spectating will be implemented here</p>
            <p className="text-sm mt-2">This will show public games you can watch</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default GameListPage
