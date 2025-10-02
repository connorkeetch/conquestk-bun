import { normalizeThemeId, type ThemeId } from '@shared/types/themes'
import { logger } from '@/utils/logger'
import api from './api'

export interface UserPreferences {
  userId: number
  theme: string
  soundEnabled: boolean
  musicEnabled: boolean
  notificationEnabled: boolean
  autoReady: boolean
  showTimer: boolean
  showArmyNumbers: boolean
  animationSpeed: 'slow' | 'normal' | 'fast'
  language: string
}

class PreferencesService {
  async getPreferences(): Promise<UserPreferences | null> {
    try {
      const response = await api.get('/preferences')
      return response.data
    } catch (error) {
      logger.error('Failed to fetch preferences', error)
      return null
    }
  }

  async updatePreferences(preferences: Partial<UserPreferences>): Promise<UserPreferences | null> {
    try {
      const response = await api.put('/preferences', preferences)
      return response.data
    } catch (error) {
      logger.error('Failed to update preferences', error)
      return null
    }
  }

  async updateTheme(theme: string): Promise<ThemeId | null> {
    const normalizedTheme = normalizeThemeId(theme)

    try {
      const response = await api.put('/preferences/theme', { theme: normalizedTheme })
      const persistedTheme = response.data?.theme

      if (typeof persistedTheme === 'string') {
        return normalizeThemeId(persistedTheme)
      }

      // Fall back to the normalized theme we attempted to persist
      return normalizedTheme
    } catch (error) {
      logger.error('Failed to update theme', error)
      return null
    }
  }
}

export default new PreferencesService()
