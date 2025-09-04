import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { PlayerColor } from '../constants/colors'

// Theme types
export type Theme = 'dark' | 'light'
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
      return {
        ...defaultSettings,
        ...parsed,
        display: { ...defaultSettings.display, ...parsed.display },
        audio: { ...defaultSettings.audio, ...parsed.audio },
        game: { ...defaultSettings.game, ...parsed.game },
        privacy: { ...defaultSettings.privacy, ...parsed.privacy },
        notifications: { ...defaultSettings.notifications, ...parsed.notifications },
      }
    }
  } catch (_error) {}
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
      // Apply theme to document
      document.documentElement.setAttribute('data-theme', action.payload)
      saveSettings(state)
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
  clearCache,
  resetSettings,
} = settingsSlice.actions

export default settingsSlice.reducer
