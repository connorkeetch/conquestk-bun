/* tslint:disable */
/* eslint-disable */
export function version(): string
export function simulate_step(
  seed_hi: number,
  seed_lo: number,
  att_dice: number,
  def_dice: number,
): any
export function simulate_battle(
  seed_hi: number,
  seed_lo: number,
  att_armies: number,
  def_armies: number,
  policy: any,
): any
export function monte_carlo(
  att_armies: number,
  def_armies: number,
  trials: number,
  seed_hi: number,
  seed_lo: number,
): any
export function odds_matrix(
  max_att: number,
  max_def: number,
  trials: number,
  seed_hi: number,
  seed_lo: number,
): any
export function exact_odds(att_armies: number, def_armies: number): number
/**
 * Compute exact odds for many attacker/defender pairs in one call using typed arrays.
 * This drastically reduces JS<->WASM bridging overhead compared to per-candidate calls.
 */
export function bulk_exact_odds(att: Uint16Array, def: Uint16Array): Float64Array
export function init_eval_state(ids: any): number
export function free_eval_state(handle: number): void
export function ai_eval_attacks_with_handle(
  handle: number,
  owned_by_current: Uint8Array,
  armies: Uint16Array,
  pairs: Uint32Array,
): Float64Array
export function exact_odds_matrix(max_att: number, max_def: number): any
export function ai_evaluate(state: any, candidates: any, opts: any): any
