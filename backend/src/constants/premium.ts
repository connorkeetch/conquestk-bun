import type { ThemeId } from '@risk-game/shared/types/themes'

const PREMIUM_THEME_ID_LIST: ThemeId[] = [
  'retrospace',
  'frontier',
  'metal',
  'halloween',
  'cutlers-cheese',
]

export const PREMIUM_THEME_IDS: ReadonlySet<ThemeId> = new Set(PREMIUM_THEME_ID_LIST)

const PREMIUM_COLOR_KEY_LIST = [
  'MidnightBlack',
  'PureWhite',
  'MetallicGold',
  'NeonGreen',
  'Dragonfire',
] as const

export const PREMIUM_COLOR_KEYS: ReadonlySet<string> = new Set(PREMIUM_COLOR_KEY_LIST)

const PREMIUM_COLOR_KEY_NORMALIZED = new Set(PREMIUM_COLOR_KEY_LIST.map((key) => key.toLowerCase()))

const PREMIUM_COLOR_HEX_VALUES = new Set(['#000000', '#FFFFFF', '#DFAF37', '#39FF14', '#FB923C'])

const PREMIUM_COLOR_GRADIENTS = new Set(['linear-gradient(45deg,#dc2626,#fb923c,#fde047)'])

export const PREMIUM_GAME_LIMIT = 5

export const PREMIUM_GAME_LIMIT_MESSAGE =
  'Free players can only participate in up to 5 active or pending games. Upgrade to Premium to unlock more slots.'

export const PREMIUM_THEME_MESSAGE =
  'Premium themes are reserved for Premium members. Upgrade to unlock this theme.'

export const PREMIUM_COLOR_MESSAGE =
  'Premium player colors are reserved for Premium members. Upgrade to unlock these colors.'

export const PREMIUM_GENERAL_MESSAGE =
  'This feature is reserved for Premium members. Upgrade to unlock it.'

export const PREMIUM_UPSELL_ERROR_CODE = 'PREMIUM_REQUIRED'

export const PREMIUM_ACTIVE_STATUS_VALUES = [
  'lobby',
  'waiting',
  'starting',
  'initializing',
  'active',
  'in_progress',
  'pending',
] as const

export function isPremiumThemeId(themeId: unknown): themeId is ThemeId {
  if (typeof themeId !== 'string') {
    return false
  }

  return PREMIUM_THEME_IDS.has(themeId as ThemeId)
}

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

export function normalizePremiumAwareColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
