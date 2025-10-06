import { ChevronRight, Clock, Gamepad2, Trophy, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { useAppSelector } from '../hooks/redux'
import api from '../services/api'
import type { GameRoom } from '../types/gameRoom'

interface GameInfo {
  id: string
  name: string
  status: GameRoom['status']
  playerCount: number
  maxPlayers: number
  roomCode?: number
  isYourTurn?: boolean
  winner?: string | null
  createdAt: string
}

const ActiveGamesDropdown: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const [games, setGames] = useState<GameInfo[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [turnMeta, setTurnMeta] =
    useState<Record<string, { expiresAt?: number; bank?: number; queueAhead?: number }>>()
  const [now, setNow] = useState<number>(() => Date.now())

  const fetchGames = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get('/game/my-games')
      const list: GameInfo[] = response.data.games || []
      setGames(list)

      // Compute queue + timers for top active games (limit to what we render)
      const topActive = list.filter((g) => g.status === 'active').slice(0, 5)

      if (topActive.length === 0) {
        setTurnMeta({})
      } else {
        const metaEntries = await Promise.all(
          topActive.map(async (g) => {
            try {
              // Fetch room details for timers and current turn user id
              const roomRes = await api.get(`/game/rooms/${g.id}`)
              const room = (roomRes.data?.room ?? {}) as Partial<{
                turnExpiresAt?: string | null
                timeBankSecondsRemaining?: number | null
                currentTurnUserId?: string | null
              }>

              const expiresAt = room.turnExpiresAt ? Date.parse(room.turnExpiresAt) : undefined
              const bank =
                typeof room.timeBankSecondsRemaining === 'number'
                  ? Math.max(0, Math.trunc(room.timeBankSecondsRemaining))
                  : undefined

              // Fetch game state to compute queue position reliably (skip eliminated players)
              // Only attempt if not already your turn
              let queueAhead: number | undefined
              try {
                const stateRes = await api.get(`/game/rooms/${g.id}/state`)
                const game = stateRes.data?.game as
                  | {
                      players?: Array<{ id: string; userId?: string; isEliminated?: boolean }>
                      currentPlayer?: string
                    }
                  | undefined
                if (game && Array.isArray(game.players) && game.players.length > 0) {
                  const currentPlayerId = game.currentPlayer
                  const players = game.players.filter((p) => !p.isEliminated)
                  const you = players.find((p) => p.userId === user?.id)
                  const curIdx = players.findIndex((p) => p.id === currentPlayerId)
                  const youIdx = you ? players.findIndex((p) => p.id === you.id) : -1
                  if (curIdx !== -1 && youIdx !== -1) {
                    const n = players.length
                    const dist = (youIdx - curIdx + n) % n
                    queueAhead = dist === 0 ? 0 : dist // 0 => your turn; 1 => next; >1 => players before you
                  }
                }
              } catch (err) {
                // If state fetch fails (e.g., race), leave queueAhead undefined
                logger.debug?.('ActiveGamesDropdown: state fetch failed', err)
              }

              return [g.id, { expiresAt, bank, queueAhead }] as const
            } catch (err) {
              logger.debug?.('ActiveGamesDropdown: room details fetch failed', err)
              return [
                g.id,
                { expiresAt: undefined, bank: undefined, queueAhead: undefined },
              ] as const
            }
          }),
        )
        const map: Record<string, { expiresAt?: number; bank?: number; queueAhead?: number }> = {}
        for (const [id, t] of metaEntries) map[id] = t
        setTurnMeta(map)
      }
    } catch (error) {
      logger.error('Failed to load active games', error)
      setGames([])
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (user && isOpen) {
      fetchGames()
    }
  }, [user, isOpen, fetchGames])

  // Tick to update countdowns while the menu is open
  useEffect(() => {
    if (!isOpen) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [isOpen])

  const formatWorded = useCallback((secs: number) => {
    const s = Math.max(0, Math.trunc(secs))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const r = s % 60
    const parts: string[] = []
    if (h > 0) parts.push(`${h}h`)
    if (m > 0) parts.push(`${m}m`)
    if (r > 0 || parts.length === 0) parts.push(`${r}s`)
    return parts.join(' ')
  }, [])

  const activeGames = games.filter((g) => g.status === 'active')
  const waitingGames = games.filter((g) => g.status === 'lobby' || g.status === 'initializing')
  const finishedGames = games.filter((g) => g.status === 'completed').slice(0, 3)

  const totalActive = activeGames.length + waitingGames.length
  const yourTurnCount = activeGames.filter((g) => g.isYourTurn).length

  const meta = useMemo(() => turnMeta ?? {}, [turnMeta])

  return !user ? null : (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="btn-ghost btn-icon relative"
        title="My Games"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Gamepad2 className="w-6 h-6 text-muted" />
        {totalActive > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
            {totalActive}
          </span>
        )}
        {yourTurnCount > 0 && (
          <span className="absolute -bottom-1 -right-1 bg-red-600 text-white text-xs rounded-full w-2 h-2 animate-pulse" />
        )}
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setIsOpen(false)}
            aria-label="Close active games menu"
          >
            <span className="sr-only">Close active games menu</span>
          </button>
          <div className="absolute right-0 mt-2 w-80 bg-surface-1 border border-border rounded-lg shadow-xl z-50 max-h-[600px] overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Gamepad2 className="w-5 h-5" />
                My Games
              </h3>
            </div>

            {loading ? (
              <div className="p-8 text-center text-muted">Loading games...</div>
            ) : games.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted mb-4">No games yet</p>
                <Link
                  to="/lobby"
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary transition-colors inline-flex items-center gap-2"
                  onClick={() => setIsOpen(false)}
                >
                  Start Playing <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <>
                {/* Active Games */}
                {activeGames.length > 0 && (
                  <div className="p-4 border-b border-border">
                    <h4 className="text-sm font-semibold text-muted mb-2 uppercase">
                      Active Games ({activeGames.length})
                    </h4>
                    <div className="space-y-2">
                      {activeGames.slice(0, 5).map((game) => (
                        <Link
                          key={game.id}
                          to={`/room/${(game as unknown as { roomCode?: number }).roomCode ?? game.id}`}
                          className="block p-3 bg-surface-2 rounded-lg hover:bg-gray-600 transition-colors"
                          onClick={() => setIsOpen(false)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="text-white font-medium">
                                {game.name}
                                {typeof game.roomCode === 'number'
                                  ? ` — Room ${game.roomCode}`
                                  : ''}
                              </p>
                              <div className="flex items-center gap-3 text-sm text-muted mt-1">
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {game.playerCount}/{game.maxPlayers}
                                </span>
                                {(() => {
                                  const t = meta[game.id]
                                  const remain = t?.expiresAt
                                    ? Math.ceil((t.expiresAt - now) / 1000)
                                    : null

                                  if (game.isYourTurn) {
                                    return (
                                      <span className="text-red-400 font-semibold animate-pulse flex items-center gap-2">
                                        Your Turn
                                        {remain != null && (
                                          <span className="inline-flex items-center gap-1 text-xs">
                                            <span>{formatWorded(Math.max(0, remain))}</span>
                                            {t?.bank && remain <= 0 && (
                                              <span className="chip text-[10px]">
                                                +{formatWorded(t.bank)}
                                              </span>
                                            )}
                                          </span>
                                        )}
                                      </span>
                                    )
                                  }

                                  // Not your turn: show queue position + current turn timer
                                  const queue = t?.queueAhead
                                  const queueLabel =
                                    typeof queue === 'number'
                                      ? queue === 1
                                        ? 'Your turn next'
                                        : `${queue} before you`
                                      : null
                                  return (
                                    <>
                                      {queueLabel && (
                                        <span className="font-medium">{queueLabel}</span>
                                      )}
                                      {remain != null && (
                                        <span className="inline-flex items-center gap-1 text-xs">
                                          <Clock className="w-3 h-3" />
                                          <span>{formatWorded(Math.max(0, remain))}</span>
                                        </span>
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted mt-1" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Waiting Games */}
                {waitingGames.length > 0 && (
                  <div className="p-4 border-b border-border">
                    <h4 className="text-sm font-semibold text-muted mb-2 uppercase flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      Waiting to Start ({waitingGames.length})
                    </h4>
                    <div className="space-y-2">
                      {waitingGames.slice(0, 3).map((game) => (
                        <Link
                          key={game.id}
                          to={`/room/${game.roomCode ?? game.id}`}
                          className="block p-3 bg-surface-2 rounded-lg hover:bg-gray-600 transition-colors"
                          onClick={() => setIsOpen(false)}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-white font-medium">
                                {game.name}
                                {typeof game.roomCode === 'number'
                                  ? ` — Room ${game.roomCode}`
                                  : ''}
                              </p>
                              <p className="text-sm text-muted">
                                {game.playerCount}/{game.maxPlayers} players
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted mt-1" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed Games */}
                {finishedGames.length > 0 && (
                  <div className="p-4 border-b border-border">
                    <h4 className="text-sm font-semibold text-muted mb-2 uppercase flex items-center gap-2">
                      <Trophy className="w-3 h-3" />
                      Recently Completed
                    </h4>
                    <div className="space-y-2">
                      {finishedGames.map((game) => (
                        <div key={game.id} className="p-3 bg-surface-2 rounded-lg opacity-75">
                          <p className="text-white font-medium">
                            {game.name}
                            {typeof game.roomCode === 'number' ? ` — Room ${game.roomCode}` : ''}
                          </p>
                          <p className="text-sm text-muted">Winner: {game.winner || 'Unknown'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="p-4 bg-surface-1">
                  <Link
                    to="/lobby/my-games?filter=active"
                    className="w-full px-4 py-2 bg-surface-2 text-white rounded-lg hover:bg-gray-600 transition-colors text-center block"
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
