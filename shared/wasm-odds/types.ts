// Types mirrored from wasm-bindgen output. These are runtime-validated by wasm-bindgen
// but we export stable TS shapes here for callers.

export interface StepResult {
  attacker_losses: number
  defender_losses: number
}

export interface BattleResult {
  attacker_won: boolean
  attacker_remaining: number
  defender_remaining: number
  steps: number
}

export interface MonteCarloResult {
  trials: number
  wins: number
  losses: number
  p_win: number
  p_loss: number
  att_remaining_hist: number[]
  def_remaining_hist: number[]
}

export type ExactOdds = number
