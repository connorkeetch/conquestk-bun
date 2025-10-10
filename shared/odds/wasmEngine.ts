import type { BattleResult, StepResult, MonteCarloResult } from '@conquestk/wasm-odds/types'
import { loadWasm } from '@conquestk/wasm-odds'

type WasmApi = Awaited<ReturnType<typeof loadWasm>>
let apiPromise: Promise<WasmApi> | null = null

async function getApi(): Promise<WasmApi> {
  if (!apiPromise) apiPromise = loadWasm()
  return apiPromise
}

export async function simulateStep(seedHi: number, seedLo: number, attDice: number, defDice: number): Promise<StepResult> {
  const api = await getApi()
  return api.simulate_step(seedHi >>> 0, seedLo >>> 0, attDice >>> 0, defDice >>> 0) as unknown as StepResult
}

export async function simulateBattle(seedHi: number, seedLo: number, attArmies: number, defArmies: number, policy?: { attacker?: 'greedy' | 'conservative'; defender?: 'max' | 'conservative' }): Promise<BattleResult> {
  const api = await getApi()
  return api.simulate_battle(seedHi >>> 0, seedLo >>> 0, attArmies >>> 0, defArmies >>> 0, policy || { attacker: 'greedy', defender: 'max' }) as unknown as BattleResult
}

export async function monteCarlo(attArmies: number, defArmies: number, trials: number, seedHi: number, seedLo: number): Promise<MonteCarloResult> {
  const api = await getApi()
  return api.monte_carlo(attArmies >>> 0, defArmies >>> 0, trials >>> 0, seedHi >>> 0, seedLo >>> 0) as unknown as MonteCarloResult
}

export async function oddsMatrix(maxAtt: number, maxDef: number, trials: number, seedHi: number, seedLo: number) {
  const api = await getApi()
  return api.odds_matrix(maxAtt >>> 0, maxDef >>> 0, trials >>> 0, seedHi >>> 0, seedLo >>> 0) as unknown as number[][]
}
