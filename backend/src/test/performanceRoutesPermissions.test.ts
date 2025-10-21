import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const dashboardMock = jest.fn(() => ({
  summary: {},
  current: {
    cache: { hitRate: 95 },
    database: { avgResponseTime: 120 },
    server: { memoryUsage: { heapUsed: 256 * 1024 * 1024 } },
    queues: { waitingJobs: 5 },
  },
  trends: {},
}))

const currentMetricsMock = jest.fn(() => ({
  cache: { hitRate: 85 },
  database: { avgResponseTime: 650 },
  server: { memoryUsage: { heapUsed: 900 * 1024 * 1024 } },
  queues: { waitingJobs: 60 },
}))

const metricsHistoryMock = jest.fn(() => [])
const getActiveAlertsMock = jest.fn(() => [])
const getAllAlertsMock = jest.fn(() => [])
const resolveAlertMock = jest.fn(() => true)
const healthCheckMock = jest.fn(async () => ({ status: 'healthy' }))
const redisDeletePatternMock = jest.fn(async () => 3)
const redisGetMetricsMock = jest.fn(() => ({}))
const redisHealthCheckMock = jest.fn(async () => ({ status: 'healthy' }))
const databaseMetricsMock = jest.fn(() => ({}))
const databaseHealthCheckMock = jest.fn(async () => ({ status: 'healthy' }))
const cdnMetricsMock = jest.fn(() => ({}))
const cdnHealthCheckMock = jest.fn(async () => ({ status: 'healthy' }))
const cdnPurgeMock = jest.fn(async () => true)
const oddsHistoryMock = jest.fn(() => [])
const oddsSnapshotMock = jest.fn(() => ({ total: 0 }))

jest.mock('../middleware/auth.js', () => ({
  authenticateToken: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    const headerUser = req.headers['x-test-user-id']
    req.userId = typeof headerUser === 'string' ? headerUser : 'test-user'
    next()
  },
}))

const loggedActions: string[] = []

jest.mock('../middleware/adminAuth.js', () => ({
  requireAdmin: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (req.headers['x-test-admin'] !== 'true') {
      res.status(403).json({ error: 'Admin access required' })
      return
    }

    req.adminUser = {
      userId: req.userId,
      roles: ['test-admin'],
      permissions: ['*'],
      isSuperAdmin: true,
    }

    next()
  },
  logAdminActivity:
    (action: string) =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
      loggedActions.push(action)
      next()
    },
}))

jest.mock('../services/performanceMonitorService.js', () => ({
  performanceMonitorService: {
    getDashboardData: dashboardMock,
    getCurrentMetrics: currentMetricsMock,
    getMetricsHistory: metricsHistoryMock,
    getActiveAlerts: getActiveAlertsMock,
    getAllAlerts: getAllAlertsMock,
    resolveAlert: resolveAlertMock,
    healthCheck: healthCheckMock,
  },
}))

jest.mock('../services/redisClusterService.js', () => ({
  redisClusterService: {
    deletePattern: redisDeletePatternMock,
    getMetrics: redisGetMetricsMock,
    healthCheck: redisHealthCheckMock,
  },
}))

jest.mock('../services/databaseClusterService.js', () => ({
  databaseClusterService: {
    getMetrics: databaseMetricsMock,
    healthCheck: databaseHealthCheckMock,
  },
}))

jest.mock('../services/cdnService.js', () => ({
  cdnService: {
    getMetrics: cdnMetricsMock,
    healthCheck: cdnHealthCheckMock,
    purgeCache: cdnPurgeMock,
  },
}))

jest.mock('../services/metricsService.js', () => ({
  oddsMetrics: {
    getHistory: oddsHistoryMock,
    snapshot: oddsSnapshotMock,
  },
}))

jest.mock('../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

const createApp = () => {
  const app = express()
  app.use(express.json())

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../routes/performanceRoutes.js').default as express.Router
  app.use('/api/performance', router)
  return app
}

describe('Performance routes admin protection', () => {
  beforeEach(() => {
    dashboardMock.mockClear()
    currentMetricsMock.mockClear()
    metricsHistoryMock.mockClear()
    getActiveAlertsMock.mockClear()
    getAllAlertsMock.mockClear()
    resolveAlertMock.mockClear()
    healthCheckMock.mockClear()
    redisDeletePatternMock.mockClear()
    redisGetMetricsMock.mockClear()
    redisHealthCheckMock.mockClear()
    databaseMetricsMock.mockClear()
    databaseHealthCheckMock.mockClear()
    cdnMetricsMock.mockClear()
    cdnHealthCheckMock.mockClear()
    cdnPurgeMock.mockClear()
    oddsHistoryMock.mockClear()
    oddsSnapshotMock.mockClear()
    loggedActions.length = 0
  })

  it('rejects non-admin users from performance dashboard', async () => {
    const response = await request(createApp()).get('/api/performance/dashboard')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'Admin access required' })
    expect(dashboardMock).not.toHaveBeenCalled()
  })

  it('allows admins to access performance dashboard', async () => {
    const response = await request(createApp())
      .get('/api/performance/dashboard')
      .set('x-test-admin', 'true')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(dashboardMock).toHaveBeenCalled()
  })

  it('blocks non-admin cache clear requests', async () => {
    const response = await request(createApp())
      .post('/api/performance/cache/clear')
      .send({ pattern: 'session:*' })

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'Admin access required' })
    expect(redisDeletePatternMock).not.toHaveBeenCalled()
  })

  it('allows admins to clear cache and logs the action', async () => {
    const response = await request(createApp())
      .post('/api/performance/cache/clear')
      .set('x-test-admin', 'true')
      .send({ pattern: 'session:*' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: { cleared: 3 },
      message: 'Cleared 3 keys matching pattern: session:*',
    })
    expect(redisDeletePatternMock).toHaveBeenCalledWith('session:*')
    expect(loggedActions).toContain('performance.cache_clear')
  })
})
