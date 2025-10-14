import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import { queueService } from '../services/queueService.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

const router = Router()

// GET /api/admin/queues/dlq?queue=gameActions&offset=0&limit=50
router.get('/dlq', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const _q = String(
      req.query.queue || '',
    ) as keyof typeof import('../services/queueService.js').queueService
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
router.post('/dlq/requeue', authenticateToken, requireAdmin, async (req, res) => {
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

// GET /api/admin/queues/jobs?queue=gameActions&state=active&offset=0&limit=50
router.get('/jobs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const key =
      (req.query.queue as
        | 'gameActions'
        | 'gameCleanup'
        | 'analyticsEvents'
        | 'maintenance'
        | 'mapAssets') || 'gameActions'
    const state =
      (req.query.state as 'waiting' | 'active' | 'completed' | 'failed' | 'delayed') || 'active'
    const offset = Number(req.query.offset ?? 0)
    const limit = Number(req.query.limit ?? 50)
    const items = await queueService.listJobsByState(key, state, { offset, limit })
    res.json({ success: true, items })
  } catch (error) {
    handleRouteError(error, req, 'Failed to list jobs')
    res.status(500).json({ success: false, error: 'Failed to list jobs' })
  }
})

// POST /api/admin/queues/jobs/retry { queue: 'gameActions', jobId: '...' }
router.post('/jobs/retry', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const key =
      (req.body?.queue as
        | 'gameActions'
        | 'gameCleanup'
        | 'analyticsEvents'
        | 'maintenance'
        | 'mapAssets') || 'gameActions'
    const jobId = req.body?.jobId
    if (!jobId) {
      res.status(400).json({ success: false, error: 'jobId is required' })
      return
    }
    const result = await queueService.retryJob(key, jobId)
    res.json({ success: result.retried, message: result.message })
  } catch (error) {
    handleRouteError(error, req, 'Failed to retry job')
    res.status(500).json({ success: false, error: 'Failed to retry job' })
  }
})

export default router
