import { query } from '../config/database'

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

// The Conqueror's Path - Historical conquest-themed ranking system
export const SKILL_TIERS: SkillTier[] = [
  { name: 'Chieftain', minRating: 0, maxRating: 599, icon: '🛡️', color: '#8B4513' }, // Brown - tribal leader
  { name: 'Warlord', minRating: 600, maxRating: 799, icon: '⚔️', color: '#DC143C' }, // Crimson - rules by might
  { name: 'Raider King', minRating: 800, maxRating: 999, icon: '⚓', color: '#4682B4' }, // Steel blue - Viking raiders
  { name: 'Sultan', minRating: 1000, maxRating: 1199, icon: '☪️', color: '#228B22' }, // Forest green - faith & politics
  { name: 'Caesar', minRating: 1200, maxRating: 1399, icon: '🦅', color: '#FFD700' }, // Gold - Roman empire
  { name: 'Khan', minRating: 1400, maxRating: 1599, icon: '🏹', color: '#FF8C00' }, // Dark orange - steppe warriors
  { name: 'Emperor', minRating: 1600, maxRating: 1799, icon: '👑', color: '#9370DB' }, // Medium purple - European dominance
  { name: 'The Great King', minRating: 1800, maxRating: 1999, icon: '☀️', color: '#FF6347' }, // Tomato - Alexander's empire
  { name: 'Overlord', minRating: 2000, maxRating: 2199, icon: '💀', color: '#2F4F4F' }, // Dark slate gray - terror & tribute
  { name: 'Worldbreaker', minRating: 2200, maxRating: 9999, icon: '☄️', color: '#8B0000' }, // Dark red - apocalyptic conqueror
]

export class EloService {
  constructor() {
    // No need for database initialization with query function
  }

  /**
   * Calculate K-factor based on games played and current rating
   * Lower K-factor for more experienced players, higher for new players
   */
  private calculateKFactor(
    gamesPlayed: number,
    currentRating: number,
    numberOfPlayers: number,
  ): number {
    // Base K-factor depends on experience
    let baseK: number
    if (gamesPlayed < 30) {
      baseK = 32 // New players have higher volatility
    } else if (gamesPlayed < 100) {
      baseK = 24 // Intermediate players
    } else {
      baseK = 16 // Experienced players
    }

    // Adjust for game size (more players = more variance)
    // Scale factor: more players means each individual game has less impact
    const playerAdjustment = numberOfPlayers / 4
    const adjustedK = baseK * playerAdjustment

    // Additional adjustment for high-rated players (slower changes at the top)
    if (currentRating > 1800) {
      return adjustedK * 0.8
    }
    if (currentRating > 1600) {
      return adjustedK * 0.9
    }

    return adjustedK
  }

  /**
   * Calculate expected score for a player against multiple opponents
   * In multiplayer, we calculate average expected score against all opponents
   */
  private calculateExpectedScore(playerRating: number, opponentRatings: number[]): number {
    const expectedScores = opponentRatings.map((opponentRating) => {
      const ratingDiff = (opponentRating - playerRating) / 400
      return 1 / (1 + 10 ** ratingDiff)
    })

    // Average expected score against all opponents
    return expectedScores.reduce((sum, score) => sum + score, 0) / expectedScores.length
  }

  /**
   * Calculate actual score based on final position
   * Winner gets 1.0, positions scale down from there
   */
  private calculateActualScore(position: number, totalPlayers: number): number {
    if (position === 1) {
      return 1.0 // Winner gets full score
    }

    // Linear scaling for other positions
    // 2nd place gets higher score than 3rd, etc.
    const baseScore = (totalPlayers - position) / (totalPlayers - 1)

    // Apply position-based adjustments
    if (position === 2) {
      return baseScore * 0.75 // 2nd place loses 25% less
    }
    if (position === 3) {
      return baseScore * 0.5 // 3rd place loses 50% less
    }

    return baseScore * 0.25 // Other positions get minimal score
  }

  /**
   * Calculate new ratings for all players after a ranked game
   */
  calculateRatingChanges(players: PlayerRating[]): RatingChange[] {
    if (players.length < 3) {
      throw new Error('Ranked games require at least 3 players')
    }

    const changes: RatingChange[] = []

    for (const player of players) {
      // Get opponent ratings (everyone except current player)
      const opponentRatings = players
        .filter((p) => p.userId !== player.userId)
        .map((p) => p.currentRating)

      // Calculate K-factor
      const kFactor = this.calculateKFactor(
        player.gamesPlayed,
        player.currentRating,
        players.length,
      )

      // Calculate expected and actual scores
      const expectedScore = this.calculateExpectedScore(player.currentRating, opponentRatings)
      const actualScore = this.calculateActualScore(player.position, players.length)

      // Calculate rating change
      const ratingChange = Math.round(kFactor * (actualScore - expectedScore))
      const newRating = Math.max(0, player.currentRating + ratingChange) // Never go below 0

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

  /**
   * Apply rating changes to database after a game (optimized bulk operations)
   */
  async applyRatingChanges(gameId: string, changes: RatingChange[]): Promise<void> {
    if (changes.length === 0) return

    try {
      // Start transaction
      await query('BEGIN')

      // Sort changes by new rating to determine positions
      const sortedChanges = [...changes].sort((a, b) => b.newRating - a.newRating)
      const positionMap = new Map<string, number>()
      sortedChanges.forEach((change, index) => {
        positionMap.set(change.userId, index + 1)
      })

      // Bulk insert rating history
      if (changes.length > 0) {
        await this.bulkInsertRatingHistory(gameId, changes, positionMap)
      }

      // Bulk update user ratings
      await this.bulkUpdateUserRatings(changes, positionMap)

      // Commit transaction
      await query('COMMIT')
    } catch (error) {
      // Rollback on error
      await query('ROLLBACK')
      throw error
    }
  }

  /**
   * Bulk insert rating history records
   */
  private async bulkInsertRatingHistory(
    gameId: string,
    changes: RatingChange[],
    positionMap: Map<string, number>,
  ): Promise<void> {
    const values: any[] = []
    const placeholders: string[] = []

    changes.forEach((change, index) => {
      const baseIndex = index * 10
      const position = positionMap.get(change.userId) || 0

      placeholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10})`,
      )

      values.push(
        change.userId,
        gameId,
        change.oldRating,
        change.newRating,
        change.change,
        position,
        changes.length,
        change.kFactor,
        change.expectedScore,
        change.actualScore,
      )
    })

    const sql = `
      INSERT INTO rating_history (
        user_id, game_id, rating_before, rating_after, rating_change,
        position, total_players, k_factor, expected_score, actual_score
      ) VALUES ${placeholders.join(', ')}
    `

    await query(sql, values)
  }

  /**
   * Bulk update user ratings using PostgreSQL UPDATE with CASE statements
   */
  private async bulkUpdateUserRatings(
    changes: RatingChange[],
    positionMap: Map<string, number>,
  ): Promise<void> {
    if (changes.length === 0) return

    const userIds = changes.map((change) => change.userId)
    const userIdPlaceholders = userIds
      .map((_, index) => `$${changes.length * 4 + index + 1}`)
      .join(', ')

    // Build CASE statements for each field
    const ratingCases: string[] = []
    const winCases: string[] = []
    const lossCases: string[] = []
    const values: any[] = []

    changes.forEach((change, index) => {
      const position = positionMap.get(change.userId) || 0
      const isWinner = position === 1
      const baseIndex = index * 4

      ratingCases.push(`WHEN id = $${baseIndex + 1} THEN $${baseIndex + 2}`)
      winCases.push(`WHEN id = $${baseIndex + 1} THEN ranked_wins + $${baseIndex + 3}`)
      lossCases.push(`WHEN id = $${baseIndex + 1} THEN ranked_losses + $${baseIndex + 4}`)

      values.push(change.userId, change.newRating, isWinner ? 1 : 0, isWinner ? 0 : 1)
    })

    // Add user IDs for the WHERE clause
    values.push(...userIds)

    const sql = `
      UPDATE users SET 
        skill_rating = CASE ${ratingCases.join(' ')} END,
        skill_confidence = LEAST(1.0, skill_confidence + 0.05),
        total_ranked_games = total_ranked_games + 1,
        ranked_wins = CASE ${winCases.join(' ')} END,
        ranked_losses = CASE ${lossCases.join(' ')} END,
        last_ranked_game_at = CURRENT_TIMESTAMP
      WHERE id IN (${userIdPlaceholders})
    `

    await query(sql, values)
  }

  /**
   * Get skill tier for a rating
   */
  getSkillTier(rating: number): SkillTier {
    return (
      SKILL_TIERS.find((tier) => rating >= tier.minRating && rating <= tier.maxRating) ||
      SKILL_TIERS[0]
    )
  }

  /**
   * Check if players can join a ranked game (skill gap validation)
   */
  canJoinRankedGame(
    playerRating: number,
    gameAvgRating: number,
    maxSkillGap: number = 500,
  ): boolean {
    return Math.abs(playerRating - gameAvgRating) <= maxSkillGap
  }

  /**
   * Get rating history for a user
   */
  async getRatingHistory(userId: string, limit: number = 30): Promise<any[]> {
    const result = await query(
      `
      SELECT 
        rh.*,
        gr.name as game_name,
        gr.created_at as game_date
      FROM rating_history rh
      JOIN game_rooms gr ON rh.game_id = gr.id
      WHERE rh.user_id = ?
      ORDER BY rh.created_at DESC
      LIMIT ?
    `,
      [userId, limit],
    )

    return result.rows
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(
    limit: number = 100,
    offset: number = 0,
    tierFilter?: string,
  ): Promise<any[]> {
    let queryStr = `
      SELECT 
        slc.*,
        u.username,
        u.id as user_id
      FROM skill_leaderboard_cache slc
      JOIN users u ON slc.user_id = u.id
    `

    const params: any[] = []

    if (tierFilter) {
      queryStr += ` WHERE slc.tier = ?`
      params.push(tierFilter)
    }

    queryStr += ` ORDER BY slc.rank_position LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const result = await query(queryStr, params)
    return result.rows
  }

  /**
   * Recalculate leaderboard rankings (should be run periodically)
   */
  async updateLeaderboardCache(): Promise<void> {
    await query(`
      INSERT OR REPLACE INTO skill_leaderboard_cache (
        user_id, username, skill_rating, skill_confidence,
        rank_position, tier, total_ranked_games, win_rate
      )
      SELECT 
        u.id,
        u.username,
        u.skill_rating,
        u.skill_confidence,
        ROW_NUMBER() OVER (ORDER BY u.skill_rating DESC) as rank_position,
        u.current_tier,
        u.total_ranked_games,
        CASE 
          WHEN u.total_ranked_games > 0 
          THEN CAST(u.ranked_wins AS REAL) / u.total_ranked_games 
          ELSE 0 
        END as win_rate
      FROM users u
      WHERE u.total_ranked_games > 0
      ORDER BY u.skill_rating DESC
    `)
  }
}

// Export singleton instance
export const eloService = new EloService()
