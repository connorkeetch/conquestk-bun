// Odds facade with engines: 'ts', 'wasm', 'shadow'.
// Default engine is 'ts'. In Node, respects process.env.ODDS_ENGINE unless setEngine is called.

import * as tsEngine from './tsEngine.js'
import type { BattleResult as TSBattleResult, StepResult as TSStepResult } from './tsEngine.js'
import type { BattleResult as WBattleResult, StepResult as WStepResult, MonteCarloResult as WMonteCarloResult } from '../wasm-odds/types.js'
import * as wasmEngine from './wasmEngine.js'

export type Engine = 'ts' | 'wasm' | 'shadow'

let engine: Engine = (typeof process !== 'undefined' && (process as any)?.env?.ODDS_ENGINE) || 'ts'
let logger: ((entry: unknown) => void) | null = null

export function setEngine(e: Engine) { engine = e }
export function getEngine(): Engine { return engine }
export function setLogger(fn: (entry: unknown) => void) { logger = fn }

export type StepResult = TSStepResult
export type BattleResult = TSBattleResult

export async function simulateStep(params: { seedHi: number; seedLo: number; attDice: number; defDice: number }): Promise<StepResult> {
  const { seedHi, seedLo, attDice, defDice } = params
  if (engine === 'ts') return tsEngine.simulateStep(seedHi, seedLo, attDice, defDice)
  if (engine === 'wasm') return wasmEngine.simulateStep(seedHi, seedLo, attDice, defDice)
  // shadow
  const [tsr, wsr] = await Promise.all([
    Promise.resolve(tsEngine.simulateStep(seedHi, seedLo, attDice, defDice)),
    wasmEngine.simulateStep(seedHi, seedLo, attDice, defDice),
  ])
  if (tsr.attacker_losses !== wsr.attacker_losses || tsr.defender_losses !== wsr.defender_losses) {
    logger?.({ tag: 'odds-divergence', kind: 'step', seed: { seedHi, seedLo }, params: { attDice, defDice }, ts: tsr, wasm: wsr })
  }
  return tsr
}

export async function simulateBattle(params: { seedHi: number; seedLo: number; attArmies: number; defArmies: number; policy?: { attacker?: 'greedy' | 'conservative'; defender?: 'max' | 'conservative' } }): Promise<BattleResult> {
  const { seedHi, seedLo, attArmies, defArmies, policy } = params
  if (engine === 'ts') return tsEngine.simulateBattle(seedHi, seedLo, attArmies, defArmies, policy)
  if (engine === 'wasm') return wasmEngine.simulateBattle(seedHi, seedLo, attArmies, defArmies, policy)
  const [tsr, wsr] = await Promise.all([
    Promise.resolve(tsEngine.simulateBattle(seedHi, seedLo, attArmies, defArmies, policy)),
    wasmEngine.simulateBattle(seedHi, seedLo, attArmies, defArmies, policy),
  ])
  if (
    tsr.attacker_won !== wsr.attacker_won ||
    tsr.attacker_remaining !== wsr.attacker_remaining ||
    tsr.defender_remaining !== wsr.defender_remaining
  ) {
    logger?.({ tag: 'odds-divergence', kind: 'battle', seed: { seedHi, seedLo }, params: { attArmies, defArmies, policy }, ts: tsr, wasm: wsr })
  }
  return tsr
}

export async function monteCarlo(params: { attArmies: number; defArmies: number; trials: number; seedHi: number; seedLo: number }): Promise<WMonteCarloResult> {
  const { attArmies, defArmies, trials, seedHi, seedLo } = params
  if (engine === 'ts') return tsEngine.monteCarlo(attArmies, defArmies, trials, seedHi, seedLo) as unknown as WMonteCarloResult
  if (engine === 'wasm') return wasmEngine.monteCarlo(attArmies, defArmies, trials, seedHi, seedLo)
  const [tsr, wsr] = await Promise.all([
    Promise.resolve(tsEngine.monteCarlo(attArmies, defArmies, trials, seedHi, seedLo)),
    wasmEngine.monteCarlo(attArmies, defArmies, trials, seedHi, seedLo),
  ])
  // Compare wins/losses; allow small epsilon on probabilities but sequence should match exactly here
  if (Math.abs((tsr as any).wins - (wsr as any).wins) !== 0) {
    logger?.({ tag: 'odds-divergence', kind: 'mc', seed: { seedHi, seedLo }, params: { attArmies, defArmies, trials }, ts: tsr, wasm: wsr })
  }
  return tsr as unknown as WMonteCarloResult
}

// Exact/DP odds from existing TS implementation, exposed for callers
export { computeConquestOdds, computeConquestProbability } from '../utils/battleOdds.js'

