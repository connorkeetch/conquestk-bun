// Thin loader that initializes the wasm-pack bundle in Node or browser.
// No global fetch reliance: caller can pass a module URL or bytes.

import type {
  BattleResult as TBattleResult,
  MonteCarloResult as TMonteCarloResult,
  StepResult as TStepResult,
} from './types.js'
export type {
  TStepResult as StepResult,
  TBattleResult as BattleResult,
  TMonteCarloResult as MonteCarloResult,
}

export interface WasmApi {
  version(): string
  simulate_step(seed_hi: number, seed_lo: number, att_dice: number, def_dice: number): TStepResult
  simulate_battle(
    seed_hi: number,
    seed_lo: number,
    att_armies: number,
    def_armies: number,
    policy: unknown,
  ): TBattleResult
  monte_carlo(
    att_armies: number,
    def_armies: number,
    trials: number,
    seed_hi: number,
    seed_lo: number,
  ): TMonteCarloResult
  odds_matrix(
    max_att: number,
    max_def: number,
    trials: number,
    seed_hi: number,
    seed_lo: number,
  ): unknown
  exact_odds(att_armies: number, def_armies: number): number
  exact_odds_matrix(max_att: number, max_def: number): number[][]
  ai_evaluate(state: unknown, candidates: unknown, opts?: { difficulty?: string }): number[]
}

export async function loadWasm(_moduleUrlOrBytes?: string | ArrayBuffer): Promise<WasmApi> {
  // Runtime-friendly loader: choose Node-target or bundler-target module.
  const isNode = typeof process !== 'undefined' && !!(process as any).versions?.node
  const tryImport = async (urls: string[]) => {
    for (const u of urls) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await import(u)
      } catch {}
    }
    throw new Error(`Failed to load wasm module from: ${urls.join(', ')}`)
  }

  if (isNode) {
    const urls = [
      new URL('../pkg-node/wasm_odds.js', import.meta.url).toString(),
      new URL('./pkg-node/wasm_odds.js', import.meta.url).toString(),
    ]
    const mod = await tryImport(urls)
    return mod as unknown as WasmApi
  }
  const urls = [
    new URL('../pkg/wasm_odds.js', import.meta.url).toString(),
    new URL('./pkg/wasm_odds.js', import.meta.url).toString(),
  ]
  const mod = await tryImport(urls)
  return mod as unknown as WasmApi
}
