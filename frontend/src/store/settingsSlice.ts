import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { DEFAULT_THEME_ID, normalizeThemeId, type ThemeId } from '@shared/types/themes'
import type { PlayerColor } from '../constants/colors'
import preferencesService from '../services/preferencesService'
import { logger } from '../utils/logger'

// Theme types - Extended for multi-theme support
export type ColorTheme = ThemeId
export type StyleTheme = 'modern' | 'cowboy' | 'myspace' | 'minimal' | 'gaming'
export type Theme = ThemeId

// New theme system for future theme switching
export interface ThemeSettings {
  baseTheme: 'dark' | 'light' | 'highcontrast' // Core theme (dark/light)
  colorTheme: ColorTheme // Color palette
  styleTheme: StyleTheme // UI style/components
}

export type DMPermission = 'everyone' | 'friends' | 'nobody'

// Notification settings
export interface NotificationPrefs {
  turnNotifications: { browser: boolean; email: boolean }
  turnTimerWarning: { browser: boolean; email: boolean }
  gameInvites: { browser: boolean; email: boolean }
  gameEnded: { browser: boolean; email: boolean }
  directMessages: { browser: boolean; email: boolean }
}

type ServerNotificationsPayload = {
  enabled?: boolean
} & Partial<Record<keyof NotificationPrefs, { browser?: boolean; email?: boolean }>>

interface ServerSettingsPayload {
  theme?: string
  preferred_color?: string
  show_online_status?: boolean
  direct_messages?: string
  dm_notifications_browser?: boolean
  dm_notifications_email?: boolean
  notifications?: ServerNotificationsPayload | string
}

// Settings state interface
interface SettingsState {
  // Display Settings
  display: {
    theme: Theme
    colorblindMode?: boolean
  }

  // Audio Settings
  audio: {
    masterVolume: number
    sfxVolume: number
    musicVolume: number
  }

  // Game Settings
  game: {
    preferredColor: PlayerColor
  }

  // Performance Settings
  performance: {
    mode: boolean // true = performance mode (reduced visuals), false = quality mode
  }
  // Chat Settings
  chat?: {
    profanityFilter: boolean
  }

  // Privacy Settings
  privacy: {
    showOnlineStatus: boolean
    directMessages: DMPermission
  }

  // Notification Settings
  notifications: NotificationPrefs
}

// Default settings
const defaultSettings: SettingsState = {
  display: {
    theme: DEFAULT_THEME_ID,
    colorblindMode: false,
  },
  audio: {
    masterVolume: 75,
    sfxVolume: 80,
    musicVolume: 50,
  },
  game: {
    preferredColor: '#DC2626' as PlayerColor, // Red - first standard color
  },
  chat: {
    profanityFilter: true,
  },
  privacy: {
    showOnlineStatus: true,
    directMessages: 'friends' as DMPermission,
  },
  notifications: {
    turnNotifications: { browser: true, email: false },
    turnTimerWarning: { browser: true, email: false },
    gameInvites: { browser: true, email: true },
    gameEnded: { browser: true, email: false },
    directMessages: { browser: true, email: false },
  },
  performance: {
    mode: false, // Default to quality mode
  },
}

const createSettingsState = (theme: ThemeId = DEFAULT_THEME_ID): SettingsState => ({
  ...defaultSettings,
  display: { ...defaultSettings.display, theme },
  audio: { ...defaultSettings.audio },
  game: { ...defaultSettings.game },
  privacy: { ...defaultSettings.privacy },
  notifications: { ...defaultSettings.notifications },
  performance: { ...defaultSettings.performance },
})

// Load settings from localStorage
const loadSettings = (): SettingsState => {
  const fallbackTheme = DEFAULT_THEME_ID

  try {
    const saved = localStorage.getItem('userSettings')
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<SettingsState>

      // Merge with defaults to ensure all fields exist
      const mergedSettings: SettingsState = {
        ...defaultSettings,
        ...parsed,
        display: { ...defaultSettings.display, ...parsed.display },
        audio: { ...defaultSettings.audio, ...parsed.audio },
        game: { ...defaultSettings.game, ...parsed.game },
        privacy: { ...defaultSettings.privacy, ...parsed.privacy },
        notifications: { ...defaultSettings.notifications, ...parsed.notifications },
        performance: { ...defaultSettings.performance, ...parsed.performance },
      }

      const storedColorThemeRaw = localStorage.getItem('colorTheme')
      const parsedTheme =
        typeof parsed.display?.theme === 'string' ? parsed.display.theme : undefined

      let themeToUse: ThemeId = fallbackTheme
      let themeSource: string = 'default'

      if (typeof storedColorThemeRaw === 'string') {
        themeToUse = normalizeThemeId(storedColorThemeRaw)
        themeSource = 'localStorage.colorTheme'
      } else if (parsedTheme) {
        themeToUse = normalizeThemeId(parsedTheme)
        themeSource = 'userSettings.display.theme'
      }

      mergedSettings.display.theme = themeToUse
      // Adopt colorblind mode flag if present
      const colorblind = Boolean(parsed.display?.colorblindMode)
      mergedSettings.display.colorblindMode = colorblind

      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', themeToUse)
        // Debug (opt-in): log theme application source in production when enabled
        try {
          if (localStorage.getItem('themeDebug') === '1') {
            logger.info('[theme/settings] loadSettings apply', { themeToUse, themeSource })
          }
        } catch {
          // ignore theme debug logging issues (e.g., localStorage unavailable)
        }
        // Apply colorblind attribute
        if (colorblind) {
          document.documentElement.setAttribute('data-colorblind', '1')
        } else {
          document.documentElement.removeAttribute('data-colorblind')
        }
      }

      try {
        localStorage.setItem('colorTheme', themeToUse)
      } catch (_storageError) {
        // Ignore storage errors (quota, privacy mode, etc.)
      }

      return mergedSettings
    }
  } catch (_error) {
    // Attempt to recover theme preference even if parsing fails
    try {
      const storedColorThemeRaw = localStorage.getItem('colorTheme')
      if (storedColorThemeRaw) {
        const themeToUse = normalizeThemeId(storedColorThemeRaw)

        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', themeToUse)
          try {
            if (localStorage.getItem('themeDebug') === '1') {
              logger.info('[theme/settings] recover theme after parse error', { themeToUse })
            }
          } catch {
            // ignore theme debug logging issues (e.g., localStorage unavailable)
          }
        }

        try {
          localStorage.setItem('colorTheme', themeToUse)
        } catch (_storageError) {
          // Ignore storage errors (quota, privacy mode, etc.)
        }

        return createSettingsState(themeToUse)
      }
    } catch (_storageError) {
      // Ignore fallback errors and continue to default state
    }
  }

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', fallbackTheme)
    try {
      if (localStorage.getItem('themeDebug') === '1') {
        logger.info('[theme/settings] no stored settings; using fallback', { fallbackTheme })
      }
    } catch {
      // ignore theme debug logging issues (e.g., localStorage unavailable)
    }
  }

  try {
    localStorage.setItem('colorTheme', fallbackTheme)
  } catch (_error) {
    // Ignore storage errors (quota, privacy mode, etc.)
  }

  return createSettingsState(fallbackTheme)
}

// Save settings to localStorage
const saveSettings = (state: SettingsState) => {
  try {
    localStorage.setItem('userSettings', JSON.stringify(state))
  } catch (_error) {
    // Ignore storage errors (quota, privacy mode, etc.)
  }
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: loadSettings(),
  reducers: {
    // Display settings
    setTheme: (state, action: PayloadAction<Theme>) => {
      const normalizedTheme = normalizeThemeId(action.payload)
      state.display.theme = normalizedTheme
      saveSettings(state)

      try {
        localStorage.setItem('colorTheme', normalizedTheme)
      } catch (_error) {
        // Ignore storage errors (quota, privacy mode, etc.)
      }

      // Also save to backend if user is logged in
      preferencesService.updateTheme(normalizedTheme).catch(() => {
        // Silently fail if not logged in or backend unavailable
      })
    },

    // Audio settings
    setMasterVolume: (state, action: PayloadAction<number>) => {
      state.audio.masterVolume = action.payload
      saveSettings(state)
    },
    setSfxVolume: (state, action: PayloadAction<number>) => {
      state.audio.sfxVolume = action.payload
      saveSettings(state)
    },
    setMusicVolume: (state, action: PayloadAction<number>) => {
      state.audio.musicVolume = action.payload
      saveSettings(state)
    },

    // Game settings
    setPreferredColor: (state, action: PayloadAction<PlayerColor>) => {
      state.game.preferredColor = action.payload
      saveSettings(state)
    },

    // Privacy settings
    setShowOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.privacy.showOnlineStatus = action.payload
      saveSettings(state)
    },
    setDirectMessages: (state, action: PayloadAction<DMPermission>) => {
      state.privacy.directMessages = action.payload
      saveSettings(state)
    },

    // Notification settings
    setNotificationPref: (
      state,
      action: PayloadAction<{
        type: keyof NotificationPrefs
        channel: 'browser' | 'email'
        enabled: boolean
      }>,
    ) => {
      const { type, channel, enabled } = action.payload
      state.notifications[type][channel] = enabled
      saveSettings(state)
    },

    // Utility actions
    clearCache: (_state) => {
      // Clear all localStorage except auth and settings
      const authData = localStorage.getItem('token')
      const settingsData = localStorage.getItem('userSettings')
      localStorage.clear()
      if (authData) localStorage.setItem('token', authData)
      if (settingsData) localStorage.setItem('userSettings', settingsData)
    },

    resetSettings: (state) => {
      Object.assign(state, createSettingsState(DEFAULT_THEME_ID))
      saveSettings(state)
      // Apply default theme
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', DEFAULT_THEME_ID)
      }

      try {
        localStorage.setItem('colorTheme', DEFAULT_THEME_ID)
      } catch (_error) {
        // Ignore storage errors (quota, privacy mode, etc.)
      }
    },

    // Load settings from server (merge with current Redux state)
    loadServerSettings: (state, action: PayloadAction<ServerSettingsPayload | undefined>) => {
      const serverSettings = action.payload
      if (!serverSettings) return

      // Map server settings to Redux state (only if they exist)
      if (serverSettings.theme) {
        const normalizedTheme = normalizeThemeId(serverSettings.theme)
        state.display.theme = normalizedTheme

        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', normalizedTheme)
        }

        try {
          localStorage.setItem('colorTheme', normalizedTheme)
        } catch (_error) {
          // Ignore storage errors (quota, privacy mode, etc.)
        }
      }

      if (serverSettings.preferred_color) {
        state.game.preferredColor = serverSettings.preferred_color
      }

      if (serverSettings.show_online_status !== undefined) {
        state.privacy.showOnlineStatus = serverSettings.show_online_status
      }

      if (serverSettings.direct_messages) {
        state.privacy.directMessages = serverSettings.direct_messages as DMPermission
      }

      if (serverSettings.dm_notifications_browser !== undefined) {
        state.notifications.directMessages.browser = Boolean(
          serverSettings.dm_notifications_browser,
        )
      }

      if (serverSettings.dm_notifications_email !== undefined) {
        state.notifications.directMessages.email = Boolean(serverSettings.dm_notifications_email)
      }

      const notificationsFromServer = serverSettings.notifications
      if (notificationsFromServer) {
        try {
          const notifications =
            typeof notificationsFromServer === 'string'
              ? (JSON.parse(notificationsFromServer) as ServerNotificationsPayload)
              : notificationsFromServer

          // Merge notification settings carefully
          Object.entries(notifications).forEach(([key, value]) => {
            if (key === 'enabled' || !(key in state.notifications)) {
              return
            }

            const typedKey = key as keyof NotificationPrefs
            if (typeof value !== 'object' || value === null) {
              return
            }

            state.notifications[typedKey] = {
              ...state.notifications[typedKey],
              ...value,
            }
          })
        } catch (_error) {
          /* ignore malformed notification payloads */
        }
      }

      // Don't call saveSettings here - we don't want to overwrite localStorage with server data
    },

    // Color theme settings (new semantic theme system)
    setColorTheme: (state, action: PayloadAction<ColorTheme>) => {
      const normalizedTheme = normalizeThemeId(action.payload)

      // Update the Redux state for consistency
      state.display.theme = normalizedTheme

      // Save full settings to maintain consistency
      saveSettings(state)

      try {
        localStorage.setItem('colorTheme', normalizedTheme)
      } catch (_error) {
        // Ignore storage errors (quota, privacy mode, etc.)
      }
    },

    // Accessibility: Colorblind palette toggle
    setColorblindMode: (state, action: PayloadAction<boolean>) => {
      state.display.colorblindMode = Boolean(action.payload)
      saveSettings(state)
      if (typeof document !== 'undefined') {
        if (state.display.colorblindMode) {
          document.documentElement.setAttribute('data-colorblind', '1')
        } else {
          document.documentElement.removeAttribute('data-colorblind')
        }
      }
    },

    // Performance settings
    setPerformanceMode: (state, action: PayloadAction<boolean>) => {
      state.performance.mode = Boolean(action.payload)
      saveSettings(state)
      // Apply background motion preference immediately
      if (typeof document !== 'undefined') {
        const { setBackgroundMotionPreference } = require('../config/themes.config')
        setBackgroundMotionPreference(!action.payload, true)
      }
    },
  },
})

export const {
  setTheme,
  setMasterVolume,
  setSfxVolume,
  setMusicVolume,
  setPreferredColor,
  setShowOnlineStatus,
  setDirectMessages,
  setNotificationPref,
  setColorTheme,
  setColorblindMode,
  setPerformanceMode,
  clearCache,
  resetSettings,
  loadServerSettings,
} = settingsSlice.actions

export default settingsSlice.reducer
