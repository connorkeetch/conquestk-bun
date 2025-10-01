import {
  DEFAULT_THEME_ID,
  isThemeId,
  normalizeThemeId,
  THEME_IDS,
  type ThemeId,
} from '@shared/types/themes'
import { featureFlagService } from '../services/featureFlagService'
import { FEATURE_FLAGS } from '../constants/featureFlags'

// Theme Configuration - Metadata Only
// CSS in app.css handles all actual styling

export interface ThemeDefinition {
  id: ThemeId
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
const THEME_METADATA: Record<ThemeId, Omit<ThemeDefinition, 'id'>> = {
  default: {
    name: 'Default',
    displayColor: '#2563EB',
    description: 'Blue theme with purple gradient background',
  },
  dark: {
    name: 'Dark',
    displayColor: '#111827',
    description: 'Neutral dark background',
  },
  light: {
    name: 'Light',
    displayColor: '#93C5FD',
    description: 'Neutral light background',
  },
  'violet-dark': {
    name: 'Violet (Dark)',
    displayColor: '#7C3AED',
    description: 'Violet accents on dark surfaces',
  },
  'violet-light': {
    name: 'Violet (Light)',
    displayColor: '#8B5CF6',
    description: 'Violet accents on light surfaces',
  },
  'blue-dark': {
    name: 'Blue (Dark)',
    displayColor: '#2563EB',
    description: 'Blue accents on dark surfaces',
  },
  'blue-light': {
    name: 'Blue (Light)',
    displayColor: '#3B82F6',
    description: 'Blue accents on light surfaces',
  },
  'red-dark': {
    name: 'Red (Dark)',
    displayColor: '#DC2626',
    description: 'Red accents on dark surfaces',
  },
  'red-light': {
    name: 'Red (Light)',
    displayColor: '#EF4444',
    description: 'Red accents on light surfaces',
  },
  'green-dark': {
    name: 'Green (Dark)',
    displayColor: '#10B981',
    description: 'Green accents on dark surfaces',
  },
  'green-light': {
    name: 'Green (Light)',
    displayColor: '#34D399',
    description: 'Green accents on light surfaces',
  },
  black: {
    name: 'Black',
    displayColor: '#1f2937',
    description: 'Pure black with gray accents',
  },
  highcontrast: {
    name: 'High Contrast',
    displayColor: '#00B4FF',
    description: 'Accessibility-focused high contrast (WCAG AAA)',
  },
  retrospace: {
    name: 'RetroSpace',
    displayColor: '#0F4CDA',
    description: 'Premium early-2000s social profile homage with blue tabs and white panels',
    isPremium: true,
  },
  frontier: {
    name: 'Frontier',
    displayColor: '#C47E35',
    description: 'Premium cowboy fantasy with saddle browns and turquoise accents',
    isPremium: true,
  },
  metal: {
    name: 'Metal Mayhem',
    displayColor: '#FF2D95',
    description: 'Premium heavy metal theme with neon grid energy',
    isPremium: true,
  },
  halloween: {
    name: 'Halloween',
    displayColor: '#FF6B35',
    description: 'Spooky seasonal theme with pumpkin orange and midnight purple',
    isPremium: true,
  },
  'cutlers-cheese': {
    name: "Cutler's Cheese",
    displayColor: '#F5B700',
    description: 'Premium cheddar couture with fondue glows and breadstick accents',
    isPremium: true,
  },
}

const ORDERED_THEME_IDS: ThemeId[] = [
  DEFAULT_THEME_ID,
  ...THEME_IDS.filter((id) => id !== DEFAULT_THEME_ID),
]

export const THEMES: ThemeDefinition[] = ORDERED_THEME_IDS.map((id) => ({
  id,
  ...THEME_METADATA[id],
}))

export const STANDARD_THEMES = THEMES.filter((theme) => !theme.isPremium)
export const PREMIUM_THEMES = THEMES.filter((theme) => theme.isPremium)

// Export configuration
export const THEME_CONFIG: ThemeConfig = {
  themes: THEMES,
  defaultTheme: DEFAULT_THEME_ID,
}

// Helper functions
export function getThemeById(id: string): ThemeDefinition | undefined {
  if (!isThemeId(id)) {
    return undefined
  }

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
  if (typeof document === 'undefined') {
    return
  }

  // Pure CSS-based theming - just set the data-theme attribute
  // All styling is handled by CSS rules in app.css
  const normalizedTheme = normalizeThemeId(themeId)
  document.documentElement.setAttribute('data-theme', normalizedTheme)
  setBackgroundMotionPreference(getBackgroundMotionPreference(), false)

  // Optional: persist to cookie for first-paint fallback (behind feature flag)
  try {
    if (featureFlagService.isEnabled(FEATURE_FLAGS.UI_THEME_COOKIE_FALLBACK)) {
      setThemeCookie(normalizedTheme)
      themeDebugLog('applyTheme: wrote cookie', { normalizedTheme })
    }
  } catch {
    // ignore cookie errors
  }
}

export function getStoredTheme(): ThemeId {
  try {
    const storedTheme = localStorage.getItem('colorTheme')
    const normalized = normalizeThemeId(storedTheme)
    themeDebugLog('getStoredTheme', { storedTheme, normalized })
    return normalized
  } catch {
    themeDebugLog('getStoredTheme: localStorage failed; defaulting', { fallback: DEFAULT_THEME_ID })
    return DEFAULT_THEME_ID
  }
}

export function storeTheme(themeId: string): ThemeId {
  const normalizedTheme = normalizeThemeId(themeId)

  try {
    localStorage.setItem('colorTheme', normalizedTheme)
  } catch (_error) {
    // Silently fail if localStorage is not available
  }

  // Optional cookie persistence for first-paint fallback (behind feature flag)
  try {
    if (
      typeof document !== 'undefined' &&
      featureFlagService.isEnabled(FEATURE_FLAGS.UI_THEME_COOKIE_FALLBACK)
    ) {
      setThemeCookie(normalizedTheme)
      themeDebugLog('storeTheme: wrote cookie', { normalizedTheme })
    }
  } catch {
    // ignore cookie errors
  }

  return normalizedTheme
}

// --- Internals: cookie + debug helpers ---
function setThemeCookie(themeId: string) {
  if (typeof document === 'undefined') return
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : ''
  const domain = host.endsWith('conquestk.com') ? '; Domain=.conquestk.com' : ''
  const secure = isHttps ? '; Secure' : ''
  const sameSite = '; SameSite=Lax'
  // Short TTL (3 days)
  const expires = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `ck_theme=${encodeURIComponent(themeId)}; Expires=${expires}; Path=/${domain}${sameSite}${secure}`
}

function isThemeDebugEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('themeDebug') === '1') return true
  } catch {}
  try {
    const value = `; ${document.cookie}`
    const parts = value.split('; ck_theme_debug=')
    if (parts.length === 2) {
      const v = parts.pop()?.split(';').shift()
      if (v === '1') return true
    }
  } catch {}
  // Feature flag can also enable logs globally
  try {
    return featureFlagService.isEnabled(FEATURE_FLAGS.UI_THEME_DEBUG_LOGS)
  } catch {
    return false
  }
}

function themeDebugLog(message: string, data?: unknown) {
  if (!isThemeDebugEnabled()) return
  try {
    console.info('[theme]', message, data ?? '')
  } catch {}
}
