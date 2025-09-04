import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger'
import { query } from '../config/database'

// Extend Request interface
declare module 'express-serve-static-core' {
  interface Request {
    userId?: string
    user?: {
      id: string
      username?: string
      email?: string
      isAdmin?: boolean
    }
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any
    req.userId = decoded.userId

    // Optionally fetch user details for req.user
    try {
      const result = await query(
        'SELECT id, username, email FROM users WHERE id = $1',
        [decoded.userId],
      )
      if (result.rows[0]) {
        // Check if user is admin
        const adminResult = await query(
          'SELECT COUNT(*) as count FROM user_admin_roles WHERE user_id = $1',
          [decoded.userId],
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
      logger.warn('Failed to fetch user details:', dbError)
    }

    next()
  } catch (error) {
    logger.error('Token verification failed:', error)
    res.status(403).json({ message: 'Invalid token' })
    return
  }
}
