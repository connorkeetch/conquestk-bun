const ASSET_BASE = import.meta.env.VITE_ASSET_BASE_URL?.trim().replace(/\/$/, '') || ''
const ABSOLUTE_URL_REGEX = /^https?:\/\//i

export const resolveAssetPath = (relativePath: string): string => {
  if (!relativePath) return relativePath
  if (ABSOLUTE_URL_REGEX.test(relativePath)) return relativePath

  const normalized = relativePath.replace(/^\/+/, '')
  if (!normalized) return ASSET_BASE || '/'

  if (!ASSET_BASE) {
    return `/${normalized}`
  }

  return `${ASSET_BASE}/${normalized}`
}

export const getAssetBaseUrl = (): string => ASSET_BASE
