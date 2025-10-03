import { useEffect, useId, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import {
  type AdminGameDetails as AdminGameDetailsType,
  type AdminMoveRecord,
  adminService,
} from '@/services/adminService'

type TabKey = 'overview' | 'moves' | 'turnStats' | 'log' | 'state'
type TabKeyAll = TabKey | 'snapshots'

type TurnStat = {
  turn: number
  phase: string
  currentPlayerId: string
  timestamp: string
  players?: Array<{ id: string; territories: number; armies: number; eliminated: boolean }>
}

type LogEntry = { id?: string; timestamp?: string } & Record<string, unknown>

export default function AdminGameDetailsPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()

  const [details, setDetails] = useState<AdminGameDetailsType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<TabKeyAll>('overview')

  // Moves state
  const [moves, setMoves] = useState<AdminMoveRecord[]>([])
  const [movesTotal, setMovesTotal] = useState(0)
  const [movesPage, setMovesPage] = useState(1)
  const [movesLimit] = useState(50)
  const [moveTypeFilter, setMoveTypeFilter] = useState<string>('')
  const [movesPlayerFilter, setMovesPlayerFilter] = useState<string>('')
  const [movesTurnFilter, setMovesTurnFilter] = useState<string>('')

  // Turn stats
  const [turnStats, setTurnStats] = useState<TurnStat[]>([])

  // Log
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  // Per-player diagnostics
  const [perPlayerStats, setPerPlayerStats] = useState<
    Record<
      string,
      {
        totalMoves: number | null
        attacks: number
        reinforcements: number
        fortifies: number
        eliminations: number
      }
    >
  >({})

  // State
  const [rawState, setRawState] = useState<Record<string, unknown> | null>(null)

  // Snapshots
  const [snapshots, setSnapshots] = useState<
    Array<{ id: string; room_id: string; turn_number: number; phase: string; created_at: string }>
  >([])
  const [snapTotal, setSnapTotal] = useState(0)
  const [snapPage, setSnapPage] = useState(1)
  const [snapLimit] = useState(20)
  const [snapOrder, setSnapOrder] = useState<'asc' | 'desc'>('desc')
  const [previewSnapshot, setPreviewSnapshot] = useState<{
    id: string
    room_id: string
    turn_number: number
    phase: string
    created_at: string
    snapshot: Record<string, unknown>
  } | null>(null)
  const totalSnapPages = useMemo(
    () => Math.max(1, Math.ceil(snapTotal / snapLimit)),
    [snapTotal, snapLimit],
  )

  const totalMovePages = useMemo(
    () => Math.max(1, Math.ceil(movesTotal / movesLimit)),
    [movesTotal, movesLimit],
  )

  // Stable unique IDs for filter controls
  const filterMoveTypeId = useId()
  const filterPlayerIdId = useId()
  const filterTurnId = useId()

  // Helper: map playerId -> username for friendly display
  const usernameById = useMemo(() => {
    const map: Record<string, string> = {}
    if (details?.players) {
      for (const p of details.players) map[p.id] = p.username
    }
    return map
  }, [details])

  // Helper: map territoryId -> name for friendlier logs (loaded on demand)
  const [territoryNameById, setTerritoryNameById] = useState<Record<string, string>>({})

  useEffect(() => {
    const load = async () => {
      if (!gameId) return
      try {
        setLoading(true)
        setError(null)
        const d = await adminService.getGameDetails(gameId)
        setDetails(d)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load game details'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [gameId])

  // Compute per-player stats for overview
  useEffect(() => {
    const compute = async () => {
      if (!gameId || !details || !details.players?.length) return
      const base: Record<
        string,
        {
          totalMoves: number | null
          attacks: number
          reinforcements: number
          fortifies: number
          eliminations: number
        }
      > = {}
      for (const p of details.players) {
        base[p.id] = {
          totalMoves: null,
          attacks: 0,
          reinforcements: 0,
          fortifies: 0,
          eliminations: 0,
        }
      }
      try {
        const logResp = await adminService.getGameLog(gameId)
        const entries = Array.isArray(logResp.entries) ? logResp.entries : []
        for (const e of entries) {
          const type = (e as { type?: string }).type
          if (type === 'BATTLE') {
            const attackerId = (e as { attackerId?: string }).attackerId
            if (attackerId && base[attackerId]) {
              base[attackerId].attacks += 1
              const eliminated = Array.isArray(
                (e as { eliminatedPlayers?: unknown[] }).eliminatedPlayers,
              )
                ? (e as { eliminatedPlayers: unknown[] }).eliminatedPlayers.length || 0
                : 0
              base[attackerId].eliminations += eliminated
            }
          } else if (type === 'REINFORCE') {
            const playerId = (e as { playerId?: string }).playerId
            if (playerId && base[playerId]) base[playerId].reinforcements += 1
          } else if (type === 'FORTIFY') {
            const playerId = (e as { playerId?: string }).playerId
            if (playerId && base[playerId]) base[playerId].fortifies += 1
          }
        }

        await Promise.all(
          details.players.map(async (p) => {
            try {
              const resp = await adminService.getGameMoves(gameId, {
                limit: 1,
                offset: 0,
                playerId: p.id,
              })
              base[p.id].totalMoves = resp.total
            } catch {
              base[p.id].totalMoves = null
            }
          }),
        )
      } catch {
        // no-op; keep base defaults
      }
      setPerPlayerStats(base)
    }
    void compute()
  }, [gameId, details])

  // Load moves when tab or filters change
  useEffect(() => {
    const loadMoves = async () => {
      if (!gameId || activeTab !== 'moves') return
      try {
        const offset = (movesPage - 1) * movesLimit
        const result = await adminService.getGameMoves(gameId, {
          limit: movesLimit,
          offset,
          moveType: moveTypeFilter || undefined,
          playerId: movesPlayerFilter || undefined,
          turn: movesTurnFilter ? Number.parseInt(movesTurnFilter, 10) : undefined,
          sort: 'created_at_desc',
        })
        setMoves(result.moves)
        setMovesTotal(result.total)
      } catch (_err) {
        // non-fatal
      }
    }
    void loadMoves()
  }, [activeTab, gameId, movesLimit, movesPage, moveTypeFilter, movesPlayerFilter, movesTurnFilter])

  // Load turn stats on demand
  useEffect(() => {
    const loadStats = async () => {
      if (!gameId || activeTab !== 'turnStats') return
      try {
        const result = await adminService.getGameTurnStats(gameId)
        setTurnStats(result.turnStats)
      } catch {
        // no-op
      }
    }
    void loadStats()
  }, [activeTab, gameId])

  // Load log on demand
  useEffect(() => {
    const loadLog = async () => {
      if (!gameId || activeTab !== 'log') return
      try {
        const result = await adminService.getGameLog(gameId)
        setLogEntries(result.entries)
      } catch {
        // no-op
      }
    }
    void loadLog()
  }, [activeTab, gameId])

  // When viewing the log, fetch the latest state to resolve territory names
  useEffect(() => {
    const loadNames = async () => {
      if (!gameId || activeTab !== 'log') return
      try {
        const res = await adminService.getGameState(gameId)
        const board = Array.isArray((res.state as { board?: unknown } | null)?.board)
          ? (res.state as { board: Array<{ id: string; name?: string }> }).board
          : null
        if (board) {
          const map: Record<string, string> = {}
          for (const t of board) {
            if (t && typeof t.id === 'string') map[t.id] = t.name || t.id.slice(0, 8)
          }
          setTerritoryNameById(map)
        }
      } catch {
        // non-fatal, keep IDs
      }
    }
    void loadNames()
  }, [activeTab, gameId])

  // Load state on demand
  useEffect(() => {
    const loadState = async () => {
      if (!gameId || activeTab !== 'state') return
      try {
        const result = await adminService.getGameState(gameId)
        setRawState(result.state)
      } catch {
        // no-op
      }
    }
    void loadState()
  }, [activeTab, gameId])

  // Load snapshots on demand
  useEffect(() => {
    const loadSnaps = async () => {
      if (!gameId || activeTab !== 'snapshots') return
      try {
        const offset = (snapPage - 1) * snapLimit
        const result = await adminService.getGameSnapshots(gameId, {
          limit: snapLimit,
          offset,
          order: snapOrder,
        })
        setSnapshots(result.snapshots)
        setSnapTotal(result.total)
      } catch {
        // no-op
      }
    }
    void loadSnaps()
  }, [activeTab, gameId, snapPage, snapLimit, snapOrder])

  const handleSpectate = () => {
    if (!details) return
    const roomRef = (typeof details.roomCode === 'number' && details.roomCode) || details.id
    window.open(`/room/${roomRef}?spectate=true`, '_blank')
  }

  const handlePause = async () => {
    if (!details) return
    await adminService.pauseGame(details.id)
    window.location.reload()
  }

  const handleResume = async () => {
    if (!details) return
    await adminService.resumeGame(details.id)
    window.location.reload()
  }

  const handleForceEnd = async () => {
    if (!details) return
    const reason = window.prompt('Reason for force-ending this game?')?.trim()
    if (!reason) return
    await adminService.forceEndGame(details.id, reason)
    navigate('/admin/games')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-1 text-white p-6">
        <div className="max-w-screen-2xl mx-auto">
          <AdminPageHeader title="Game Details" subtitle="Loading..." icon="🎮" />
        </div>
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="min-h-screen bg-surface-1 text-white p-6">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <AdminPageHeader title="Game Details" subtitle="Error" icon="🎮" />
          <div className="glass-box p-6 text-red-400">{error ?? 'Game not found'}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-1 text-white p-6">
      <div className="max-w-screen-2xl mx-auto space-y-6">
        <AdminPageHeader
          title={details.name || `Game ${details.id.slice(0, 8)}`}
          subtitle={`Map: ${details.mapName} • Host: ${details.createdByUsername}`}
          icon="🎮"
        />

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/games')}
            className="bg-surface-2 px-3 py-2 rounded"
          >
            ← Back
          </button>
          <button type="button" onClick={handleSpectate} className="bg-primary px-3 py-2 rounded">
            👁️ Spectate
          </button>
          {details.status === 'paused' && (
            <button
              type="button"
              onClick={handleResume}
              className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded"
            >
              ▶️ Resume
            </button>
          )}
          {details.status === 'active' && (
            <button
              type="button"
              onClick={handlePause}
              className="bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded"
            >
              ⏸️ Pause
            </button>
          )}
          {['active', 'paused', 'waiting'].includes(details.status) && (
            <button
              type="button"
              onClick={handleForceEnd}
              className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded"
            >
              🛑 Force End
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="glass-box p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted">Status</div>
              <div className="font-medium">{details.status}</div>
            </div>
            <div>
              <div className="text-muted">Phase</div>
              <div className="font-medium">{details.phase}</div>
            </div>
            <div>
              <div className="text-muted">Turn</div>
              <div className="font-medium">{details.turnCount}</div>
            </div>
            <div>
              <div className="text-muted">Current Player</div>
              <div className="font-medium">
                {['completed', 'abandoned'].includes(details.status)
                  ? '—'
                  : (details.currentTurnUsername ?? '—')}
              </div>
            </div>
            <div>
              <div className="text-muted">Players</div>
              <div className="font-medium">
                {details.players.length} / {details.maxPlayers}
              </div>
            </div>
            <div>
              <div className="text-muted">Created</div>
              <div className="font-medium">{new Date(details.createdAt).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted">Last Activity</div>
              <div className="font-medium">{new Date(details.lastActivity).toLocaleString()}</div>
            </div>
            {typeof details.roomCode === 'number' && (
              <div>
                <div className="text-muted">Room Code</div>
                <div className="font-medium">{details.roomCode}</div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="glass-box">
          <div className="border-b border-border px-4 py-2 flex gap-2">
            {(
              [
                ['overview', 'Overview'],
                ['moves', 'Moves'],
                ['turnStats', 'Turn Stats'],
                ['log', 'Battle Log'],
                ['state', 'State'],
                ['snapshots', 'Snapshots'],
              ] as Array<[TabKeyAll, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-3 py-2 rounded ${activeTab === key ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="text-lg font-medium">Players</div>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-2 pr-2">Username</th>
                        <th className="py-2 pr-2">Status</th>
                        <th className="py-2 pr-2">AI</th>
                        <th className="py-2 pr-2">Total Moves</th>
                        <th className="py-2 pr-2">Attacks</th>
                        <th className="py-2 pr-2">Reinforcements</th>
                        <th className="py-2 pr-2">Fortifies</th>
                        <th className="py-2 pr-2">Eliminations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.players.map((p) => {
                        const s = perPlayerStats[p.id]
                        return (
                          <tr key={p.id} className="border-t border-border/60">
                            <td className="py-2 pr-2">{p.username}</td>
                            <td className="py-2 pr-2">{p.status}</td>
                            <td className="py-2 pr-2">{p.isAi ? 'Yes' : 'No'}</td>
                            <td className="py-2 pr-2">{s?.totalMoves ?? '—'}</td>
                            <td className="py-2 pr-2">{s?.attacks ?? 0}</td>
                            <td className="py-2 pr-2">{s?.reinforcements ?? 0}</td>
                            <td className="py-2 pr-2">{s?.fortifies ?? 0}</td>
                            <td className="py-2 pr-2">{s?.eliminations ?? 0}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'moves' && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label htmlFor={filterMoveTypeId} className="block text-xs text-muted mb-1">
                      Move Type
                    </label>
                    <input
                      id={filterMoveTypeId}
                      value={moveTypeFilter}
                      onChange={(e) => setMoveTypeFilter(e.target.value)}
                      className="px-2 py-1 bg-surface-2 border border-border rounded"
                      placeholder="e.g. attack"
                    />
                  </div>
                  <div>
                    <label htmlFor={filterPlayerIdId} className="block text-xs text-muted mb-1">
                      Player Id
                    </label>
                    <input
                      id={filterPlayerIdId}
                      value={movesPlayerFilter}
                      onChange={(e) => setMovesPlayerFilter(e.target.value)}
                      className="px-2 py-1 bg-surface-2 border border-border rounded"
                      placeholder="uuid"
                    />
                  </div>
                  <div>
                    <label htmlFor={filterTurnId} className="block text-xs text-muted mb-1">
                      Turn
                    </label>
                    <input
                      id={filterTurnId}
                      value={movesTurnFilter}
                      onChange={(e) => setMovesTurnFilter(e.target.value)}
                      className="px-2 py-1 bg-surface-2 border border-border rounded"
                      placeholder="turn #"
                    />
                  </div>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-2 pr-2">Time</th>
                        <th className="py-2 pr-2">Turn</th>
                        <th className="py-2 pr-2">Player</th>
                        <th className="py-2 pr-2">Type</th>
                        <th className="py-2 pr-2">Data</th>
                        <th className="py-2 pr-2">Valid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moves.map((m) => (
                        <tr key={m.id} className="border-t border-border/60 align-top">
                          <td className="py-2 pr-2 whitespace-nowrap">
                            {new Date(m.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 pr-2">{m.turn_number}</td>
                          <td className="py-2 pr-2">
                            {m.player_username ?? m.player_id.slice(0, 8)}
                          </td>
                          <td className="py-2 pr-2">{m.move_type}</td>
                          <td className="py-2 pr-2 max-w-[500px]">
                            <pre className="whitespace-pre-wrap break-words">
                              {JSON.stringify(m.move_data, null, 2)}
                            </pre>
                          </td>
                          <td className="py-2 pr-2">
                            {m.is_valid
                              ? 'Yes'
                              : `No${m.validation_error ? `: ${m.validation_error}` : ''}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalMovePages > 1 && (
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-muted">
                      Showing {(movesPage - 1) * movesLimit + 1}–
                      {Math.min(movesPage * movesLimit, movesTotal)} of {movesTotal}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMovesPage(Math.max(1, movesPage - 1))}
                        disabled={movesPage === 1}
                        className="bg-surface-2 px-3 py-1 rounded disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <div className="px-2 py-1">
                        Page {movesPage} / {totalMovePages}
                      </div>
                      <button
                        type="button"
                        onClick={() => setMovesPage(Math.min(totalMovePages, movesPage + 1))}
                        disabled={movesPage === totalMovePages}
                        className="bg-surface-2 px-3 py-1 rounded disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'turnStats' && (
              <div className="overflow-auto">
                {turnStats.length === 0 ? (
                  <div className="text-muted text-sm">No turn stats available</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-2 pr-2">Time</th>
                        <th className="py-2 pr-2">Turn</th>
                        <th className="py-2 pr-2">Phase</th>
                        <th className="py-2 pr-2">Current Player</th>
                        <th className="py-2 pr-2">Active</th>
                        <th className="py-2 pr-2">Players Snapshot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {turnStats.map((s) => {
                        const activeCount = Array.isArray(s.players)
                          ? s.players.filter((p) => !p.eliminated).length
                          : undefined
                        const playersSummary = Array.isArray(s.players)
                          ? s.players
                              .map((p) => {
                                const name = usernameById[p.id] || p.id.slice(0, 8)
                                const elim = p.eliminated ? ' ✖' : ''
                                return `${name}: ${p.territories}/${p.armies}${elim}`
                              })
                              .join(' • ')
                          : '—'
                        const currentPlayerName =
                          usernameById[s.currentPlayerId] || s.currentPlayerId
                        return (
                          <tr
                            key={`${s.timestamp}-${s.turn}`}
                            className="border-t border-border/60 align-top"
                          >
                            <td className="py-2 pr-2 whitespace-nowrap">
                              {new Date(s.timestamp).toLocaleString()}
                            </td>
                            <td className="py-2 pr-2">{String(s.turn)}</td>
                            <td className="py-2 pr-2">{s.phase}</td>
                            <td className="py-2 pr-2">{currentPlayerName}</td>
                            <td className="py-2 pr-2">{activeCount ?? '—'}</td>
                            <td className="py-2 pr-2">
                              <div className="max-w-[900px] whitespace-pre-wrap break-words">
                                {playersSummary}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'log' && (
              <div className="space-y-2 text-sm">
                {logEntries.length === 0 ? (
                  <div className="text-muted">No log entries</div>
                ) : (
                  logEntries.map((e) => {
                    const k = e.id || e.timestamp || JSON.stringify(e)
                    const type = (e as { type?: string }).type || 'UNKNOWN'
                    const ts = (e as { timestamp?: string }).timestamp
                    const when = ts ? new Date(ts).toLocaleString() : ''
                    const fmtUser = (id?: string | null) =>
                      id ? usernameById[id] || id.slice(0, 8) : '—'
                    const fmtTerr = (id?: string | null) =>
                      id ? territoryNameById[id] || id.slice(0, 8) : '—'

                    let summary = ''
                    if (type === 'BATTLE') {
                      const aId = (e as { attackerId?: string }).attackerId
                      const dId = (e as { defenderId?: string | null }).defenderId || null
                      const aTer = (e as { attackingTerritoryId?: string }).attackingTerritoryId
                      const dTer = (e as { defendingTerritoryId?: string }).defendingTerritoryId
                      const losses =
                        (e as { losses?: { attacker?: number; defender?: number } }).losses || {}
                      const conquered = (e as { conquered?: boolean }).conquered === true
                      const moved = (e as { movedArmies?: number }).movedArmies
                      const eliminated = Array.isArray(
                        (e as { eliminatedPlayers?: string[] }).eliminatedPlayers,
                      )
                        ? ((e as { eliminatedPlayers: string[] }).eliminatedPlayers as string[])
                        : []
                      const elimText = eliminated.length
                        ? ` • Eliminated: ${eliminated.map((id) => fmtUser(id)).join(', ')}`
                        : ''
                      summary = `${when} • ${fmtUser(aId)} attacked ${fmtUser(dId)} from ${fmtTerr(aTer)} → ${fmtTerr(dTer)} • losses A:${
                        losses.attacker ?? 0
                      } D:${losses.defender ?? 0}${
                        conquered ? ` • conquered${moved ? `, moved +${moved}` : ''}` : ' • held'
                      }${elimText}`
                    } else if (type === 'FORTIFY') {
                      const p = (e as { playerId?: string }).playerId
                      const from = (e as { fromTerritoryId?: string }).fromTerritoryId
                      const to = (e as { toTerritoryId?: string }).toTerritoryId
                      const moved = (e as { movedArmies?: number }).movedArmies
                      const fromArmies = (e as { fromArmies?: number }).fromArmies
                      const toArmies = (e as { toArmies?: number }).toArmies
                      summary = `${when} • ${fmtUser(p)} fortified ${fmtTerr(from)} → ${fmtTerr(
                        to,
                      )} • +${moved ?? 0} (from:${fromArmies ?? '—'} to:${toArmies ?? '—'})`
                    } else if (type === 'REINFORCE') {
                      const p = (e as { playerId?: string }).playerId
                      const t = (e as { territoryId?: string }).territoryId
                      const armies = (e as { armies?: number }).armies
                      const remaining = (e as { remainingArmies?: number }).remainingArmies
                      summary = `${when} • ${fmtUser(p)} reinforced ${fmtTerr(t)} +${armies ?? 0}$${
                        remaining != null ? ` (remaining ${remaining})` : ''
                      }`
                    } else if (type === 'TURN') {
                      const p = (e as { playerId?: string }).playerId
                      const event = (e as { event?: string }).event || ''
                      const reinf = (e as { reinforcementArmies?: number }).reinforcementArmies
                      const terr = (e as { territoryCount?: number }).territoryCount
                      summary = `${when} • Turn ${event} for ${fmtUser(p)}${
                        reinf != null ? ` (+${reinf} armies)` : ''
                      }${terr != null ? ` • ${terr} territories` : ''}`
                    } else if (type === 'TREASURE') {
                      const u = (e as { userId?: string }).userId
                      const metal = (e as { metal?: unknown }).metal
                      summary = `${when} • ${fmtUser(u)} found treasure: ${String(metal ?? '?')}`
                    } else if (type === 'LIFECYCLE') {
                      const event = (e as { event?: string }).event || ''
                      summary = `${when} • Game ${event.toLowerCase()}`
                    } else {
                      summary = `${when} • ${type}`
                    }

                    return (
                      <div key={k} className="border border-border rounded p-2 bg-surface-2">
                        <div className="mb-1">{summary}</div>
                        <pre className="whitespace-pre-wrap break-words opacity-70">
                          {JSON.stringify(e, null, 2)}
                        </pre>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {activeTab === 'state' && (
              <div className="text-sm">
                {rawState ? (
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(rawState, null, 2)}
                  </pre>
                ) : (
                  <div className="text-muted">No state snapshot available</div>
                )}
              </div>
            )}

            {activeTab === 'snapshots' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="text-sm text-muted">Order:</div>
                  <button
                    type="button"
                    onClick={() => setSnapOrder(snapOrder === 'desc' ? 'asc' : 'desc')}
                    className="bg-surface-2 px-2 py-1 rounded text-sm"
                  >
                    {snapOrder === 'desc' ? 'Newest first' : 'Oldest first'}
                  </button>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-2 pr-2">Created</th>
                        <th className="py-2 pr-2">Turn</th>
                        <th className="py-2 pr-2">Phase</th>
                        <th className="py-2 pr-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshots.map((s) => (
                        <tr key={s.id} className="border-t border-border/60">
                          <td className="py-2 pr-2">{new Date(s.created_at).toLocaleString()}</td>
                          <td className="py-2 pr-2">{s.turn_number}</td>
                          <td className="py-2 pr-2">{s.phase}</td>
                          <td className="py-2 pr-2">
                            <button
                              type="button"
                              className="bg-surface-2 hover:bg-gray-600 px-2 py-1 rounded text-sm"
                              onClick={async () => {
                                if (!gameId) return
                                const full = await adminService.getGameSnapshotById(gameId, s.id)
                                setPreviewSnapshot(full)
                              }}
                            >
                              Preview
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalSnapPages > 1 && (
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-muted">
                      Showing {(snapPage - 1) * snapLimit + 1}–
                      {Math.min(snapPage * snapLimit, snapTotal)} of {snapTotal}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSnapPage(Math.max(1, snapPage - 1))}
                        disabled={snapPage === 1}
                        className="bg-surface-2 px-3 py-1 rounded disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <div className="px-2 py-1">
                        Page {snapPage} / {totalSnapPages}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSnapPage(Math.min(totalSnapPages, snapPage + 1))}
                        disabled={snapPage === totalSnapPages}
                        className="bg-surface-2 px-3 py-1 rounded disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
                {previewSnapshot && (
                  <div className="border border-border rounded p-3 bg-surface-2">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-sm text-muted">
                        Snapshot • Turn {previewSnapshot.turn_number} • {previewSnapshot.phase}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewSnapshot(null)}
                        className="bg-surface-1 hover:bg-gray-700 px-2 py-1 rounded text-sm"
                      >
                        Close
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-sm">
                      {JSON.stringify(previewSnapshot.snapshot, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
