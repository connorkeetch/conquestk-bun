import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth'
import { authenticateToken } from '../middleware/auth'
import { queueService } from '../services/queueService'
import { handleRouteError } from '../utils/routeErrorHandler'

const router = Router()

router.use(authenticateToken)
router.use(requireAdmin)

// GET /api/admin/queues/dlq?queue=gameActions&offset=0&limit=50
router.get('/dlq', async (req, res) => {
  try {
    const _q = String(
      req.query.queue || '',
    ) as keyof typeof import('../services/queueService').queueService
    const key =
      (req.query.queue as 'gameActions' | 'gameCleanup' | 'analyticsEvents') || 'gameActions'
    const offset = Number(req.query.offset ?? 0)
    const limit = Number(req.query.limit ?? 50)
    const rows = await queueService.listDeadLetters(key, { offset, limit })
    res.json({ success: true, items: rows })
  } catch (error) {
    handleRouteError(error, req, 'Failed to list DLQ jobs')
    res.status(500).json({ success: false, error: 'Failed to list DLQ jobs' })
  }
})

// POST /api/admin/queues/dlq/requeue { queue: 'gameActions', jobId: '...' }
router.post('/dlq/requeue', async (req, res) => {
  try {
    const key =
      (req.body?.queue as 'gameActions' | 'gameCleanup' | 'analyticsEvents') || 'gameActions'
    const jobId = req.body?.jobId
    if (!jobId) {
      res.status(400).json({ success: false, error: 'jobId is required' })
      return
    }
    const result = await queueService.requeueDeadLetter(key, jobId)
    res.json({ success: result.requeued, newJobId: result.newJobId })
  } catch (error) {
    handleRouteError(error, req, 'Failed to requeue DLQ job')
    res.status(500).json({ success: false, error: 'Failed to requeue DLQ job' })
  }
})

export default router
