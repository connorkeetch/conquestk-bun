// Odds facade with engines: 'ts', 'wasm', 'shadow'.
// Default engine is 'ts'. In Node, respects process.env.ODDS_ENGINE unless setEngine is called.

import { computeConquestProbability } from '../utils/battleOdds.js'
import type {
  BattleResult as WBattleResult,
  MonteCarloResult as WMonteCarloResult,
  StepResult as WStepResult,
} from '../wasm-odds/types.js'
import type { BattleResult as TSBattleResult, StepResult as TSStepResult } from './tsEngine.js'
import * as tsEngine from './tsEngine.js'

// Avoid eagerly importing the WASM engine. Dynamic import prevents crashes
// when '@conquestk/wasm-odds' is not present on environments that use the TS engine.
async function getWasmEngine() {
  const mod = await import('./wasmEngine.js')
  return mod
}

export type Engine = 'ts' | 'wasm' | 'shadow'

let engine: Engine = (typeof process !== 'undefined' && (process as any)?.env?.ODDS_ENGINE) || 'ts'
let logger: ((entry: unknown) => void) | null = null

export function setEngine(e: Engine) {
  engine = e
}
export function getEngine(): Engine {
  return engine
}
export function setLogger(fn: (entry: unknown) => void) {
  logger = fn
}

export type StepResult = TSStepResult
export type BattleResult = TSBattleResult

export async function simulateStep(params: {
  seedHi: number
  seedLo: number
  attDice: number
  defDice: number
}): Promise<StepResult> {
  const { seedHi, seedLo, attDice, defDice } = params
  if (engine === 'ts') return tsEngine.simulateStep(seedHi, seedLo, attDice, defDice)
  if (engine === 'wasm') {
    try {
      const wasmEngine = await getWasmEngine()
      return wasmEngine.simulateStep(seedHi, seedLo, attDice, defDice)
    } catch (e) {
      if (typeof console !== 'undefined')
        console.warn('[odds] WASM engine unavailable; falling back to TS', (e as Error)?.message)
      return tsEngine.simulateStep(seedHi, seedLo, attDice, defDice)
    }
  }
  // shadow
  let wsr: WStepResult | undefined
  const tsr = await Promise.resolve(tsEngine.simulateStep(seedHi, seedLo, attDice, defDice))
  try {
    wsr = await (await getWasmEngine()).simulateStep(seedHi, seedLo, attDice, defDice)
  } catch (e) {
    if (typeof console !== 'undefined')
      console.warn(
        '[odds] WASM engine unavailable in shadow mode; using TS only',
        (e as Error)?.message,
      )
    return tsr
  }
  if (
    wsr &&
    (tsr.attacker_losses !== wsr.attacker_losses || tsr.defender_losses !== wsr.defender_losses)
  ) {
    logger?.({
      tag: 'odds-divergence',
      kind: 'step',
      seed: { seedHi, seedLo },
      params: { attDice, defDice },
      ts: tsr,
      wasm: wsr,
    })
  }
  return tsr
}

export async function simulateBattle(params: {
  seedHi: number
  seedLo: number
  attArmies: number
  defArmies: number
  policy?: { attacker?: 'greedy' | 'conservative'; defender?: 'max' | 'conservative' }
}): Promise<BattleResult> {
  const { seedHi, seedLo, attArmies, defArmies, policy } = params
  if (engine === 'ts') return tsEngine.simulateBattle(seedHi, seedLo, attArmies, defArmies, policy)
  if (engine === 'wasm') {
    try {
      const wasmEngine = await getWasmEngine()
      return wasmEngine.simulateBattle(seedHi, seedLo, attArmies, defArmies, policy)
    } catch (e) {
      if (typeof console !== 'undefined')
        console.warn('[odds] WASM engine unavailable; falling back to TS', (e as Error)?.message)
      return tsEngine.simulateBattle(seedHi, seedLo, attArmies, defArmies, policy)
    }
  }
  const tsr = await Promise.resolve(
    tsEngine.simulateBattle(seedHi, seedLo, attArmies, defArmies, policy),
  )
  let wsr: WBattleResult | undefined
  try {
    wsr = await (await getWasmEngine()).simulateBattle(seedHi, seedLo, attArmies, defArmies, policy)
  } catch (e) {
    if (typeof console !== 'undefined')
      console.warn(
        '[odds] WASM engine unavailable in shadow mode; using TS only',
        (e as Error)?.message,
      )
    return tsr
  }
  if (wsr) {
    if (
      tsr.attacker_won !== wsr.attacker_won ||
      tsr.attacker_remaining !== wsr.attacker_remaining ||
      tsr.defender_remaining !== wsr.defender_remaining
    ) {
      logger?.({
        tag: 'odds-divergence',
        kind: 'battle',
        seed: { seedHi, seedLo },
        params: { attArmies, defArmies, policy },
        ts: tsr,
        wasm: wsr,
      })
    }
  }
  return tsr
}

export async function monteCarlo(params: {
  attArmies: number
  defArmies: number
  trials: number
  seedHi: number
  seedLo: number
}): Promise<WMonteCarloResult> {
  const { attArmies, defArmies, trials, seedHi, seedLo } = params
  if (engine === 'ts')
    return tsEngine.monteCarlo(
      attArmies,
      defArmies,
      trials,
      seedHi,
      seedLo,
    ) as unknown as WMonteCarloResult
  if (engine === 'wasm') {
    try {
      const wasmEngine = await getWasmEngine()
      return wasmEngine.monteCarlo(attArmies, defArmies, trials, seedHi, seedLo)
    } catch (e) {
      if (typeof console !== 'undefined')
        console.warn('[odds] WASM engine unavailable; falling back to TS', (e as Error)?.message)
      return tsEngine.monteCarlo(
        attArmies,
        defArmies,
        trials,
        seedHi,
        seedLo,
      ) as unknown as WMonteCarloResult
    }
  }
  const tsr = await Promise.resolve(
    tsEngine.monteCarlo(attArmies, defArmies, trials, seedHi, seedLo),
  )
  let wsr: WMonteCarloResult | undefined
  try {
    wsr = await (await getWasmEngine()).monteCarlo(attArmies, defArmies, trials, seedHi, seedLo)
  } catch (e) {
    if (typeof console !== 'undefined')
      console.warn(
        '[odds] WASM engine unavailable in shadow mode; using TS only',
        (e as Error)?.message,
      )
    return tsr as unknown as WMonteCarloResult
  }
  // Compare wins/losses; allow small epsilon on probabilities but sequence should match exactly here
  if (wsr && Math.abs((tsr as any).wins - (wsr as any).wins) !== 0) {
    logger?.({
      tag: 'odds-divergence',
      kind: 'mc',
      seed: { seedHi, seedLo },
      params: { attArmies, defArmies, trials },
      ts: tsr,
      wasm: wsr,
    })
  }
  return tsr as unknown as WMonteCarloResult
}

// Exact/DP odds from existing TS implementation, exposed for callers
export { computeConquestOdds, computeConquestProbability } from '../utils/battleOdds.js'

export async function exactOddsMatrix(maxAtt: number, maxDef: number): Promise<number[][]> {
  try {
    return await (await getWasmEngine()).exactOddsMatrix(maxAtt, maxDef)
  } catch {
    // Fallback to TS DP for each cell
    const out: number[][] = Array.from({ length: maxAtt + 1 }, () => Array(maxDef + 1).fill(0))
    for (let a = 0; a <= maxAtt; a++) {
      for (let d = 0; d <= maxDef; d++) {
        out[a]![d] = computeConquestProbability(a, d)
      }
    }
    return out
  }
}

// AI evaluation (WASM when available, fallback to simple TS heuristic for attacks)
export interface EvalTerritory {
  id: string
  ownerId?: string | null
  armies: number
}
export type EvalCandidate =
  | { kind: 'attack'; from: string; to: string }
  | { kind: 'deploy'; territory: string; armies?: number }
  | { kind: 'fortify'; from: string; to: string; armies?: number }

export async function evaluateCandidates(
  state: { territories: EvalTerritory[]; currentPlayerId: string },
  candidates: EvalCandidate[],
  opts?: { difficulty?: 'recruit' | 'commander' | 'grandmaster' },
): Promise<number[]> {
  try {
    const wasm = await getWasmEngine()
    return wasm.ai_evaluate(state, candidates, opts) as unknown as number[]
  } catch {
    // TS fallback: score attacks by exact DP odds; others score 0
    const territoryById = new Map(state.territories.map((t) => [t.id, t]))
    const scores: number[] = []
    for (const c of candidates) {
      if (c.kind === 'attack') {
        const from = territoryById.get(c.from)
        const to = territoryById.get(c.to)
        if (
          from &&
          to &&
          from.ownerId === state.currentPlayerId &&
          to.ownerId !== state.currentPlayerId
        ) {
          const att = Math.max(0, (from.armies | 0) - 1)
          const def = Math.max(0, to.armies | 0)
          scores.push(computeConquestProbability(att, def))
        } else scores.push(0)
      } else {
        scores.push(0)
      }
    }
    return scores
  }
}
