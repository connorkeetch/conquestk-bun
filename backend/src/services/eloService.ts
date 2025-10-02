import type { PoolClient, QueryResultRow } from 'pg'
import type { DatabaseQueryResult } from '../config/database'
import { query, transaction } from '../config/database'

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
}

export const SKILL_TIERS: SkillTier[] = [
  { name: 'Chieftain', minRating: 0, maxRating: 599, icon: '🛡️', color: '#8B4513' },
  { name: 'Warlord', minRating: 600, maxRating: 799, icon: '⚔️', color: '#DC143C' },
  { name: 'Raider King', minRating: 800, maxRating: 999, icon: '⚓', color: '#4682B4' },
  { name: 'Sultan', minRating: 1000, maxRating: 1199, icon: '☪️', color: '#228B22' },
  { name: 'Caesar', minRating: 1200, maxRating: 1399, icon: '🦅', color: '#FFD700' },
  { name: 'Khan', minRating: 1400, maxRating: 1599, icon: '🏹', color: '#FF8C00' },
  { name: 'Emperor', minRating: 1600, maxRating: 1799, icon: '👑', color: '#9370DB' },
  { name: 'The Great King', minRating: 1800, maxRating: 1999, icon: '☀️', color: '#FF6347' },
  { name: 'Overlord', minRating: 2000, maxRating: 2199, icon: '💀', color: '#2F4F4F' },
  { name: 'Worldbreaker', minRating: 2200, maxRating: 9999, icon: '☄️', color: '#8B0000' },
]

export class EloService {
  private calculateKFactor(
    gamesPlayed: number,
    currentRating: number,
    numberOfPlayers: number,
  ): number {
    let baseK: number
    if (gamesPlayed < 30) {
      baseK = 32
    } else if (gamesPlayed < 100) {
      baseK = 24
    } else {
      baseK = 16
    }

    const playerAdjustment = numberOfPlayers / 4
    const adjustedK = baseK * playerAdjustment

    if (currentRating > 1800) {
      return adjustedK * 0.8
    }
    if (currentRating > 1600) {
      return adjustedK * 0.9
    }

    return adjustedK
  }

  private calculateExpectedScore(playerRating: number, opponentRatings: number[]): number {
    const expectedScores = opponentRatings.map((opponentRating) => {
      const ratingDiff = (opponentRating - playerRating) / 400
      return 1 / (1 + 10 ** ratingDiff)
    })

    return expectedScores.reduce((sum, score) => sum + score, 0) / expectedScores.length
  }

  private calculateActualScore(position: number, totalPlayers: number): number {
    if (position === 1) {
      return 1.0
    }

    const baseScore = (totalPlayers - position) / (totalPlayers - 1)

    if (position === 2) {
      return baseScore * 0.75
    }
    if (position === 3) {
      return baseScore * 0.5
    }

    return baseScore * 0.25
  }

  calculateRatingChanges(players: PlayerRating[]): RatingChange[] {
    if (players.length < 3) {
      throw new Error('Ranked games require at least 3 players')
    }

    const changes: RatingChange[] = []

    for (const player of players) {
      const opponentRatings = players
        .filter((p) => p.userId !== player.userId)
        .map((p) => p.currentRating)

      const kFactor = this.calculateKFactor(
        player.gamesPlayed,
        player.currentRating,
        players.length,
      )
      const expectedScore = this.calculateExpectedScore(player.currentRating, opponentRatings)
      const actualScore = this.calculateActualScore(player.position, players.length)
      const ratingChange = Math.round(kFactor * (actualScore - expectedScore))
      const newRating = Math.max(0, player.currentRating + ratingChange)

      changes.push({
        userId: player.userId,
        oldRating: player.currentRating,
        newRating,
        change: ratingChange,
        expectedScore,
        actualScore,
        kFactor,
      })
    }

    return changes
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

    if (client) {
      await persist(client)
      return
    }

    await transaction(async (dbClient) => {
      await persist(dbClient)
    })
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
      ratingCases.push(`WHEN id = $${baseIndex + 1} THEN $${baseIndex + 2}`)
      values.push(change.userId, change.newRating)
    })

    const idPlaceholders = changes
      .map((_, index) => `$${changes.length * 2 + index + 1}`)
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
          (entry.data ->> 'rank')::int AS rank_position
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
        SELECT id as user_id, username, skill_rating,
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
