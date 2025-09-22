import { query } from '../config/database'
import { logger } from '../utils/logger'

export interface UserBlockRecord {
  id: string
  blockerId: string
  blockedId: string
  createdAt: Date
}

type UserBlockRow = {
  id: string
  blocker_id: string
  blocked_id: string
  created_at: Date
}

const mapRow = (row: UserBlockRow): UserBlockRecord => ({
  id: row.id,
  blockerId: row.blocker_id,
  blockedId: row.blocked_id,
  createdAt: row.created_at,
})

export async function createBlock(blockerId: string, blockedId: string): Promise<UserBlockRecord> {
  if (blockerId === blockedId) {
    throw new Error('Cannot block yourself')
  }

  try {
    const insertResult = await query<UserBlockRow>(
      `
      INSERT INTO user_blocks (blocker_id, blocked_id)
      VALUES ($1, $2)
      ON CONFLICT (blocker_id, blocked_id) DO UPDATE
      SET blocker_id = EXCLUDED.blocker_id
      RETURNING *
    `,
      [blockerId, blockedId],
    )

    if (insertResult.rows.length > 0) {
      return mapRow(insertResult.rows[0])
    }

    const existingResult = await query<UserBlockRow>(
      'SELECT * FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
      [blockerId, blockedId],
    )

    if (existingResult.rows.length === 0) {
      throw new Error('Failed to create block')
    }

    return mapRow(existingResult.rows[0])
  } catch (error) {
    logger.error('Failed to create user block', { blockerId, blockedId, error })
    throw error
  }
}

export async function removeBlock(blockerId: string, blockedId: string): Promise<boolean> {
  try {
    const result = await query<UserBlockRow>(
      'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING id',
      [blockerId, blockedId],
    )
    return (result.rowCount ?? 0) > 0
  } catch (error) {
    logger.error('Failed to remove user block', { blockerId, blockedId, error })
    throw error
  }
}

export async function isBlocked(userA: string, userB: string): Promise<boolean> {
  try {
    const result = await query<UserBlockRow>(
      `
      SELECT 1
      FROM user_blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)
      LIMIT 1
    `,
      [userA, userB],
    )
    return (result.rowCount ?? 0) > 0
  } catch (error) {
    logger.error('Failed to check block status', { userA, userB, error })
    throw error
  }
}

export async function getBlocksForUser(userId: string): Promise<UserBlockRecord[]> {
  try {
    const result = await query<UserBlockRow>(
      `
      SELECT *
      FROM user_blocks
      WHERE blocker_id = $1
      ORDER BY created_at DESC
    `,
      [userId],
    )
    return result.rows.map(mapRow)
  } catch (error) {
    logger.error('Failed to fetch user blocks', { userId, error })
    throw error
  }
}

export async function getBlockRecords(options: {
  limit?: number
  offset?: number
  blockerId?: string
  blockedId?: string
}): Promise<UserBlockRecord[]> {
  const { limit = 100, offset = 0, blockerId, blockedId } = options

  const conditions: string[] = []
  const params: Array<string | number> = []

  if (blockerId) {
    params.push(blockerId)
    conditions.push(`blocker_id = $${params.length}`)
  }

  if (blockedId) {
    params.push(blockedId)
    conditions.push(`blocked_id = $${params.length}`)
  }

  params.push(limit)
  const limitPosition = params.length
  params.push(offset)
  const offsetPosition = params.length

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const result = await query(
      `
      SELECT *
      FROM user_blocks
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitPosition}
      OFFSET $${offsetPosition}
    `,
      params,
    )
    return result.rows.map(mapRow)
  } catch (error) {
    logger.error('Failed to fetch block records', { options, error })
    throw error
  }
}
