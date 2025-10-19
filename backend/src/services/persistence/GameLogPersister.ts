import { logger } from '../../utils/logger.js'
import type { DbMove } from '../logEmitter.js'

/**
 * Responsible for persisting game logs and battle moves
 * Extracted from GameActionProcessor for better separation of concerns
 */
export class GameLogPersister {
  /**
   * Persist battle moves to the database
   * Logs warnings on failure but does not throw (best-effort persistence)
   */
  async persistBattleMoves(gameId: string, moves: DbMove[]): Promise<void> {
    try {
      const { persistMoves } = await import('../logEmitter.js')
      await persistMoves(gameId, moves)
      logger.debug('Successfully persisted battle moves', {
        gameId,
        moveCount: moves.length,
      })
    } catch (error) {
      // Log as WARNING instead of silently swallowing
      logger.warn('Failed to persist battle moves - game log may be incomplete', {
        gameId,
        moveCount: moves.length,
        moveTypes: moves.map((m) => m.move_type),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      // Note: We don't throw here because log persistence is non-critical
      // The game can continue even if logs fail to persist
    }
  }

  /**
   * Persist a single move to the database
   * Convenience method for single-move operations
   */
  async persistMove(gameId: string, move: DbMove): Promise<void> {
    await this.persistBattleMoves(gameId, [move])
  }
}
