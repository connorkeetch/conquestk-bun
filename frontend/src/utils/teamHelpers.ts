import type { GameState } from '../types/game'

const isValidTeamId = (teamId: number | null | undefined): teamId is number =>
  typeof teamId === 'number' && Number.isFinite(teamId) && teamId > 0

export const isTeamModeEnabled = (gameState?: GameState | null): boolean =>
  Boolean(gameState?.gameConfig?.allowTeamPlay)

export const getPlayerTeamId = (
  gameState: GameState,
  playerId?: string | null,
): number | null => {
  if (!playerId) {
    return null
  }

  const player = gameState.players.find((p) => p.id === playerId)
  if (!player) {
    return null
  }

  return isValidTeamId(player.teamId) ? player.teamId : null
}

export const arePlayersTeammates = (
  gameState: GameState,
  playerA?: string | null,
  playerB?: string | null,
): boolean => {
  if (!playerA || !playerB) {
    return false
  }

  if (playerA === playerB) {
    return true
  }

  if (playerA === 'neutral' || playerB === 'neutral') {
    return false
  }

  if (!isTeamModeEnabled(gameState)) {
    return false
  }

  const teamA = getPlayerTeamId(gameState, playerA)
  const teamB = getPlayerTeamId(gameState, playerB)

  return teamA !== null && teamA === teamB
}

export const isFriendlyTerritoryOwner = (
  gameState: GameState,
  ownerId?: string | null,
  currentPlayerId?: string | null,
): boolean => {
  if (!ownerId || !currentPlayerId) {
    return false
  }

  if (ownerId === currentPlayerId) {
    return true
  }

  return arePlayersTeammates(gameState, ownerId, currentPlayerId)
}
