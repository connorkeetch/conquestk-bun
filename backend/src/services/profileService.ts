import { getClient } from '../config/database';
import { 
  UserProfile, 
  UserStatistics, 
  UserAchievement, 
  GameHistoryEntry, 
  UserPreferences,
  ProfileUpdateRequest,
  ProfileResponse,
  UserRanking,
  StatsBreakdown,
  Achievement
} from '../types/profile';

export class ProfileService {
  
  // Get complete user profile with all related data
  async getUserProfile(userId: string): Promise<ProfileResponse> {
    const client = await getClient();
    
    try {
      // Get profile data
      const profileResult = await client.query(
        'SELECT * FROM user_profiles WHERE user_id = ?',
        [userId]
      );
      
      // Get statistics
      const statsResult = await client.query(
        'SELECT * FROM user_statistics WHERE user_id = ?',
        [userId]
      );
      
      // Get achievements with details
      const achievementsResult = await client.query(`
        SELECT ua.*, a.name, a.description, a.icon_emoji, a.category, a.points, a.rarity
        FROM user_achievements ua
        JOIN achievements a ON ua.achievement_id = a.id
        WHERE ua.user_id = ?
        ORDER BY ua.unlocked_at DESC
      `, [userId]);
      
      // Get recent games
      const recentGamesResult = await client.query(
        'SELECT * FROM game_history WHERE user_id = ? ORDER BY started_at DESC LIMIT 10',
        [userId]
      );
      
      // Get preferences
      const preferencesResult = await client.query(
        'SELECT * FROM user_preferences WHERE user_id = ?',
        [userId]
      );
      
      return {
        profile: profileResult.rows[0] || this.createDefaultProfile(userId),
        statistics: statsResult.rows[0] || this.createDefaultStats(userId),
        achievements: achievementsResult.rows || [],
        recentGames: recentGamesResult.rows || [],
        preferences: preferencesResult.rows[0] || this.createDefaultPreferences(userId)
      };
    } finally {
      if (client.release) client.release();
    }
  }
  
  // Update user profile
  async updateProfile(userId: string, updates: ProfileUpdateRequest): Promise<UserProfile> {
    const client = await getClient();
    
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      
      if (updates.avatarUrl !== undefined) {
        updateFields.push('avatar_url = ?');
        values.push(updates.avatarUrl);
      }
      
      if (updates.bio !== undefined) {
        updateFields.push('bio = ?');
        values.push(updates.bio);
      }
      
      if (updates.preferences) {
        updateFields.push('preferences = ?');
        values.push(JSON.stringify(updates.preferences));
      }
      
      updateFields.push('last_active = CURRENT_TIMESTAMP');
      values.push(userId);
      
      const query = `
        UPDATE user_profiles 
        SET ${updateFields.join(', ')} 
        WHERE user_id = ?
      `;
      
      await client.query(query, values);
      
      // Return updated profile
      const result = await client.query(
        'SELECT * FROM user_profiles WHERE user_id = ?',
        [userId]
      );
      
      return result.rows[0];
    } finally {
      if (client.release) client.release();
    }
  }
  
  // Get user statistics with breakdowns
  async getUserStats(userId: string): Promise<StatsBreakdown> {
    const client = await getClient();
    
    try {
      // Overall stats
      const overallResult = await client.query(
        'SELECT * FROM user_statistics WHERE user_id = ?',
        [userId]
      );
      
      // Stats by map
      const mapStatsResult = await client.query(`
        SELECT 
          map_name,
          COUNT(*) as games_played,
          SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as games_won,
          AVG(duration) as avg_duration,
          MAX(max_territories) as best_territories
        FROM game_history 
        WHERE user_id = ? 
        GROUP BY map_name
      `, [userId]);
      
      // Stats by game mode
      const modeStatsResult = await client.query(`
        SELECT 
          game_mode,
          COUNT(*) as games_played,
          SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as games_won,
          AVG(duration) as avg_duration
        FROM game_history 
        WHERE user_id = ? 
        GROUP BY game_mode
      `, [userId]);
      
      // Timeline data (last 30 days)
      const timelineResult = await client.query(`
        SELECT 
          DATE(started_at) as date,
          COUNT(*) as games_played,
          SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as games_won,
          SUM(duration) as playtime
        FROM game_history 
        WHERE user_id = ? AND started_at >= datetime('now', '-30 days')
        GROUP BY DATE(started_at)
        ORDER BY date DESC
      `, [userId]);
      
      const byMap: Record<string, any> = {};
      mapStatsResult.rows.forEach((row: any) => {
        byMap[row.map_name] = {
          gamesPlayed: row.games_played,
          gamesWon: row.games_won,
          averageGameLength: row.avg_duration,
          bestTerritories: row.best_territories
        };
      });
      
      const byGameMode: Record<string, any> = {};
      modeStatsResult.rows.forEach((row: any) => {
        byGameMode[row.game_mode] = {
          gamesPlayed: row.games_played,
          gamesWon: row.games_won,
          averageGameLength: row.avg_duration
        };
      });
      
      return {
        overall: overallResult.rows[0] || this.createDefaultStats(userId),
        byMap,
        byGameMode,
        timeline: timelineResult.rows || []
      };
    } finally {
      if (client.release) client.release();
    }
  }
  
  // Get available achievements and user progress
  async getAchievements(userId: string): Promise<{ unlocked: UserAchievement[], available: Achievement[] }> {
    const client = await getClient();
    
    try {
      // Get unlocked achievements
      const unlockedResult = await client.query(`
        SELECT ua.*, a.name, a.description, a.icon_emoji, a.category, a.points, a.rarity
        FROM user_achievements ua
        JOIN achievements a ON ua.achievement_id = a.id
        WHERE ua.user_id = ?
        ORDER BY ua.unlocked_at DESC
      `, [userId]);
      
      // Get all available achievements
      const availableResult = await client.query(`
        SELECT a.* FROM achievements a
        WHERE a.is_hidden = FALSE
        ORDER BY a.category, a.points
      `);
      
      return {
        unlocked: unlockedResult.rows || [],
        available: availableResult.rows || []
      };
    } finally {
      if (client.release) client.release();
    }
  }
  
  // Unlock achievement for user
  async unlockAchievement(userId: string, achievementId: string): Promise<UserAchievement> {
    const client = await getClient();
    
    try {
      // Check if already unlocked
      const existing = await client.query(
        'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?',
        [userId, achievementId]
      );
      
      if (existing.rows.length > 0) {
        return existing.rows[0];
      }
      
      // Insert new achievement
      await client.query(`
        INSERT INTO user_achievements (user_id, achievement_id)
        VALUES (?, ?)
      `, [userId, achievementId]);
      
      // Get achievement details
      const result = await client.query(`
        SELECT ua.*, a.name, a.description, a.icon_emoji, a.category, a.points, a.rarity
        FROM user_achievements ua
        JOIN achievements a ON ua.achievement_id = a.id
        WHERE ua.user_id = ? AND ua.achievement_id = ?
      `, [userId, achievementId]);
      
      // Update user experience points
      const achievement = await client.query(
        'SELECT points FROM achievements WHERE id = ?',
        [achievementId]
      );
      
      if (achievement.rows.length > 0) {
        await client.query(`
          UPDATE user_profiles 
          SET experience_points = experience_points + ?
          WHERE user_id = ?
        `, [achievement.rows[0].points, userId]);
      }
      
      return result.rows[0];
    } finally {
      if (client.release) client.release();
    }
  }
  
  // Get game history with pagination
  async getGameHistory(userId: string, limit: number = 50, offset: number = 0): Promise<GameHistoryEntry[]> {
    const client = await getClient();
    
    try {
      const result = await client.query(`
        SELECT * FROM game_history 
        WHERE user_id = ? 
        ORDER BY started_at DESC 
        LIMIT ? OFFSET ?
      `, [userId, limit, offset]);
      
      return result.rows || [];
    } finally {
      if (client.release) client.release();
    }
  }
  
  // Update user preferences
  async updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    const client = await getClient();
    
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      
      Object.keys(preferences).forEach(key => {
        if (key !== 'userId' && preferences[key as keyof UserPreferences] !== undefined) {
          updateFields.push(`${this.camelToSnake(key)} = ?`);
          values.push(preferences[key as keyof UserPreferences]);
        }
      });
      
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);
      
      const query = `
        UPDATE user_preferences 
        SET ${updateFields.join(', ')} 
        WHERE user_id = ?
      `;
      
      await client.query(query, values);
      
      // Return updated preferences
      const result = await client.query(
        'SELECT * FROM user_preferences WHERE user_id = ?',
        [userId]
      );
      
      return result.rows[0];
    } finally {
      if (client.release) client.release();
    }
  }
  
  // Get global leaderboard
  async getLeaderboard(limit: number = 100): Promise<UserRanking[]> {
    const client = await getClient();
    
    try {
      const result = await client.query(`
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
        JOIN user_profiles up ON u.id = up.user_id
        JOIN user_statistics us ON u.id = us.user_id
        WHERE us.games_played >= 5
        ORDER BY rating DESC
        LIMIT ?
      `, [limit]);
      
      return result.rows.map((row: any, index: number) => ({
        userId: row.user_id,
        username: row.username,
        avatarUrl: row.avatar_url,
        rank: index + 1,
        rating: row.rating,
        gamesWon: row.games_won,
        winRate: Math.round(row.win_rate),
        level: row.level
      }));
    } finally {
      if (client.release) client.release();
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
      longestStreak: 0
    };
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
      updatedAt: new Date()
    };
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
      updatedAt: new Date()
    };
  }
  
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

export const profileService = new ProfileService();