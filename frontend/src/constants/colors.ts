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
 * 6. /frontend/src/components/ConquestKBoard.tsx - Game board rendering
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

// Color-blind friendly palette (Okabe-Ito extended)
// Source core: Okabe & Ito (2008), extended to 12 by repeating distinct hues
const COLORBLIND_PLAYER_COLORS: readonly string[] = [
  '#D55E00', // Vermilion
  '#0072B2', // Blue
  '#CC79A7', // Reddish purple
  '#E69F00', // Orange
  '#56B4E9', // Sky blue
  '#009E73', // Bluish green
  '#F0E442', // Yellow
  '#000000', // Black
  '#D55E00', // Vermilion (repeat distinct)
  '#0072B2', // Blue (repeat distinct)
  '#009E73', // Bluish green (repeat distinct)
  '#CC79A7', // Reddish purple (repeat distinct)
]

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
    // Distinct multi-hue gradient with a molten core feel
    gradient:
      'conic-gradient(from 20deg at 50% 50%, #7A0B0B 0%, #DC2626 22%, #FB923C 58%, #FDE047 78%, #DC2626 100%)',
    solid: '#FB923C',
    outline: '#B45309',
    // Custom effect tailored for tokens and small badges
    effect: 'dragonfire',
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
    name: 'Overlord',
    minElo: 2000,
    maxElo: 2199,
  },
  WORLDBREAKER: {
    base: 'linear-gradient(90deg, #EF4444, #F59E0B)', // Fire gradient
    glow: 'glow-rank-divine',
    name: 'Worldbreaker',
    minElo: 2200,
    maxElo: Infinity,
  },
} as const

// Legacy compatibility - keeping some old exports for backward compatibility
export type PlayerColor = string

// Helper functions
export const getPlayerColor = (index: number): string => {
  return PLAYER_COLORS[index % PLAYER_COLORS.length]
}

export type PremiumColorKey = keyof typeof PREMIUM_PLAYER_COLORS

// Common shape for premium color entries across the map
type PremiumColorDefinition = {
  solid: string
  outline?: string
  effect?: string
  gradient?: string
  description?: string
}

export type PremiumColorMeta = PremiumColorDefinition & { key: PremiumColorKey }

export const getPremiumPlayerColor = (key: PremiumColorKey): PremiumColorDefinition => {
  return (PREMIUM_PLAYER_COLORS as Record<PremiumColorKey, PremiumColorDefinition>)[key]
}

export const getPremiumColorMeta = (
  color?: PlayerColor | string | null,
): PremiumColorMeta | undefined => {
  if (!color) return undefined

  const str = String(color).trim()
  if (!str) return undefined

  const byKey = (PREMIUM_PLAYER_COLORS as Record<PremiumColorKey, PremiumColorDefinition>)[
    str as PremiumColorKey
  ]
  if (byKey) {
    return { key: str as PremiumColorKey, ...byKey }
  }

  const lower = str.toLowerCase()
  const entry = Object.entries(PREMIUM_PLAYER_COLORS).find(([, value]) => {
    const solid = value.solid?.toLowerCase()
    if (solid && solid === lower) return true
    if ('gradient' in value && typeof value.gradient === 'string') {
      return value.gradient.toLowerCase() === lower
    }
    return false
  })

  if (!entry) return undefined

  const [key, value] = entry
  return { key: key as PremiumColorKey, ...value }
}

export const getPremiumEffect = (
  color?: PlayerColor | string | null,
): PremiumColorDefinition['effect'] | undefined => {
  return getPremiumColorMeta(color)?.effect
}

/**
 * Resolve a player's color for text usage. Premium entries fall back to their solid tone so the
 * username renders consistently, gradients remain reserved for token fills.
 */
export const getPlayerTextColor = (color?: PlayerColor | string | null): string | undefined => {
  if (!color) return undefined
  const meta = getPremiumColorMeta(color)
  if (meta?.solid) {
    return meta.solid
  }
  try {
    return getColorValue(color as PlayerColor)
  } catch {
    return undefined
  }
}

export const isPureWhiteColor = (color?: PlayerColor | string | null): boolean => {
  const meta = getPremiumColorMeta(color)
  if (meta?.solid) {
    return meta.solid.toLowerCase() === '#ffffff'
  }

  if (typeof color === 'string') {
    const normalized = color.trim().toLowerCase()
    return normalized === '#ffffff' || normalized === 'white'
  }

  return false
}

export const getRankColor = (elo: number) => {
  const ranks = Object.values(RANK_COLORS)
  return ranks.find((rank) => elo >= rank.minElo && elo <= rank.maxElo) || RANK_COLORS.CHIEFTAIN
}

// Legacy compatibility functions for components that haven't been fully migrated
export const getColorValue = (color: PlayerColor): string => {
  // Normalize simple named colors coming from the shared backend types to our hex palette
  // This bridges backend PlayerColor name values (e.g. 'red', 'blue') to frontend hex tokens
  const namedToHex: Record<string, string> = {
    red: '#DC2626',
    blue: '#2563EB',
    green: '#059669',
    yellow: '#F59E0B',
    purple: '#7C3AED',
    orange: '#EA580C',
    cyan: '#06B6D4',
    pink: '#EC4899',
    brown: '#5C4033',
    lime: '#014421',
    indigo: '#7C3AED',
    teal: '#06B6D4',
  }

  // If we receive a named color, map it to a known hex
  const lower = typeof color === 'string' ? color.toLowerCase() : ''
  if (lower in namedToHex) {
    const hex = namedToHex[lower]
    // Ensure the mapped hex is part of our standard palette to keep visuals consistent
    if ((PLAYER_COLORS as readonly string[]).includes(hex)) {
      return hex
    }
  }

  // If it's one of our standard player colors (exact hex match), return it
  if ((PLAYER_COLORS as readonly string[]).includes(color)) {
    // If colorblind mode is enabled, map to color-blind-friendly palette by index
    try {
      const isColorblind = document?.documentElement.getAttribute('data-colorblind')
      if (isColorblind) {
        const idx = (PLAYER_COLORS as readonly string[]).indexOf(color)
        if (idx >= 0) return COLORBLIND_PLAYER_COLORS[idx % COLORBLIND_PLAYER_COLORS.length]
      }
    } catch {
      // ignore environment issues
    }
    return color
  }

  // If it's any valid hex color, return as-is rather than falling back to red
  if (typeof color === 'string' && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color.trim())) {
    return color.trim()
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
  // Support both hex values and premium color keys
  const map: Record<string, string> = {
    // Standard colors (12)
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
    // Premium hex fallbacks
    '#000000': 'Midnight Black',
    '#FFFFFF': 'Pure White',
    '#DFAF37': 'Metallic Gold',
    '#39FF14': 'Neon Green',
    '#FB923C': 'Dragonfire',
    // Premium keys
    MidnightBlack: 'Midnight Black',
    PureWhite: 'Pure White',
    MetallicGold: 'Metallic Gold',
    NeonGreen: 'Neon Green',
    Dragonfire: 'Dragonfire',
  }

  return map[color] || color
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
