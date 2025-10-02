import type { Request } from 'express'

/**
 * Build an absolute URL to the frontend from a request.
 * Priority:
 * 1) FRONTEND_URL env (explicit and recommended)
 * 2) Derived from request host/proto (works behind proxies due to trust proxy)
 * 3) Sensible defaults per NODE_ENV
 */
export function buildFrontendUrl(req: Request, path: string): string {
  const configured = process.env.FRONTEND_URL?.trim()
  if (configured) {
    return joinUrl(configured, path)
  }

  // Derive from request when behind proxy (Express trust proxy is enabled in server)
  const protocol = req.protocol || 'https'
  const host = req.get('host')
  if (host) {
    return joinUrl(`${protocol}://${host}`, path)
  }

  // Environment-based fallback
  if (process.env.NODE_ENV === 'production') {
    return joinUrl('https://conquestk.com', path)
  }
  if (process.env.NODE_ENV === 'staging') {
    return joinUrl('https://risk-game-production-9935.up.railway.app', path)
  }
  return joinUrl('http://localhost:5173', path)
}

function joinUrl(base: string, path: string): string {
  const cleanedBase = base.replace(/\/$/, '')
  const cleanedPath = path.startsWith('/') ? path : `/${path}`
  return `${cleanedBase}${cleanedPath}`
}

/**
 * Resolve a map/media asset URL to a publicly accessible URL.
 * - If given an absolute URL, return as-is.
 * - If given a local `/uploads/...` path, prefix with request host.
 * - Otherwise, treat the value as a storage key and resolve via asset storage config.
 */
export function resolveAssetUrl(req: Request, value?: string | null): string | null {
  if (!value) return null
  const url = value.trim()
  if (!url) return null

  if (/^https?:\/\//i.test(url)) {
    return url
  }

  if (url.startsWith('/uploads/')) {
    const protocol = req.protocol || 'https'
    const host = req.get('host') || ''
    if (host) return `${protocol}://${host}${url}`
    return url
  }

  // Treat as storage key
  try {
    const { getPublicAssetUrl } = require('./assetStorage') as typeof import('./assetStorage')
    return getPublicAssetUrl(url)
  } catch {
    // Fallback to returning original value if storage helper is unavailable
    return url
  }
}
