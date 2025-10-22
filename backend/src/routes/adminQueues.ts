import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth.js'
import { authenticateToken } from '../middleware/auth.js'
import { queueService } from '../services/queueService.js'
import { handleRouteError } from '../utils/routeErrorHandler.js'

/**
 * This file contains the admin routes for managing the application's queues.
 * It includes routes for listing jobs in the dead-letter queue, requeueing jobs,
 * listing jobs by state, and retrying failed jobs.
 * All routes in this file are protected by the `authenticateToken` and `requireAdmin` middleware.
 */

const router = Router()

/**
 * @api {get} /api/admin/queues/dlq List jobs in the dead-letter queue
 * @apiName GetDlqJobs
 * @apiGroup AdminQueues
 * @apiPermission admin
 *
 * @apiParam {String} [queue=gameActions] The name of the queue.
 * @apiParam {Number} [offset=0] The number of jobs to skip.
 * @apiParam {Number} [limit=50] The maximum number of jobs to return.
 *
 * @apiSuccess {Boolean} success Whether the request was successful.
 * @apiSuccess {Object[]} items The list of jobs in the dead-letter queue.
 */
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

/**
 * @api {post} /api/admin/queues/dlq/requeue Requeue a job from the dead-letter queue
 * @apiName RequeueDlqJob
 * @apiGroup AdminQueues
 * @apiPermission admin
 *
 * @apiBody {String} [queue=gameActions] The name of the queue.
 * @apiBody {String} jobId The ID of the job to requeue.
 *
 * @apiSuccess {Boolean} success Whether the job was successfully requeued.
 * @apiSuccess {String} [newJobId] The ID of the new job created.
 */
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

/**
 * @api {get} /api/admin/queues/jobs List jobs by state
 * @apiName GetJobsByState
 * @apiGroup AdminQueues
 * @apiPermission admin
 *
 * @apiParam {String} [queue=gameActions] The name of the queue.
 * @apiParam {String} [state=active] The state of the jobs to list.
 * @apiParam {Number} [offset=0] The number of jobs to skip.
 * @apiParam {Number} [limit=50] The maximum number of jobs to return.
 *
 * @apiSuccess {Boolean} success Whether the request was successful.
 * @apiSuccess {Object[]} items The list of jobs.
 */
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

/**
 * @api {post} /api/admin/queues/jobs/retry Retry a failed job
 * @apiName RetryJob
 * @apiGroup AdminQueues
 * @apiPermission admin
 *
 * @apiBody {String} [queue=gameActions] The name of the queue.
 * @apiBody {String} jobId The ID of the job to retry.
 *
 * @apiSuccess {Boolean} success Whether the job was successfully retried.
 * @apiSuccess {String} message A message indicating the result of the retry attempt.
 */
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
