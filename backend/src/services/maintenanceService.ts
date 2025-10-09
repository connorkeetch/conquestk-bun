import { query } from '../config/database'
import { logger } from '../utils/logger'

export type PruneNotificationsOptions = {
  retentionDays: number
  includeUnread?: boolean
}

export type PruneSummary = {
  deleted: number
  ranAt: string
}

export class MaintenanceService {
  async pruneNotifications(options: PruneNotificationsOptions): Promise<PruneSummary> {
    const retentionDays = Number(options.retentionDays)
    const includeUnread = Boolean(options.includeUnread)

    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      logger.info('Skipping notifications prune due to non-positive retentionDays', {
        retentionDays: options.retentionDays,
      })
      return { deleted: 0, ranAt: new Date().toISOString() }
    }

    // Delete notifications older than retentionDays. By default, keep unread.
    const result = await query<{ count: string }>(
      `
        WITH deleted AS (
          DELETE FROM notifications
          WHERE created_at < NOW() - make_interval(days => $1)
            AND ($2::boolean OR read_at IS NOT NULL)
          RETURNING 1
        )
        SELECT COUNT(*)::text as count FROM deleted
      `,
      [retentionDays, includeUnread],
    )

    const deleted = Number(result.rows[0]?.count ?? 0)
    const ranAt = new Date().toISOString()
    logger.info('Notifications prune complete', { retentionDays, includeUnread, deleted, ranAt })
    return { deleted, ranAt }
  }

  async prunePasswordResetTokens(): Promise<PruneSummary> {
    const result = await query<{ count: string }>(
      `
        WITH deleted AS (
          DELETE FROM password_reset_tokens
          WHERE (expires_at IS NOT NULL AND expires_at < NOW())
             OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '30 days')
          RETURNING 1
        )
        SELECT COUNT(*)::text as count FROM deleted
      `,
    )

    const deleted = Number(result.rows[0]?.count ?? 0)
    const ranAt = new Date().toISOString()
    logger.info('Password reset tokens prune complete', { deleted, ranAt })
    return { deleted, ranAt }
  }

  async archiveCompletedGameMoves(options?: { gameLimit?: number }): Promise<{
    archivedMoves: number
    archivedGames: number
    ranAt: string
  }> {
    const limitRaw = options?.gameLimit ?? 25
    const gameLimit = Number(limitRaw)
    if (!Number.isFinite(gameLimit) || gameLimit <= 0) {
      const ranAt = new Date().toISOString()
      logger.info('Skipping move archive sweep due to non-positive limit', {
        gameLimit: options?.gameLimit,
      })
      return { archivedMoves: 0, archivedGames: 0, ranAt }
    }

    const result = await query<{ archived_moves: number; archived_games: number }>(
      `
        WITH candidates AS (
          SELECT gr.id
          FROM game_rooms gr
          WHERE gr.status IN ('completed', 'abandoned')
            AND EXISTS (
              SELECT 1 FROM game_moves gm WHERE gm.room_id = gr.id
            )
          ORDER BY gr.ended_at NULLS LAST, gr.updated_at DESC
          LIMIT $1
        ),
        moved AS (
          DELETE FROM game_moves gm
          WHERE gm.room_id IN (SELECT id FROM candidates)
          RETURNING gm.*
        ),
        inserted AS (
          INSERT INTO game_move_archive (
            id,
            room_id,
            player_id,
            turn_number,
            move_type,
            move_data,
            is_valid,
            validation_error,
            created_at,
            archived_at
          )
          SELECT
            id,
            room_id,
            player_id,
            turn_number,
            move_type,
            move_data,
            is_valid,
            validation_error,
            created_at,
            NOW()
          FROM moved
          RETURNING room_id
        )
        SELECT
          COUNT(*)::int AS archived_moves,
          COUNT(DISTINCT room_id)::int AS archived_games
        FROM inserted
      `,
      [gameLimit],
    )

    const archivedMoves = Number(result.rows[0]?.archived_moves ?? 0)
    const archivedGames = Number(result.rows[0]?.archived_games ?? 0)
    const ranAt = new Date().toISOString()

    if (archivedMoves > 0) {
      logger.info('Archived completed game moves', { archivedMoves, archivedGames, ranAt })
    } else {
      logger.debug('Move archive sweep found no eligible games', {
        gameLimit,
        ranAt,
      })
    }

    return { archivedMoves, archivedGames, ranAt }
  }
}

export const maintenanceService = new MaintenanceService()
