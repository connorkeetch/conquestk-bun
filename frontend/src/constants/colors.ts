// Conquest K Color System Constants
// 🎯 COLOR CONSTANTS FOR GAME ELEMENTS (Player colors, ranks, etc.)
//
// ⚠️ IMPORTANT: THEMES ARE NOW IN CSS, NOT HERE!
// - Theme definitions: /frontend/src/app.css (search for [data-theme=)
// - Theme metadata: /frontend/src/config/themes.config.ts
// - Theme switching: Pure CSS via data-theme attribute
//
// This file now contains:
// - Player colors (PLAYER_COLORS, PREMIUM_PLAYER_COLORS)
// - Rank colors (RANK_COLORS)
// - Core UI colors (CORE_COLORS - still used by some components)
// - Helper functions for color management

/* ===========================================================================
 * PLAYER COLOR SYSTEM DOCUMENTATION
 * ===========================================================================
 *
 * 🎨 PLAYER COLORS LOCATION:
 * - Main definition: PLAYER_COLORS array (line ~395)
 * - Premium colors: PREMIUM_PLAYER_COLORS object (line ~415)
 * - Display names: getColorDisplayName() function (line ~585)
 *
 * 📍 WHERE PLAYER COLORS ARE USED:
 * 1. /frontend/src/constants/colors.ts - Main definitions
 * 2. /frontend/src/pages/CreateGamePage.tsx - Color picker in game creation
 * 3. /frontend/src/pages/Settings.tsx - Preferred color selection
 * 4. /frontend/src/components/ProfilePage.tsx - Avatar backgrounds
 * 5. /frontend/src/pages/GameRoom.tsx - Active game player colors
 * 6. /frontend/src/components/RiskGameBoard.tsx - Game board rendering
 * 7. /frontend/src/app.css - CSS variables for Tailwind (lines 110-122)
 * 8. /frontend/src/store/settingsSlice.ts - Default preferred color
 *
 * 🔧 HOW TO CHANGE PLAYER COLORS:
 * 1. Update PLAYER_COLORS array with new hex values (12 colors total)
 * 2. Update playerColorNames in CreateGamePage.tsx to match the order
 * 3. Update getColorDisplayName() function with new color mappings
 * 4. Update CSS variables in app.css if color variables changed
 * 5. Search for hardcoded hex values and update them
 *
 * ⚠️ IMPORTANT NOTES:
 * - Always use exactly 12 standard colors for player selection
 * - Colors must be distinguishable on dark backgrounds
 * - Order colors by hue for better visual organization
 * - Premium colors (5 total) are separate and require special handling
 * - Default color is PLAYER_COLORS[0] (currently Red #DC2626)
 *
 * 🎯 COLOR REQUIREMENTS:
 * - Must be visible on dark backgrounds (#0F172A, #111827)
 * - Must be distinguishable from each other at small sizes
 * - Should avoid colors too similar within the set
 * - Should support colorblind users when possible
 * ===========================================================================
 */

// ===== PLAYER COLORS =====
// Player colors - Organized by hue for maximum distinguishability
// Each color tested to be visually distinct on dark backgrounds
export const PLAYER_COLORS = [
  // Reds & Pinks
  '#DC2626', // Red - Classic aggressive (bright red)
  '#851D2D', // Crimson - Dark crimson
  '#EC4899', // Pink - Vibrant magenta-pink (distinct from reds)

  // Oranges & Yellows
  '#EA580C', // Orange - True orange (distinct from amber)
  '#F59E0B', // Amber - Golden yellow-orange (yellower than orange)

  // Greens
  '#014421', // Forest Green - Deep forest green
  '#059669', // Emerald - Rich, distinct from neon

  // Blues
  '#2563EB', // Blue - Pure blue (traditional)
  '#06B6D4', // Cyan - Light blue (clearly lighter than pure blue)

  // Purples
  '#7C3AED', // Violet - Deep purple, very distinct

  // Earth Tones
  '#918151', // Tan - Light brown/tan
  '#5C4033', // Brown - Deep coffee brown
] as const

// ===== PREMIUM PLAYER COLORS =====
// Premium player colors with special effects
export const PREMIUM_PLAYER_COLORS = {
  MidnightBlack: {
    solid: '#000000',
    outline: '#FFFFFF',
    effect: 'subtle-starfield',
    description: 'The void between stars',
  },
  PureWhite: {
    solid: '#FFFFFF',
    outline: '#000000',
    effect: 'pearl-shimmer',
    description: 'Pristine and untouchable',
  },
  MetallicGold: {
    solid: '#DFAF37',
    effect: 'metallic-gradient',
    outline: '#B8860B',
    description: 'The color of victory',
  },
  NeonGreen: {
    solid: '#39FF14',
    effect: 'electric-glow',
    outline: '#2FB510',
    description: 'Radioactive power',
  },
  Dragonfire: {
    gradient: 'linear-gradient(45deg, #DC2626, #FB923C, #FDE047)',
    solid: '#FB923C',
    effect: 'flame-particles',
    description: 'Burning conquest',
  },
} as const

// ===== RANK COLORS =====
// All rank colors now reference CORE_COLORS - change rank colors by updating CORE_COLORS above
export const RANK_COLORS = {
  CHIEFTAIN: {
    base: '#9CA3AF', // Iron gray
    glow: 'glow-rank-low',
    name: 'Iron',
    minElo: 0,
    maxElo: 599,
  },
  WARLORD: {
    base: '#92400E', // Brown metal
    glow: 'glow-rank-low',
    name: 'Bronze',
    minElo: 600,
    maxElo: 799,
  },
  RAIDER_KING: {
    base: '#B22222', // Crimson red
    glow: 'glow-rank-medium',
    name: 'Crimson',
    minElo: 800,
    maxElo: 999,
  },
  SULTAN: {
    base: '#10B981', // Emerald green
    glow: 'glow-rank-medium',
    name: 'Emerald',
    minElo: 1000,
    maxElo: 1199,
  },
  CAESAR: {
    base: '#C0C0C0', // Silver metal
    glow: 'glow-rank-medium',
    name: 'Silver',
    minElo: 1200,
    maxElo: 1399,
  },
  KHAN: {
    base: '#9B111E', // Deep ruby red
    glow: 'glow-rank-medium',
    name: 'Ruby',
    minElo: 1400,
    maxElo: 1599,
  },
  EMPEROR: {
    base: '#2563EB', // Sapphire blue
    glow: 'glow-rank-high',
    name: 'Sapphire',
    minElo: 1600,
    maxElo: 1799,
  },
  GREAT_KING: {
    base: '#FFD700', // Gold metal
    glow: 'glow-rank-high',
    name: 'Gold',
    minElo: 1800,
    maxElo: 1999,
  },
  OVERLORD: {
    base: '#000000', // Obsidian black
    glow: 'glow-rank-divine',
    name: 'Obsidian',
    minElo: 2000,
    maxElo: 2499,
  },
  APOCALYPSE: {
    base: 'linear-gradient(90deg, #EF4444, #F59E0B)', // Fire gradient
    glow: 'glow-rank-divine',
    name: 'Inferno',
    minElo: 2500,
    maxElo: Infinity,
  },
} as const

// Legacy compatibility - keeping some old exports for backward compatibility
export type PlayerColor = string

// Helper functions
export const getPlayerColor = (index: number): string => {
  return PLAYER_COLORS[index % PLAYER_COLORS.length]
}

export const getPremiumPlayerColor = (key: keyof typeof PREMIUM_PLAYER_COLORS) => {
  return PREMIUM_PLAYER_COLORS[key]
}

export const getRankColor = (elo: number) => {
  const ranks = Object.values(RANK_COLORS)
  return ranks.find((rank) => elo >= rank.minElo && elo <= rank.maxElo) || RANK_COLORS.CHIEFTAIN
}

// Legacy compatibility functions for components that haven't been fully migrated
export const getColorValue = (color: PlayerColor): string => {
  // Check if it's a regular player color (hex value)
  if ((PLAYER_COLORS as readonly string[]).includes(color)) {
    return color
  }

  // Check if it's a premium color
  const premiumColor = PREMIUM_PLAYER_COLORS[color as keyof typeof PREMIUM_PLAYER_COLORS]
  if (premiumColor) {
    return 'gradient' in premiumColor
      ? premiumColor.gradient || premiumColor.solid
      : premiumColor.solid
  }

  // Fallback to first player color
  return PLAYER_COLORS[0]
}

export const getColorDisplayName = (color: string): string => {
  const colorMap: Record<string, string> = {
    // Standard colors (13) - organized by hue
    '#DC2626': 'Red',
    '#851D2D': 'Crimson',
    '#EC4899': 'Pink',
    '#EA580C': 'Orange',
    '#F59E0B': 'Amber',
    '#014421': 'Forest Green',
    '#059669': 'Emerald',
    '#2563EB': 'Blue',
    '#06B6D4': 'Cyan',
    '#7C3AED': 'Violet',
    '#918151': 'Tan',
    '#5C4033': 'Brown',
    // Premium colors (5)
    '#000000': 'Midnight Black',
    '#FFFFFF': 'Pure White',
    '#DFAF37': 'Metallic Gold',
    '#39FF14': 'Neon Green',
    '#FB923C': 'Dragonfire',
  }

  return colorMap[color] || color
}

export const isPremiumColor = (color: PlayerColor): boolean => {
  return color in PREMIUM_PLAYER_COLORS
}

export const isGradientColor = (color: PlayerColor): boolean => {
  const premiumColor = PREMIUM_PLAYER_COLORS[color as keyof typeof PREMIUM_PLAYER_COLORS]
  return premiumColor && 'gradient' in premiumColor
}

// Create arrays for compatibility
export const STANDARD_COLORS = PLAYER_COLORS
export const PREMIUM_COLORS = Object.keys(PREMIUM_PLAYER_COLORS)
export const COLOR_HEX_VALUES: Record<string, string> = {
  ...Object.fromEntries(PLAYER_COLORS.map((color) => [color, color])),
  ...Object.fromEntries(
    Object.entries(PREMIUM_PLAYER_COLORS).map(([key, value]) => [
      key,
      'gradient' in value ? value.gradient || value.solid : value.solid,
    ]),
  ),
}
export const COLOR_DISPLAY_NAMES: Record<string, string> = {
  ...Object.fromEntries(PLAYER_COLORS.map((color) => [color, getColorDisplayName(color)])),
  ...Object.fromEntries(
    Object.keys(PREMIUM_PLAYER_COLORS).map((key) => [key, getColorDisplayName(key)]),
  ),
}
export const COLOR_CLASSES: Record<string, string> = {
  ...Object.fromEntries(PLAYER_COLORS.map((color) => [color, 'text-white'])),
  ...Object.fromEntries(Object.keys(PREMIUM_PLAYER_COLORS).map((key) => [key, 'text-white'])),
}
