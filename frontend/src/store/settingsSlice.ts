import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { PlayerColor } from '../constants/colors'
import preferencesService from '../services/preferencesService'

// Theme types - Extended for multi-theme support
export type ColorTheme = 'violet' | 'red' | 'blue' | 'green' | 'black' | 'default'
export type StyleTheme = 'modern' | 'cowboy' | 'myspace' | 'minimal' | 'gaming'
export type Theme = 'dark' | 'light' | 'high-contrast' | ColorTheme // Legacy compatibility

// New theme system for future theme switching
export interface ThemeSettings {
  baseTheme: 'dark' | 'light' | 'high-contrast'  // Core theme (dark/light)
  colorTheme: ColorTheme                          // Color palette 
  styleTheme: StyleTheme                          // UI style/components
}

export type DMPermission = 'everyone' | 'friends' | 'nobody'

// Notification settings
export interface NotificationPrefs {
  turnNotifications: { browser: boolean; email: boolean }
  turnTimerWarning: { browser: boolean; email: boolean }
  gameInvites: { browser: boolean; email: boolean }
  gameEnded: { browser: boolean; email: boolean }
}

// Settings state interface
interface SettingsState {
  // Display Settings
  display: {
    theme: Theme
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
    theme: 'dark',
  },
  audio: {
    masterVolume: 75,
    sfxVolume: 80,
    musicVolume: 50,
  },
  game: {
    preferredColor: 'bright-red' as PlayerColor,
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
  },
}

// Load settings from localStorage
const loadSettings = (): SettingsState => {
  try {
    const saved = localStorage.getItem('userSettings')
    if (saved) {
      const parsed = JSON.parse(saved)
      // Merge with defaults to ensure all fields exist
      const mergedSettings = {
        ...defaultSettings,
        ...parsed,
        display: { ...defaultSettings.display, ...parsed.display },
        audio: { ...defaultSettings.audio, ...parsed.audio },
        game: { ...defaultSettings.game, ...parsed.game },
        privacy: { ...defaultSettings.privacy, ...parsed.privacy },
        notifications: { ...defaultSettings.notifications, ...parsed.notifications },
      }
      
      // Apply stored color theme from localStorage on load to fix persistence
      const storedColorTheme = localStorage.getItem('colorTheme') as ColorTheme
      if (storedColorTheme) {
        document.documentElement.setAttribute('data-theme', storedColorTheme)
      }
      
      return mergedSettings
    }
  } catch (_error) {
    // Even on error, try to load stored color theme
    const storedColorTheme = localStorage.getItem('colorTheme') as ColorTheme
    if (storedColorTheme) {
      document.documentElement.setAttribute('data-theme', storedColorTheme)
    }
  }
  return defaultSettings
}

// Save settings to localStorage
const saveSettings = (state: SettingsState) => {
  try {
    localStorage.setItem('userSettings', JSON.stringify(state))
  } catch (_error) {}
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: loadSettings(),
  reducers: {
    // Display settings
    setTheme: (state, action: PayloadAction<Theme>) => {
      state.display.theme = action.payload
      saveSettings(state)
      // Also save to backend if user is logged in
      preferencesService.updateTheme(action.payload).catch(() => {
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
    setNotificationPref: (state, action: PayloadAction<{ 
      type: keyof NotificationPrefs; 
      channel: 'browser' | 'email'; 
      enabled: boolean 
    }>) => {
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
      Object.assign(state, defaultSettings)
      saveSettings(state)
      // Apply default theme
      document.documentElement.setAttribute('data-theme', defaultSettings.display.theme)
    },

    // Load settings from server (merge with current Redux state)
    loadServerSettings: (state, action: PayloadAction<any>) => {
      const serverSettings = action.payload
      if (!serverSettings) return
      
      // Map server settings to Redux state (only if they exist)
      if (serverSettings.theme) {
        state.display.theme = serverSettings.theme
        document.documentElement.setAttribute('data-theme', serverSettings.theme)
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
      
      if (serverSettings.notifications && typeof serverSettings.notifications === 'object') {
        try {
          const notifications = typeof serverSettings.notifications === 'string' 
            ? JSON.parse(serverSettings.notifications) 
            : serverSettings.notifications
          
          // Merge notification settings carefully
          Object.keys(notifications).forEach((key) => {
            if (key in state.notifications) {
              state.notifications[key as keyof NotificationPrefs] = {
                ...state.notifications[key as keyof NotificationPrefs],
                ...notifications[key]
              }
            }
          })
        } catch (error) {
          console.warn('Failed to parse server notifications:', error)
        }
      }
      
      // Don't call saveSettings here - we don't want to overwrite localStorage with server data
      console.log('✅ Server settings loaded into Redux')
    },

    // Color theme settings (new semantic theme system)
    setColorTheme: (state, action: PayloadAction<ColorTheme>) => {
      // Update the Redux state for consistency
      state.display.theme = action.payload
      // Save full settings to maintain consistency
      saveSettings(state)
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
  clearCache,
  resetSettings,
  loadServerSettings,
} = settingsSlice.actions

export default settingsSlice.reducer
