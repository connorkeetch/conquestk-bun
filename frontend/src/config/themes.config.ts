// Theme Configuration - Metadata Only
// CSS in app.css handles all actual styling

export interface ThemeDefinition {
  id: string
  name: string
  displayColor: string // Color for UI picker/preview
  description: string
  isPremium?: boolean
}

export interface ThemeConfig {
  themes: ThemeDefinition[]
  defaultTheme: string
}

// Theme metadata for UI display
// Actual styling is done via CSS in app.css using [data-theme="id"] selectors
export const THEMES: ThemeDefinition[] = [
  {
    id: 'dark',
    name: 'Dark',
    displayColor: '#111827',
    description: 'Neutral dark background',
  },
  {
    id: 'light',
    name: 'Light',
    displayColor: '#93C5FD',
    description: 'Neutral light background',
  },
  {
    id: 'default',
    name: 'Default',
    displayColor: '#2563EB',
    description: 'Blue theme with purple gradient background',
  },
  {
    id: 'violet',
    name: 'Violet',
    displayColor: '#7C3AED',
    description: 'Purple theme with violet accents',
  },
  {
    id: 'red',
    name: 'Red',
    displayColor: '#DC2626',
    description: 'Crimson theme with red accents',
  },
  {
    id: 'blue',
    name: 'Blue',
    displayColor: '#2563EB',
    description: 'Ocean blue theme',
  },
  {
    id: 'green',
    name: 'Green',
    displayColor: '#059669',
    description: 'Emerald green theme',
  },
  {
    id: 'black',
    name: 'Black',
    displayColor: '#1f2937',
    description: 'Pure black with gray accents',
  },
  {
    id: 'highcontrast',
    name: 'High Contrast',
    displayColor: '#00B4FF',
    description: 'Accessibility-focused high contrast (WCAG AAA)',
  },
  {
    id: 'retrospace',
    name: 'RetroSpace',
    displayColor: '#0F4CDA',
    description: 'Premium early-2000s social profile homage with blue tabs and white panels',
    isPremium: true,
  },
  {
    id: 'frontier',
    name: 'Frontier',
    displayColor: '#C47E35',
    description: 'Premium cowboy fantasy with saddle browns and turquoise accents',
    isPremium: true,
  },
  {
    id: 'metal',
    name: 'Metal Mayhem',
    displayColor: '#FF2D95',
    description: 'Premium heavy metal theme with neon grid energy',
    isPremium: true,
  },
  {
    id: 'halloween',
    name: 'Halloween',
    displayColor: '#FF6B35',
    description: 'Spooky seasonal theme with pumpkin orange and midnight purple',
    isPremium: true,
  },
  {
    id: 'cutlers-cheese',
    name: "Cutler's Cheese",
    displayColor: '#F5B700',
    description: 'Premium cheddar couture with fondue glows and breadstick accents',
    isPremium: true,
  },
]

export const STANDARD_THEMES = THEMES.filter((theme) => !theme.isPremium)
export const PREMIUM_THEMES = THEMES.filter((theme) => theme.isPremium)

// Export configuration
export const THEME_CONFIG: ThemeConfig = {
  themes: THEMES,
  defaultTheme: 'default',
}

// Helper functions
export function getThemeById(id: string): ThemeDefinition | undefined {
  return THEMES.find((theme) => theme.id === id)
}

const BACKGROUND_MOTION_KEY = 'backgroundMotion'

export function getBackgroundMotionPreference(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    const stored = localStorage.getItem(BACKGROUND_MOTION_KEY)
    if (stored === 'off') {
      return false
    }
    if (stored === 'on') {
      return true
    }
  } catch {
    // Ignore storage errors and fall back to default
  }

  return true
}

export function setBackgroundMotionPreference(enabled: boolean, persist = true): void {
  if (typeof document === 'undefined') {
    return
  }

  document.body.setAttribute('data-background-motion', enabled ? 'on' : 'off')

  if (persist) {
    try {
      localStorage.setItem(BACKGROUND_MOTION_KEY, enabled ? 'on' : 'off')
    } catch {
      // Ignore storage failures (e.g., Safari private mode)
    }
  }
}

export function applyTheme(themeId: string): void {
  // Pure CSS-based theming - just set the data-theme attribute
  // All styling is handled by CSS rules in app.css
  document.documentElement.setAttribute('data-theme', themeId)
  setBackgroundMotionPreference(getBackgroundMotionPreference(), false)
}

export function getStoredTheme(): string {
  try {
    return localStorage.getItem('colorTheme') || THEME_CONFIG.defaultTheme
  } catch {
    return THEME_CONFIG.defaultTheme
  }
}

export function storeTheme(themeId: string): void {
  try {
    localStorage.setItem('colorTheme', themeId)
  } catch (_error) {
    // Silently fail if localStorage is not available
  }
}
