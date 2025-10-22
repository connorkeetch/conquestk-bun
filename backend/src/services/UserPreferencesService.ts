/**
 * @fileoverview This file defines the UserPreferencesService class, which is responsible for managing user preferences in the database.
 * It handles getting, creating, and updating user preferences, and is designed to be backward compatible with older database schemas
 * by dynamically checking for column existence and providing default values.
 * @module services/UserPreferencesService
 */
import type { ThemeId } from '@conquestk/shared/types/themes'
import { DEFAULT_THEME_ID, normalizeThemeId } from '@conquestk/shared/types/themes'
import type { Pool } from 'pg'
import { logger } from '../utils/logger.js'

/**
 * An interface representing a user's preferences.
 * @interface UserPreferences
 */
export interface UserPreferences {
  userId: string
  theme: ThemeId
  soundEnabled: boolean
  musicEnabled: boolean
  notificationEnabled: boolean
  dmNotificationsBrowser?: boolean
  dmNotificationsEmail?: boolean
  autoReady: boolean
  showTimer: boolean
  showArmyNumbers: boolean
  animationSpeed: 'slow' | 'normal' | 'fast'
  language: string
}

/**
 * A service class for managing user preferences.
 * @class UserPreferencesService
 */
export class UserPreferencesService {
  /**
   * Creates an instance of UserPreferencesService.
   * @param {Pool} pool - The PostgreSQL connection pool.
   */
  constructor(private pool: Pool) {}

  /**
   * Retrieves the preferences for a given user.
   * If no preferences are found, it creates and returns default preferences.
   * This method is backward compatible and will provide default values for columns that may not exist in older schemas.
   * @param {string} userId - The ID of the user.
   * @returns {Promise<UserPreferences | null>} A promise that resolves to the user's preferences, or null if an error occurs.
   */
  async getPreferences(userId: string): Promise<UserPreferences | null> {
    try {
      // First check what columns exist
      const columnsResult = await this.pool.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'user_preferences' AND table_schema = 'public'`,
      )
      const existingColumns = columnsResult.rows.map((r) => r.column_name)

      // Build dynamic SELECT based on what exists
      const selectFields = []
      selectFields.push('user_id as "userId"')
      selectFields.push('theme')

      // Add audio columns if they exist
      if (existingColumns.includes('sound_enabled')) {
        selectFields.push('sound_enabled as "soundEnabled"')
      } else {
        selectFields.push('true as "soundEnabled"') // Default value
      }

      if (existingColumns.includes('music_enabled')) {
        selectFields.push('music_enabled as "musicEnabled"')
      } else {
        selectFields.push('true as "musicEnabled"') // Default value
      }

      // Add other columns with defaults if missing
      if (existingColumns.includes('notification_enabled')) {
        selectFields.push('notification_enabled as "notificationEnabled"')
      } else {
        selectFields.push('true as "notificationEnabled"')
      }

      if (existingColumns.includes('dm_notifications_browser')) {
        selectFields.push('dm_notifications_browser as "dmNotificationsBrowser"')
      } else {
        selectFields.push('true as "dmNotificationsBrowser"')
      }

      if (existingColumns.includes('dm_notifications_email')) {
        selectFields.push('dm_notifications_email as "dmNotificationsEmail"')
      } else {
        selectFields.push('false as "dmNotificationsEmail"')
      }

      if (existingColumns.includes('auto_ready')) {
        selectFields.push('auto_ready as "autoReady"')
      } else {
        selectFields.push('false as "autoReady"')
      }

      if (existingColumns.includes('show_timer')) {
        selectFields.push('show_timer as "showTimer"')
      } else {
        selectFields.push('true as "showTimer"')
      }

      if (existingColumns.includes('show_army_numbers')) {
        selectFields.push('show_army_numbers as "showArmyNumbers"')
      } else {
        selectFields.push('true as "showArmyNumbers"')
      }

      if (existingColumns.includes('animation_speed')) {
        selectFields.push('animation_speed as "animationSpeed"')
      } else {
        selectFields.push('\'normal\' as "animationSpeed"')
      }

      if (existingColumns.includes('language')) {
        selectFields.push('language')
      } else {
        selectFields.push('\'en\' as "language"')
      }

      const result = await this.pool.query(
        `SELECT ${selectFields.join(', ')}
        FROM user_preferences
        WHERE user_id = $1`,
        [userId],
      )

      if (result.rows.length === 0) {
        // Create default preferences if none exist
        return this.createDefaultPreferences(userId)
      }

      const updatedPreferences = result.rows[0] as UserPreferences

      return {
        ...updatedPreferences,
        theme: normalizeThemeId(updatedPreferences.theme),
      }
    } catch (error) {
      logger.error('❌ Error fetching user preferences', { userId, error })
      return null
    }
  }

  /**
   * Updates the preferences for a given user.
   * If the user does not have existing preferences, it creates them.
   * @param {string} userId - The ID of the user.
   * @param {Partial<UserPreferences>} preferences - An object containing the preferences to update.
   * @returns {Promise<UserPreferences | null>} A promise that resolves to the updated preferences, or null if an error occurs.
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<UserPreferences>,
  ): Promise<UserPreferences | null> {
    try {
      // Build dynamic update query
      const updates: string[] = []
      const values: Array<string | boolean | number> = []
      let paramIndex = 1

      if (preferences.theme !== undefined) {
        updates.push(`theme = $${paramIndex++}`)
        values.push(normalizeThemeId(preferences.theme))
      }
      if (preferences.soundEnabled !== undefined) {
        updates.push(`sound_enabled = $${paramIndex++}`)
        values.push(preferences.soundEnabled)
      }
      if (preferences.musicEnabled !== undefined) {
        updates.push(`music_enabled = $${paramIndex++}`)
        values.push(preferences.musicEnabled)
      }
      if (preferences.notificationEnabled !== undefined) {
        updates.push(`notification_enabled = $${paramIndex++}`)
        values.push(preferences.notificationEnabled)
      }
      if (preferences.dmNotificationsBrowser !== undefined) {
        updates.push(`dm_notifications_browser = $${paramIndex++}`)
        values.push(preferences.dmNotificationsBrowser)
      }
      if (preferences.dmNotificationsEmail !== undefined) {
        updates.push(`dm_notifications_email = $${paramIndex++}`)
        values.push(preferences.dmNotificationsEmail)
      }
      if (preferences.autoReady !== undefined) {
        updates.push(`auto_ready = $${paramIndex++}`)
        values.push(preferences.autoReady)
      }
      if (preferences.showTimer !== undefined) {
        updates.push(`show_timer = $${paramIndex++}`)
        values.push(preferences.showTimer)
      }
      if (preferences.showArmyNumbers !== undefined) {
        updates.push(`show_army_numbers = $${paramIndex++}`)
        values.push(preferences.showArmyNumbers)
      }
      if (preferences.animationSpeed !== undefined) {
        updates.push(`animation_speed = $${paramIndex++}`)
        values.push(preferences.animationSpeed)
      }
      if (preferences.language !== undefined) {
        updates.push(`language = $${paramIndex++}`)
        values.push(preferences.language)
      }

      if (updates.length === 0) {
        return this.getPreferences(userId)
      }

      values.push(userId)

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
        values,
      )

      if (result.rows.length === 0) {
        // If no row exists, create one with the preferences
        return this.createDefaultPreferences(userId, preferences)
      }

      const createdPreferences = result.rows[0] as UserPreferences

      return {
        ...createdPreferences,
        theme: normalizeThemeId(createdPreferences.theme),
      }
    } catch (error) {
      logger.error('❌ Error updating user preferences', {
        userId,
        preferences,
        error,
      })
      return null
    }
  }

  /**
   * Updates the theme for a given user.
   * @param {string} userId - The ID of the user.
   * @param {string} theme - The theme to set.
   * @returns {Promise<ThemeId | null>} A promise that resolves to the updated theme ID, or null if an error occurs.
   */
  async updateTheme(userId: string, theme: string): Promise<ThemeId | null> {
    try {
      const normalizedTheme = normalizeThemeId(theme)
      const result = await this.updatePreferences(userId, { theme: normalizedTheme })

      if (!result) {
        return null
      }

      return normalizeThemeId(result.theme)
    } catch (error) {
      logger.error('❌ Error updating theme preference', {
        userId,
        theme,
        error,
      })
      return null
    }
  }

  /**
   * Creates default preferences for a new user, or for a user who doesn't have any preferences set.
   * This method will also apply any overrides provided.
   * @private
   * @param {string} userId - The ID of the user.
   * @param {Partial<UserPreferences>} [overrides={}] - An object with preference values to override the defaults.
   * @returns {Promise<UserPreferences>} A promise that resolves to the newly created preferences.
   */
  private async createDefaultPreferences(
    userId: string,
    overrides: Partial<UserPreferences> = {},
  ): Promise<UserPreferences> {
    try {
      const defaults: UserPreferences = {
        userId,
        theme: normalizeThemeId(overrides.theme ?? DEFAULT_THEME_ID),
        soundEnabled: overrides.soundEnabled ?? true,
        musicEnabled: overrides.musicEnabled ?? true,
        notificationEnabled: overrides.notificationEnabled ?? true,
        dmNotificationsBrowser: overrides.dmNotificationsBrowser ?? true,
        dmNotificationsEmail: overrides.dmNotificationsEmail ?? false,
        autoReady: overrides.autoReady ?? false,
        showTimer: overrides.showTimer ?? true,
        showArmyNumbers: overrides.showArmyNumbers ?? true,
        animationSpeed: overrides.animationSpeed ?? 'normal',
        language: overrides.language ?? 'en',
      }

      const result = await this.pool.query(
        `INSERT INTO user_preferences (
          user_id, theme, sound_enabled, music_enabled,
          notification_enabled, dm_notifications_browser, dm_notifications_email,
          auto_ready, show_timer,
          show_army_numbers, animation_speed, language
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (user_id) DO UPDATE
        SET 
          theme = EXCLUDED.theme,
          sound_enabled = EXCLUDED.sound_enabled,
          music_enabled = EXCLUDED.music_enabled,
          notification_enabled = EXCLUDED.notification_enabled,
          dm_notifications_browser = EXCLUDED.dm_notifications_browser,
          dm_notifications_email = EXCLUDED.dm_notifications_email,
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
          dm_notifications_browser as "dmNotificationsBrowser",
          dm_notifications_email as "dmNotificationsEmail",
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
          defaults.dmNotificationsBrowser,
          defaults.dmNotificationsEmail,
          defaults.autoReady,
          defaults.showTimer,
          defaults.showArmyNumbers,
          defaults.animationSpeed,
          defaults.language,
        ],
      )

      const createdPreferences = result.rows[0] as UserPreferences

      return {
        ...createdPreferences,
        theme: normalizeThemeId(createdPreferences.theme),
      }
    } catch (error) {
      logger.error('❌ Error creating default preferences', {
        userId,
        overrides,
        error,
      })
      // Return in-memory defaults as fallback
      return {
        userId,
        theme: normalizeThemeId(overrides.theme ?? DEFAULT_THEME_ID),
        soundEnabled: overrides.soundEnabled ?? true,
        musicEnabled: overrides.musicEnabled ?? true,
        notificationEnabled: overrides.notificationEnabled ?? true,
        dmNotificationsBrowser: overrides.dmNotificationsBrowser ?? true,
        dmNotificationsEmail: overrides.dmNotificationsEmail ?? false,
        autoReady: overrides.autoReady ?? false,
        showTimer: overrides.showTimer ?? true,
        showArmyNumbers: overrides.showArmyNumbers ?? true,
        animationSpeed: overrides.animationSpeed ?? 'normal',
        language: overrides.language ?? 'en',
      }
    }
  }
}
