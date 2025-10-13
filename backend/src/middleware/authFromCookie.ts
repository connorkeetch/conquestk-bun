import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { getJwtSecrets, signJwt, verifyJwtWithAnySecret } from '../utils/jwtHelpers.js'
import { logger } from '../utils/logger.js'
import { authenticateToken } from './auth.js'

// Lightweight cookie parser to avoid bringing a new dependency just for this case
const parseCookie = (cookieHeader: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!cookieHeader) return out
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [rawKey, ...rest] = part.split('=')
    if (!rawKey || rest.length === 0) continue
    const key = rawKey.trim()
    const value = rest.join('=').trim()
    try {
      out[key] = decodeURIComponent(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

/**
 * Authenticate using Bearer token header if present, otherwise fall back to a cookie.
 * Intended for UI routes (like Bull Board) where browser navigation cannot attach headers.
 */
export const authenticateTokenFromCookie: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // If an Authorization header is already present, defer to the standard middleware
  const existing = req.headers.authorization
  if (existing?.startsWith('Bearer ')) {
    return authenticateToken(req, res, next)
  }

  // Accept token/grant via query string for UI flows where the browser cannot attach headers
  // Supported params (case-sensitive): access_token, accessToken, token, code
  // - If a short-lived grant `code` is provided, verify and mint a UI-scoped token cookie
  // - If an access token is provided, verify and mint a UI-scoped token cookie
  // Either path avoids relying on headers and enables subsequent XHR calls from the UI
  const q = req.query as Record<string, unknown>
  const queryAccessToken = [q.access_token, q.accessToken, q.token].find(
    (v) => typeof v === 'string' && v.length > 0,
  ) as string | undefined
  const queryGrantCode =
    typeof q.code === 'string' && q.code.length > 0 ? (q.code as string) : undefined

  const secrets = getJwtSecrets()
  const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
  const uiCookiePath = '/api/admin/queues'

  const tryMintUiCookieFromPayload = (payload: unknown) => {
    if (!secrets.length) return false
    // Accept payloads that include a userId
    const userId =
      payload && typeof payload === 'object' ? (payload as { userId?: unknown }).userId : undefined
    if (typeof userId !== 'string' || userId.length === 0) return false
    const uiToken = signJwt({ userId }, { expiresIn: '15m' })
    res.cookie('auth_token', uiToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: uiCookiePath,
      maxAge: 15 * 60 * 1000,
    })
    // Also set Authorization header for this request
    req.headers.authorization = `Bearer ${uiToken}`
    return true
  }

  // Prefer redeeming a grant code first if present
  if (queryGrantCode && secrets.length) {
    try {
      const decoded = verifyJwtWithAnySecret(queryGrantCode, secrets).payload
      if (tryMintUiCookieFromPayload(decoded)) {
        return authenticateToken(req, res, next)
      }
    } catch {
      // fall through to access token/cookie paths
    }
  }

  // Next, accept an access token directly via query param
  if (queryAccessToken && secrets.length) {
    try {
      const decoded = verifyJwtWithAnySecret(queryAccessToken, secrets).payload
      if (tryMintUiCookieFromPayload(decoded)) {
        return authenticateToken(req, res, next)
      }
    } catch {
      // fall through to cookie path
    }
  }

  const cookies = parseCookie(req.headers.cookie)
  const token = cookies.auth_token || cookies.token
  if (!token) {
    // Add debug logging to help diagnose cookie issues
    logger.warn('authFromCookie: no token found', {
      path: req.path,
      originalUrl: req.originalUrl,
      hasCookieHeader: Boolean(req.headers.cookie),
      cookieKeys: Object.keys(cookies),
      ip: req.ip,
    })
    res.status(401).json({ message: 'Access token required' })
    return
  }

  // Inject a synthetic Authorization header so we can reuse authenticateToken
  req.headers.authorization = `Bearer ${token}`
  return authenticateToken(req, res, next)
}

export default authenticateTokenFromCookie
