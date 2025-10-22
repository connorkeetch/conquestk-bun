import { DEFAULT_THEME_ID, normalizeThemeId } from '@conquestk/shared/types/themes'
import type { QueryResultRow } from 'pg'
import { getPool, withClient } from '../config/database.js'
import type {
  Achievement,
  AggregatedStatsSummary,
  GameHistoryEntry,
  ProfileResponse,
  ProfileUpdateRequest,
  StatsBreakdown,
  UserAchievement,
  UserPreferences,
  UserProfile,
  UserRanking,
  UserStatistics,
} from '../types/profile.js'
import { validateBio } from '../utils/contentModeration.js'
import { logger } from '../utils/logger.js'
import { UserPreferencesService } from './UserPreferencesService.js'

interface RawLeaderboardRow {
  user_id: string
  username: string
  skill_rating: number
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
  best_territories: number | null
}

interface ModeStatsRow extends QueryResultRow {
  game_mode: string
  games_played: number
  games_won: number
  avg_duration: number | null
}

interface GameHistoryRow extends QueryResultRow {
  game_id: string
  game_name: string | null
  game_mode: string | null
  status: string
  result: string | null
  duration_minutes: number | string | null
  started_at: Date | null
  ended_at: Date | null
}

const mapGameHistoryRow = (row: GameHistoryRow): GameHistoryEntry => ({
  gameId: row.game_id,
  gameName: row.game_name ?? null,
  gameMode: row.game_mode ?? null,
  status: row.status,
  result: row.result === 'won' ? 'won' : 'lost',
  durationMinutes:
    typeof row.duration_minutes === 'number'
      ? row.duration_minutes
      : typeof row.duration_minutes === 'string'
        ? Number(row.duration_minutes)
        : null,
  startedAt: row.started_at ?? null,
  endedAt: row.ended_at ?? null,
})

type WritablePreferenceKey = Exclude<keyof UserPreferences, 'userId'>

const WRITABLE_PREFERENCE_KEYS: ReadonlyArray<WritablePreferenceKey> = [
  'theme',
  'soundEnabled',
  'musicEnabled',
  'notificationEnabled',
  'dmNotificationsBrowser',
  'dmNotificationsEmail',
  'autoReady',
  'showTimer',
  'showArmyNumbers',
  'animationSpeed',
  'language',
]

export class ProfileService {
  private preferencesService?: UserPreferencesService

  constructor(preferencesService?: UserPreferencesService) {
    this.preferencesService = preferencesService
  }

  // Get complete user profile with all related data
  async getUserProfile(userId: string): Promise<ProfileResponse> {
    const { profile, statistics, achievements, recentGames } = await withClient(async (client) => {
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
        SELECT ua.*, a.name, a.description, a.icon AS icon, a.category, a.points, a.rarity
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
        WHERE rp.user_id = $1 AND gr.status IN ('completed')
        ORDER BY gr.started_at DESC LIMIT 10`,
        [userId],
      )

      return {
        profile: profileResult.rows[0] || this.createDefaultProfile(userId),
        statistics: statsResult.rows[0] || this.createDefaultStats(userId),
        achievements: achievementsResult.rows || [],
        recentGames: (recentGamesResult.rows as GameHistoryRow[]).map(mapGameHistoryRow),
      }
    })

    const preferencesService = this.getPreferencesService()
    const preferences =
      (await preferencesService.getPreferences(userId)) || this.createDefaultPreferences(userId)

    return {
      profile,
      statistics,
      achievements,
      recentGames,
      preferences,
    }
  }

  // Update user profile
  async updateProfile(userId: string, updates: ProfileUpdateRequest): Promise<UserProfile> {
    await withClient(async (client) => {
      const updateClauses: string[] = []
      const values: unknown[] = []
      let paramIndex = 0

      if (updates.avatarUrl !== undefined) {
        updateClauses.push(`avatar_url = $${++paramIndex}`)
        values.push(updates.avatarUrl)
      }

      if (updates.bio !== undefined) {
        // Enforce server-side moderation and length limit
        const input = typeof updates.bio === 'string' ? updates.bio : ''
        const { ok, sanitized, error } = validateBio(input)
        if (!ok) {
          logger.warn('Bio update rejected by moderation', { userId, reason: error })
          const err = new Error(error || 'Invalid bio') as Error & {
            status?: number
            statusCode?: number
          }
          err.status = 400
          err.statusCode = 400
          throw err
        }
        const limited = sanitized.length > 160 ? sanitized.slice(0, 160) : sanitized
        updateClauses.push(`bio = $${++paramIndex}`)
        values.push(limited)
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
    })

    if (updates.preferences && Object.keys(updates.preferences).length > 0) {
      await this.updatePreferences(userId, updates.preferences)
    }

    const updatedProfile = await this.getUserProfile(userId)
    return updatedProfile.profile
  }

  // Get user statistics with breakdowns
  async getUserStats(userId: string): Promise<StatsBreakdown> {
    return await withClient(async (client) => {
      // Overall stats from aggregated table
      const overallResult = await client.query('SELECT * FROM player_stats WHERE user_id = $1', [
        userId,
      ])

      // Extended stats sourced from completed game results
      const bestResult = await client.query(
        `
        SELECT
          COALESCE(MAX(pgr.territories), 0) AS best_territories,
          COALESCE(MAX(pgr.armies), 0) AS best_armies
        FROM player_game_results pgr
        WHERE pgr.user_id = $1
      `,
        [userId],
      )

      const cardStatsResult = await client.query(
        `
        WITH combined AS (
          SELECT move_data
          FROM game_moves
          WHERE player_id = $1 AND move_type = 'trade_cards'
          UNION ALL
          SELECT move_data
          FROM game_move_archive
          WHERE player_id = $1 AND move_type = 'trade_cards'
        )
        SELECT
          COUNT(*)::INTEGER AS trade_count,
          COALESCE(
            SUM(
              CASE
                WHEN move_data ? 'cards' AND jsonb_typeof(move_data->'cards') = 'array'
                  THEN jsonb_array_length(move_data->'cards')
                WHEN move_data ? 'cardIds' AND jsonb_typeof(move_data->'cardIds') = 'array'
                  THEN jsonb_array_length(move_data->'cardIds')
                WHEN move_data ? 'cardCount' AND (move_data->>'cardCount') ~ '^[0-9]+$'
                  THEN (move_data->>'cardCount')::INTEGER
                ELSE 0
              END
            ),
            0
          )::INTEGER AS card_count
        FROM combined
      `,
        [userId],
      )

      // Stats by map using completed results
      const mapStatsResult = await client.query<MapStatsRow>(
        `
        SELECT
          COALESCE(m.name, 'Unknown Map') AS map_name,
          COUNT(*) AS games_played,
          SUM(CASE WHEN pgr.is_winner THEN 1 ELSE 0 END) AS games_won,
          AVG(COALESCE(gres.duration_seconds, 0)) / 60 AS avg_duration,
          MAX(pgr.territories) AS best_territories
        FROM player_game_results pgr
        JOIN game_results gres ON pgr.room_id = gres.room_id
        JOIN game_rooms gr ON pgr.room_id = gr.id
        LEFT JOIN maps m ON gr.map_id = m.id
        WHERE pgr.user_id = $1
        GROUP BY COALESCE(m.name, 'Unknown Map')
        ORDER BY games_played DESC
      `,
        [userId],
      )

      // Stats by game mode from completed results
      const modeStatsResult = await client.query<ModeStatsRow>(
        `
        SELECT
          gr.game_mode,
          COUNT(*) AS games_played,
          SUM(CASE WHEN pgr.is_winner THEN 1 ELSE 0 END) AS games_won,
          AVG(COALESCE(gres.duration_seconds, 0)) / 60 AS avg_duration
        FROM player_game_results pgr
        JOIN game_results gres ON pgr.room_id = gres.room_id
        JOIN game_rooms gr ON pgr.room_id = gr.id
        WHERE pgr.user_id = $1
        GROUP BY gr.game_mode
      `,
        [userId],
      )

      // Compute win streaks from historical results (ordered by creation time)
      const streakRows = await client.query<{ is_winner: boolean }>(
        `
        SELECT pgr.is_winner
        FROM player_game_results pgr
        JOIN game_results gres ON pgr.room_id = gres.room_id
        WHERE pgr.user_id = $1
        ORDER BY gres.created_at ASC
      `,
        [userId],
      )

      let longestWinStreak = 0
      let rolling = 0
      for (const row of streakRows.rows) {
        if (row.is_winner) {
          rolling += 1
          if (rolling > longestWinStreak) longestWinStreak = rolling
        } else {
          rolling = 0
        }
      }
      // current streak: count wins from most recent going backwards until first loss
      let currentWinStreak = 0
      for (let i = streakRows.rows.length - 1; i >= 0; i--) {
        const r = streakRows.rows[i]
        if (r.is_winner) currentWinStreak += 1
        else break
      }

      // Battle impact metrics from battle_log JSON: eliminations and conquests
      // Count total players eliminated by this user across all games
      const elimQuery = await client.query<{ eliminations: number }>(
        `
        SELECT COALESCE(SUM(jsonb_array_length(entry->'eliminatedPlayers')), 0)::int AS eliminations
        FROM game_results gres
        JOIN player_game_results pgr ON pgr.room_id = gres.room_id
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(gres.battle_log, '[]'::jsonb)) AS entry
        WHERE pgr.user_id = $1 AND (entry->>'attackerId') = ($1)::text
      `,
        [userId],
      )

      // Also include capital eliminations table (if populated)
      const capitalElims = await client.query<{ cnt: number }>(
        `
        SELECT COUNT(*)::int AS cnt
        FROM capital_eliminations ce
        WHERE ce.conqueror_player_id = $1
      `,
        [userId],
      )

      const totalEliminations =
        (elimQuery.rows[0]?.eliminations ?? 0) + (capitalElims.rows[0]?.cnt ?? 0)

      // Territories conquered = number of battle_log entries by this user where conquered=true
      const conqueredQuery = await client.query<{ conquests: number }>(
        `
        SELECT COALESCE(COUNT(*), 0)::int AS conquests
        FROM game_results gres
        JOIN player_game_results pgr ON pgr.room_id = gres.room_id
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(gres.battle_log, '[]'::jsonb)) AS entry
        WHERE pgr.user_id = $1 AND (entry->>'attackerId') = ($1)::text AND (entry->>'conquered')::boolean = TRUE
      `,
        [userId],
      )

      // Timeline data (last 90 days) using completed results
      const timelineResult = await client.query(
        `
        SELECT
          DATE(gres.created_at) AS date,
          COUNT(*) AS games_played,
          SUM(CASE WHEN pgr.is_winner THEN 1 ELSE 0 END) AS games_won,
          SUM(COALESCE(gres.duration_seconds, 0)) / 60 AS playtime
        FROM player_game_results pgr
        JOIN game_results gres ON pgr.room_id = gres.room_id
        WHERE pgr.user_id = $1
          AND gres.created_at >= NOW() - INTERVAL '90 days'
        GROUP BY DATE(gres.created_at)
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

      const overallStats = overallResult.rows[0] || this.createDefaultStats(userId)
      const bestStats = bestResult.rows[0] || { best_territories: 0, best_armies: 0 }
      const cardStats = cardStatsResult.rows[0] || { trade_count: 0, card_count: 0 }

      return {
        overall: {
          ...overallStats,
          // Ensure streaks and battle impact are present even if player_stats is sparse
          longest_win_streak:
            typeof (overallStats as Record<string, unknown>)?.longest_win_streak === 'number'
              ? (overallStats as Record<string, unknown>).longest_win_streak
              : longestWinStreak,
          current_win_streak:
            typeof (overallStats as Record<string, unknown>)?.current_win_streak === 'number'
              ? (overallStats as Record<string, unknown>).current_win_streak
              : currentWinStreak,
          total_eliminations:
            typeof (overallStats as Record<string, unknown>)?.total_eliminations === 'number'
              ? (overallStats as Record<string, unknown>).total_eliminations
              : totalEliminations,
          total_territories_conquered:
            typeof (overallStats as Record<string, unknown>)?.total_territories_conquered ===
            'number'
              ? (overallStats as Record<string, unknown>).total_territories_conquered
              : (conqueredQuery.rows[0]?.conquests ?? 0),
          best_territories: Number(bestStats.best_territories ?? 0),
          best_armies: Number(bestStats.best_armies ?? 0),
          card_trades: Number(cardStats.trade_count ?? 0),
          cards_traded: Number(cardStats.card_count ?? 0),
        },
        byMap,
        byGameMode,
        timeline: timelineResult.rows || [],
      }
    })
  }

  // Get available achievements and user progress
  async getAchievements(
    userId: string,
  ): Promise<{ unlocked: UserAchievement[]; available: Achievement[] }> {
    return await withClient(async (client) => {
      // Get unlocked achievements
      const unlockedResult = await client.query(
        `
        SELECT ua.*, a.name, a.description, a.icon AS icon, a.category, a.points, a.rarity
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
        WHERE a.is_secret = FALSE
        ORDER BY a.category, a.points
      `)

      return {
        unlocked: unlockedResult.rows || [],
        available: availableResult.rows || [],
      }
    })
  }

  // Unlock achievement for user
  async unlockAchievement(userId: string, achievementId: string): Promise<UserAchievement> {
    return await withClient(async (client) => {
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
        SELECT ua.*, a.name, a.description, a.icon AS icon, a.category, a.points, a.rarity
        FROM user_achievements ua
        JOIN achievements a ON ua.achievement_id = a.id
        WHERE ua.user_id = $1 AND ua.achievement_id = $2
      `,
        [userId, achievementId],
      )

      // XP update omitted (no experience_points column on users)

      const preferences = result.rows[0]

      if (preferences && typeof preferences.theme === 'string') {
        preferences.theme = normalizeThemeId(preferences.theme)
      }

      return preferences
    })
  }

  // Get game history with pagination
  async getGameHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<GameHistoryEntry[]> {
    return await withClient(async (client) => {
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
        WHERE rp.user_id = $1 AND gr.status IN ('completed')
        ORDER BY gr.started_at DESC 
        LIMIT $2 OFFSET $3
      `,
        [userId, limit, offset],
      )

      return (result.rows as GameHistoryRow[]).map(mapGameHistoryRow)
    })
  }

  // Update user preferences
  async updatePreferences(
    userId: string,
    preferences: Partial<UserPreferences> | Record<string, unknown>,
  ): Promise<UserPreferences> {
    const sanitized = this.sanitizePreferenceUpdates(preferences)

    const updated = await this.getPreferencesService().updatePreferences(userId, sanitized)
    if (updated) {
      return updated
    }

    // Fall back to in-memory defaults when persistence is unavailable
    const defaults = this.createDefaultPreferences(userId)
    return { ...defaults, ...sanitized }
  }

  // Get global leaderboard
  async getLeaderboard(limit: number = 100): Promise<UserRanking[]> {
    return await withClient(async (client) => {
      const result = await client.query(
        `
        SELECT
          u.id as user_id,
          u.username,
          u.skill_rating,
          us.games_won,
          us.games_played,
          CASE WHEN us.games_played > 0 THEN (us.games_won * 100.0 / us.games_played) ELSE 0 END as win_rate,
          (u.skill_rating + us.games_won * 5) as rating
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
        avatarUrl: undefined,
        rank: index + 1,
        rating: row.rating,
        gamesWon: row.games_won,
        gamesPlayed: row.games_played,
        winRate: Math.round(row.win_rate),
        level: Math.max(1, Math.floor((row.skill_rating ?? 0) / 100)),
      }))
    })
  }

  // Helper methods
  private getPreferencesService(): UserPreferencesService {
    if (!this.preferencesService) {
      this.preferencesService = new UserPreferencesService(getPool())
    }
    return this.preferencesService
  }

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
      sectorsControlled: 0,
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

  private sanitizePreferenceUpdates(
    preferences: Partial<UserPreferences> | Record<string, unknown>,
  ): Partial<UserPreferences> {
    if (!preferences || typeof preferences !== 'object') {
      return {}
    }

    const sanitized: Partial<UserPreferences> = {}

    for (const key of WRITABLE_PREFERENCE_KEYS) {
      const rawValue = (preferences as Record<string, unknown>)[key]
      if (rawValue === undefined) {
        continue
      }

      switch (key) {
        case 'theme':
          if (typeof rawValue === 'string') {
            sanitized.theme = normalizeThemeId(rawValue)
          }
          break
        case 'soundEnabled':
          if (typeof rawValue === 'boolean') {
            sanitized.soundEnabled = rawValue
          }
          break
        case 'musicEnabled':
          if (typeof rawValue === 'boolean') {
            sanitized.musicEnabled = rawValue
          }
          break
        case 'notificationEnabled':
          if (typeof rawValue === 'boolean') {
            sanitized.notificationEnabled = rawValue
          }
          break
        case 'dmNotificationsBrowser':
          if (typeof rawValue === 'boolean') {
            sanitized.dmNotificationsBrowser = rawValue
          }
          break
        case 'dmNotificationsEmail':
          if (typeof rawValue === 'boolean') {
            sanitized.dmNotificationsEmail = rawValue
          }
          break
        case 'autoReady':
          if (typeof rawValue === 'boolean') {
            sanitized.autoReady = rawValue
          }
          break
        case 'showTimer':
          if (typeof rawValue === 'boolean') {
            sanitized.showTimer = rawValue
          }
          break
        case 'showArmyNumbers':
          if (typeof rawValue === 'boolean') {
            sanitized.showArmyNumbers = rawValue
          }
          break
        case 'animationSpeed':
          if (rawValue === 'slow' || rawValue === 'normal' || rawValue === 'fast') {
            sanitized.animationSpeed = rawValue
          }
          break
        case 'language':
          if (typeof rawValue === 'string') {
            const trimmed = rawValue.trim()
            if (trimmed.length > 0 && trimmed.length <= 10) {
              sanitized.language = trimmed
            }
          }
          break
      }
    }

    return sanitized
  }

  private createDefaultPreferences(userId: string): UserPreferences {
    return {
      userId,
      theme: DEFAULT_THEME_ID,
      soundEnabled: true,
      musicEnabled: true,
      notificationEnabled: true,
      dmNotificationsBrowser: true,
      dmNotificationsEmail: false,
      autoReady: false,
      showTimer: true,
      showArmyNumbers: true,
      animationSpeed: 'normal',
      language: 'en',
    }
  }
}

export const profileService = new ProfileService()
