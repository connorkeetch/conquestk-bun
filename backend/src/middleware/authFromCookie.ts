import type { NextFunction, Request, RequestHandler, Response } from 'express'
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

  const cookies = parseCookie(req.headers.cookie)
  const token = cookies.auth_token || cookies.token
  if (!token) {
    res.status(401).json({ message: 'Access token required' })
    return
  }

  // Inject a synthetic Authorization header so we can reuse authenticateToken
  req.headers.authorization = `Bearer ${token}`
  return authenticateToken(req, res, next)
}

export default authenticateTokenFromCookie
