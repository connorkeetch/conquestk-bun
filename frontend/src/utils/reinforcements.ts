import type { GameState } from '@/types/game'
import { getContinentBonusArmies, resolveContinentDefinitions } from './continentBonuses'

type BonusConfigInput = Parameters<typeof resolveContinentDefinitions>[0]

const pickConfiguredBonuses = (game: GameState): BonusConfigInput => {
  return game.gameConfig?.sectorBonuses ?? []
}

export const computeBoardReinforcements = (game: GameState, playerId: string): number => {
  const territoryCount = game.board.filter((territory) => territory.ownerId === playerId).length
  const baseArmies = Math.max(3, Math.floor(territoryCount / 3))

  const configuredBonuses = pickConfiguredBonuses(game)
  const continentDefinitions = resolveContinentDefinitions(configuredBonuses)
  const bonusArmies = getContinentBonusArmies(playerId, game.board, continentDefinitions)

  return baseArmies + bonusArmies
}
