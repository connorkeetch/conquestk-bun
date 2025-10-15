import { RANKS } from '@conquestk/shared/constants/ranks'
import type { PoolClient, QueryResultRow } from 'pg'
import type { DatabaseQueryResult } from '../config/database.js'
import { query, transaction } from '../config/database.js'
import { logger } from '../utils/logger.js'

export interface PlayerRating {
  userId: string
  currentRating: number
  gamesPlayed: number
  position: number // 1 = winner, 2 = second place, etc.
}

export interface RatingChange {
  userId: string
  oldRating: number
  newRating: number
  change: number
  expectedScore: number
  actualScore: number
  kFactor: number
}

export interface SkillTier {
  name: string
  minRating: number
  maxRating: number
  icon: string
  color: string
}

interface RatingHistoryEntryRow extends QueryResultRow {
  id: string
  user_id: string
  old_rating: number
  new_rating: number
  rating_change: number
  game_room_id: string | null
  reason: string
  created_at: string
}

interface LeaderboardRow extends QueryResultRow {
  user_id: string
  username: string
  skill_rating: number
  rank_position: number
  ranked_wins?: number | null
  ranked_losses?: number | null
}
// Centralize tier thresholds using shared RANKS and attach icons/colors here (server-only)
const TIER_META: Record<string, { icon: string; color: string }> = {
  Chieftain: { icon: '🛡️', color: '#8B4513' },
  Warlord: { icon: '⚔️', color: '#DC143C' },
  'Raider King': { icon: '⚓', color: '#4682B4' },
  Sultan: { icon: '☪️', color: '#228B22' },
  Caesar: { icon: '🦅', color: '#FFD700' },
  Khan: { icon: '🏹', color: '#FF8C00' },
  Emperor: { icon: '👑', color: '#9370DB' },
  'The Great King': { icon: '☀️', color: '#FF6347' },
  Overlord: { icon: '💀', color: '#2F4F4F' },
  Worldbreaker: { icon: '☄️', color: '#8B0000' },
}

export const SKILL_TIERS: SkillTier[] = RANKS.map(
  (r: { name: string; minRating: number }, i: number) => {
    const nextMin = i < RANKS.length - 1 ? RANKS[i + 1].minRating : 10000
    const meta = TIER_META[r.name] || { icon: '🏅', color: '#666' }
    return {
      name: r.name,
      minRating: r.minRating,
      maxRating: nextMin - 1,
      icon: meta.icon,
      color: meta.color,
    }
  },
)

export class EloService {
  private static readonly D = 400
  private static readonly K_BASE = 24
  private static readonly K_PROVISIONAL = 40 // first 20 ranked games
  private static readonly R_FLOOR = 800

  private kForPlayer(gamesPlayed: number, nPlayers: number): number {
    const provisional = gamesPlayed < 20
    const kUsed = provisional ? EloService.K_PROVISIONAL : EloService.K_BASE
    return kUsed * Math.sqrt(Math.max(1, nPlayers - 1))
  }

  calculateRatingChanges(players: PlayerRating[]): RatingChange[] {
    if (players.length < 2) {
      return []
    }
    if (players.length < 3) {
      // Ranked constraints expect >=3; still compute deltas for 1v1 deterministically
      // to keep function behavior well-defined.
    }

    const n = players.length
    const expected = new Map<string, number>()
    const score = new Map<string, number>()

    for (const i of players) {
      let eSum = 0
      let sSum = 0
      for (const j of players) {
        if (i.userId === j.userId) continue
        const e_ij = 1 / (1 + 10 ** ((j.currentRating - i.currentRating) / EloService.D))
        eSum += e_ij
        if (i.position < j.position) sSum += 1
        else if (i.position === j.position) sSum += 0.5
        else sSum += 0
      }
      const denom = Math.max(1, n - 1)
      expected.set(i.userId, eSum / denom)
      score.set(i.userId, sSum / denom)
    }

    // Build raw deltas using per-player K scaled by sqrt(n-1)
    const deltas = players.map((p) => {
      const k = this.kForPlayer(p.gamesPlayed, n)
      const e = expected.get(p.userId) ?? 0
      const s = score.get(p.userId) ?? 0
      const delta = Math.round(k * (s - e))
      const newRating = Math.max(EloService.R_FLOOR, Math.round(p.currentRating + delta))
      return {
        userId: p.userId,
        oldRating: p.currentRating,
        newRating,
        change: delta,
        expectedScore: e,
        actualScore: s,
        kFactor: k,
      } as RatingChange
    })

    // Enforce exact zero-sum after rounding
    let sum = deltas.reduce((acc, d) => acc + d.change, 0)
    if (sum !== 0 && deltas.length > 0) {
      let idx = 0
      let maxMag = -1
      for (let i = 0; i < deltas.length; i++) {
        const mag = Math.abs(deltas[i].change)
        if (mag > maxMag) {
          maxMag = mag
          idx = i
        }
      }
      const d = deltas[idx]
      const newDelta = d.change - sum
      const adjustedNew = Math.max(EloService.R_FLOOR, Math.round(d.oldRating + newDelta))
      deltas[idx] = { ...d, change: newDelta, newRating: adjustedNew }
      sum = 0
    }

    return deltas
  }

  async applyRatingChanges(
    gameId: string,
    changes: RatingChange[],
    client?: PoolClient,
  ): Promise<void> {
    if (changes.length === 0) return

    const persist = async (dbClient: PoolClient) => {
      await this.bulkInsertRatingHistory(dbClient, gameId, changes)
      await this.bulkUpdateUserRatings(dbClient, changes)
    }

    logger.info('Persisting rating changes for ranked game', {
      gameId,
      players: changes.length,
      updates: changes.map((change) => ({
        userId: change.userId,
        oldRating: change.oldRating,
        newRating: change.newRating,
        delta: change.change,
      })),
    })

    try {
      if (client) {
        await persist(client)
      } else {
        await transaction(async (dbClient) => {
          await persist(dbClient)
        })
      }
      logger.info('Finished persisting rating changes for ranked game', {
        gameId,
      })
    } catch (error) {
      logger.error('Failed to persist rating changes for ranked game', {
        gameId,
        error: error instanceof Error ? error.message : error,
      })
      throw error
    }
  }

  private async bulkInsertRatingHistory(
    client: PoolClient,
    gameId: string,
    changes: RatingChange[],
  ): Promise<void> {
    if (changes.length === 0) return

    const values: Array<number | string> = []
    const placeholders: string[] = []

    changes.forEach((change, index) => {
      const baseIndex = index * 6
      placeholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`,
      )
      values.push(
        change.userId,
        change.oldRating,
        change.newRating,
        change.change,
        gameId,
        'match_completed',
      )
    })

    await client.query(
      `
        INSERT INTO rating_history (
          user_id,
          old_rating,
          new_rating,
          rating_change,
          game_room_id,
          reason
        ) VALUES ${placeholders.join(', ')}
      `,
      values,
    )
  }

  private async bulkUpdateUserRatings(client: PoolClient, changes: RatingChange[]): Promise<void> {
    if (changes.length === 0) return

    const ratingCases: string[] = []
    const values: Array<number | string> = []

    changes.forEach((change, index) => {
      const baseIndex = index * 2
      // Explicitly cast parameter types to ensure Postgres resolves
      // the CASE expression to integer for skill_rating updates.
      ratingCases.push(`WHEN id = $${baseIndex + 1}::uuid THEN $${baseIndex + 2}::int`)
      values.push(change.userId, change.newRating)
    })

    const idPlaceholders = changes
      .map((_, index) => `$${changes.length * 2 + index + 1}::uuid`)
      .join(', ')

    values.push(...changes.map((change) => change.userId))

    await client.query(
      `
        UPDATE users SET
          skill_rating = CASE ${ratingCases.join(' ')} END,
          updated_at = NOW()
        WHERE id IN (${idPlaceholders})
      `,
      values,
    )

    // Update highest_skill_rating and last_ranked_game_at for affected users.
    // Do this after skill_rating has been updated so GREATEST() reflects the new value.
    const affectedUserIds = changes.map((change) => change.userId)
    if (affectedUserIds.length > 0) {
      await client.query(
        `
          UPDATE users
          SET
            highest_skill_rating = GREATEST(highest_skill_rating, skill_rating),
            last_ranked_game_at = NOW(),
            updated_at = NOW()
          WHERE id = ANY($1::uuid[])
        `,
        [affectedUserIds],
      )
    }
  }

  getSkillTier(rating: number): SkillTier {
    return (
      SKILL_TIERS.find((tier) => rating >= tier.minRating && rating <= tier.maxRating) ||
      SKILL_TIERS[0]
    )
  }

  canJoinRankedGame(
    playerRating: number,
    gameAvgRating: number,
    maxSkillGap: number = 500,
  ): boolean {
    return Math.abs(playerRating - gameAvgRating) <= maxSkillGap
  }

  async getRatingHistory(userId: string, limit: number = 30): Promise<RatingHistoryEntryRow[]> {
    const result = await query<RatingHistoryEntryRow>(
      `
        SELECT *
        FROM rating_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [userId, limit],
    )

    return result.rows
  }

  async getLeaderboard(limit: number = 100, offset: number = 0): Promise<LeaderboardRow[]> {
    const result = await query<LeaderboardRow>(
      `
        SELECT
          (entry.data ->> 'userId')::uuid AS user_id,
          entry.data ->> 'username' AS username,
          (entry.data ->> 'skillRating')::int AS skill_rating,
          (entry.data ->> 'rank')::int AS rank_position,
          COALESCE((entry.data ->> 'wins')::int, 0) AS ranked_wins,
          COALESCE((entry.data ->> 'losses')::int, 0) AS ranked_losses
        FROM skill_leaderboard_cache cache,
        LATERAL jsonb_array_elements(cache.rankings) WITH ORDINALITY AS entry(data, ord)
        WHERE cache.period_type = 'all_time'
        ORDER BY ord
        LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    )

    if ((result.rowCount ?? 0) > 0) {
      return result.rows
    }

    // Fallback to live query if cache is empty
    const fallback = await query<LeaderboardRow>(
      `
        SELECT
          id as user_id,
          username,
          skill_rating,
          ranked_wins,
          ranked_losses,
          ROW_NUMBER() OVER (ORDER BY skill_rating DESC, created_at ASC) + $2 AS rank_position
        FROM users
        ORDER BY skill_rating DESC, created_at ASC
        LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    )

    return fallback.rows
  }

  async updateLeaderboardCache(client?: PoolClient): Promise<void> {
    const executeQuery = async <T extends QueryResultRow>(
      sql: string,
      params?: unknown[],
    ): Promise<DatabaseQueryResult<T>> => {
      if (client) {
        const result = await client.query<T>(sql, params)
        return {
          rows: result.rows,
          rowCount: result.rowCount ?? null,
        }
      }

      return query<T>(sql, params)
    }

    const leaderboard = await executeQuery<LeaderboardRow>(
      `
        SELECT id as user_id, username, skill_rating, ranked_wins, ranked_losses,
               ROW_NUMBER() OVER (ORDER BY skill_rating DESC, created_at ASC) AS rank_position
        FROM users
        ORDER BY skill_rating DESC, created_at ASC
        LIMIT 100
      `,
    )

    const rankings = leaderboard.rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      skillRating: row.skill_rating,
      wins: row.ranked_wins ?? 0,
      losses: row.ranked_losses ?? 0,
      rank: row.rank_position,
    }))

    await executeQuery(
      `
        INSERT INTO skill_leaderboard_cache (
          period_type,
          period_start,
          period_end,
          rankings,
          generated_at
        ) VALUES ($1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (period_type, period_start, period_end)
        DO UPDATE SET rankings = EXCLUDED.rankings, generated_at = EXCLUDED.generated_at
      `,
      ['all_time', '1970-01-01', '9999-12-31', JSON.stringify(rankings)],
    )
  }
}

export const eloService = new EloService()
