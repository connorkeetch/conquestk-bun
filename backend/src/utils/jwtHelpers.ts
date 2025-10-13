import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { logger } from './logger.js'

export type VerifiedJwt<T extends object = jwt.JwtPayload> = {
  payload: T
  secretUsed: string
}

export const getJwtSecrets = (): string[] => {
  const primary = (process.env.JWT_SECRET || '').trim()
  const extra = (process.env.JWT_SECRETS || '').trim()
  const extras = extra
    ? extra
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : []
  const all = [primary, ...extras].filter((s) => s.length > 0)
  // De-duplicate while preserving order
  return Array.from(new Set(all))
}

export const hashSecret = (secret: string): string => {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

export const verifyJwtWithAnySecret = <T extends object = jwt.JwtPayload>(
  token: string,
  secrets = getJwtSecrets(),
): VerifiedJwt<T> => {
  if (!secrets || secrets.length === 0) {
    const msg = 'JWT secret(s) not configured'
    logger.error(msg)
    const err = new Error(msg)
    ;(err as Error & { status?: number }).status = 500
    throw err
  }

  let lastError: unknown = null
  for (const s of secrets) {
    try {
      const decoded = jwt.verify(token, s) as T
      return { payload: decoded, secretUsed: s }
    } catch (e) {
      lastError = e
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Invalid token')
}
export const signJwt = (payload: object, options?: jwt.SignOptions): string => {
  const [primary] = getJwtSecrets()
  if (!primary) {
    throw new Error('JWT secret not configured')
  }
  return jwt.sign(payload, primary, options)
}
