import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import {
  type ArmyMap,
  getReplayChunk,
  getReplaySummary,
  type ReplaySummary,
  type ReplayTurnItem,
} from '@/services/replayService'
import type { RootState } from './index'

export type ReplayState = {
  meta: ReplaySummary | null
  timelineIndex: { currentTurn: number; roundFilter?: number | null; playerFilter?: string | null }
  cache: Map<string, ReplayTurnItem[]>
  loading: boolean
  error?: string | null
}

const initialState: ReplayState = {
  meta: null,
  timelineIndex: { currentTurn: 1, roundFilter: null, playerFilter: null },
  cache: new Map(),
  loading: false,
  error: null,
}

export const fetchReplaySummary = createAsyncThunk(
  'replay/fetchSummary',
  async (gameId: string, { signal }) => {
    return await getReplaySummary(gameId, signal as AbortSignal | undefined)
  },
)

export const fetchReplayChunk = createAsyncThunk(
  'replay/fetchChunk',
  async (args: { gameId: string; fromTurn: number; toTurn: number }, { signal }) => {
    const { gameId, fromTurn, toTurn } = args
    const chunk = await getReplayChunk(gameId, fromTurn, toTurn, signal as AbortSignal | undefined)
    return { key: `${fromTurn}-${toTurn}`, items: chunk }
  },
)

const replaySlice = createSlice({
  name: 'replay',
  initialState,
  reducers: {
    setCurrentTurn(state, action: PayloadAction<number>) {
      const n = Math.max(1, Math.trunc(action.payload))
      state.timelineIndex.currentTurn = n
    },
    setRoundFilter(state, action: PayloadAction<number | null | undefined>) {
      state.timelineIndex.roundFilter = action.payload ?? null
    },
    setPlayerFilter(state, action: PayloadAction<string | null | undefined>) {
      state.timelineIndex.playerFilter = action.payload ?? null
    },
    clearCache(state) {
      state.cache.clear()
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReplaySummary.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchReplaySummary.fulfilled, (state, action) => {
        state.loading = false
        state.meta = action.payload
        if (state.meta && state.meta.turns > 0) {
          state.timelineIndex.currentTurn = Math.min(
            state.meta.turns,
            state.timelineIndex.currentTurn,
          )
        }
      })
      .addCase(fetchReplaySummary.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to load replay summary'
      })
      .addCase(fetchReplayChunk.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchReplayChunk.fulfilled, (state, action) => {
        state.loading = false
        state.cache.set(action.payload.key, action.payload.items)
      })
      .addCase(fetchReplayChunk.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to load replay chunk'
      })
  },
})

export const { setCurrentTurn, setRoundFilter, setPlayerFilter, clearCache } = replaySlice.actions

export default replaySlice.reducer

// Selectors
export const selectReplayMeta = (s: RootState) => s.replay.meta
export const selectCurrentTurn = (s: RootState) => s.replay.timelineIndex.currentTurn

function findTurnItemInCache(state: ReplayState, turn: number): ReplayTurnItem | null {
  for (const [, items] of state.cache) {
    for (const it of items) {
      if (it.turnNumber === turn) return it
    }
  }
  return null
}

export const selectPhaseBreakdown = (s: RootState) => {
  const cur = s.replay.timelineIndex.currentTurn
  const item = findTurnItemInCache(s.replay, cur)
  if (!item) return null
  return {
    phases: item.phases,
    stats: item.stats,
  }
}

export const selectMapDiff = (s: RootState) => {
  const cur = s.replay.timelineIndex.currentTurn
  const item = findTurnItemInCache(s.replay, cur)
  if (!item) return null
  const before = (item.preArmyMap ?? {}) as ArmyMap
  const after = (item.postArmyMap ?? {}) as ArmyMap
  const ownershipFlips: string[] = []
  const armyChanges: Array<{ territoryId: string; delta: number }> = []
  const ids = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const id of ids) {
    const b = before[id] ?? { ownerId: null, armies: 0 }
    const a = after[id] ?? { ownerId: null, armies: 0 }
    if ((b.ownerId || null) !== (a.ownerId || null)) ownershipFlips.push(id)
    const delta = (a.armies || 0) - (b.armies || 0)
    if (delta !== 0) armyChanges.push({ territoryId: id, delta })
  }
  // Paths: derive from deltas (FORTIFY_RESULT) and logs-derived attack deltas
  const paths: Array<{ from: string; to: string; kind: 'attack' | 'fortify' }> = []
  for (const d of item.deltas) {
    if ((d as { type?: string }).type === 'FORTIFY_RESULT') {
      const f = d as unknown as {
        fromTerritoryId: string
        toTerritoryId: string
      }
      paths.push({ from: f.fromTerritoryId, to: f.toTerritoryId, kind: 'fortify' })
    }
  }
  return { ownershipFlips, armyChanges, paths }
}
