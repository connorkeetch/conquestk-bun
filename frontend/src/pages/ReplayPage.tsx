import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import UnifiedMapDisplay from '@/components/UnifiedMapDisplay'
import { getColorValue } from '@/constants/colors'
import { useAppSelector } from '@/hooks/redux'
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
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { gameId } = useParams<{ gameId: string }>()
  const meta = useSelector(selectReplayMeta)
  const currentTurn = useSelector(selectCurrentTurn)
  const diff = useSelector(selectMapDiff)

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!gameId) return
    let active = true
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        await dispatch(fetchReplaySummary(gameId) as any)
      } catch (e) {
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
    dispatch(fetchReplayChunk({ gameId, fromTurn: from, toTurn: to }) as any)
  }, [dispatch, meta, gameId])

  const goPrev = React.useCallback(() => {
    if (!meta) return
    const next = Math.max(1, currentTurn - 1)
    dispatch(setCurrentTurn(next))
    const needFrom = Math.floor((next - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
    const needTo = Math.min(meta.turns, needFrom + CHUNK_SIZE - 1)
    dispatch(fetchReplayChunk({ gameId: gameId!, fromTurn: needFrom, toTurn: needTo }) as any)
  }, [dispatch, meta, currentTurn, gameId])

  const goNext = React.useCallback(() => {
    if (!meta) return
    const next = Math.min(meta.turns, currentTurn + 1)
    dispatch(setCurrentTurn(next))
    const needFrom = Math.floor((next - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
    const needTo = Math.min(meta.turns, needFrom + CHUNK_SIZE - 1)
    dispatch(fetchReplayChunk({ gameId: gameId!, fromTurn: needFrom, toTurn: needTo }) as any)
  }, [dispatch, meta, currentTurn, gameId])

  if (!gameId) {
    return (
      <div className="p-6">
        <div className="text-danger">Missing game id</div>
      </div>
    )
  }

  if (loading && !meta) {
    return (
      <div className="p-6">
        <div className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-danger">{error}</div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="p-6">
        <div className="text-muted">No replay metadata</div>
      </div>
    )
  }

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
  const playerColors = Object.fromEntries(
    meta.players.map((p) => [p.id, getColorValue((p.color as any) || '#94A3B8')]),
  )

  // Controls
  const onTurnSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Math.max(1, Math.min(meta.turns, Math.round(Number(e.target.value))))
    dispatch(setCurrentTurn(n))
    const needFrom = Math.floor((n - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1
    const needTo = Math.min(meta.turns, needFrom + CHUNK_SIZE - 1)
    dispatch(fetchReplayChunk({ gameId, fromTurn: needFrom, toTurn: needTo }) as any)
  }

  // Pull the current turn's pre/post state from replay cache to show tokens
  const replayState = useAppSelector((s) => s.replay)
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
    owner?: string | null
  }> = React.useMemo(() => {
    if (!mapTerritories) return []
    const post = currentItem?.postArmyMap ?? {}
    const pre = currentItem?.preArmyMap ?? {}
    return mapTerritories.map((t) => {
      const snapshot = (post as any)[t.territoryId] ?? (pre as any)[t.territoryId] ?? null
      const armies = snapshot ? Number(snapshot.armies || 0) : 0
      const owner = snapshot ? (snapshot.ownerId as string | null) : null
      return {
        id: t.territoryId,
        name: t.name,
        x: t.armyPosition.x,
        y: t.armyPosition.y,
        armies,
        owner,
      }
    })
  }, [mapTerritories, currentItem?.postArmyMap, currentItem?.preArmyMap])

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3">
      <div className="panel flex items-center gap-3 p-3">
        <button className="btn" disabled={currentTurn <= 1} onClick={goPrev}>
          ⟨ Prev
        </button>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Turn</label>
          <input
            type="range"
            min={1}
            max={Math.max(1, meta.turns)}
            value={currentTurn}
            onChange={onTurnSlider}
            className="w-64"
          />
          <span className="text-sm text-muted">
            {currentTurn} / {meta.turns}
          </span>
        </div>
        <button className="btn" disabled={currentTurn >= meta.turns} onClick={goNext}>
          Next ⟩
        </button>
        <div className="ml-auto text-sm text-muted">
          Mode: {meta.mode} • Fog: {meta.hasFog ? 'on' : 'off'}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-w-0 flex-1 rounded-lg border border-border/60 bg-surface-2 p-2">
          <UnifiedMapDisplay
            mapId={(meta.options.mapId as string) || 'default'}
            territories={territories}
            playerColors={playerColors}
            onTerritoryClick={() => {}}
            onTerritoryHover={() => {}}
            selectedTerritoryId={null}
            selectedTargetTerritoryId={null}
            pendingAction={null}
            validTargets={[]}
            adjacency={{}}
            previewMode={true}
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
            <button className="btn" onClick={() => navigate(`/room/${gameId}`)}>
              Back to Match
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReplayPage
