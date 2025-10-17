import type { GameState } from '@/types/game'
import { getSectorBonusArmies, resolveSectorDefinitions } from './sectorBonuses'

type BonusConfigInput = Parameters<typeof resolveSectorDefinitions>[0]

const pickConfiguredBonuses = (game: GameState): BonusConfigInput => {
  return game.gameConfig?.sectorBonuses ?? []
}

export const computeBoardReinforcements = (game: GameState, playerId: string): number => {
  const territoryCount = game.board.filter((territory) => territory.ownerId === playerId).length
  const baseArmies = Math.max(3, Math.floor(territoryCount / 3))

  const configuredBonuses = pickConfiguredBonuses(game)
  const sectorDefinitions = resolveSectorDefinitions(configuredBonuses)
  const bonusArmies = getSectorBonusArmies(playerId, game.board, sectorDefinitions)

  return baseArmies + bonusArmies
}
