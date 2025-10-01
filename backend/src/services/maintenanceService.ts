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
}

export const maintenanceService = new MaintenanceService()

