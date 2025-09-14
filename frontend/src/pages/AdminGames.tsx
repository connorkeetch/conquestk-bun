import { useEffect, useState } from 'react'
import { adminService } from '../services/adminService'

interface Game {
  id: string
  name: string
  mapName: string
  createdBy: string
  createdByUsername: string
  players: {
    id: string
    username: string
    color: string
    status: 'waiting' | 'active' | 'eliminated' | 'disconnected'
    territoriesCount: number
    armiesCount: number
  }[]
  status: 'waiting' | 'active' | 'paused' | 'completed' | 'abandoned'
  currentTurn?: string
  currentTurnUsername?: string
  phase: 'reinforcement' | 'attack' | 'fortification'
  turnCount: number
  createdAt: string
  updatedAt: string
  maxPlayers: number
  isPrivate: boolean
  lastActivity: string
}

interface GameActionModal {
  game: Game
  isOpen: boolean
  action: 'spectate' | 'force_end' | 'adjust_settings' | 'pause' | 'resume'
}

export default function AdminGames() {
  const [games, setGames] = useState<Game[]>([])
  const [totalGames, setTotalGames] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [limit] = useState(20)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Modal state
  const [actionModal, setActionModal] = useState<GameActionModal | null>(null)
  const [actionNotes, setActionNotes] = useState('')

  const loadGames = async () => {
    try {
      setLoading(true)
      setError(null)

      const offset = (currentPage - 1) * limit
      const result = await adminService.getGames({
        limit,
        offset,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchTerm || undefined,
      })

      setGames(result.games)
      setTotalGames(result.total)
    } catch (err: any) {
      setError(err.message || 'Failed to load games')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGames()
  }, [currentPage, searchTerm, statusFilter])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchTerm(searchInput)
    setCurrentPage(1)
  }

  const handleGameAction = async () => {
    if (!actionModal) return

    try {
      switch (actionModal.action) {
        case 'spectate':
          // Open game in spectator mode
          window.open(`/game/${actionModal.game.id}?spectate=true`, '_blank')
          break
        case 'force_end':
          if (!actionNotes.trim()) {
            alert('Please provide a reason for force-ending the game')
            return
          }
          await adminService.forceEndGame(actionModal.game.id, actionNotes)
          break
        case 'pause':
          await adminService.pauseGame(actionModal.game.id, actionNotes)
          break
        case 'resume':
          await adminService.resumeGame(actionModal.game.id, actionNotes)
          break
        case 'adjust_settings':
          // This would open a more complex modal for adjusting game settings
          alert('Game settings adjustment interface coming soon')
          break
      }

      await loadGames()
      setActionModal(null)
      setActionNotes('')
    } catch (err: any) {
      alert(`Failed to ${actionModal.action.replace('_', ' ')} game: ${err.message}`)
    }
  }

  const openActionModal = (game: Game, action: GameActionModal['action']) => {
    setActionModal({ game, isOpen: true, action })
    setActionNotes('')
  }

  const closeActionModal = () => {
    setActionModal(null)
    setActionNotes('')
  }

  const getGameStatusColor = (status: string) => {
    switch (status) {
      case 'waiting':
        return 'text-yellow-400'
      case 'active':
        return 'text-green-400'
      case 'paused':
        return 'text-orange-400'
      case 'completed':
        return 'text-primary-soft'
      case 'abandoned':
        return 'text-red-400'
      default:
        return 'text-muted'
    }
  }

  const getTimeSinceLastActivity = (lastActivity: string) => {
    const now = new Date()
    const last = new Date(lastActivity)
    const diffMs = now.getTime() - last.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const totalPages = Math.ceil(totalGames / limit)

  return (
    <div className="min-h-screen bg-surface-1 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">🎮 Game Management</h1>
            <div className="text-muted">Monitor and manage active games</div>
          </div>
          <a href="/admin" className="bg-surface-2 hover:bg-gray-600 px-4 py-2 rounded">
            ← Back to Dashboard
          </a>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-surface-1 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-400">
                  {games.filter((game) => game.status === 'active').length}
                </div>
                <div className="text-sm text-muted">Active Games</div>
              </div>
              <div className="text-3xl">🎯</div>
            </div>
          </div>

          <div className="bg-surface-1 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-yellow-400">
                  {games.filter((game) => game.status === 'waiting').length}
                </div>
                <div className="text-sm text-muted">Waiting for Players</div>
              </div>
              <div className="text-3xl">⏳</div>
            </div>
          </div>

          <div className="bg-surface-1 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-400">
                  {games.filter((game) => game.status === 'paused').length}
                </div>
                <div className="text-sm text-muted">Paused Games</div>
              </div>
              <div className="text-3xl">⏸️</div>
            </div>
          </div>

          <div className="bg-surface-1 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-400">
                  {
                    games.filter((game) => {
                      const lastActivity = new Date(game.lastActivity)
                      const now = new Date()
                      const diffHours = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60)
                      return game.status === 'active' && diffHours > 2
                    }).length
                  }
                </div>
                <div className="text-sm text-muted">Potentially Stuck</div>
              </div>
              <div className="text-3xl">🚨</div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-surface-1 rounded-lg p-6 mb-6">
          <div className="flex flex-col lg:flex-row space-y-4 lg:space-y-0 lg:space-x-4">
            <form onSubmit={handleSearch} className="flex-1 flex space-x-4">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search games by name, map, or player..."
                className="flex-1 px-4 py-2 bg-surface-2 border border-border rounded-lg"
              />
              <button type="submit" className="bg-primary hover:bg-primary px-6 py-2 rounded-lg">
                🔍 Search
              </button>
            </form>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="px-4 py-2 bg-surface-2 border border-border rounded-lg"
            >
              <option value="all">All Statuses</option>
              <option value="waiting">Waiting</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="abandoned">Abandoned</option>
            </select>

            {(searchTerm || statusFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('')
                  setSearchInput('')
                  setStatusFilter('all')
                  setCurrentPage(1)
                }}
                className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Games Table */}
        <div className="bg-surface-1 rounded-lg overflow-hidden">
          <div className="p-6 border-b border-border">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Games ({totalGames.toLocaleString()})</h2>
              <button
                onClick={loadGames}
                className="bg-primary hover:bg-primary px-4 py-2 rounded text-sm"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="text-2xl mb-4">⏳</div>
              <div>Loading games...</div>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <div className="text-2xl mb-4 text-red-400">❌</div>
              <div className="text-red-400 mb-4">{error}</div>
              <button
                onClick={loadGames}
                className="bg-primary hover:bg-primary px-4 py-2 rounded"
              >
                Retry
              </button>
            </div>
          ) : games.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-2xl mb-4">🎮</div>
              <div className="text-lg font-medium mb-2">No games found</div>
              <div className="text-muted">No games match your current filters</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {games.map((game) => (
                <div key={game.id} className="p-6 hover:bg-gray-750">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <div>
                          <div className="font-medium text-lg">
                            {game.name || `Game ${game.id.slice(0, 8)}`}
                          </div>
                          <div className="text-sm text-muted">
                            Map: {game.mapName} • Created by {game.createdByUsername}
                          </div>
                        </div>
                        <span className={`font-medium ${getGameStatusColor(game.status)}`}>
                          {game.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm mb-4">
                        <div>
                          <div className="text-muted">Players</div>
                          <div>
                            {game.players.length}/{game.maxPlayers}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted">Turn</div>
                          <div>
                            #{game.turnCount} ({game.phase})
                          </div>
                        </div>
                        <div>
                          <div className="text-muted">Current Player</div>
                          <div>{game.currentTurnUsername || 'None'}</div>
                        </div>
                        <div>
                          <div className="text-muted">Last Activity</div>
                          <div>{getTimeSinceLastActivity(game.lastActivity)}</div>
                        </div>
                      </div>

                      {/* Player Status */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {game.players.map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center space-x-2 bg-surface-2 rounded-lg px-3 py-1 text-sm"
                          >
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: player.color }}
                            />
                            <span>{player.username}</span>
                            <span className="text-muted">
                              ({player.territoriesCount}T, {player.armiesCount}A)
                            </span>
                            {player.status !== 'active' && (
                              <span className="text-yellow-400 text-xs">{player.status}</span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="text-xs text-muted">
                        Created: {new Date(game.createdAt).toLocaleString()} • Updated:{' '}
                        {new Date(game.updatedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex flex-col space-y-2 ml-6">
                      <button
                        onClick={() => openActionModal(game, 'spectate')}
                        className="bg-primary hover:bg-primary px-3 py-1 rounded text-sm"
                      >
                        👁️ Spectate
                      </button>

                      {game.status === 'active' && (
                        <button
                          onClick={() => openActionModal(game, 'pause')}
                          className="bg-orange-600 hover:bg-orange-700 px-3 py-1 rounded text-sm"
                        >
                          ⏸️ Pause
                        </button>
                      )}

                      {game.status === 'paused' && (
                        <button
                          onClick={() => openActionModal(game, 'resume')}
                          className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm"
                        >
                          ▶️ Resume
                        </button>
                      )}

                      {['active', 'paused', 'waiting'].includes(game.status) && (
                        <button
                          onClick={() => openActionModal(game, 'force_end')}
                          className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
                        >
                          🛑 Force End
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-border">
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted">
                  Showing {(currentPage - 1) * limit + 1} to{' '}
                  {Math.min(currentPage * limit, totalGames)} of {totalGames} games
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="bg-surface-2 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="bg-surface-2 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-1 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              {actionModal.action === 'spectate' && '👁️ Spectate Game'}
              {actionModal.action === 'force_end' && '🛑 Force End Game'}
              {actionModal.action === 'pause' && '⏸️ Pause Game'}
              {actionModal.action === 'resume' && '▶️ Resume Game'}
              {actionModal.action === 'adjust_settings' && '⚙️ Adjust Game Settings'}
            </h3>

            <div className="mb-4 p-4 bg-surface-2 rounded">
              <div className="font-medium">
                {actionModal.game.name || `Game ${actionModal.game.id.slice(0, 8)}`}
              </div>
              <div className="text-sm text-muted">
                {actionModal.game.mapName} • {actionModal.game.players.length} players
              </div>
            </div>

            {actionModal.action !== 'spectate' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {actionModal.action === 'force_end' ? 'Reason (required)' : 'Notes (optional)'}
                  </label>
                  <textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded resize-none"
                    rows={3}
                    placeholder={
                      actionModal.action === 'force_end'
                        ? 'Explain why this game is being force-ended...'
                        : 'Optional notes about this action...'
                    }
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={closeActionModal}
                className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleGameAction}
                disabled={actionModal.action === 'force_end' && !actionNotes.trim()}
                className={`px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed ${
                  actionModal.action === 'spectate'
                    ? 'bg-primary hover:bg-primary'
                    : actionModal.action === 'force_end'
                      ? 'bg-red-600 hover:bg-red-700'
                      : actionModal.action === 'pause'
                        ? 'bg-orange-600 hover:bg-orange-700'
                        : actionModal.action === 'resume'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gray-600 hover:bg-surface-2'
                }`}
              >
                {actionModal.action === 'spectate' && '👁️ Open Spectator View'}
                {actionModal.action === 'force_end' && '🛑 Force End Game'}
                {actionModal.action === 'pause' && '⏸️ Pause Game'}
                {actionModal.action === 'resume' && '▶️ Resume Game'}
                {actionModal.action === 'adjust_settings' && '⚙️ Adjust Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
