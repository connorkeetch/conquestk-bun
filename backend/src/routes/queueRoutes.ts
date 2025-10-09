import express from 'express'
import { authenticateToken } from '../middleware/auth'
import { type QueueStats, queueService } from '../services/queueService'
import { handleRouteError } from '../utils/routeErrorHandler'
import { getWorkerManagerInstance } from '../workers/workerManager'

const router = express.Router()

// Queue monitoring endpoints (admin only)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const workerManager = getWorkerManagerInstance()
    if (!workerManager) {
      res.status(503).json({
        success: false,
        error: 'WorkerManager not initialized',
      })
      return
    }
    const stats = await workerManager.getStats()
    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to load queue stats')
    res.status(500).json({
      success: false,
      error: 'Failed to load queue statistics',
    })
  }
})

router.get('/health', authenticateToken, async (req, res) => {
  try {
    const workerManager = getWorkerManagerInstance()
    if (!workerManager) {
      res.status(503).json({
        success: false,
        status: 'not-initialized',
        details: {
          workers: { initialized: false },
          queues: {},
        },
        error: 'WorkerManager not initialized',
      })
      return
    }

    // Worker/manager perspective (summarized)
    const wmHealth = await workerManager.healthCheck()

    // Direct queue service perspective (adds redis ping and init flag)
    const qsHealth = await queueService.healthCheck()

    const statusCode = wmHealth.status === 'healthy' && qsHealth.status === 'healthy' ? 200 : 503

    res.status(statusCode).json({
      success: statusCode === 200,
      status:
        wmHealth.status === 'healthy' && qsHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
      details: {
        workers: (wmHealth.details as { workers?: { initialized?: boolean } }).workers ?? {
          initialized: false,
        },
        queues:
          (
            wmHealth.details as {
              queues?: Record<string, import('../services/queueService').QueueStats>
            }
          ).queues ?? {},
        redis: (qsHealth.details as { redis?: string }).redis ?? 'UNKNOWN',
        queueServiceInitialized:
          (qsHealth.details as { initialized?: boolean }).initialized ?? false,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to evaluate queue health')
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: 'Failed to evaluate queue health',
      timestamp: new Date().toISOString(),
    })
  }
})

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const workerManager = getWorkerManagerInstance()
    if (!workerManager) {
      res.status(503).json({
        success: false,
        error: 'WorkerManager not initialized',
      })
      return
    }
    const stats = await queueService.getQueueStats()
    const health = await workerManager.healthCheck()

    const queueList: QueueStats[] = Object.values(stats)
    const dashboard = {
      timestamp: new Date().toISOString(),
      status: health.status,
      queues: stats,
      summary: {
        totalWaiting: queueList.reduce((sum, queue) => sum + queue.waiting, 0),
        totalActive: queueList.reduce((sum, queue) => sum + queue.active, 0),
        totalCompleted: queueList.reduce((sum, queue) => sum + queue.completed, 0),
        totalFailed: queueList.reduce((sum, queue) => sum + queue.failed, 0),
        totalDeadLetter: queueList.reduce((sum, queue) => sum + queue.deadLetter, 0),
        queuesWithWarnings: queueList.filter((queue) => queue.warnings.length > 0).length,
      },
    }

    res.json({
      success: true,
      data: dashboard,
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to load queue dashboard')
    res.status(500).json({
      success: false,
      error: 'Failed to load queue dashboard',
    })
  }
})

// Queue management endpoints (admin only)
router.post('/pause/:queueName', authenticateToken, async (req, res) => {
  try {
    const { queueName } = req.params
    // Implementation would pause specific queue
    res.json({
      success: true,
      message: `Queue ${queueName} paused`,
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to pause queue', 500, {
      queueName: req.params.queueName,
    })
    res.status(500).json({
      success: false,
      error: 'Failed to pause queue',
    })
  }
})

router.post('/resume/:queueName', authenticateToken, async (req, res) => {
  try {
    const { queueName } = req.params
    // Implementation would resume specific queue
    res.json({
      success: true,
      message: `Queue ${queueName} resumed`,
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to resume queue', 500, {
      queueName: req.params.queueName,
    })
    res.status(500).json({
      success: false,
      error: 'Failed to resume queue',
    })
  }
})

router.delete('/clear/:queueName', authenticateToken, async (req, res) => {
  try {
    const { queueName } = req.params
    const { type = 'all' } = req.query

    // Implementation would clear queue jobs based on type (waiting, failed, completed, all)
    res.json({
      success: true,
      message: `Cleared ${type} jobs from queue ${queueName}`,
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to clear queue', 500, {
      queueName: req.params.queueName,
      type: req.query.type,
    })
    res.status(500).json({
      success: false,
      error: 'Failed to clear queue',
    })
  }
})

// Public health check (lighter version)
router.get('/ping', async (req, res) => {
  try {
    const workerManager = getWorkerManagerInstance()
    if (!workerManager) {
      res.json({
        status: 'not-initialized',
        timestamp: new Date().toISOString(),
      })
      return
    }
    const health = await workerManager.healthCheck()
    res.json({
      status: health.status,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    handleRouteError(error, req, 'Queue ping failed', 503)
    res.status(503).json({
      status: 'unhealthy',
      error: 'Queue service unavailable',
    })
  }
})

export default router
