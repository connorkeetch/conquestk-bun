// Centralized Theme Configuration
// Single source of truth for all theme definitions

export interface ThemeDefinition {
  id: string
  name: string
  displayColor: string // Color shown in UI picker
  description: string
  colors: {
    primary: string
    primarySoft: string
    secondary: string
    accent: string
    bgDeep?: string
    bgAlt?: string
    surface1?: string
    surface2?: string
    text?: string
    textMuted?: string
    border?: string
  }
  gradient: {
    stops: {
      position: string
      color: string
    }[]
  }
}

export interface ThemeConfig {
  themes: ThemeDefinition[]
  defaultTheme: string
}

// Theme definitions - single source of truth
export const THEMES: ThemeDefinition[] = [
  {
    id: 'default',
    name: 'Default',
    displayColor: '#4338CA',
    description: 'Dark blue-purple gradient',
    colors: {
      primary: '#4338CA',
      primarySoft: '#5B21B6',
      secondary: '#FFD700',
      accent: '#dc2626',
      bgDeep: '#0a0a0f',        // Much darker, nearly black
      bgAlt: '#080812',         // Inky dark blue
      surface1: '#0f172a',      // Dark surface
      surface2: '#111827',      // Slightly lighter surface
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
    },
    gradient: {
      stops: [
        { position: '0%', color: '#0a0814' },    // Nearly black with blue tint
        { position: '30%', color: '#050308' },   // Inky black center
        { position: '60%', color: '#0d0615' },   // Very dark purple
        { position: '100%', color: '#0a0814' },  // Nearly black with blue tint
      ],
    },
  },
  {
    id: 'light',
    name: 'Light',
    displayColor: '#f8fafc',
    description: 'Bright and clean',
    colors: {
      primary: '#3B82F6',
      primarySoft: '#60A5FA',
      secondary: '#F59E0B',
      accent: '#DC2626',
      bgDeep: '#F8F9FA',
      bgAlt: '#F1F5F9',
      surface1: '#FFFFFF',
      surface2: '#F1F5F9',
      text: '#1E293B',
      textMuted: '#64748B',
      border: '#E2E8F0',
    },
    gradient: {
      stops: [
        { position: '0%', color: '#f8fafc' },
        { position: '30%', color: '#f1f5f9' },
        { position: '60%', color: '#e2e8f0' },
        { position: '100%', color: '#f8fafc' },
      ],
    },
  },
  {
    id: 'violet',
    name: 'Violet',
    displayColor: '#7C3AED',
    description: 'Purple accent',
    colors: {
      primary: '#7C3AED',
      primarySoft: '#8B5CF6',
      secondary: '#FFD700',
      accent: '#B22222',
      bgDeep: '#0b0812',        // Inky black with violet tint
      bgAlt: '#090510',         // Nearly pure black
      surface1: '#0f172a',
      surface2: '#111827',
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
    },
    gradient: {
      stops: [
        { position: '0%', color: '#0d0814' },    // Nearly black violet
        { position: '30%', color: '#040207' },   // Inky black center
        { position: '60%', color: '#0a0610' },   // Very dark violet
        { position: '100%', color: '#0d0814' },  // Nearly black violet
      ],
    },
  },
  {
    id: 'red',
    name: 'Red',
    displayColor: '#DC2626',
    description: 'Crimson theme',
    colors: {
      primary: '#DC2626',
      primarySoft: '#EF4444',
      secondary: '#FFD700',
      accent: '#F59E0B',
      bgDeep: '#0d0505',        // Inky black with red tint
      bgAlt: '#0a0303',         // Nearly pure black
      surface1: '#0f172a',
      surface2: '#111827',
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
    },
    gradient: {
      stops: [
        { position: '0%', color: '#110303' },    // Nearly black red
        { position: '30%', color: '#050101' },   // Inky black center
        { position: '60%', color: '#0f0202' },   // Very dark red
        { position: '100%', color: '#110303' },  // Nearly black red
      ],
    },
  },
  {
    id: 'blue',
    name: 'Blue',
    displayColor: '#2563EB',
    description: 'Ocean blue',
    colors: {
      primary: '#2563EB',
      primarySoft: '#3B82F6',
      secondary: '#FFD700',
      accent: '#06B6D4',
      bgDeep: '#05080f',        // Inky black with blue tint
      bgAlt: '#03050a',         // Nearly pure black
      surface1: '#0f172a',
      surface2: '#111827',
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
    },
    gradient: {
      stops: [
        { position: '0%', color: '#06090f' },    // Nearly black blue
        { position: '30%', color: '#020305' },   // Inky black center
        { position: '60%', color: '#05070c' },   // Very dark blue
        { position: '100%', color: '#06090f' },  // Nearly black blue
      ],
    },
  },
  {
    id: 'green',
    name: 'Green',
    displayColor: '#059669',
    description: 'Forest green',
    colors: {
      primary: '#059669',
      primarySoft: '#10B981',
      secondary: '#FFD700',
      accent: '#14B8A6',
      bgDeep: '#050a08',        // Inky black with green tint
      bgAlt: '#030605',         // Nearly pure black
      surface1: '#0f172a',
      surface2: '#111827',
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
    },
    gradient: {
      stops: [
        { position: '0%', color: '#060c0a' },    // Nearly black green
        { position: '30%', color: '#020403' },   // Inky black center
        { position: '60%', color: '#050907' },   // Very dark green
        { position: '100%', color: '#060c0a' },  // Nearly black green
      ],
    },
  },
  {
    id: 'black',
    name: 'Black',
    displayColor: '#1f2937',
    description: 'Dark and minimal',
    colors: {
      primary: '#1f2937',
      primarySoft: '#374151',
      secondary: '#9ca3af',
      accent: '#f3f4f6',
      bgDeep: '#000000',        // Pure black
      bgAlt: '#050505',         // Nearly black
      surface1: '#0a0a0a',      // Very dark gray
      surface2: '#111111',      // Dark gray
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
    },
    gradient: {
      stops: [
        { position: '0%', color: '#050505' },    // Nearly black
        { position: '30%', color: '#000000' },   // Pure black center
        { position: '60%', color: '#030303' },   // Inky black
        { position: '100%', color: '#050505' },  // Nearly black
      ],
    },
  },
]

// Export configuration
export const THEME_CONFIG: ThemeConfig = {
  themes: THEMES,
  defaultTheme: 'default',
}

// Helper functions
export function getThemeById(id: string): ThemeDefinition | undefined {
  return THEMES.find(theme => theme.id === id)
}

export function generateCSSVariables(theme: ThemeDefinition): Record<string, string> {
  const vars: Record<string, string> = {}
  
  // Map theme colors to CSS variables
  if (theme.colors.primary) vars['--color-primary'] = theme.colors.primary
  if (theme.colors.primarySoft) vars['--color-primary-soft'] = theme.colors.primarySoft
  if (theme.colors.secondary) vars['--color-secondary'] = theme.colors.secondary
  if (theme.colors.accent) vars['--color-accent'] = theme.colors.accent
  if (theme.colors.bgDeep) vars['--color-bg-deep'] = theme.colors.bgDeep
  if (theme.colors.bgAlt) vars['--color-bg-alt'] = theme.colors.bgAlt
  if (theme.colors.surface1) vars['--color-surface-1'] = theme.colors.surface1
  if (theme.colors.surface2) vars['--color-surface-2'] = theme.colors.surface2
  if (theme.colors.text) vars['--color-text'] = theme.colors.text
  if (theme.colors.textMuted) vars['--color-text-muted'] = theme.colors.textMuted
  if (theme.colors.border) vars['--color-border'] = theme.colors.border
  
  // Generate gradient CSS
  const gradientStops = theme.gradient.stops
    .map(stop => `${stop.color} ${stop.position}`)
    .join(', ')
  vars['--ck-bg-gradient'] = `linear-gradient(135deg, ${gradientStops})`
  
  return vars
}

export function applyTheme(themeId: string): void {
  const theme = getThemeById(themeId)
  if (!theme) {
    // Theme not found, use default
    return
  }
  
  const cssVars = generateCSSVariables(theme)
  
  // Apply CSS variables to root element
  Object.entries(cssVars).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value)
  })
  
  // Set data-theme attribute for CSS-based styling
  document.documentElement.setAttribute('data-theme', themeId)
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