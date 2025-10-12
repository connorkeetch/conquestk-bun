import type { GameState } from '../types/game.js'

// Centralized team utilities to keep a single source of truth
export function getPlayerTeam(gameState: GameState, playerId?: string | null): number | null {
  if (!playerId) return null
  const player = gameState.players.find((p) => p.id === playerId)
  if (!player) return null
  const { teamId } = player
  return typeof teamId === 'number' && Number.isFinite(teamId) && teamId > 0
    ? Math.trunc(teamId)
    : null
}

export function arePlayersTeammates(
  gameState: GameState,
  playerA: string,
  playerB?: string | null,
): boolean {
  if (!gameState.gameConfig?.allowTeamPlay) return false
  if (!playerB || playerB === 'neutral') return false

  const teamA = getPlayerTeam(gameState, playerA)
  const teamB = getPlayerTeam(gameState, playerB)
  if (!teamA || !teamB) return false
  return teamA === teamB
}
