/**
 * Player colors available for game selection
 * 12 free colors plus 6 premium options
 */
export const STANDARD_COLORS = [
  // Free colors - exactly 12
  'bright-red',
  'maroon',
  'orange',
  'yellow',
  'light-green',
  'dark-green',
  'light-blue',
  'dark-blue',
  'purple',
  'pink',
  'brown',
  'gray',
] as const

export const PREMIUM_COLORS = [
  'black',
  'silver',
  'rainbow', // Animated gradient
  'pulse', // Animated pulse effect
  'metallic', // Metallic sheen effect
  'neon', // Neon glow effect
] as const

export const PLAYER_COLORS = [...STANDARD_COLORS, ...PREMIUM_COLORS] as const

export type PlayerColor = (typeof PLAYER_COLORS)[number]
export type StandardColor = (typeof STANDARD_COLORS)[number]
export type PremiumColor = (typeof PREMIUM_COLORS)[number]

/**
 * Color hex values for rendering
 * These provide good contrast on dark backgrounds
 */
export const COLOR_HEX_VALUES: Record<PlayerColor, string> = {
  // Free colors - exactly 12
  'bright-red': '#FF0000', // Bright red
  maroon: '#800000', // Maroon
  orange: '#FFA500', // Orange
  yellow: '#FFD700', // Yellow/Gold
  'light-green': '#90EE90', // Light green
  'dark-green': '#006400', // Dark green
  'light-blue': '#87CEEB', // Sky blue
  'dark-blue': '#000080', // Navy blue
  purple: '#800080', // Purple
  pink: '#FFC0CB', // Pink
  brown: '#8B4513', // Brown
  gray: '#808080', // Gray
  // Premium colors
  black: '#000000',
  silver: '#C0C0C0',
  rainbow: 'linear-gradient(90deg, #FF0000, #FF7F00, #FFFF00, #00FF00, #0000FF, #4B0082, #9400D3)',
  pulse: '#FF1493', // Base color for pulse animation
  metallic: '#B8860B', // Base color for metallic effect
  neon: '#39FF14', // Base color for neon effect
}

/**
 * Tailwind color classes for player colors
 * Used for consistent styling across the app
 */
export const COLOR_CLASSES: Record<PlayerColor, string> = {
  // Free colors - exactly 12
  'bright-red': 'bg-red-600 text-white',
  maroon: 'bg-red-900 text-white',
  orange: 'bg-orange-500 text-white',
  yellow: 'bg-yellow-400 text-black',
  'light-green': 'bg-green-400 text-black',
  'dark-green': 'bg-green-800 text-white',
  'light-blue': 'bg-sky-400 text-black',
  'dark-blue': 'bg-blue-900 text-white',
  purple: 'bg-purple-600 text-white',
  pink: 'bg-pink-300 text-black',
  brown: 'bg-amber-800 text-white',
  gray: 'bg-gray-500 text-white',
  // Premium colors
  black: 'bg-black text-white border border-gray-600',
  silver: 'bg-gray-400 text-black',
  rainbow: 'bg-gradient-to-r from-red-500 via-yellow-500 to-purple-500 text-white',
  pulse: 'bg-pink-500 text-white animate-pulse',
  metallic: 'bg-gradient-to-br from-yellow-600 via-yellow-400 to-yellow-600 text-black',
  neon: 'bg-green-400 text-black shadow-[0_0_10px_#39FF14]',
}

/**
 * Check if a color is premium
 */
export const isPremiumColor = (color: PlayerColor): color is PremiumColor => {
  return PREMIUM_COLORS.includes(color as PremiumColor)
}

/**
 * Color display names for UI
 */
export const COLOR_DISPLAY_NAMES: Record<PlayerColor, string> = {
  // Free colors - exactly 12
  'bright-red': 'Bright Red',
  maroon: 'Maroon',
  orange: 'Orange',
  yellow: 'Yellow',
  'light-green': 'Light Green',
  'dark-green': 'Dark Green',
  'light-blue': 'Light Blue',
  'dark-blue': 'Dark Blue',
  purple: 'Purple',
  pink: 'Pink',
  brown: 'Brown',
  gray: 'Gray',
  // Premium colors
  black: 'Midnight Black ⭐',
  silver: 'Silver ⭐',
  rainbow: 'Rainbow ⭐',
  pulse: 'Pulse ⭐',
  metallic: 'Metallic Gold ⭐',
  neon: 'Neon Green ⭐',
}

// =============================================================================
// CONQUEST K COMPREHENSIVE COLOR SYSTEM
// =============================================================================

// Player colors - Optimized for gameplay visibility against dark backgrounds
export const PLAYER_COLORS_NEW = [
  '#DC2626', // Red - Classic aggressive
  '#2563EB', // Blue - Traditional defensive
  '#059669', // Forest Green - Distinct from premium neon
  '#F59E0B', // Amber - Better than pure yellow
  '#9333EA', // Purple - Clear and distinct
  '#EA580C', // Orange - Vibrant energy
  '#06B6D4', // Cyan - Cool and calculating
  '#EC4899', // Pink - Surprisingly visible
  '#D97706', // Tan/Bronze - Earthy warfare
  '#881337', // Maroon - Deep and rich
  '#14B8A6', // Teal - Ocean depths
  '#6366F1', // Indigo - Bridge between blue and purple
] as const;

// Premium player colors with special effects
export const PREMIUM_PLAYER_COLORS = {
  MidnightBlack: {
    solid: '#000000',
    outline: '#FFFFFF',
    effect: 'subtle-starfield',
    description: 'The void between stars'
  },
  PureWhite: {
    solid: '#FFFFFF',
    outline: '#000000',
    effect: 'pearl-shimmer',
    description: 'Pristine and untouchable'
  },
  MetallicGold: {
    solid: '#FFD700',
    effect: 'metallic-gradient',
    outline: '#B8860B',
    description: 'The color of victory'
  },
  MetallicSilver: {
    solid: '#C0C0C0',
    effect: 'chrome-reflection',
    outline: '#808080',
    description: 'Polished steel'
  },
  NeonGreen: {
    solid: '#39FF14',
    effect: 'electric-glow',
    outline: '#2FB510',
    description: 'Radioactive power'
  },
  Dragonfire: {
    gradient: 'linear-gradient(45deg, #DC2626, #FB923C, #FDE047)',
    solid: '#FB923C',
    effect: 'flame-particles',
    description: 'Burning conquest'
  }
} as const;

// Rank colors - The progression of power
export const RANK_COLORS = {
  CHIEFTAIN: { 
    base: '#9CA3AF', 
    glow: 'glow-rank-low', 
    name: 'Iron',
    minElo: 0,
    maxElo: 599
  },
  WARLORD: { 
    base: '#CD7F32', 
    glow: 'glow-rank-low', 
    name: 'Bronze',
    minElo: 600,
    maxElo: 799
  },
  RAIDER_KING: { 
    base: '#B22222', 
    glow: 'glow-rank-medium', 
    name: 'Crimson',
    minElo: 800,
    maxElo: 999
  },
  SULTAN: { 
    base: '#10B981', 
    glow: 'glow-rank-medium', 
    name: 'Emerald',
    minElo: 1000,
    maxElo: 1199
  },
  CAESAR: { 
    base: '#C0C0C0', 
    glow: 'glow-rank-medium', 
    name: 'Silver',
    minElo: 1200,
    maxElo: 1399
  },
  KHAN: { 
    base: '#9B111E', 
    glow: 'glow-rank-medium', 
    name: 'Ruby',
    minElo: 1400,
    maxElo: 1599
  },
  EMPEROR: { 
    base: '#2563EB', 
    glow: 'glow-rank-high', 
    name: 'Sapphire',
    minElo: 1600,
    maxElo: 1799
  },
  GREAT_KING: { 
    base: '#FFD700', 
    glow: 'glow-rank-high', 
    name: 'Gold',
    minElo: 1800,
    maxElo: 1999
  },
  OVERLORD: { 
    base: '#0B0B0B', 
    glow: 'glow-rank-divine', 
    name: 'Obsidian',
    minElo: 2000,
    maxElo: 2499
  },
  WORLDBREAKER: { 
    base: 'linear-gradient(90deg, #EF4444, #F59E0B)', 
    glow: 'glow-rank-divine', 
    name: 'Inferno',
    minElo: 2500,
    maxElo: Infinity
  }
} as const;

// UI Color mappings for easy access
export const UI_COLORS = {
  // Brand
  primary: 'violet',
  primarySoft: 'violet-soft',
  accent: 'gold',
  danger: 'crimson',
  
  // Surfaces
  background: 'ink',
  surface: 'surface-1',
  surfaceElevated: 'surface-2',
  
  // Text
  text: 'text',
  textMuted: 'muted',
  
  // Semantic
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'info'
} as const;
