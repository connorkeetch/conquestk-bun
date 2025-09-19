import type { QueryResultRow } from 'pg'
import { getClient } from '../config/database'
import type {
  Achievement,
  GameHistoryEntry,
  ProfileResponse,
  ProfileUpdateRequest,
  StatsBreakdown,
  AggregatedStatsSummary,
  UserAchievement,
  UserPreferences,
  UserProfile,
  UserRanking,
  UserStatistics,
} from '../types/profile'

interface RawLeaderboardRow {
  user_id: string
  username: string
  avatar_url: string | null
  level: number
  games_won: number
  games_played: number
  win_rate: number
  rating: number
}

interface MapStatsRow extends QueryResultRow {
  map_name: string
  games_played: number
  games_won: number
  avg_duration: number | null
  best_territories: number
}

interface ModeStatsRow extends QueryResultRow {
  game_mode: string
  games_played: number
  games_won: number
  avg_duration: number | null
}

export class ProfileService {
  // Get complete user profile with all related data
  async getUserProfile(userId: string): Promise<ProfileResponse> {
    const client = await getClient()

    try {
      // Get profile data
      // user_profiles table removed - profile data is now in users table
      const profileResult = await client.query('SELECT * FROM users WHERE id = $1', [userId])

      // Get statistics
      const statsResult = await client.query('SELECT * FROM player_stats WHERE user_id = $1', [
        userId,
      ])

      // Get achievements with details
      const achievementsResult = await client.query(
        `
        SELECT ua.*, a.name, a.description, a.icon_emoji, a.category, a.points, a.rarity
        FROM user_achievements ua
        JOIN achievements a ON ua.achievement_id = a.id
        WHERE ua.user_id = $1
        ORDER BY ua.unlocked_at DESC
      `,
        [userId],
      )

      // Get recent games from game_rooms + room_players (game_history table doesn't exist)
      const recentGamesResult = await client.query(
        `SELECT 
          gr.id as game_id,
          gr.name as game_name, 
          gr.started_at,
          gr.ended_at,
          gr.game_mode,
          gr.status,
          CASE WHEN gr.winner_id = $1 THEN 'won' ELSE 'lost' END as result,
          EXTRACT(EPOCH FROM (gr.ended_at - gr.started_at))/60 as duration_minutes
        FROM game_rooms gr
        JOIN room_players rp ON gr.id = rp.room_id
        WHERE rp.user_id = $1 AND gr.status IN ('finished', 'ended')
        ORDER BY gr.started_at DESC LIMIT 10`,
        [userId],
      )

      // Get preferences
      const preferencesResult = await client.query(
        'SELECT * FROM user_preferences WHERE user_id = $1',
        [userId],
      )

      return {
        profile: profileResult.rows[0] || this.createDefaultProfile(userId),
        statistics: statsResult.rows[0] || this.createDefaultStats(userId),
        achievements: achievementsResult.rows || [],
        recentGames: recentGamesResult.rows || [],
        preferences: preferencesResult.rows[0] || this.createDefaultPreferences(userId),
      }
    } finally {
      if (client.release) client.release()
    }
  }

  // Update user profile
  async updateProfile(userId: string, updates: ProfileUpdateRequest): Promise<UserProfile> {
    const client = await getClient()

    try {
      const updateClauses: string[] = []
      const values: unknown[] = []
      let paramIndex = 0

      if (updates.avatarUrl !== undefined) {
        updateClauses.push(`avatar_url = $${++paramIndex}`)
        values.push(updates.avatarUrl)
      }

      if (updates.bio !== undefined) {
        updateClauses.push(`bio = $${++paramIndex}`)
        values.push(updates.bio)
      }

      if (updateClauses.length > 0) {
        updateClauses.push('updated_at = CURRENT_TIMESTAMP')
        const queryText = `
          UPDATE users
          SET ${updateClauses.join(', ')}
          WHERE id = $${++paramIndex}
        `

        values.push(userId)
        await client.query(queryText, values)
      }
    } finally {
      if (client.release) client.release()
    }

    if (updates.preferences && Object.keys(updates.preferences).length > 0) {
      await this.updatePreferences(userId, updates.preferences)
    }

    const updatedProfile = await this.getUserProfile(userId)
    return updatedProfile.profile
  }

  // Get user statistics with breakdowns
  async getUserStats(userId: string): Promise<StatsBreakdown> {
    const client = await getClient()

    try {
      // Overall stats
      const overallResult = await client.query('SELECT * FROM player_stats WHERE user_id = $1', [
        userId,
      ])

      // Stats by map (using game_rooms + room_players)
      const mapStatsResult = await client.query<MapStatsRow>(
        `
        SELECT 
          m.name as map_name,
          COUNT(*) as games_played,
          SUM(CASE WHEN gr.winner_id = $1 THEN 1 ELSE 0 END) as games_won,
          AVG(EXTRACT(EPOCH FROM (gr.ended_at - gr.started_at))/60) as avg_duration,
          0 as best_territories  -- TODO: Get from game_states when needed
        FROM game_rooms gr
        JOIN room_players rp ON gr.id = rp.room_id  
        JOIN maps m ON gr.map_id = m.id
        WHERE rp.user_id = $1 AND gr.status IN ('finished', 'ended')
        GROUP BY m.name
      `,
        [userId],
      )

      // Stats by game mode (using game_rooms + room_players)
      const modeStatsResult = await client.query<ModeStatsRow>(
        `
        SELECT 
          gr.game_mode,
          COUNT(*) as games_played,
          SUM(CASE WHEN gr.winner_id = $1 THEN 1 ELSE 0 END) as games_won,
          AVG(EXTRACT(EPOCH FROM (gr.ended_at - gr.started_at))/60) as avg_duration
        FROM game_rooms gr
        JOIN room_players rp ON gr.id = rp.room_id
        WHERE rp.user_id = $1 AND gr.status IN ('finished', 'ended')
        GROUP BY gr.game_mode
      `,
        [userId],
      )

      // Timeline data (last 30 days) (using game_rooms + room_players)
      const timelineResult = await client.query(
        `
        SELECT 
          DATE(gr.started_at) as date,
          COUNT(*) as games_played,
          SUM(CASE WHEN gr.winner_id = $1 THEN 1 ELSE 0 END) as games_won,
          SUM(EXTRACT(EPOCH FROM (gr.ended_at - gr.started_at))/60) as playtime
        FROM game_rooms gr
        JOIN room_players rp ON gr.id = rp.room_id
        WHERE rp.user_id = $1 AND gr.status IN ('finished', 'ended') 
          AND gr.started_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(gr.started_at)
        ORDER BY date DESC
      `,
        [userId],
      )

      const byMap: Record<string, AggregatedStatsSummary> = {}
      mapStatsResult.rows.forEach((row) => {
        byMap[row.map_name] = {
          gamesPlayed: row.games_played,
          gamesWon: row.games_won,
          averageGameLength: row.avg_duration ?? undefined,
          bestTerritories: row.best_territories ?? undefined,
        }
      })

      const byGameMode: Record<string, AggregatedStatsSummary> = {}
      modeStatsResult.rows.forEach((row) => {
        byGameMode[row.game_mode] = {
          gamesPlayed: row.games_played,
          gamesWon: row.games_won,
          averageGameLength: row.avg_duration ?? undefined,
        }
      })

      return {
        overall: overallResult.rows[0] || this.createDefaultStats(userId),
        byMap,
        byGameMode,
        timeline: timelineResult.rows || [],
      }
    } finally {
      if (client.release) client.release()
    }
  }

  // Get available achievements and user progress
  async getAchievements(
    userId: string,
  ): Promise<{ unlocked: UserAchievement[]; available: Achievement[] }> {
    const client = await getClient()

    try {
      // Get unlocked achievements
      const unlockedResult = await client.query(
        `
        SELECT ua.*, a.name, a.description, a.icon_emoji, a.category, a.points, a.rarity
        FROM user_achievements ua
        JOIN achievements a ON ua.achievement_id = a.id
        WHERE ua.user_id = $1
        ORDER BY ua.unlocked_at DESC
      `,
        [userId],
      )

      // Get all available achievements
      const availableResult = await client.query(`
        SELECT a.* FROM achievements a
        WHERE a.is_hidden = FALSE
        ORDER BY a.category, a.points
      `)

      return {
        unlocked: unlockedResult.rows || [],
        available: availableResult.rows || [],
      }
    } finally {
      if (client.release) client.release()
    }
  }

  // Unlock achievement for user
  async unlockAchievement(userId: string, achievementId: string): Promise<UserAchievement> {
    const client = await getClient()

    try {
      // Check if already unlocked
      const existing = await client.query(
        'SELECT * FROM user_achievements WHERE user_id = $1 AND achievement_id = $2',
        [userId, achievementId],
      )

      if (existing.rows.length > 0) {
        return existing.rows[0]
      }

      // Insert new achievement
      await client.query(
        `
        INSERT INTO user_achievements (user_id, achievement_id)
        VALUES ($1, $2)
      `,
        [userId, achievementId],
      )

      // Get achievement details
      const result = await client.query(
        `
        SELECT ua.*, a.name, a.description, a.icon_emoji, a.category, a.points, a.rarity
        FROM user_achievements ua
        JOIN achievements a ON ua.achievement_id = a.id
        WHERE ua.user_id = $1 AND ua.achievement_id = $2
      `,
        [userId, achievementId],
      )

      // Update user experience points
      const achievement = await client.query('SELECT points FROM achievements WHERE id = $1', [
        achievementId,
      ])

      if (achievement.rows.length > 0) {
        await client.query(
          `
          UPDATE users 
          SET experience_points = experience_points + $1
          WHERE user_id = $2
        `,
          [achievement.rows[0].points, userId],
        )
      }

      return result.rows[0]
    } finally {
      if (client.release) client.release()
    }
  }

  // Get game history with pagination
  async getGameHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<GameHistoryEntry[]> {
    const client = await getClient()

    try {
      const result = await client.query(
        `
        SELECT 
          gr.id as game_id,
          gr.name as game_name,
          gr.started_at,
          gr.ended_at,
          gr.game_mode,
          gr.status,
          CASE WHEN gr.winner_id = $1 THEN 'won' ELSE 'lost' END as result,
          EXTRACT(EPOCH FROM (gr.ended_at - gr.started_at))/60 as duration_minutes
        FROM game_rooms gr
        JOIN room_players rp ON gr.id = rp.room_id
        WHERE rp.user_id = $1 AND gr.status IN ('finished', 'ended')
        ORDER BY gr.started_at DESC 
        LIMIT $2 OFFSET $3
      `,
        [userId, limit, offset],
      )

      return result.rows || []
    } finally {
      if (client.release) client.release()
    }
  }

  // Update user preferences
  async updatePreferences(
    userId: string,
    preferences: Partial<UserPreferences>,
  ): Promise<UserPreferences> {
    const client = await getClient()

    try {
      const updateFields: string[] = []
      const values: Array<string | number | boolean> = []
      let paramCount = 0

      Object.keys(preferences).forEach((key) => {
        if (key !== 'userId' && preferences[key as keyof UserPreferences] !== undefined) {
          updateFields.push(`${this.camelToSnake(key)} = $${++paramCount}`)
          const value = preferences[key as keyof UserPreferences]
          values.push(value as string | number | boolean)
        }
      })

      updateFields.push('updated_at = CURRENT_TIMESTAMP')
      values.push(userId)

      const query = `
        UPDATE user_preferences 
        SET ${updateFields.join(', ')} 
        WHERE user_id = $${++paramCount}
      `

      await client.query(query, values)

      // Return updated preferences
      const result = await client.query('SELECT * FROM user_preferences WHERE user_id = $1', [
        userId,
      ])

      return result.rows[0]
    } finally {
      if (client.release) client.release()
    }
  }

  // Get global leaderboard
  async getLeaderboard(limit: number = 100): Promise<UserRanking[]> {
    const client = await getClient()

    try {
      const result = await client.query(
        `
        SELECT 
          u.id as user_id,
          u.username,
          up.avatar_url,
          up.level,
          us.games_won,
          us.games_played,
          CASE WHEN us.games_played > 0 THEN (us.games_won * 100.0 / us.games_played) ELSE 0 END as win_rate,
          (us.games_won * 10 + up.level * 5) as rating
        FROM users u
        -- JOIN user_profiles up ON u.id = up.user_id  -- Table removed
        JOIN player_stats us ON u.id = us.user_id
        WHERE us.games_played >= 5
        ORDER BY rating DESC
        LIMIT $1
      `,
        [limit],
      )

      return result.rows.map((row: RawLeaderboardRow, index: number) => ({
        userId: row.user_id,
        username: row.username,
        avatarUrl: row.avatar_url ?? undefined,
        rank: index + 1,
        rating: row.rating,
        gamesWon: row.games_won,
        winRate: Math.round(row.win_rate),
        level: row.level,
      }))
    } finally {
      if (client.release) client.release()
    }
  }

  // Helper methods
  private createDefaultProfile(userId: string): UserProfile {
    return {
      userId,
      joinDate: new Date(),
      lastActive: new Date(),
      preferences: {},
      level: 1,
      experiencePoints: 0,
      totalPlaytime: 0,
      currentStreak: 0,
      longestStreak: 0,
    }
  }

  private createDefaultStats(userId: string): UserStatistics {
    return {
      userId,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesAbandoned: 0,
      territoriesConquered: 0,
      battlesWon: 0,
      battlesLost: 0,
      continentsControlled: 0,
      averageGameLength: 0,
      longestGame: 0,
      shortestGame: 0,
      bestTurnTime: 0,
      mapsCreated: 0,
      mapsRated: 0,
      tournamentsJoined: 0,
      tournamentsWon: 0,
      updatedAt: new Date(),
    }
  }

  private createDefaultPreferences(userId: string): UserPreferences {
    return {
      userId,
      theme: 'dark',
      language: 'en',
      timezone: 'UTC',
      notificationsEnabled: true,
      emailNotifications: true,
      soundEffects: true,
      backgroundMusic: true,
      autoSaveFrequency: 30,
      animationSpeed: 'normal',
      showTerritoryNames: true,
      showArmyCounts: true,
      confirmActions: true,
      privacyLevel: 'public',
      allowFriendRequests: true,
      showOnlineStatus: true,
      updatedAt: new Date(),
    }
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  }
}

export const profileService = new ProfileService()
