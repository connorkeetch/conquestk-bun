import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { query } from '../config/database'
import type { RequestUser } from '../types/express'
import { getErrorMessage, toKnownError } from '../utils/errorHelpers'
import { logger } from '../utils/logger'

type AuthTokenPayload = jwt.JwtPayload & {
  userId: string
}

// Extend Request interface
declare module 'express-serve-static-core' {
  interface Request {
    userId: string
    user?: RequestUser
  }
}

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization
  const token = authHeader?.split(' ')[1]

  if (!token) {
    res.status(401).json({ message: 'Access token required' })
    return
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret')
    if (!decoded || typeof decoded !== 'object' || typeof (decoded as AuthTokenPayload).userId !== 'string') {
      logger.warn('Token verification succeeded but payload was invalid')
      res.status(403).json({ message: 'Invalid token payload' })
      return
    }

    const payload = decoded as AuthTokenPayload
    req.userId = payload.userId

    // Optionally fetch user details for req.user
    try {
      const result = await query('SELECT id, username, email FROM users WHERE id = $1', [
        payload.userId,
      ])
      if (result.rows[0]) {
        // Check if user is admin
        const adminResult = await query(
          'SELECT COUNT(*) as count FROM user_admin_roles WHERE user_id = $1',
          [payload.userId],
        )
        const isAdmin = adminResult.rows[0]?.count > 0

        req.user = {
          id: result.rows[0].id,
          username: result.rows[0].username,
          email: result.rows[0].email,
          isAdmin,
        }
      }
    } catch (dbError) {
      // Log but don't fail auth if database lookup fails
      logger.warn('Failed to fetch user details:', getErrorMessage(dbError))
    }

    next()
  } catch (error) {
    logger.error('Token verification failed:', toKnownError(error))
    res.status(403).json({ message: 'Invalid token' })
    return
  }
}
