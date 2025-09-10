import type { Pool } from 'pg';

export interface UserPreferences {
  userId: number;
  theme: string;
  soundEnabled: boolean;
  musicEnabled: boolean;
  notificationEnabled: boolean;
  autoReady: boolean;
  showTimer: boolean;
  showArmyNumbers: boolean;
  animationSpeed: 'slow' | 'normal' | 'fast';
  language: string;
}

export class UserPreferencesService {
  constructor(private pool: Pool) {}

  async getPreferences(userId: number): Promise<UserPreferences | null> {
    try {
      const result = await this.pool.query(
        `SELECT 
          user_id as "userId",
          theme,
          sound_enabled as "soundEnabled",
          music_enabled as "musicEnabled",
          notification_enabled as "notificationEnabled",
          auto_ready as "autoReady",
          show_timer as "showTimer",
          show_army_numbers as "showArmyNumbers",
          animation_speed as "animationSpeed",
          language
        FROM user_preferences
        WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        // Create default preferences if none exist
        return this.createDefaultPreferences(userId);
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return null;
    }
  }

  async updatePreferences(
    userId: number,
    preferences: Partial<UserPreferences>
  ): Promise<UserPreferences | null> {
    try {
      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (preferences.theme !== undefined) {
        updates.push(`theme = $${paramIndex++}`);
        values.push(preferences.theme);
      }
      if (preferences.soundEnabled !== undefined) {
        updates.push(`sound_enabled = $${paramIndex++}`);
        values.push(preferences.soundEnabled);
      }
      if (preferences.musicEnabled !== undefined) {
        updates.push(`music_enabled = $${paramIndex++}`);
        values.push(preferences.musicEnabled);
      }
      if (preferences.notificationEnabled !== undefined) {
        updates.push(`notification_enabled = $${paramIndex++}`);
        values.push(preferences.notificationEnabled);
      }
      if (preferences.autoReady !== undefined) {
        updates.push(`auto_ready = $${paramIndex++}`);
        values.push(preferences.autoReady);
      }
      if (preferences.showTimer !== undefined) {
        updates.push(`show_timer = $${paramIndex++}`);
        values.push(preferences.showTimer);
      }
      if (preferences.showArmyNumbers !== undefined) {
        updates.push(`show_army_numbers = $${paramIndex++}`);
        values.push(preferences.showArmyNumbers);
      }
      if (preferences.animationSpeed !== undefined) {
        updates.push(`animation_speed = $${paramIndex++}`);
        values.push(preferences.animationSpeed);
      }
      if (preferences.language !== undefined) {
        updates.push(`language = $${paramIndex++}`);
        values.push(preferences.language);
      }

      if (updates.length === 0) {
        return this.getPreferences(userId);
      }

      values.push(userId);
      
      const result = await this.pool.query(
        `UPDATE user_preferences
        SET ${updates.join(', ')}
        WHERE user_id = $${paramIndex}
        RETURNING 
          user_id as "userId",
          theme,
          sound_enabled as "soundEnabled",
          music_enabled as "musicEnabled",
          notification_enabled as "notificationEnabled",
          auto_ready as "autoReady",
          show_timer as "showTimer",
          show_army_numbers as "showArmyNumbers",
          animation_speed as "animationSpeed",
          language`,
        values
      );

      if (result.rows.length === 0) {
        // If no row exists, create one with the preferences
        return this.createDefaultPreferences(userId, preferences);
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error updating user preferences:', error);
      return null;
    }
  }

  async updateTheme(userId: number, theme: string): Promise<boolean> {
    try {
      const result = await this.updatePreferences(userId, { theme });
      return result !== null;
    } catch (error) {
      console.error('Error updating theme:', error);
      return false;
    }
  }

  private async createDefaultPreferences(
    userId: number,
    overrides: Partial<UserPreferences> = {}
  ): Promise<UserPreferences> {
    try {
      const defaults = {
        theme: 'default',
        soundEnabled: true,
        musicEnabled: true,
        notificationEnabled: true,
        autoReady: false,
        showTimer: true,
        showArmyNumbers: true,
        animationSpeed: 'normal' as const,
        language: 'en',
        ...overrides
      };

      const result = await this.pool.query(
        `INSERT INTO user_preferences (
          user_id, theme, sound_enabled, music_enabled,
          notification_enabled, auto_ready, show_timer,
          show_army_numbers, animation_speed, language
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id) DO UPDATE
        SET 
          theme = EXCLUDED.theme,
          sound_enabled = EXCLUDED.sound_enabled,
          music_enabled = EXCLUDED.music_enabled,
          notification_enabled = EXCLUDED.notification_enabled,
          auto_ready = EXCLUDED.auto_ready,
          show_timer = EXCLUDED.show_timer,
          show_army_numbers = EXCLUDED.show_army_numbers,
          animation_speed = EXCLUDED.animation_speed,
          language = EXCLUDED.language
        RETURNING 
          user_id as "userId",
          theme,
          sound_enabled as "soundEnabled",
          music_enabled as "musicEnabled",
          notification_enabled as "notificationEnabled",
          auto_ready as "autoReady",
          show_timer as "showTimer",
          show_army_numbers as "showArmyNumbers",
          animation_speed as "animationSpeed",
          language`,
        [
          userId,
          defaults.theme,
          defaults.soundEnabled,
          defaults.musicEnabled,
          defaults.notificationEnabled,
          defaults.autoReady,
          defaults.showTimer,
          defaults.showArmyNumbers,
          defaults.animationSpeed,
          defaults.language
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error creating default preferences:', error);
      // Return in-memory defaults as fallback
      return {
        userId,
        theme: 'default',
        soundEnabled: true,
        musicEnabled: true,
        notificationEnabled: true,
        autoReady: false,
        showTimer: true,
        showArmyNumbers: true,
        animationSpeed: 'normal',
        language: 'en',
        ...overrides
      };
    }
  }
}