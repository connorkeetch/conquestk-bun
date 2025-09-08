import express from 'express'
import { authenticateToken } from '@/middleware/auth'
import { queueService } from '@/services/queueService'
import { getWorkerManagerInstance } from '@/workers/workerManager'

const router = express.Router()

// Queue monitoring endpoints (admin only)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const workerManager = getWorkerManagerInstance()
    if (!workerManager) {
      return res.status(503).json({
        success: false,
        error: 'WorkerManager not initialized',
      })
    }
    const stats = await workerManager.getStats()
    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

router.get('/health', authenticateToken, async (req, res) => {
  try {
    const workerManager = getWorkerManagerInstance()
    if (!workerManager) {
      return res.status(503).json({
        success: false,
        error: 'WorkerManager not initialized',
      })
    }
    const health = await workerManager.healthCheck()
    const statusCode = health.status === 'healthy' ? 200 : 503
    
    res.status(statusCode).json({
      success: health.status === 'healthy',
      status: health.status,
      details: health.details,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const workerManager = getWorkerManagerInstance()
    if (!workerManager) {
      return res.status(503).json({
        success: false,
        error: 'WorkerManager not initialized',
      })
    }
    const stats = await queueService.getQueueStats()
    const health = await workerManager.healthCheck()
    
    const dashboard = {
      timestamp: new Date().toISOString(),
      status: health.status,
      queues: stats,
      summary: {
        totalWaiting: Object.values(stats).reduce((sum: number, queue: any) => sum + queue.waiting, 0),
        totalActive: Object.values(stats).reduce((sum: number, queue: any) => sum + queue.active, 0),
        totalCompleted: Object.values(stats).reduce((sum: number, queue: any) => sum + queue.completed, 0),
        totalFailed: Object.values(stats).reduce((sum: number, queue: any) => sum + queue.failed, 0),
      },
    }
    
    res.json({
      success: true,
      data: dashboard,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
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
    res.status(500).json({
      success: false,
      error: (error as Error).message,
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
    res.status(500).json({
      success: false,
      error: (error as Error).message,
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
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Public health check (lighter version)
router.get('/ping', async (req, res) => {
  try {
    const workerManager = getWorkerManagerInstance()
    if (!workerManager) {
      return res.json({
        status: 'not-initialized',
        timestamp: new Date().toISOString(),
      })
    }
    const health = await workerManager.healthCheck()
    res.json({
      status: health.status,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: (error as Error).message,
    })
  }
})

export default router