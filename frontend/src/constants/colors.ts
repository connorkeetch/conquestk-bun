/**
 * Player colors available for game selection
 * Extended set with 12 distinct, high-contrast colors
 */
export const PLAYER_COLORS = [
  // Original 6 colors
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  // New 6 colors - distinct and high contrast
  'cyan',
  'pink',
  'brown',
  'lime',
  'teal',
  'indigo',
] as const

export type PlayerColor = typeof PLAYER_COLORS[number]

/**
 * Color hex values for rendering
 * These provide good contrast on dark backgrounds
 */
export const COLOR_HEX_VALUES: Record<PlayerColor, string> = {
  red: '#EF4444',      // red-500
  blue: '#3B82F6',     // blue-500
  green: '#10B981',    // emerald-500
  yellow: '#F59E0B',   // amber-500
  purple: '#A855F7',   // purple-500
  orange: '#F97316',   // orange-500
  cyan: '#06B6D4',     // cyan-500
  pink: '#EC4899',     // pink-500
  brown: '#92400E',    // amber-900
  lime: '#84CC16',     // lime-500
  teal: '#14B8A6',     // teal-500
  indigo: '#6366F1',   // indigo-500
}

/**
 * Tailwind color classes for player colors
 * Used for consistent styling across the app
 */
export const COLOR_CLASSES: Record<PlayerColor, string> = {
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
}