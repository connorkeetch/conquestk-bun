import type { GamePhase, GamePlayer, GameState } from '../types/game.js'
import { getPlayerTeam as utilGetPlayerTeam } from '../utils/gameTeams.js'

type DistinctSide = string

function sideKey(state: GameState, player: GamePlayer): DistinctSide {
  const teamId = utilGetPlayerTeam(state, player.id)
  return teamId ? `team:${teamId}` : `player:${player.id}`
}

function distinctSidesOfActivePlayers(state: GameState): Set<DistinctSide> {
  const sides = new Set<DistinctSide>()
  for (const p of state.players) {
    if (!p.isEliminated) sides.add(sideKey(state, p))
  }
  return sides
}

function isAllowedPhase(phase: unknown): phase is GamePhase {
  return (
    phase === 'reinforcement' || phase === 'attack' || phase === 'fortify' || phase === 'finished'
  )
}

/**
 * Asserts that the game state satisfies all invariants. Throws an error if
 * any invariant is violated.
 *
 * @param {GameState} state - The game state to check.
 */
export function assertInvariants(state: GameState): void {
  if (!isAllowedPhase(state.phase)) {
    throw new Error(`Illegal game phase: ${String(state.phase)}`)
  }

  // Current player must exist when not finished
  if (state.phase !== 'finished') {
    const holder = state.players.find((p) => p.id === state.currentPlayer)
    if (!holder) throw new Error('Current player not found in players list')
    if (holder.isEliminated) throw new Error('Turn holder is eliminated')
  }

  const activeSides = distinctSidesOfActivePlayers(state)

  if (state.phase === 'finished') {
    if (activeSides.size === 0) {
      // Aborted/edge case: allow zero active only if no players exist
      if (state.players.length > 0) {
        throw new Error('Finished game without any active players')
      }
    } else if (activeSides.size > 1) {
      // In team modes, all remaining active players must belong to the same side
      throw new Error('Finished game but multiple sides remain active')
    }
  } else if (activeSides.size <= 1) {
    // Not finished yet: must have contention
    throw new Error('Game not finished but only one side remains active')
  }
}

/**
 * Checks if the game state is terminal (i.e., if there is a winner). If the
 * game is terminal, it updates the game state to reflect the winner and returns
 * `true`.
 *
 * @param {GameState} state - The game state to check.
 * @returns {boolean} `true` if the game is terminal, otherwise `false`.
 */
export function finalizeIfTerminal(state: GameState): boolean {
  const active = state.players.filter((p) => !p.isEliminated)
  if (active.length === 0) {
    // No one left – mark finished as degenerate terminal; keep current player unchanged
    state.phase = 'finished'
    return true
  }

  const sides = distinctSidesOfActivePlayers(state)
  if (sides.size === 1) {
    // One side remains. End game and set currentPlayer to a representative winner
    state.phase = 'finished'
    const rep = active[0]
    if (rep) state.currentPlayer = rep.id
    return true
  }
  return false
}
