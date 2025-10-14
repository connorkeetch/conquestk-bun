import {
  computeConquestProbability,
  evaluateCandidates as wasmEvaluate,
} from '@conquestk/shared/odds'
import { isAiEvalWasmAvailable } from '../config/runtimeFlags.js'
import { logger } from '../utils/logger.js'

export type EvalEngine = 'ts' | 'wasm' | 'shadow'

export type EvalTerritory = { id: string; ownerId?: string | null; armies: number }
export type EvalCandidate =
  | { kind: 'attack'; from: string; to: string }
  | { kind: 'deploy'; territory: string; armies?: number }
  | { kind: 'fortify'; from: string; to: string; armies?: number }

export async function evaluateCandidatesAdapter(
  state: { territories: EvalTerritory[]; currentPlayerId: string },
  candidates: EvalCandidate[],
  opts?: { difficulty?: 'recruit' | 'commander' | 'grandmaster' },
): Promise<number[]> {
  const mode = (process.env.AI_EVAL_ENGINE || 'ts').toLowerCase() as EvalEngine
  const difficulty = (opts?.difficulty || 'commander').toLowerCase()
  const wasmAvailable = isAiEvalWasmAvailable()

  // Gate WASM to grandmaster only to minimize overhead on lighter AIs
  if (difficulty !== 'grandmaster') {
    return scoreCandidatesTs(state, candidates)
  }

  if (mode === 'wasm' && wasmAvailable) {
    try {
      return await wasmEvaluate(state, candidates, opts)
    } catch (e) {
      logger.warn('AI eval WASM unavailable; falling back to TS', { error: (e as Error)?.message })
      return scoreCandidatesTs(state, candidates)
    }
  }
  if (mode === 'wasm' && !wasmAvailable) {
    // Explicit gate: only use WASM for grandmaster when detected at startup
    return scoreCandidatesTs(state, candidates)
  }
  if (mode === 'shadow') {
    let wasmScores: number[] | null = null
    try {
      wasmScores = await wasmEvaluate(state, candidates, opts)
    } catch (e) {
      logger.warn('AI eval WASM unavailable in shadow mode', { error: (e as Error)?.message })
    }
    const tsScores = scoreCandidatesTs(state, candidates)
    if (wasmScores && wasmScores.length === tsScores.length) {
      let diffs = 0
      for (let i = 0; i < tsScores.length; i++) {
        if (Math.abs(tsScores[i] - wasmScores[i]) > 1e-9) diffs++
      }
      if (diffs > 0) {
        logger.info('ai-eval-divergence', { diffs, n: tsScores.length, mode, difficulty })
      }
    }
    return tsScores
  }
  // ts
  return scoreCandidatesTs(state, candidates)
}

function scoreCandidatesTs(
  state: { territories: EvalTerritory[]; currentPlayerId: string },
  candidates: EvalCandidate[],
): number[] {
  const byId = new Map(state.territories.map((t) => [t.id, t]))
  const out: number[] = []
  for (const c of candidates) {
    if (c.kind === 'attack') {
      const from = byId.get(c.from)
      const to = byId.get(c.to)
      if (
        from &&
        to &&
        from.ownerId === state.currentPlayerId &&
        to.ownerId !== state.currentPlayerId
      ) {
        const att = Math.max(0, (from.armies | 0) - 1)
        const def = Math.max(0, to.armies | 0)
        out.push(computeConquestProbability(att, def))
      } else out.push(0)
    } else out.push(0)
  }
  return out
}
