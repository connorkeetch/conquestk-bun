import type { GameState as SharedGameState } from '@conquestk/shared'
import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
// TODO: Refactor replay system to use event-based architecture instead of lockstep frames
// import { LockstepSimulationManager } from '@/services/lockstepSimulationManager'
import {
  type ArmyMap,
  getReplayChunk,
  getReplayFrameChunkWindow,
  getReplaySummary,
  type ReplayFrameRecord,
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
  lockstep: {
    baseline: SharedGameState | null
    frames: Map<number, ReplayFrameRecord>
    stateBySeq: Map<number, SharedGameState>
    finalSeq: number | null
    lastSeq: number
    totalFrames: number
    loading: boolean
    error?: string | null
  }
}

const initialState: ReplayState = {
  meta: null,
  timelineIndex: { currentTurn: 1, roundFilter: null, playerFilter: null },
  cache: new Map(),
  loading: false,
  error: null,
  lockstep: {
    baseline: null,
    frames: new Map(),
    stateBySeq: new Map(),
    finalSeq: null,
    lastSeq: 0,
    totalFrames: 0,
    loading: false,
    error: null,
  },
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

type LockstepFetchResult = {
  gameId: string
  frames: ReplayFrameRecord[]
  baseline: SharedGameState | null
  baselineSeq: number | null
  states: Array<{ seq: number; state: SharedGameState }>
  finalSeq: number
  totalFrames: number
  failure?: { reason: string; unsupported?: string[] }
}

export const ensureLockstepFrames = createAsyncThunk<
  LockstepFetchResult,
  { gameId: string; uptoSeq: number }
>('replay/ensureLockstepFrames', async ({ gameId, uptoSeq }, { getState, signal }) => {
  if (!gameId) {
    throw new Error('gameId is required')
  }

  const state = getState() as RootState
  const lockstepState = state.replay.lockstep
  const targetSeq = Math.max(1, Math.trunc(uptoSeq))
  const cappedTarget =
    lockstepState.finalSeq != null ? Math.min(targetSeq, lockstepState.finalSeq) : targetSeq

  if (lockstepState.lastSeq >= cappedTarget) {
    return {
      gameId,
      frames: [],
      baseline: null,
      baselineSeq: null,
      states: [],
      finalSeq: lockstepState.finalSeq ?? cappedTarget,
      totalFrames: lockstepState.totalFrames,
    }
  }

  const fromSeq = lockstepState.lastSeq + 1
  const span = Math.max(1, cappedTarget - lockstepState.lastSeq)
  const limit = Math.max(1, Math.min(200, span))
  const includeSnapshot = !lockstepState.baseline

  const chunk = await getReplayFrameChunkWindow(
    gameId,
    { fromSeq, limit, includeSnapshot },
    signal as AbortSignal | undefined,
  )

  // TODO: Refactor replay system to use event-based architecture
  // const simulator = new LockstepSimulationManager()
  const frames = Array.isArray(chunk.frames) ? chunk.frames : []
  const finalSeq = chunk.finalSeq ?? lockstepState.finalSeq ?? lockstepState.lastSeq
  const totalFrames = chunk.totalFrames ?? lockstepState.totalFrames

  let baseline: SharedGameState | null = null
  let baselineSeq: number | null = null
  const states: Array<{ seq: number; state: SharedGameState }> = []

  if (includeSnapshot && chunk.snapshot) {
    baseline = structuredClone(chunk.snapshot) as SharedGameState
    baselineSeq = fromSeq - 1
    // simulator.setBaseline(gameId, structuredClone(baseline))
    states.push({ seq: baselineSeq, state: structuredClone(baseline) })
  } else {
    const referenceSeq = fromSeq - 1
    const existingBaseline =
      lockstepState.stateBySeq.get(referenceSeq) ??
      (referenceSeq === lockstepState.lastSeq
        ? lockstepState.stateBySeq.get(lockstepState.lastSeq)
        : undefined) ??
      lockstepState.baseline ??
      null

    if (existingBaseline) {
      baseline = structuredClone(existingBaseline)
      baselineSeq = referenceSeq < 0 ? 0 : referenceSeq
      // TODO: Replace with event-based replay
      // simulator.setBaseline(gameId, structuredClone(existingBaseline))
      states.push({ seq: baselineSeq, state: structuredClone(baseline) })
    } else if (frames.length === 0) {
      return {
        gameId,
        frames,
        baseline: null,
        baselineSeq: null,
        states: [],
        finalSeq,
        totalFrames,
      }
    } else {
      return {
        gameId,
        frames,
        baseline: null,
        baselineSeq: null,
        states: [],
        finalSeq,
        totalFrames,
        failure: { reason: 'missing_baseline' },
      }
    }
  }

  let failure: LockstepFetchResult['failure']
  for (const _frame of frames) {
    // TODO: Replace with event-based replay
    // const result = simulator.applyFrame(gameId, {
    //   matchId: gameId,
    //   seq: frame.seq,
    //   playerId: frame.playerId,
    //   commands: frame.commands,
    //   committedAt: frame.committedAt,
    // })
    // if (!result.ok) {
    //   failure = { reason: result.reason, unsupported: result.unsupported }
    //   break
    // }
    // const stateAfter = simulator.getState(gameId)
    // if (stateAfter) {
    //   states.push({ seq: frame.seq, state: structuredClone(stateAfter) })
    // }
  }

  return {
    gameId,
    frames,
    baseline,
    baselineSeq,
    states,
    finalSeq,
    totalFrames,
    ...(failure ? { failure } : {}),
  }
})

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
        const key = action.payload.key
        if (!state.cache.has(key) && state.cache.size >= 5) {
          const firstKey = state.cache.keys().next().value as string | undefined
          if (firstKey) state.cache.delete(firstKey)
        }
        state.cache.set(key, action.payload.items)
      })
      .addCase(fetchReplayChunk.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to load replay chunk'
      })
      .addCase(ensureLockstepFrames.pending, (state) => {
        state.lockstep.loading = true
        state.lockstep.error = null
      })
      .addCase(ensureLockstepFrames.fulfilled, (state, action) => {
        state.lockstep.loading = false
        const { frames, baseline, baselineSeq, states, finalSeq, totalFrames, failure } =
          action.payload

        if (baseline && baselineSeq != null) {
          state.lockstep.baseline = baseline
          if (!state.lockstep.stateBySeq.has(baselineSeq)) {
            state.lockstep.stateBySeq.set(baselineSeq, baseline)
          }
        }

        for (const frame of frames) {
          state.lockstep.frames.set(frame.seq, frame)
        }

        let highestSeq = state.lockstep.lastSeq
        for (const entry of states) {
          state.lockstep.stateBySeq.set(entry.seq, entry.state)
          if (entry.seq > highestSeq) highestSeq = entry.seq
        }
        state.lockstep.lastSeq = highestSeq

        if (Number.isFinite(finalSeq)) {
          state.lockstep.finalSeq =
            state.lockstep.finalSeq != null ? Math.max(state.lockstep.finalSeq, finalSeq) : finalSeq
        }
        if (Number.isFinite(totalFrames)) {
          state.lockstep.totalFrames = totalFrames
        }

        if (failure?.reason) {
          state.lockstep.error = failure.reason
        } else if (frames.length > 0 || states.length > 0) {
          state.lockstep.error = null
        }

        const keepLimit = 400
        if (state.lockstep.stateBySeq.size > keepLimit) {
          const keys = Array.from(state.lockstep.stateBySeq.keys()).sort((a, b) => a - b)
          while (keys.length > keepLimit) {
            const key = keys.shift()
            if (key == null) break
            if (key === 0 || key >= state.lockstep.lastSeq - 1) continue
            state.lockstep.stateBySeq.delete(key)
          }
        }
      })
      .addCase(ensureLockstepFrames.rejected, (state, action) => {
        state.lockstep.loading = false
        state.lockstep.error = action.error.message || 'Failed to load lockstep frames'
      })
  },
})

export const { setCurrentTurn, setRoundFilter, setPlayerFilter, clearCache } = replaySlice.actions

export default replaySlice.reducer

// Selectors
export const selectReplayMeta = (s: RootState) => s.replay.meta
export const selectCurrentTurn = (s: RootState) => s.replay.timelineIndex.currentTurn
export const selectLockstepState = (s: RootState) => s.replay.lockstep

function findTurnItemInCache(state: ReplayState, turn: number): ReplayTurnItem | null {
  for (const [, items] of state.cache) {
    for (const it of items) {
      if (it.turnNumber === turn) return it
    }
  }
  return null
}

const extractArmyMapFromState = (state: SharedGameState | null): ArmyMap => {
  if (!state || !Array.isArray(state.board)) return {}
  const map: ArmyMap = {}
  for (const territory of state.board) {
    if (!territory) continue
    map[territory.id] = {
      ownerId: territory.ownerId ?? null,
      armies: territory.armies ?? 0,
    }
  }
  return map
}

const deriveMapDiff = (
  before: ArmyMap,
  after: ArmyMap,
  fallbackItem?: ReplayTurnItem | null,
): {
  ownershipFlips: string[]
  armyChanges: Array<{ territoryId: string; delta: number }>
  paths: Array<{ from: string; to: string; kind: 'attack' | 'fortify' }>
} => {
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

  let paths: Array<{ from: string; to: string; kind: 'attack' | 'fortify' }>
  if (fallbackItem) {
    const serverPaths = (
      fallbackItem as unknown as {
        paths?: Array<{ from: string; to: string; kind: 'attack' | 'fortify' }>
      }
    ).paths
    if (Array.isArray(serverPaths) && serverPaths.length > 0) {
      paths = serverPaths
    } else {
      paths = []
      for (const d of fallbackItem.deltas) {
        if ((d as { type?: string }).type === 'FORTIFY_RESULT') {
          const f = d as unknown as { fromTerritoryId: string; toTerritoryId: string }
          paths.push({ from: f.fromTerritoryId, to: f.toTerritoryId, kind: 'fortify' })
        }
      }
    }
  } else {
    paths = []
  }

  return { ownershipFlips, armyChanges, paths }
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
  const lockstep = s.replay.lockstep

  if (lockstep.stateBySeq.size > 0) {
    const afterState = lockstep.stateBySeq.get(cur) ?? null
    const beforeState =
      cur > 0 ? (lockstep.stateBySeq.get(cur - 1) ?? lockstep.baseline) : lockstep.baseline

    if (afterState && beforeState) {
      const beforeMap = extractArmyMapFromState(beforeState)
      const afterMap = extractArmyMapFromState(afterState)
      return deriveMapDiff(beforeMap, afterMap, null)
    }
  }

  const item = findTurnItemInCache(s.replay, cur)
  if (!item) return null
  const before = (item.preArmyMap ?? {}) as ArmyMap
  const after = (item.postArmyMap ?? {}) as ArmyMap
  return deriveMapDiff(before, after, item)
}
