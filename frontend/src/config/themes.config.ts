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
    displayColor: '#4a5fff',
    description: '',
    colors: {
      primary: '#4a5fff',       // Blue-purple primary
      primarySoft: '#6366f1',   // Softer blue-purple
      secondary: '#38bdf8',     // Cyan-blue for interactive
      accent: '#dc2626',        // Keep red accent
      bgDeep: '#0a0a12',        // Very dark blue-black
      bgAlt: '#14141f',         // Slightly lighter dark blue
      surface1: '#1a1a2e',      // Card background
      surface2: '#252538',      // Slightly lighter for nested
      text: '#e0e0e6',          // Primary text
      textMuted: '#9ca3af',     // Secondary text
      border: 'rgba(255, 255, 255, 0.08)',  // Subtle white border
    },
    gradient: {
      stops: [
        { position: '0%', color: '#0a0a12' },
        { position: '50%', color: 'rgba(88, 28, 135, 0.15)' },
        { position: '100%', color: '#0a0a12' },
      ],
    },
  },
  {
    id: 'light',
    name: 'Light',
    displayColor: '#f8fafc',
    description: '',
    colors: {
      primary: '#2563EB',      // Darker blue for better contrast (WCAG AA)
      primarySoft: '#3B82F6',   // Adjusted for hierarchy
      secondary: '#EA580C',     // Darker orange for better contrast
      accent: '#DC2626',        // Keep red accent
      bgDeep: '#F9FAFB',        // Slightly lighter for better hierarchy
      bgAlt: '#F3F4F6',         // More distinct from bgDeep
      surface1: '#FFFFFF',      // Pure white for cards
      surface2: '#E5E7EB',      // Much darker for better contrast with surface1
      text: '#111827',          // Much darker for WCAG AAA compliance
      textMuted: '#4B5563',     // Darker muted text for better readability
      border: '#9CA3AF',        // Darker border for visibility
    },
    gradient: {
      stops: [
        { position: '0%', color: '#ffffff' },
        { position: '30%', color: '#f9fafb' },
        { position: '60%', color: '#f3f4f6' },
        { position: '100%', color: '#ffffff' },
      ],
    },
  },
  {
    id: 'violet',
    name: 'Violet',
    displayColor: '#7C3AED',
    description: '',
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
      border: '#334155',  // Lighter border for better visibility in dark themes
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
    description: '',
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
      border: '#334155',  // Lighter border for better visibility in dark themes
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
    description: '',
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
      border: '#334155',  // Lighter border for better visibility in dark themes
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
    description: '',
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
      border: '#334155',  // Lighter border for better visibility in dark themes
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
    description: '',
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
      textMuted: '#9CA3AF',  // Slightly lighter for better readability in pure black
      border: '#374151',  // Even lighter border for pure black theme
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
  {
    id: 'highcontrast',
    name: 'High Contrast',
    displayColor: '#000000',
    description: '',
    colors: {
      primary: '#0066FF',      // Bright blue for WCAG AAA
      primarySoft: '#3385FF',   // Lighter bright blue
      secondary: '#FFD700',     // Gold remains high contrast
      accent: '#FF0000',        // Pure red for maximum visibility
      bgDeep: '#000000',        // Pure black background
      bgAlt: '#000000',         // Pure black alt
      surface1: '#1A1A1A',      // Very dark gray for cards
      surface2: '#262626',      // Slightly lighter for nested
      text: '#FFFFFF',          // Pure white text
      textMuted: '#B3B3B3',     // Light gray for WCAG AA
      border: '#666666',        // Medium gray for clear borders
    },
    gradient: {
      stops: [
        { position: '0%', color: '#000000' },    // Pure black
        { position: '30%', color: '#000000' },   // Pure black
        { position: '60%', color: '#0A0A0A' },   // Tiny variation
        { position: '100%', color: '#000000' },  // Pure black
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