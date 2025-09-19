import express from 'express'
import { authenticateToken } from '../middleware/auth'
import { cdnService } from '../services/cdnService'
import { databaseClusterService } from '../services/databaseClusterService'
import { performanceMonitorService } from '../services/performanceMonitorService'
import { redisClusterService } from '../services/redisClusterService'
import { getErrorMessage } from '../utils/errorHelpers'
import { logger } from '../utils/logger'

type ServiceHealthResult = {
  status: string
  [key: string]: unknown
}

const router = express.Router()

// Performance dashboard (admin only)
router.get('/dashboard', authenticateToken, async (_req, res) => {
  try {
    const dashboard = performanceMonitorService.getDashboardData()

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

// Current system metrics
router.get('/metrics', authenticateToken, async (_req, res) => {
  try {
    const current = performanceMonitorService.getCurrentMetrics()

    res.json({
      success: true,
      data: current,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Historical metrics
router.get('/metrics/history', authenticateToken, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string, 10) || 1
    const history = performanceMonitorService.getMetricsHistory(hours)

    res.json({
      success: true,
      data: history,
      meta: {
        hours,
        count: history.length,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Performance alerts
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const activeOnly = req.query.active === 'true'
    const alerts = activeOnly
      ? performanceMonitorService.getActiveAlerts()
      : performanceMonitorService.getAllAlerts()

    res.json({
      success: true,
      data: alerts,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Resolve alert
router.post('/alerts/:alertId/resolve', authenticateToken, async (req, res) => {
  try {
    const { alertId } = req.params
    const resolved = performanceMonitorService.resolveAlert(alertId)

    res.json({
      success: resolved,
      message: resolved ? 'Alert resolved' : 'Alert not found',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Component-specific health checks
router.get('/health/detailed', authenticateToken, async (_req, res) => {
  try {
    const [performanceHealth, redisHealth, databaseHealth, cdnHealth] = await Promise.allSettled([
      performanceMonitorService.healthCheck(),
      redisClusterService.healthCheck(),
      databaseClusterService.healthCheck(),
      cdnService.healthCheck(),
    ])

    const extractResult = (
      result: PromiseSettledResult<ServiceHealthResult>,
    ): ServiceHealthResult =>
      result.status === 'fulfilled'
        ? result.value
        : { status: 'error', error: getErrorMessage(result.reason) }

    const health = {
      performance: extractResult(performanceHealth),
      redis: extractResult(redisHealth),
      database: extractResult(databaseHealth),
      cdn: extractResult(cdnHealth),
    }

    const overallStatus = Object.values(health).every((h) => h.status === 'healthy')
      ? 'healthy'
      : Object.values(health).some((h) => h.status === 'critical')
        ? 'critical'
        : 'degraded'

    res.json({
      success: true,
      status: overallStatus,
      data: health,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Cache management
router.get('/cache/stats', authenticateToken, async (_req, res) => {
  try {
    const stats = redisClusterService.getMetrics()

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

router.post('/cache/clear', authenticateToken, async (req, res): Promise<void> => {
  try {
    const { pattern } = req.body

    if (!pattern) {
      res.status(400).json({
        success: false,
        error: 'Pattern is required',
      })
      return
    }

    const cleared = await redisClusterService.deletePattern(pattern)

    res.json({
      success: true,
      data: { cleared },
      message: `Cleared ${cleared} keys matching pattern: ${pattern}`,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Database performance
router.get('/database/stats', authenticateToken, async (_req, res) => {
  try {
    const stats = databaseClusterService.getMetrics()

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

// CDN management
router.get('/cdn/stats', authenticateToken, async (_req, res) => {
  try {
    const stats = cdnService.getMetrics()

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

router.post('/cdn/purge', authenticateToken, async (req, res) => {
  try {
    const { paths = [], tags = [] } = req.body

    const purged = await cdnService.purgeCache(paths, tags)

    res.json({
      success: purged,
      message: purged ? 'CDN cache purged successfully' : 'Failed to purge CDN cache',
      data: { paths: paths.length, tags: tags.length },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Performance testing endpoints
router.post('/test/load', authenticateToken, async (req, res) => {
  try {
    const {
      duration = 60, // seconds
      concurrency = 10,
      endpoint = '/api/health',
    } = req.body

    // Start load test (implementation would depend on testing framework)
    const testId = `load-test-${Date.now()}`

    // Simulate load test initiation
    setTimeout(() => {
      // Would implement actual load testing here
      logger.info(`Load test ${testId} completed`)
    }, duration * 1000)

    res.json({
      success: true,
      data: {
        testId,
        duration,
        concurrency,
        endpoint,
        status: 'started',
      },
      message: 'Load test started',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// System optimization recommendations
router.get('/optimization/recommendations', authenticateToken, async (_req, res) => {
  try {
    const current = performanceMonitorService.getCurrentMetrics()
    const recommendations = []

    if (current) {
      // Cache optimization
      if (current.cache.hitRate < 90) {
        recommendations.push({
          component: 'cache',
          priority: 'high',
          issue: 'Low cache hit rate',
          recommendation: 'Review cache TTL settings and implement cache warming',
          metric: `${current.cache.hitRate}% hit rate`,
        })
      }

      // Database optimization
      if (current.database.avgResponseTime > 500) {
        recommendations.push({
          component: 'database',
          priority: 'high',
          issue: 'High database response time',
          recommendation: 'Consider adding indexes, optimizing queries, or scaling read replicas',
          metric: `${current.database.avgResponseTime}ms avg response time`,
        })
      }

      // Memory optimization
      const memoryUsageMB = current.server.memoryUsage.heapUsed / 1024 / 1024
      if (memoryUsageMB > 800) {
        recommendations.push({
          component: 'server',
          priority: 'medium',
          issue: 'High memory usage',
          recommendation: 'Implement memory pooling and optimize data structures',
          metric: `${Math.round(memoryUsageMB)}MB memory usage`,
        })
      }

      // Queue optimization
      if (current.queues.waitingJobs > 50) {
        recommendations.push({
          component: 'queues',
          priority: 'medium',
          issue: 'Queue backlog building up',
          recommendation: 'Scale worker processes or optimize job processing',
          metric: `${current.queues.waitingJobs} waiting jobs`,
        })
      }
    }

    res.json({
      success: true,
      data: recommendations,
      meta: {
        generated: new Date().toISOString(),
        total: recommendations.length,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

// Export performance report
router.get('/report', authenticateToken, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string, 10) || 24
    const format = (req.query.format as string) || 'json'

    const dashboard = performanceMonitorService.getDashboardData()
    const history = performanceMonitorService.getMetricsHistory(hours)
    const alerts = performanceMonitorService.getAllAlerts()

    const report = {
      generated: new Date().toISOString(),
      period: `${hours} hours`,
      summary: dashboard.summary,
      current: dashboard.current,
      trends: dashboard.trends,
      alerts: {
        total: alerts.length,
        active: alerts.filter((a) => !a.resolved).length,
        by_severity: alerts.reduce(
          (acc, alert) => {
            acc[alert.severity] = (acc[alert.severity] || 0) + 1
            return acc
          },
          {} as Record<string, number>,
        ),
      },
      metrics: history,
    }

    if (format === 'csv') {
      // Would implement CSV export
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename=performance-report.csv')
      res.send('CSV export not implemented')
    } else {
      res.json({
        success: true,
        data: report,
      })
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    })
  }
})

export default router
