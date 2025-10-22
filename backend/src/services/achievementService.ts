/**
 * @fileoverview This file defines the AchievementService class, which is responsible for handling
 * the logic of unlocking achievements for players based on game outcomes.
 * @module services/achievementService
 */
import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'
import { profileService } from './profileService.js'

/**
 * A minimal representation of a player's ranking in a completed game.
 * @typedef {object} MinimalRanking
 * @property {string} userId - The ID of the user.
 * @property {boolean} isWinner - Whether the user was a winner of the game.
 * @property {boolean} eliminated - Whether the user was eliminated.
 */
type MinimalRanking = {
  userId: string
  isWinner: boolean
  eliminated: boolean
}

/**
 * A service class for managing achievements.
 * @class AchievementService
 */
class AchievementService {
  private nameToId: Map<string, string> = new Map()

  /**
   * Retrieves the ID of an achievement by its name, using a cache to avoid repeated database lookups.
   * @private
   * @param {string} name - The name of the achievement.
   * @returns {Promise<string | null>} A promise that resolves to the achievement ID, or null if not found or an error occurs.
   */
  private async getAchievementIdByName(name: string): Promise<string | null> {
    if (this.nameToId.has(name)) return this.nameToId.get(name) ?? null
    try {
      const res = await query<{ id: string }>('SELECT id FROM achievements WHERE name = $1', [name])
      const id = res.rows?.[0]?.id ?? null
      if (id) this.nameToId.set(name, id)
      return id
    } catch (e) {
      logger.warn('Failed to resolve achievement id by name', { name, error: e })
      return null
    }
  }

  /**
   * Unlocks an achievement for a user by the achievement's name.
   * @private
   * @param {string} userId - The ID of the user.
   * @param {string} name - The name of the achievement to unlock.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  private async unlockByName(userId: string, name: string): Promise<void> {
    const id = await this.getAchievementIdByName(name)
    if (!id) return
    try {
      await profileService.unlockAchievement(userId, id)
    } catch (e) {
      // Likely already unlocked or FK issues; swallow but log at debug level
      logger.debug('Unlock achievement skipped', { userId, name, error: e })
    }
  }

  /**
   * Handles the logic for awarding achievements at the completion of a game.
   * @param {string} gameId - The ID of the completed game.
   * @param {MinimalRanking[]} rankings - An array of player rankings for the game.
   * @returns {Promise<void>} A promise that resolves when all achievement checks are complete.
   */
  async handleGameCompleted(gameId: string, rankings: MinimalRanking[]): Promise<void> {
    if (!rankings || rankings.length === 0) return

    try {
      // Fetch game mode
      const roomRes = await query<{ game_mode: string | null }>(
        'SELECT game_mode FROM game_rooms WHERE id = $1',
        [gameId],
      )
      const gameMode = (roomRes.rows?.[0]?.game_mode || 'normal').toLowerCase()

      const winners = rankings.filter((r) => r.isWinner)
      if (winners.length === 0) return

      // Determine full domination (all non-winners eliminated)
      const others = rankings.filter((r) => !r.isWinner)
      const allOthersEliminated = others.length > 0 && others.every((r) => r.eliminated)

      for (const w of winners) {
        // World Eater: first win ever
        try {
          const winsRes = await query<{ count: string }>(
            'SELECT COUNT(*)::int AS count FROM player_game_results WHERE user_id = $1 AND is_winner = TRUE',
            [w.userId],
          )
          const winCount = Number(winsRes.rows?.[0]?.count ?? 0)
          if (winCount === 1) {
            await this.unlockByName(w.userId, 'World Eater')
          }
        } catch (e) {
          logger.warn('Failed checking first win count', { userId: w.userId, error: e })
        }

        // Crown Jewel: win capitals game (MVP approximation)
        if (gameMode === 'capitals' || gameMode === 'capital') {
          await this.unlockByName(w.userId, 'Crown Jewel')
        }

        // Classic Conqueror: win normal game by domination
        if (
          (gameMode === 'normal' ||
            gameMode === 'classic' ||
            gameMode === '' ||
            gameMode === 'standard') &&
          allOthersEliminated
        ) {
          await this.unlockByName(w.userId, 'Classic Conqueror')
        }
      }
    } catch (e) {
      logger.warn('Failed to evaluate achievements on game completion', { gameId, error: e })
    }
  }
}

export const achievementService = new AchievementService()
export default achievementService
