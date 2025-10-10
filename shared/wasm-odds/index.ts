// Thin loader that initializes the wasm-pack bundle in Node or browser.
// No global fetch reliance: caller can pass a module URL or bytes.

import initWasm, * as wasm from '../pkg/wasm_odds.js'

export type { StepResult, BattleResult, MonteCarloResult } from './types.js'

export interface WasmApi {
  version(): string
  simulate_step(seed_hi: number, seed_lo: number, att_dice: number, def_dice: number): wasm.StepResult
  simulate_battle(
    seed_hi: number,
    seed_lo: number,
    att_armies: number,
    def_armies: number,
    policy: unknown,
  ): wasm.BattleResult
  monte_carlo(
    att_armies: number,
    def_armies: number,
    trials: number,
    seed_hi: number,
    seed_lo: number,
  ): wasm.MonteCarloResult
  odds_matrix(max_att: number, max_def: number, trials: number, seed_hi: number, seed_lo: number): unknown
  exact_odds(att_armies: number, def_armies: number): number
}

export async function loadWasm(moduleUrlOrBytes?: string | ArrayBuffer): Promise<WasmApi> {
  // If caller passes string, treat as URL; otherwise pass bytes/Response
  if (typeof moduleUrlOrBytes === 'string') {
    await initWasm(moduleUrlOrBytes)
  } else if (moduleUrlOrBytes instanceof ArrayBuffer) {
    await initWasm(moduleUrlOrBytes)
  } else {
    // Default resolution: resolve local pkg wasm by URL relative to this module
    const defaultUrl = new URL('../pkg/wasm_odds_bg.wasm', import.meta.url)
    await initWasm(defaultUrl)
  }

  return wasm as unknown as WasmApi
}
