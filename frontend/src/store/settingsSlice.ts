import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Theme types
export type Theme = 'dark' | 'light';

// Settings state interface
interface SettingsState {
  // Game Settings
  game: {
    showAttackAnimations: boolean;
    confirmAttacks: boolean;
  };
  
  // Display Settings
  display: {
    theme: Theme;
  };
  
  // Audio Settings (for future use)
  audio: {
    masterVolume: number;
    sfxVolume: number;
    musicVolume: number;
    diceSounds: boolean;
    turnNotifications: boolean;
  };
  
  // Advanced Settings
  advanced: {
    debugMode: boolean;
    betaFeatures: boolean;
  };
}

// Default settings
const defaultSettings: SettingsState = {
  game: {
    showAttackAnimations: true,
    confirmAttacks: false,
  },
  display: {
    theme: 'dark',
  },
  audio: {
    masterVolume: 75,
    sfxVolume: 80,
    musicVolume: 50,
    diceSounds: true,
    turnNotifications: true,
  },
  advanced: {
    debugMode: false,
    betaFeatures: false,
  },
};

// Load settings from localStorage
const loadSettings = (): SettingsState => {
  try {
    const saved = localStorage.getItem('userSettings');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to ensure all fields exist
      return {
        ...defaultSettings,
        ...parsed,
        game: { ...defaultSettings.game, ...parsed.game },
        display: { ...defaultSettings.display, ...parsed.display },
        audio: { ...defaultSettings.audio, ...parsed.audio },
        advanced: { ...defaultSettings.advanced, ...parsed.advanced },
      };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return defaultSettings;
};

// Save settings to localStorage
const saveSettings = (state: SettingsState) => {
  try {
    localStorage.setItem('userSettings', JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState: loadSettings(),
  reducers: {
    // Game settings
    setShowAttackAnimations: (state, action: PayloadAction<boolean>) => {
      state.game.showAttackAnimations = action.payload;
      saveSettings(state);
    },
    setConfirmAttacks: (state, action: PayloadAction<boolean>) => {
      state.game.confirmAttacks = action.payload;
      saveSettings(state);
    },
    
    // Display settings
    setTheme: (state, action: PayloadAction<Theme>) => {
      state.display.theme = action.payload;
      // Apply theme to document
      document.documentElement.setAttribute('data-theme', action.payload);
      saveSettings(state);
    },
    
    // Audio settings (for future use)
    setMasterVolume: (state, action: PayloadAction<number>) => {
      state.audio.masterVolume = action.payload;
      saveSettings(state);
    },
    setSfxVolume: (state, action: PayloadAction<number>) => {
      state.audio.sfxVolume = action.payload;
      saveSettings(state);
    },
    setMusicVolume: (state, action: PayloadAction<number>) => {
      state.audio.musicVolume = action.payload;
      saveSettings(state);
    },
    setDiceSounds: (state, action: PayloadAction<boolean>) => {
      state.audio.diceSounds = action.payload;
      saveSettings(state);
    },
    setTurnNotifications: (state, action: PayloadAction<boolean>) => {
      state.audio.turnNotifications = action.payload;
      saveSettings(state);
    },
    
    // Advanced settings
    setDebugMode: (state, action: PayloadAction<boolean>) => {
      state.advanced.debugMode = action.payload;
      saveSettings(state);
    },
    setBetaFeatures: (state, action: PayloadAction<boolean>) => {
      state.advanced.betaFeatures = action.payload;
      saveSettings(state);
    },
    
    // Utility actions
    clearCache: (state) => {
      // Clear all localStorage except auth and settings
      const authData = localStorage.getItem('token');
      const settingsData = localStorage.getItem('userSettings');
      localStorage.clear();
      if (authData) localStorage.setItem('token', authData);
      if (settingsData) localStorage.setItem('userSettings', settingsData);
      console.log('Cache cleared successfully');
    },
    
    exportSettings: (state) => {
      const dataStr = JSON.stringify(state, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `risk-game-settings-${Date.now()}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    },
    
    importSettings: (state, action: PayloadAction<string>) => {
      try {
        const imported = JSON.parse(action.payload);
        // Validate structure before applying
        if (imported.game && imported.display && imported.advanced) {
          Object.assign(state, imported);
          saveSettings(state);
          // Apply theme immediately
          document.documentElement.setAttribute('data-theme', state.display.theme);
        }
      } catch (error) {
        console.error('Failed to import settings:', error);
      }
    },
    
    resetSettings: (state) => {
      Object.assign(state, defaultSettings);
      saveSettings(state);
      // Apply default theme
      document.documentElement.setAttribute('data-theme', defaultSettings.display.theme);
    },
  },
});

export const {
  setShowAttackAnimations,
  setConfirmAttacks,
  setTheme,
  setMasterVolume,
  setSfxVolume,
  setMusicVolume,
  setDiceSounds,
  setTurnNotifications,
  setDebugMode,
  setBetaFeatures,
  clearCache,
  exportSettings,
  importSettings,
  resetSettings,
} = settingsSlice.actions;

export default settingsSlice.reducer;