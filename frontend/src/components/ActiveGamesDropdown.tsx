import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gamepad2, Trophy, Clock, Users, ChevronRight } from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import api from '../services/api'

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

const ActiveGamesDropdown: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const [games, setGames] = useState<GameInfo[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user && isOpen) {
      fetchGames()
    }
  }, [user, isOpen])

  const fetchGames = async () => {
    setLoading(true)
    try {
      const response = await api.get('/game/my-games')
      setGames(response.data.games || [])
    } catch (error) {
      console.error('Failed to fetch games:', error)
      setGames([])
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  const activeGames = games.filter(g => g.status === 'active')
  const waitingGames = games.filter(g => g.status === 'waiting')
  const finishedGames = games.filter(g => g.status === 'finished').slice(0, 3)
  
  const totalActive = activeGames.length + waitingGames.length
  const yourTurnCount = activeGames.filter(g => g.isYourTurn).length

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-800 transition-colors"
        title="My Games"
      >
        <Gamepad2 className="w-6 h-6 text-gray-300" />
        {totalActive > 0 && (
          <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
            {totalActive}
          </span>
        )}
        {yourTurnCount > 0 && (
          <span className="absolute -bottom-1 -right-1 bg-red-600 text-white text-xs rounded-full w-2 h-2 animate-pulse" />
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-[600px] overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Gamepad2 className="w-5 h-5" />
                My Games
              </h3>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-400">
                Loading games...
              </div>
            ) : games.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-400 mb-4">No games yet</p>
                <Link
                  to="/play"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
                  onClick={() => setIsOpen(false)}
                >
                  Start Playing <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <>
                {/* Active Games */}
                {activeGames.length > 0 && (
                  <div className="p-4 border-b border-gray-700">
                    <h4 className="text-sm font-semibold text-gray-400 mb-2 uppercase">
                      Active Games ({activeGames.length})
                    </h4>
                    <div className="space-y-2">
                      {activeGames.slice(0, 5).map((game) => (
                        <Link
                          key={game.id}
                          to={`/game/${game.id}`}
                          className="block p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                          onClick={() => setIsOpen(false)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="text-white font-medium">{game.name}</p>
                              <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {game.playerCount}/{game.maxPlayers}
                                </span>
                                {game.isYourTurn && (
                                  <span className="text-red-500 font-semibold animate-pulse">
                                    Your Turn!
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400 mt-1" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Waiting Games */}
                {waitingGames.length > 0 && (
                  <div className="p-4 border-b border-gray-700">
                    <h4 className="text-sm font-semibold text-gray-400 mb-2 uppercase flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      Waiting to Start ({waitingGames.length})
                    </h4>
                    <div className="space-y-2">
                      {waitingGames.slice(0, 3).map((game) => (
                        <Link
                          key={game.id}
                          to={`/lobby/${game.id}`}
                          className="block p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                          onClick={() => setIsOpen(false)}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-white font-medium">{game.name}</p>
                              <p className="text-sm text-gray-400">
                                {game.playerCount}/{game.maxPlayers} players
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400 mt-1" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Finished Games */}
                {finishedGames.length > 0 && (
                  <div className="p-4 border-b border-gray-700">
                    <h4 className="text-sm font-semibold text-gray-400 mb-2 uppercase flex items-center gap-2">
                      <Trophy className="w-3 h-3" />
                      Recently Finished
                    </h4>
                    <div className="space-y-2">
                      {finishedGames.map((game) => (
                        <div
                          key={game.id}
                          className="p-3 bg-gray-700 rounded-lg opacity-75"
                        >
                          <p className="text-white font-medium">{game.name}</p>
                          <p className="text-sm text-gray-400">
                            Winner: {game.winner || 'Unknown'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="p-4 bg-gray-900">
                  <Link
                    to="/games"
                    className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-center block"
                    onClick={() => setIsOpen(false)}
                  >
                    View All Games
                  </Link>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default ActiveGamesDropdown