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