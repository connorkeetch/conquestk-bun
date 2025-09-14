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

// Theme definitions - Used for UI display and documentation
// Actual styling is done via CSS in app.css
export const THEMES: ThemeDefinition[] = [
  {
    id: 'default',
    name: 'Default',
    displayColor: '#2563EB',  // Blue - matches CSS primary
    description: 'Blue theme with purple gradient background',
    colors: {
      primary: '#2563EB',       // Blue primary for buttons
      primarySoft: '#3B82F6',   // Lighter blue for hover
      secondary: '#FFD700',     // Gold secondary
      accent: '#DC2626',        // Red accent
      bgDeep: '#000000',        // Pure black base
      bgAlt: '#050505',         // Near black alternative
      surface1: '#0f172a',      // Dark blue-gray cards
      surface2: '#1e293b',      // Slightly lighter surface
      text: '#F9FAFB',          // White text
      textMuted: '#94A3B8',     // Muted blue-gray text
      border: '#334155',        // Blue-gray borders
    },
    gradient: {
      stops: [
        { position: '0%', color: '#111827' },                    // gray-900
        { position: '50%', color: 'rgba(88, 28, 135, 0.2)' },   // purple-900/20
        { position: '100%', color: '#000000' },                  // black
      ],
    },
  },
  // Light theme temporarily disabled - needs more work
  // {
  //   id: 'light',
  //   name: 'Light',
  //   displayColor: '#f8fafc',
  //   description: '',
  //   colors: {
  //     primary: '#2563EB',
  //     primarySoft: '#3B82F6',
  //     secondary: '#EA580C',
  //     accent: '#DC2626',
  //     bgDeep: '#F9FAFB',
  //     bgAlt: '#F3F4F6',
  //     surface1: '#FFFFFF',
  //     surface2: '#E5E7EB',
  //     text: '#111827',
  //     textMuted: '#4B5563',
  //     border: '#9CA3AF',
  //   },
  //   gradient: {
  //     stops: [
  //       { position: '0%', color: '#ffffff' },
  //       { position: '30%', color: '#f9fafb' },
  //       { position: '60%', color: '#f3f4f6' },
  //       { position: '100%', color: '#ffffff' },
  //     ],
  //   },
  // },
  {
    id: 'violet',
    name: 'Violet',
    displayColor: '#7C3AED',
    description: 'Purple theme with violet accents',
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
    description: 'Crimson theme with red accents',
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
    description: 'Ocean blue theme',
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
    description: 'Emerald green theme',
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
    description: 'Pure black with gray accents',
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
    displayColor: '#00B4FF',
    description: 'Accessibility-focused high contrast (WCAG AAA)',
    colors: {
      primary: '#00B4FF',      // Bright cyan-blue - 8.6:1 contrast
      primarySoft: '#66D4FF',   // Lighter cyan - 12.8:1 contrast
      secondary: '#FFD700',     // Gold - 14.5:1 contrast
      accent: '#FF3366',        // Bright red-pink - 7.5:1 contrast
      bgDeep: '#000000',        // Pure black for maximum contrast
      bgAlt: '#000000',         // Pure black
      surface1: '#1A1A1A',      // Dark gray for cards
      surface2: '#2D2D2D',      // Lighter gray - more distinguishable
      text: '#FFFFFF',          // Pure white - 21:1 contrast
      textMuted: '#E0E0E0',     // Light gray - 13.5:1 contrast (WCAG AAA)
      border: '#808080',        // Medium gray - clearly visible
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
  {
    id: 'halloween',
    name: '🎃 Halloween',
    displayColor: '#FF6B35',
    description: 'Spooky seasonal theme with pumpkin orange and midnight purple',
    colors: {
      primary: '#FF6B35',       // Pumpkin orange
      primarySoft: '#FF8C5A',   // Lighter pumpkin
      secondary: '#FFD23F',     // Candy corn yellow
      accent: '#8B1538',        // Blood red
      bgDeep: '#0A0108',        // Midnight black
      bgAlt: '#110A0F',         // Purple-tinted black
      surface1: '#1A0F17',      // Dark purple surface
      surface2: '#2B1624',      // Lighter purple surface
      text: '#F5E6E8',          // Ghostly white
      textMuted: '#B68FA5',     // Muted purple-gray
      border: '#4A2040',        // Purple border
    },
    gradient: {
      stops: [
        { position: '0%', color: '#0A0108' },                    // Midnight black
        { position: '25%', color: 'rgba(139, 21, 56, 0.3)' },   // Blood red glow
        { position: '50%', color: 'rgba(255, 107, 53, 0.15)' }, // Pumpkin orange glow
        { position: '75%', color: 'rgba(75, 0, 130, 0.25)' },   // Deep purple
        { position: '100%', color: '#0A0108' },                  // Back to midnight
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
  // Pure CSS-based theming - just set the data-theme attribute
  // All styling is handled by CSS rules in app.css
  document.documentElement.setAttribute('data-theme', themeId)
  
  // Remove any inline styles that might have been set by the old system
  const root = document.documentElement
  const stylesToRemove = [
    '--color-primary', '--color-primary-soft', '--color-secondary', '--color-accent',
    '--color-bg-deep', '--color-bg-alt', '--color-surface-1', '--color-surface-2',
    '--color-text', '--color-text-muted', '--color-border', '--ck-bg-gradient'
  ]
  stylesToRemove.forEach(prop => root.style.removeProperty(prop))
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