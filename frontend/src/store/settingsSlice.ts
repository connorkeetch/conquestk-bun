import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

// Theme types
export type Theme = 'dark' | 'light'

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
  clearCache,
  resetSettings,
} = settingsSlice.actions

export default settingsSlice.reducer
