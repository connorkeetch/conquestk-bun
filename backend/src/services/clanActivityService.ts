/**
 * @fileoverview This file provides a function for logging clan activities to the database.
 * @module services/clanActivityService
 */
import type { PoolClient } from 'pg'
import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'

/**
 * @interface ClanActivityOptions
 * @description Represents the options for logging a clan activity.
 */
interface ClanActivityOptions {
  clanId: string
  actorUserId?: string | null
  actionType: string
  metadata?: Record<string, unknown>
  targetId?: string | null
  client?: PoolClient
}

/**
 * Logs a clan activity to the `clan_activity_log` table.
 * @param {ClanActivityOptions} options - The options for the activity to log.
 * @returns {Promise<void>} A promise that resolves when the activity has been logged.
 */
export async function logClanActivity({
  clanId,
  actorUserId,
  actionType,
  metadata,
  targetId,
  client,
}: ClanActivityOptions): Promise<void> {
  try {
    const params = [
      clanId,
      actorUserId ?? null,
      actionType,
      metadata ? JSON.stringify(metadata) : '{}',
      targetId ?? null,
    ]
    const sql = `
      INSERT INTO clan_activity_log (clan_id, actor_user_id, action_type, metadata, target_id)
      VALUES ($1, $2, $3, $4::jsonb, $5)
    `

    if (client) {
      await client.query(sql, params)
    } else {
      await query(sql, params)
    }
  } catch (error) {
    logger.warn('Failed to append clan activity', {
      clanId,
      actionType,
      error,
    })
  }
}
