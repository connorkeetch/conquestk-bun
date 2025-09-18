import type { Request } from 'express'

const ABSOLUTE_URL_REGEX = /^https?:\/\//i

const normalizePath = (assetPath: string): string => {
  if (!assetPath.startsWith('/')) return `/${assetPath}`
  return assetPath
}

const getBaseUrl = (req: Request): string => {
  const override = process.env.PUBLIC_ASSET_BASE_URL?.trim()
  if (override) return override.replace(/\/$/, '')

  const protocol = req.protocol
  const host = req.get('host')
  if (host) return `${protocol}://${host}`
  return ''
}

export const resolveAssetUrl = (req: Request, assetPath?: string | null): string | null => {
  if (!assetPath) return null
  if (ABSOLUTE_URL_REGEX.test(assetPath)) return assetPath

  const baseUrl = getBaseUrl(req)
  if (!baseUrl) return normalizePath(assetPath)
  return `${baseUrl}${normalizePath(assetPath)}`
}
