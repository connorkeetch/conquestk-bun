import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import authenticateTokenFromCookie from '../middleware/authFromCookie.js'
import { queueService } from '../services/queueService.js'

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

  createBullBoard({ queues: queues as unknown as readonly never[], serverAdapter })

  // Guard the UI behind admin auth
  // Accept auth via Bearer header (if present) or an HttpOnly cookie (auth_token)
  router.use(basePath, authenticateTokenFromCookie, requireAdmin, serverAdapter.getRouter())

  // Helper endpoint to set a short-lived HttpOnly token cookie for the Bull Board UI.
  // This enables opening the board in a new tab where headers aren't attached.
  router.post('/api/admin/queues/ui/grant', authenticateToken, requireAdmin, (req, res) => {
    try {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : undefined
      if (!token) {
        res.status(401).json({ message: 'Access token required' })
        return
      }

      const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
      // Scope cookie narrowly to the Bull Board UI path
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: basePath,
        // Short lifetime to reduce risk; Bull Board sessions are brief
        maxAge: 15 * 60 * 1000, // 15 minutes
      })
      res.json({ success: true })
    } catch (_e) {
      res.status(500).json({ success: false, message: 'Failed to grant UI access' })
    }
  })
  return router
}

export default createBullBoardRouter
