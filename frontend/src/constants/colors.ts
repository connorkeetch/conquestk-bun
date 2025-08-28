/**
 * Player colors available for game selection
 * Extended set with 16 standard colors plus premium options
 */
export const STANDARD_COLORS = [
  // Original 6 colors
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  // Extended standard colors (10 more)
  'cyan',
  'pink',
  'brown',
  'lime',
  'teal',
  'indigo',
  'coral',
  'gold',
  'maroon',
  'navy',
] as const

export const PREMIUM_COLORS = [
  'black',
  'silver',
  'rainbow',    // Animated gradient
  'pulse',      // Animated pulse effect
  'metallic',   // Metallic sheen effect
  'neon',       // Neon glow effect
] as const

export const PLAYER_COLORS = [...STANDARD_COLORS, ...PREMIUM_COLORS] as const

export type PlayerColor = typeof PLAYER_COLORS[number]
export type StandardColor = typeof STANDARD_COLORS[number]
export type PremiumColor = typeof PREMIUM_COLORS[number]

/**
 * Color hex values for rendering
 * These provide good contrast on dark backgrounds
 */
export const COLOR_HEX_VALUES: Record<PlayerColor, string> = {
  // Original colors
  red: '#EF4444',      // red-500
  blue: '#3B82F6',     // blue-500
  green: '#10B981',    // emerald-500
  yellow: '#F59E0B',   // amber-500
  purple: '#A855F7',   // purple-500
  orange: '#F97316',   // orange-500
  // Extended standard colors
  cyan: '#06B6D4',     // cyan-500
  pink: '#EC4899',     // pink-500
  brown: '#92400E',    // amber-900
  lime: '#84CC16',     // lime-500
  teal: '#14B8A6',     // teal-500
  indigo: '#6366F1',   // indigo-500
  coral: '#FB7185',    // rose-400
  gold: '#EAB308',     // yellow-500
  maroon: '#881337',   // rose-900
  navy: '#1E3A8A',     // blue-900
  // Premium colors
  black: '#000000',
  silver: '#C0C0C0',
  rainbow: 'linear-gradient(90deg, #FF0000, #FF7F00, #FFFF00, #00FF00, #0000FF, #4B0082, #9400D3)',
  pulse: '#FF1493',    // Base color for pulse animation
  metallic: '#B8860B', // Base color for metallic effect
  neon: '#39FF14',     // Base color for neon effect
}

/**
 * Tailwind color classes for player colors
 * Used for consistent styling across the app
 */
export const COLOR_CLASSES: Record<PlayerColor, string> = {
  // Standard colors
  red: 'bg-red-500 text-white',
  blue: 'bg-blue-500 text-white',
  green: 'bg-emerald-500 text-white',
  yellow: 'bg-amber-500 text-black',
  purple: 'bg-purple-500 text-white',
  orange: 'bg-orange-500 text-white',
  cyan: 'bg-cyan-500 text-black',
  pink: 'bg-pink-500 text-white',
  brown: 'bg-amber-900 text-white',
  lime: 'bg-lime-500 text-black',
  teal: 'bg-teal-500 text-white',
  indigo: 'bg-indigo-500 text-white',
  coral: 'bg-rose-400 text-white',
  gold: 'bg-yellow-500 text-black',
  maroon: 'bg-rose-900 text-white',
  navy: 'bg-blue-900 text-white',
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
  // Standard colors
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  yellow: 'Yellow',
  purple: 'Purple',
  orange: 'Orange',
  cyan: 'Cyan',
  pink: 'Pink',
  brown: 'Brown',
  lime: 'Lime',
  teal: 'Teal',
  indigo: 'Indigo',
  coral: 'Coral',
  gold: 'Gold',
  maroon: 'Maroon',
  navy: 'Navy',
  // Premium colors
  black: 'Midnight Black ⭐',
  silver: 'Silver ⭐',
  rainbow: 'Rainbow ⭐',
  pulse: 'Pulse ⭐',
  metallic: 'Metallic Gold ⭐',
  neon: 'Neon Green ⭐',
}