import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth'
import { authenticateToken } from '../middleware/auth'
import { queueService } from '../services/queueService'

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
  router.use(basePath, authenticateToken, requireAdmin, serverAdapter.getRouter())
  return router
}

export default createBullBoardRouter
