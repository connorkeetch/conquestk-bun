import React from 'react'
import { useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import UnifiedMapDisplay from '@/components/UnifiedMapDisplay'
import { getColorValue } from '@/constants/colors'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { type MapTerritory, mapService } from '@/services/mapService'
import {
  fetchReplayChunk,
  fetchReplaySummary,
  selectCurrentTurn,
  selectMapDiff,
  selectReplayMeta,
  setCurrentTurn,
} from '@/store/replaySlice'

const CHUNK_SIZE = 25

const ReplayPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { gameId } = useParams<{ gameId: string }>()
  const meta = useSelector(selectReplayMeta)
  const currentTurn = useSelector(selectCurrentTurn)
  const diff = useSelector(selectMapDiff)

  const [_loading, setLoading] = React.useState(false)
  const [_error, setError] = React.useState<string | null>(null)

  // Replay cache access must be defined before effects that depend on it
  const replayState = useAppSelector((s) => s.replay)
  const cacheKeys = React.useMemo(
    () => Array.from(replayState.cache.keys()).join(','),
    [replayState.cache],
  )

  React.useEffect(() => {
    if (!gameId) return
    let active = true
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        await dispatch(fetchReplaySummary(gameId))
      } catch (_e) {
        if (!active) return
        setError('Failed to load replay summary')
      } finally {
        if (!active) setLoading(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [dispatch, gameId])

  // Preload initial chunk when summary ready
  React.useEffect(() => {
    if (!meta || !gameId) return
    const from = 1
    const to = Math.min(meta.turns, CHUNK_SIZE)
    if (gameId) dispatch(fetchReplayChunk({ gameId, fromTurn: from, toTurn: to }))
  }, [dispatch, meta, gameId])

  const goPrev = React.useCallback(() => {
    if (!meta) return
    const next = Math.max(1, currentTurn - 1)
    dispatch(setCurrentTurn(next))
    const needFrom = Math.floor((next - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
    const needTo = Math.min(meta.turns, needFrom + CHUNK_SIZE - 1)
    if (gameId) dispatch(fetchReplayChunk({ gameId, fromTurn: needFrom, toTurn: needTo }))
  }, [dispatch, meta, currentTurn, gameId])

  const goNext = React.useCallback(() => {
    if (!meta) return
    const next = Math.min(meta.turns, currentTurn + 1)
    dispatch(setCurrentTurn(next))
    const needFrom = Math.floor((next - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
    const needTo = Math.min(meta.turns, needFrom + CHUNK_SIZE - 1)
    if (gameId) dispatch(fetchReplayChunk({ gameId, fromTurn: needFrom, toTurn: needTo }))
  }, [dispatch, meta, currentTurn, gameId])

  // Keyboard shortcuts: ←/→, Shift+←/→ per round, Home/End, PgUp/PgDn by chunk
  React.useEffect(() => {
    if (!meta) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName || ''
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      const total = meta.turns
      const perRound = Math.max(1, meta.players.length)
      const chunk = CHUNK_SIZE
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const step = e.shiftKey ? perRound : 1
        const next = Math.max(1, currentTurn - step)
        dispatch(setCurrentTurn(next))
        const nf = Math.floor((next - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
        const nt = Math.min(total, nf + CHUNK_SIZE - 1)
        if (gameId) dispatch(fetchReplayChunk({ gameId, fromTurn: nf, toTurn: nt }))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const step = e.shiftKey ? perRound : 1
        const next = Math.min(total, currentTurn + step)
        dispatch(setCurrentTurn(next))
        const nf = Math.floor((next - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
        const nt = Math.min(total, nf + CHUNK_SIZE - 1)
        if (gameId) dispatch(fetchReplayChunk({ gameId, fromTurn: nf, toTurn: nt }))
      } else if (e.key === 'Home') {
        e.preventDefault()
        dispatch(setCurrentTurn(1))
        if (gameId)
          dispatch(fetchReplayChunk({ gameId, fromTurn: 1, toTurn: Math.min(total, CHUNK_SIZE) }))
      } else if (e.key === 'End') {
        e.preventDefault()
        dispatch(setCurrentTurn(total))
        const nf = Math.floor((total - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
        if (gameId) dispatch(fetchReplayChunk({ gameId, fromTurn: nf, toTurn: total }))
      } else if (e.key === 'PageUp') {
        e.preventDefault()
        const next = Math.max(1, currentTurn - chunk)
        dispatch(setCurrentTurn(next))
        const nf = Math.floor((next - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
        const nt = Math.min(total, nf + CHUNK_SIZE - 1)
        if (gameId) dispatch(fetchReplayChunk({ gameId, fromTurn: nf, toTurn: nt }))
      } else if (e.key === 'PageDown') {
        e.preventDefault()
        const next = Math.min(total, currentTurn + chunk)
        dispatch(setCurrentTurn(next))
        const nf = Math.floor((next - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
        const nt = Math.min(total, nf + CHUNK_SIZE - 1)
        if (gameId) dispatch(fetchReplayChunk({ gameId, fromTurn: nf, toTurn: nt }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, meta, currentTurn, gameId])

  // Prefetch neighbor chunks (LRU capped in slice)
  React.useEffect(() => {
    if (!meta || !gameId) return
    const total = meta.turns
    const idx = Math.floor((currentTurn - 1) / CHUNK_SIZE)
    const want: Array<[number, number]> = []
    const curFrom = idx * CHUNK_SIZE + 1
    const curTo = Math.min(total, curFrom + CHUNK_SIZE - 1)
    want.push([curFrom, curTo])
    const prevFrom = (idx - 1) * CHUNK_SIZE + 1
    if (idx - 1 >= 0) want.push([prevFrom, Math.min(total, prevFrom + CHUNK_SIZE - 1)])
    const nextFrom = (idx + 1) * CHUNK_SIZE + 1
    if (nextFrom <= total) want.push([nextFrom, Math.min(total, nextFrom + CHUNK_SIZE - 1)])
    const have = new Set(cacheKeys ? cacheKeys.split(',').filter(Boolean) : [])
    for (const [from, to] of want) {
      const key = `${from}-${to}`
      if (!have.has(key)) dispatch(fetchReplayChunk({ gameId, fromTurn: from, toTurn: to }))
    }
  }, [dispatch, meta, gameId, currentTurn, cacheKeys])

  // Load map geometry to position tokens for replay
  const [mapTerritories, setMapTerritories] = React.useState<MapTerritory[] | null>(null)
  React.useEffect(() => {
    let active = true
    const run = async () => {
      try {
        if (!meta?.options?.mapId) return
        const data = await mapService.getMap(String(meta.options.mapId))
        if (!active) return
        setMapTerritories(Array.isArray(data.territories) ? data.territories : [])
      } catch {
        // best-effort
      }
    }
    run()
    return () => {
      active = false
    }
  }, [meta?.options?.mapId])
  // meta.players won't have owner territory counts; they are used for colors only
  const playerColors = React.useMemo(() => {
    const players = meta?.players ?? []
    return Object.fromEntries(players.map((p) => [p.id, getColorValue(p.color ?? '#94A3B8')]))
  }, [meta])

  // Controls
  const onTurnSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!gameId) return
    const total = meta?.turns ?? 1
    const n = Math.max(1, Math.min(total, Math.round(Number(e.target.value))))
    dispatch(setCurrentTurn(n))
    const needFrom = Math.floor((n - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
    const needTo = Math.min(total, needFrom + CHUNK_SIZE - 1)
    dispatch(fetchReplayChunk({ gameId, fromTurn: needFrom, toTurn: needTo }))
  }

  // Pull the current turn's pre/post state from replay cache to show tokens
  const currentItem = React.useMemo(() => {
    for (const [, items] of replayState.cache) {
      const found = items.find((it) => it.turnNumber === currentTurn)
      if (found) return found
    }
    return null
  }, [replayState.cache, currentTurn])

  const territories: Array<{
    id: string
    name: string
    x: number
    y: number
    armies?: number
    owner?: string
  }> = React.useMemo(() => {
    if (!mapTerritories) return []
    const post = (currentItem?.postArmyMap ?? {}) as Record<
      string,
      { ownerId?: string | null; armies?: number }
    >
    const pre = (currentItem?.preArmyMap ?? {}) as Record<
      string,
      { ownerId?: string | null; armies?: number }
    >
    return mapTerritories.map((t) => {
      const snapshot = post[t.territoryId] ?? pre[t.territoryId]
      const armies = snapshot ? Number(snapshot.armies || 0) : 0
      const owner = (snapshot?.ownerId ?? undefined) as string | undefined
      return {
        id: t.territoryId,
        name: t.name,
        x: t.armyPosition.x,
        y: t.armyPosition.y,
        armies,
        ...(owner ? { owner } : {}),
      }
    })
  }, [mapTerritories, currentItem?.postArmyMap, currentItem?.preArmyMap])

  const turnRangeId = React.useId()

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3">
      <div className="panel flex items-center gap-3 p-3">
        <button type="button" className="btn" disabled={currentTurn <= 1} onClick={goPrev}>
          ⟨ Prev
        </button>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted" htmlFor={turnRangeId}>
            Turn
          </label>
          <input
            id={turnRangeId}
            type="range"
            min={1}
            max={Math.max(1, meta?.turns ?? 1)}
            value={currentTurn}
            onChange={onTurnSlider}
            className="w-64"
          />
          <span className="text-sm text-muted">
            {currentTurn} / {meta?.turns ?? 1}
          </span>
        </div>
        <button
          type="button"
          className="btn"
          disabled={!meta || currentTurn >= meta.turns}
          onClick={goNext}
        >
          Next ⟩
        </button>
        <div className="ml-auto text-sm text-muted">
          Mode: {meta?.mode ?? 'unknown'} • Fog: {meta?.hasFog ? 'on' : 'off'}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-w-0 flex-1 rounded-lg border border-border/60 bg-surface-2 p-2">
          <UnifiedMapDisplay
            mapId={String(meta?.options?.mapId ?? 'default')}
            territories={territories}
            playerColors={playerColors}
            selectedTerritoryId={null}
            selectedTargetTerritoryId={null}
            pendingAction={null}
            validTargets={[]}
            adjacency={{}}
            previewMode={true}
            {...(diff
              ? {
                  diffOverlayData: {
                    ownershipFlips: diff.ownershipFlips,
                    armyChanges: diff.armyChanges,
                    paths: diff.paths,
                  },
                }
              : {})}
          />
        </div>

        <div className="w-80 shrink-0 rounded-lg border border-border/60 bg-surface-2 p-3">
          <div className="text-sm font-semibold text-heading">Phase Breakdown</div>
          {diff ? (
            <div className="mt-2 space-y-2 text-sm">
              <div className="text-muted">Phases: reinforce / attack / fortify</div>
              <div className="text-muted">Ownership flips: {diff.ownershipFlips.length}</div>
              <div className="text-muted">Army changes: {diff.armyChanges.length}</div>
            </div>
          ) : (
            <div className="text-muted">Loading diff…</div>
          )}
          <div className="mt-4">
            <button type="button" className="btn" onClick={() => navigate(`/room/${gameId}`)}>
              Back to Match
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReplayPage
