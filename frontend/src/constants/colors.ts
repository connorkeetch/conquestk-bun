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
