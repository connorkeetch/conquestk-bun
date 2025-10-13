import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import authenticateTokenFromCookie from '../middleware/authFromCookie.js'
import { queueService } from '../services/queueService.js'
import { getJwtSecrets, signJwt, verifyJwtWithAnySecret } from '../utils/jwtHelpers.js'
import { logger } from '../utils/logger.js'

// Export grant/accept routes separately so they can be mounted BEFORE the Bull Board router
export const createGrantRoute = () => {
  const router = Router()
  const basePath = '/api/admin/queues/ui'

  // Helper endpoint to set a short-lived HttpOnly token cookie for the Bull Board UI.
  // This enables opening the board in a new tab where headers aren't attached.
  router.post(`${basePath}/grant`, authenticateToken, requireAdmin, async (req, res) => {
    try {
      const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
      const secrets = getJwtSecrets()
      if (!secrets.length) {
        res.status(500).json({ success: false, message: 'Server configuration error' })
        return
      }

      // Issue a grant code that can be redeemed via GET to set the cookie
      // Use 5 minutes to allow for slower manual navigation in production
      const grantPayload = {
        purpose: 'bull_board_ui',
        userId: req.userId,
      }
      const grantCode = signJwt(grantPayload, { expiresIn: '5m' })

      // Also set an HttpOnly cookie immediately for XHR-based checks
      // Use broader path scope to cover all Bull Board subpaths
      // Create a short-lived UI token
      const uiToken = signJwt({ userId: req.userId }, { expiresIn: '15m' })
      const cookiePath = '/api/admin/queues'
      res.cookie('auth_token', uiToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: cookiePath,
        // Short lifetime to reduce risk; Bull Board sessions are brief
        maxAge: 15 * 60 * 1000, // 15 minutes
      })
      logger.info('Bull Board grant: cookie set', {
        userId: req.userId,
        path: cookiePath,
        ip: req.ip,
      })
      res.json({ success: true, code: grantCode })
    } catch (_e) {
      res.status(500).json({ success: false, message: 'Failed to grant UI access' })
    }
  })

  return router
}

export const createAcceptRoute = () => {
  const router = Router()
  const basePath = '/api/admin/queues/ui'

  // Accept a short-lived grant code and mint a UI cookie, then redirect to the Bull Board UI
  router.get(`${basePath}/accept`, async (req, res) => {
    logger.info('BullBoard accept: endpoint reached', {
      ip: req.ip,
      ua: req.get('User-Agent'),
      hasCode: Boolean(req.query?.code),
      hasCookie: Boolean(req.headers.cookie),
    })
    try {
      const { code } = (req.query || {}) as { code?: string }
      const secrets = getJwtSecrets()
      if (!secrets.length) {
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
        decoded = verifyJwtWithAnySecret<{ purpose?: string; userId?: string }>(
          code,
          secrets,
        ).payload
      } catch (e) {
        logger.warn('BullBoard accept: grant verification failed', {
          ip: req.ip,
          ua: req.get('User-Agent'),
          error: (e as Error)?.message,
          codeSnippet: code?.substring(0, 50),
        })
        res.status(401).send('Invalid or expired code - please try again')
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
      const uiToken = signJwt({ userId: decoded.userId }, { expiresIn: '15m' })
      const cookiePath = '/api/admin/queues'
      res.cookie('auth_token', uiToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: cookiePath,
        maxAge: 15 * 60 * 1000,
      })
      logger.info('BullBoard accept: UI cookie minted', {
        ip: req.ip,
        ua: req.get('User-Agent'),
        userId: decoded.userId,
        path: cookiePath,
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

  return router
}

export const createLoginRoute = () => {
  const router = Router()

  // Dedicated login endpoint outside the UI base path so guards can't intercept.
  // Accepts either a short-lived grant `code` or a raw `access_token`.
  router.get('/api/admin/queues/login', async (req, res) => {
    try {
      const secrets = getJwtSecrets()
      if (!secrets.length) {
        logger.error('BullBoard login: missing JWT secrets', {
          ip: req.ip,
          ua: req.get('User-Agent'),
        })
        res.status(500).send('Server configuration error')
        return
      }

      const { code, access_token: accessToken } = (req.query || {}) as {
        code?: string
        access_token?: string
      }

      let userId: string | undefined

      if (typeof code === 'string' && code.length > 0) {
        try {
          const decoded = verifyJwtWithAnySecret<{ purpose?: string; userId?: string }>(
            code,
            secrets,
          ).payload
          if (decoded?.purpose === 'bull_board_ui' && typeof decoded.userId === 'string') {
            userId = decoded.userId
          } else {
            logger.warn('BullBoard login: invalid grant payload', { decoded })
          }
        } catch (e) {
          logger.warn('BullBoard login: grant verification failed', {
            error: (e as Error)?.message,
          })
        }
      }

      if (!userId && typeof accessToken === 'string' && accessToken.length > 0) {
        try {
          const decoded = verifyJwtWithAnySecret<{ userId?: string }>(accessToken, secrets).payload
          if (decoded && typeof decoded.userId === 'string') {
            userId = decoded.userId
          }
        } catch (e) {
          logger.warn('BullBoard login: access_token verification failed', {
            error: (e as Error)?.message,
          })
        }
      }

      // As a final fallback, accept Authorization header if present
      if (!userId) {
        const auth = req.headers.authorization
        const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : undefined
        if (bearer) {
          try {
            const decoded = verifyJwtWithAnySecret<{ userId?: string }>(bearer, secrets).payload
            if (decoded && typeof decoded.userId === 'string') {
              userId = decoded.userId
            }
          } catch (e) {
            logger.warn('BullBoard login: header token verification failed', {
              error: (e as Error)?.message,
            })
          }
        }
      }

      if (!userId) {
        res.status(401).send('Access token required')
        return
      }

      // Ensure the user is still an admin
      const { adminService } = await import('../services/adminService.js')
      const isAdmin = await adminService.isAdmin(userId)
      if (!isAdmin) {
        res.status(403).send('Admin required')
        return
      }

      const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
      const uiToken = signJwt({ userId }, { expiresIn: '15m' })
      const cookiePath = '/api/admin/queues'
      res.cookie('auth_token', uiToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: cookiePath,
        maxAge: 15 * 60 * 1000,
      })
      logger.info('BullBoard login: UI cookie minted', { userId, path: cookiePath })
      res.redirect('/api/admin/queues/ui')
    } catch (e) {
      logger.error('BullBoard login: unexpected failure', { error: (e as Error)?.message })
      res.status(500).send('Failed to login to Bull Board')
    }
  })

  return router
}

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

  // Guard the UI behind admin auth. Accept auth via Bearer header (if present) or
  // an HttpOnly cookie (auth_token). Explicitly skip the grant/accept helpers to
  // avoid accidental 401s during the bootstrap flow, even if Express ordering varies.
  router.use(
    basePath,
    (req, res, next) => {
      const url = req.originalUrl || ''
      const rel = req.url || ''
      const p = req.path || ''

      const shouldSkip =
        url.startsWith(`${basePath}/accept`) ||
        url.startsWith(`${basePath}/grant`) ||
        rel.startsWith('/accept') ||
        rel.startsWith('/grant') ||
        p.startsWith('/accept') ||
        p.startsWith('/grant')

      logger.info('Bull Board middleware check', {
        url,
        rel,
        path: p,
        basePath,
        shouldSkip,
        checks: {
          urlStartsWithAccept: url.startsWith(`${basePath}/accept`),
          urlStartsWithGrant: url.startsWith(`${basePath}/grant`),
          relStartsWithAccept: rel.startsWith('/accept'),
          relStartsWithGrant: rel.startsWith('/grant'),
          pathStartsWithAccept: p.startsWith('/accept'),
          pathStartsWithGrant: p.startsWith('/grant'),
        },
      })

      // Skip auth for grant/accept bootstrap endpoints — ensure we bypass the rest of this chain
      if (shouldSkip) {
        logger.info('Bull Board: skipping auth via next(route)')
        return next('route')
      }

      // Log for debugging
      logger.debug('Bull Board UI: applying auth check')
      return authenticateTokenFromCookie(req, res, next)
    },
    requireAdmin,
    serverAdapter.getRouter(),
  )

  return router
}

export default createBullBoardRouter
