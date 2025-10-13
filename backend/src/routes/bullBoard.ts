import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import authenticateTokenFromCookie from '../middleware/authFromCookie.js'
import { queueService } from '../services/queueService.js'
import { logger } from '../utils/logger.js'

export const createBullBoardRouter = () => {
  const router = Router()

  const serverAdapter = new ExpressAdapter()
  // Mount behind API prefix so production proxy forwards it
  const basePath = '/api/admin/queues/ui'
  serverAdapter.setBasePath(basePath)

  const queues = [
    new BullMQAdapter(queueService.getGameActionQueue()),
    new BullMQAdapter(queueService.getCleanupQueue()),
    new BullMQAdapter(queueService.getAnalyticsQueue()),
    new BullMQAdapter(queueService.getMaintenanceQueue()),
    new BullMQAdapter(queueService.getMapAssetQueue()),
  ]

  const adapters: readonly BullMQAdapter[] = queues
  createBullBoard({ queues: adapters, serverAdapter })

  // Helper endpoint to set a short-lived HttpOnly token cookie for the Bull Board UI.
  // This enables opening the board in a new tab where headers aren't attached.
  router.post('/api/admin/queues/ui/grant', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
      const jwtSecret = process.env.JWT_SECRET
      if (!jwtSecret) {
        res.status(500).json({ success: false, message: 'Server configuration error' })
        return
      }

      // Issue a short-lived, UI-scoped grant code that can be redeemed via GET to set the cookie
      const grantPayload = {
        purpose: 'bull_board_ui',
        userId: req.userId,
      }
      const grantCode = jwt.sign(grantPayload, jwtSecret, { expiresIn: '60s' })

      // Also set an HttpOnly cookie immediately for XHR-based checks
      // Scope cookie narrowly to the Bull Board UI path
      // Create a short-lived UI token
      const uiToken = jwt.sign({ userId: req.userId }, jwtSecret, { expiresIn: '15m' })
      res.cookie('auth_token', uiToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: basePath,
        // Short lifetime to reduce risk; Bull Board sessions are brief
        maxAge: 15 * 60 * 1000, // 15 minutes
      })
      res.json({ success: true, code: grantCode })
    } catch (_e) {
      res.status(500).json({ success: false, message: 'Failed to grant UI access' })
    }
  })

  // Accept a short-lived grant code and mint a UI cookie, then redirect to the Bull Board UI
  router.get('/api/admin/queues/ui/accept', async (req, res) => {
    try {
      const { code } = (req.query || {}) as { code?: string }
      const jwtSecret = process.env.JWT_SECRET
      if (!jwtSecret) {
        logger.error('BullBoard accept: missing JWT_SECRET', {
          ip: req.ip,
          ua: req.get('User-Agent'),
        })
        res.status(500).send('Server configuration error')
        return
      }
      if (!code) {
        logger.warn('BullBoard accept: missing grant code', {
          ip: req.ip,
          ua: req.get('User-Agent'),
        })
        res.status(400).send('Missing code')
        return
      }
      let decoded: { purpose?: string; userId?: string } | null = null
      try {
        decoded = jwt.verify(code, jwtSecret) as { purpose?: string; userId?: string }
      } catch (e) {
        logger.warn('BullBoard accept: grant verification failed', {
          ip: req.ip,
          ua: req.get('User-Agent'),
          error: (e as Error)?.message,
        })
        res.status(401).send('Invalid or expired code')
        return
      }
      if (!decoded || decoded.purpose !== 'bull_board_ui' || !decoded.userId) {
        logger.warn('BullBoard accept: invalid grant payload', {
          ip: req.ip,
          ua: req.get('User-Agent'),
          hasDecoded: Boolean(decoded),
          purpose: decoded?.purpose,
          hasUserId: Boolean(decoded?.userId),
        })
        res.status(403).send('Invalid code')
        return
      }

      // Ensure the user is still an admin before granting UI cookie
      const { adminService } = await import('../services/adminService.js')
      const isAdmin = await adminService.isAdmin(decoded.userId)
      if (!isAdmin) {
        logger.warn('BullBoard accept: user is not admin', {
          ip: req.ip,
          ua: req.get('User-Agent'),
          userId: decoded.userId,
        })
        res.status(403).send('Admin required')
        return
      }

      const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
      const uiToken = jwt.sign({ userId: decoded.userId }, jwtSecret, { expiresIn: '15m' })
      res.cookie('auth_token', uiToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: basePath,
        maxAge: 15 * 60 * 1000,
      })
      logger.info('BullBoard accept: UI cookie minted', {
        ip: req.ip,
        ua: req.get('User-Agent'),
        userId: decoded.userId,
        path: basePath,
      })
      res.redirect(basePath)
    } catch (_e) {
      logger.error('BullBoard accept: unexpected failure', {
        ip: req.ip,
        ua: req.get('User-Agent'),
        error: (_e as Error)?.message,
      })
      res.status(500).send('Failed to accept grant')
    }
  })
  // Guard the UI behind admin auth. Accept auth via Bearer header (if present) or
  // an HttpOnly cookie (auth_token). Explicitly skip the grant/accept helpers to
  // avoid accidental 401s during the bootstrap flow, even if Express ordering varies.
  router.use(
    basePath,
    (req, res, next) => {
      const url = req.originalUrl || ''
      if (url.startsWith(`${basePath}/accept`) || url.startsWith(`${basePath}/grant`)) {
        return next()
      }
      return authenticateTokenFromCookie(req, res, next)
    },
    requireAdmin,
    serverAdapter.getRouter(),
  )

  return router
}

export default createBullBoardRouter
