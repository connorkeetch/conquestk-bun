/**
 * Shared theme identifiers to keep frontend and backend in sync.
 * These values control both the CSS data-theme attribute on the frontend
 * and the persisted value stored in the database via the backend.
 */

export const THEME_IDS = [
  'default',
  'dark',
  'light',
  'violet-dark',
  'violet-light',
  'blue-dark',
  'blue-light',
  'red-dark',
  'red-light',
  'green-dark',
  'green-light',
  'black',
  'highcontrast',
  'retrospace',
  'frontier',
  'metal',
  'halloween',
  'cutlers-cheese',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME_ID: ThemeId = 'default'

const THEME_ID_SET = new Set<string>(THEME_IDS)

export function isThemeId(value: unknown): value is ThemeId {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  return THEME_ID_SET.has(trimmed)
}

export function normalizeThemeId(value: unknown): ThemeId {
  if (typeof value !== 'string') {
    return DEFAULT_THEME_ID
  }

  const normalizedInput = value.trim().toLowerCase()

  if (THEME_ID_SET.has(normalizedInput)) {
    return normalizedInput as ThemeId
  }

  return DEFAULT_THEME_ID
}
