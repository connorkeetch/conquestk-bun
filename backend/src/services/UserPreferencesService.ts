import type { ThemeId } from '@conquestk/shared/types/themes'
import { DEFAULT_THEME_ID, normalizeThemeId } from '@conquestk/shared/types/themes'
import type { Pool } from 'pg'
import { logger } from '../utils/logger.js'

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

export class UserPreferencesService {
  constructor(private pool: Pool) {}

  async getPreferences(userId: string): Promise<UserPreferences | null> {
    try {
      const existingColumns = await this.getExistingColumns()
      const selectFields = this.buildSelectFields(existingColumns)

      const result = await this.pool.query(
        `SELECT ${selectFields.join(', ')}
        FROM user_preferences
        WHERE user_id = $1`,
        [userId],
      )

      if (result.rows.length === 0) {
        // Create default preferences if none exist
        return this.createDefaultPreferences(userId, {}, existingColumns)
      }

      const row = result.rows[0] as Partial<UserPreferences> & { userId: string }

      return this.mapRowToPreferences(row)
    } catch (error) {
      logger.error('❌ Error fetching user preferences', { userId, error })
      return null
    }
  }

  async updatePreferences(
    userId: string,
    preferences: Partial<UserPreferences>,
  ): Promise<UserPreferences | null> {
    try {
      const existingColumns = await this.getExistingColumns()

      // Build dynamic update query
      const updates: string[] = []
      const values: Array<string | boolean | number> = []
      let paramIndex = 1

      if (preferences.theme !== undefined && existingColumns.has('theme')) {
        updates.push(`theme = $${paramIndex++}`)
        values.push(normalizeThemeId(preferences.theme))
      }
      if (preferences.soundEnabled !== undefined && existingColumns.has('sound_enabled')) {
        updates.push(`sound_enabled = $${paramIndex++}`)
        values.push(preferences.soundEnabled)
      }
      if (preferences.musicEnabled !== undefined && existingColumns.has('music_enabled')) {
        updates.push(`music_enabled = $${paramIndex++}`)
        values.push(preferences.musicEnabled)
      }
      if (
        preferences.notificationEnabled !== undefined &&
        existingColumns.has('notification_enabled')
      ) {
        updates.push(`notification_enabled = $${paramIndex++}`)
        values.push(preferences.notificationEnabled)
      }
      if (
        preferences.dmNotificationsBrowser !== undefined &&
        existingColumns.has('dm_notifications_browser')
      ) {
        updates.push(`dm_notifications_browser = $${paramIndex++}`)
        values.push(preferences.dmNotificationsBrowser)
      }
      if (
        preferences.dmNotificationsEmail !== undefined &&
        existingColumns.has('dm_notifications_email')
      ) {
        updates.push(`dm_notifications_email = $${paramIndex++}`)
        values.push(preferences.dmNotificationsEmail)
      }
      if (preferences.autoReady !== undefined && existingColumns.has('auto_ready')) {
        updates.push(`auto_ready = $${paramIndex++}`)
        values.push(preferences.autoReady)
      }
      if (preferences.showTimer !== undefined && existingColumns.has('show_timer')) {
        updates.push(`show_timer = $${paramIndex++}`)
        values.push(preferences.showTimer)
      }
      if (preferences.showArmyNumbers !== undefined && existingColumns.has('show_army_numbers')) {
        updates.push(`show_army_numbers = $${paramIndex++}`)
        values.push(preferences.showArmyNumbers)
      }
      if (preferences.animationSpeed !== undefined && existingColumns.has('animation_speed')) {
        updates.push(`animation_speed = $${paramIndex++}`)
        values.push(preferences.animationSpeed)
      }
      if (preferences.language !== undefined && existingColumns.has('language')) {
        updates.push(`language = $${paramIndex++}`)
        values.push(preferences.language)
      }

      if (updates.length === 0) {
        return this.getPreferences(userId)
      }

      values.push(userId)

      const returningFields = this.buildSelectFields(existingColumns)

      const result = await this.pool.query(
        `UPDATE user_preferences
        SET ${updates.join(', ')}
        WHERE user_id = $${paramIndex}
        RETURNING ${returningFields.join(', ')}`,
        values,
      )

      if (result.rows.length === 0) {
        // If no row exists, create one with the preferences
        return this.createDefaultPreferences(userId, preferences, existingColumns)
      }

      const createdPreferences = result.rows[0] as Partial<UserPreferences> & { userId: string }

      return this.mapRowToPreferences(createdPreferences)
    } catch (error) {
      logger.error('❌ Error updating user preferences', {
        userId,
        preferences,
        error,
      })
      return null
    }
  }

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

  private async createDefaultPreferences(
    userId: string,
    overrides: Partial<UserPreferences> = {},
    existingColumns?: Set<string>,
  ): Promise<UserPreferences> {
    try {
      const columnSet = existingColumns ?? (await this.getExistingColumns())
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

      const columns: string[] = ['user_id']
      const placeholders: string[] = ['$1']
      const values: unknown[] = [userId]
      const updatableColumns: string[] = []
      let paramIndex = 2

      const maybeIncludeColumn = (column: string, value: unknown) => {
        if (!columnSet.has(column)) {
          return
        }
        columns.push(column)
        placeholders.push(`$${paramIndex}`)
        values.push(value)
        updatableColumns.push(column)
        paramIndex++
      }

      maybeIncludeColumn('theme', defaults.theme)
      maybeIncludeColumn('sound_enabled', defaults.soundEnabled)
      maybeIncludeColumn('music_enabled', defaults.musicEnabled)
      maybeIncludeColumn('notification_enabled', defaults.notificationEnabled)
      maybeIncludeColumn('dm_notifications_browser', defaults.dmNotificationsBrowser)
      maybeIncludeColumn('dm_notifications_email', defaults.dmNotificationsEmail)
      maybeIncludeColumn('auto_ready', defaults.autoReady)
      maybeIncludeColumn('show_timer', defaults.showTimer)
      maybeIncludeColumn('show_army_numbers', defaults.showArmyNumbers)
      maybeIncludeColumn('animation_speed', defaults.animationSpeed)
      maybeIncludeColumn('language', defaults.language)

      const updateAssignments = updatableColumns
        .filter((column) => column !== 'user_id')
        .map((column) => `${column} = EXCLUDED.${column}`)

      const onConflictClause =
        updateAssignments.length > 0
          ? `DO UPDATE SET ${updateAssignments.join(', ')}`
          : 'DO NOTHING'

      await this.pool.query(
        `INSERT INTO user_preferences (${columns.join(', ')})
        VALUES (${placeholders.join(', ')})
        ON CONFLICT (user_id) ${onConflictClause}`,
        values,
      )

      return this.mapRowToPreferences(defaults)
    } catch (error) {
      logger.error('❌ Error creating default preferences', {
        userId,
        overrides,
        error,
      })
      // Return in-memory defaults as fallback
      return this.mapRowToPreferences({ userId, ...overrides })
    }
  }

  private async getExistingColumns(): Promise<Set<string>> {
    const result = await this.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'user_preferences' AND table_schema = 'public'`,
    )
    return new Set(result.rows.map((row) => row.column_name))
  }

  private buildSelectFields(existingColumns: Set<string>): string[] {
    const fields = ['user_id as "userId"']

    if (existingColumns.has('theme')) {
      fields.push('theme as "theme"')
    }
    if (existingColumns.has('sound_enabled')) {
      fields.push('sound_enabled as "soundEnabled"')
    }
    if (existingColumns.has('music_enabled')) {
      fields.push('music_enabled as "musicEnabled"')
    }
    if (existingColumns.has('notification_enabled')) {
      fields.push('notification_enabled as "notificationEnabled"')
    }
    if (existingColumns.has('dm_notifications_browser')) {
      fields.push('dm_notifications_browser as "dmNotificationsBrowser"')
    }
    if (existingColumns.has('dm_notifications_email')) {
      fields.push('dm_notifications_email as "dmNotificationsEmail"')
    }
    if (existingColumns.has('auto_ready')) {
      fields.push('auto_ready as "autoReady"')
    }
    if (existingColumns.has('show_timer')) {
      fields.push('show_timer as "showTimer"')
    }
    if (existingColumns.has('show_army_numbers')) {
      fields.push('show_army_numbers as "showArmyNumbers"')
    }
    if (existingColumns.has('animation_speed')) {
      fields.push('animation_speed as "animationSpeed"')
    }
    if (existingColumns.has('language')) {
      fields.push('language as "language"')
    }

    return fields
  }

  private mapRowToPreferences(row: Partial<UserPreferences> & { userId: string }): UserPreferences {
    return {
      userId: row.userId,
      theme: normalizeThemeId((row.theme as ThemeId | undefined) ?? DEFAULT_THEME_ID),
      soundEnabled: row.soundEnabled ?? true,
      musicEnabled: row.musicEnabled ?? true,
      notificationEnabled: row.notificationEnabled ?? true,
      dmNotificationsBrowser: row.dmNotificationsBrowser ?? true,
      dmNotificationsEmail: row.dmNotificationsEmail ?? false,
      autoReady: row.autoReady ?? false,
      showTimer: row.showTimer ?? true,
      showArmyNumbers: row.showArmyNumbers ?? true,
      animationSpeed:
        (row.animationSpeed as UserPreferences['animationSpeed'] | undefined) ?? 'normal',
      language: row.language ?? 'en',
    }
  }
}
