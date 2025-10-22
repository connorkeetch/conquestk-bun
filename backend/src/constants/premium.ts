import type { ThemeId } from '@conquestk/shared/types/themes'

const PREMIUM_THEME_ID_LIST: ThemeId[] = [
  'retrospace',
  'frontier',
  'metal',
  'halloween',
  'cutlers-cheese',
]

/** A set of theme IDs that are exclusive to Premium members. */
export const PREMIUM_THEME_IDS: ReadonlySet<ThemeId> = new Set(PREMIUM_THEME_ID_LIST)

const PREMIUM_COLOR_KEY_LIST = [
  'MidnightBlack',
  'PureWhite',
  'MetallicGold',
  'NeonGreen',
  'Dragonfire',
] as const

/** A set of color keys that are exclusive to Premium members. */
export const PREMIUM_COLOR_KEYS: ReadonlySet<string> = new Set(PREMIUM_COLOR_KEY_LIST)

const PREMIUM_COLOR_KEY_NORMALIZED = new Set(PREMIUM_COLOR_KEY_LIST.map((key) => key.toLowerCase()))

const PREMIUM_COLOR_HEX_VALUES = new Set(['#000000', '#FFFFFF', '#DFAF37', '#39FF14', '#FB923C'])

const PREMIUM_COLOR_GRADIENTS = new Set(['linear-gradient(45deg,#dc2626,#fb923c,#fde047)'])

/** The maximum number of active games a free player can have. */
export const PREMIUM_GAME_LIMIT = 5

/** The message displayed when a free player exceeds the game limit. */
export const PREMIUM_GAME_LIMIT_MESSAGE =
  'Free players can only participate in up to 5 active or pending games. Upgrade to Premium to unlock more slots.'

/** The message displayed when a free player tries to use a premium theme. */
export const PREMIUM_THEME_MESSAGE =
  'Premium themes are reserved for Premium members. Upgrade to unlock this theme.'

/** The message displayed when a free player tries to use a premium color. */
export const PREMIUM_COLOR_MESSAGE =
  'Premium player colors are reserved for Premium members. Upgrade to unlock these colors.'

/** A general message for premium-only features. */
export const PREMIUM_GENERAL_MESSAGE =
  'This feature is reserved for Premium members. Upgrade to unlock it.'

/** The error code used when a premium feature is accessed by a free player. */
export const PREMIUM_UPSELL_ERROR_CODE = 'PREMIUM_REQUIRED'

/** Game statuses that are considered active for the premium game limit. */
export const PREMIUM_ACTIVE_STATUS_VALUES = [
  'lobby',
  'waiting',
  'starting',
  'initializing',
  'active',
  'in_progress',
  'pending',
] as const

/**
 * Checks if a given theme ID is a premium theme.
 * @param {unknown} themeId The theme ID to check.
 * @returns {themeId is ThemeId} True if the theme ID is a premium theme.
 */
export function isPremiumThemeId(themeId: unknown): themeId is ThemeId {
  if (typeof themeId !== 'string') {
    return false
  }

  return PREMIUM_THEME_IDS.has(themeId as ThemeId)
}

/**
 * Checks if a given color choice is a premium color.
 * @param {unknown} value The color choice to check.
 * @returns {boolean} True if the color choice is a premium color.
 */
export function isPremiumColorChoice(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return false
  }

  if (PREMIUM_COLOR_KEYS.has(trimmed)) {
    return true
  }

  const lower = trimmed.toLowerCase()
  if (PREMIUM_COLOR_KEY_NORMALIZED.has(lower)) {
    return true
  }

  if (trimmed.startsWith('#')) {
    return PREMIUM_COLOR_HEX_VALUES.has(trimmed.toUpperCase())
  }

  const normalizedGradient = lower.replace(/\s+/g, '')
  if (PREMIUM_COLOR_GRADIENTS.has(normalizedGradient)) {
    return true
  }

  // Only treat the specific Dragonfire gradient as premium, not all gradients
  return false
}

/**
 * Normalizes a color value by trimming whitespace.
 * @param {unknown} value The color value to normalize.
 * @returns {string | null} The normalized color value, or null if the input is not a string.
 */
export function normalizePremiumAwareColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
