import { logger } from '../utils/logger'
import { getWorkerManagerInstance } from '../workers/workerManager'
import { cdnService } from './cdnService'
import { databaseClusterService } from './databaseClusterService'
import type { QueueStats } from './queueService'
import { redisClusterService } from './redisClusterService'

interface SystemMetrics {
  timestamp: number
  server: {
    uptime: number
    memoryUsage: NodeJS.MemoryUsage
    cpuUsage: NodeJS.CpuUsage
    activeConnections: number
    requestsPerSecond: number
  }
  database: {
    totalQueries: number
    avgResponseTime: number
    slowQueries: number
    connectionPoolSize: number
    healthyNodes: number
  }
  cache: {
    hitRate: number
    totalRequests: number
    memoryUsage: number
    evictions: number
  }
  queues: {
    totalJobs: number
    activeJobs: number
    waitingJobs: number
    failedJobs: number
    processedJobs: number
    deadLetterJobs: number
  }
  cdn: {
    hitRate: number
    bandwidth: number
    avgLoadTime: number
    healthyProviders: number
  }
  game: {
    activeGames: number
    totalPlayers: number
    avgPlayersPerGame: number
    completedGames: number
  }
}

interface PerformanceAlert {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  component: string
  message: string
  timestamp: number
  resolved: boolean
  metrics?: MetricDetails
}

type MetricValue = string | number | boolean | null | undefined
type MetricDetails = Record<string, MetricValue | MetricValue[]>

type WorkerQueueSnapshot = {
  initialized: boolean
  queues: Record<string, QueueStats>
  timestamp: string
}

type HealthStatus = 'healthy' | 'warning' | 'critical'

type HealthCheckDetails = {
  monitoring: boolean
  metricsCollected: number
  currentMetrics: SystemMetrics | null
  activeAlerts: number
  criticalAlerts: number
}

interface PerformanceThresholds {
  database: {
    maxResponseTime: number
    minHitRate: number
    maxSlowQueries: number
  }
  cache: {
    minHitRate: number
    maxMemoryUsage: number
  }
  server: {
    maxMemoryUsage: number
    maxCpuUsage: number
    maxResponseTime: number
  }
  queues: {
    maxWaitingJobs: number
    maxFailureRate: number
  }
}

export class PerformanceMonitorService {
  private metrics: SystemMetrics[] = []
  private alerts: PerformanceAlert[] = []
  private isMonitoring = false
  private monitoringInterval?: NodeJS.Timeout
  private alertCheckInterval?: NodeJS.Timeout

  private thresholds: PerformanceThresholds = {
    database: {
      maxResponseTime: 1000, // 1 second
      minHitRate: 85, // 85%
      maxSlowQueries: 10, // per minute
    },
    cache: {
      minHitRate: 90, // 90%
      maxMemoryUsage: 1024 * 1024 * 512, // 512MB
    },
    server: {
      maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
      maxCpuUsage: 80, // 80%
      maxResponseTime: 500, // 500ms
    },
    queues: {
      maxWaitingJobs: 100,
      maxFailureRate: 5, // 5%
    },
  }

  private requestCounter = 0
  private requestTimestamps: number[] = []

  async initialize(): Promise<void> {
    try {
      logger.info('🔄 Initializing Performance Monitor Service...')

      this.startMonitoring()
      this.startAlertSystem()

      logger.info('✅ Performance Monitor Service initialized')
    } catch (error) {
      logger.error('❌ Failed to initialize Performance Monitor Service:', error)
      throw error
    }
  }

  private startMonitoring(): void {
    if (this.isMonitoring) return

    this.isMonitoring = true

    // Collect metrics every 30 seconds
    this.monitoringInterval = setInterval(() => this.collectMetrics(), 30000)

    // Start with immediate collection
    this.collectMetrics()

    logger.info('📊 Started performance monitoring')
  }

  private startAlertSystem(): void {
    // Check for alerts every 60 seconds
    this.alertCheckInterval = setInterval(() => this.checkPerformanceAlerts(), 60000)

    logger.info('🚨 Started alert system')
  }

  private async collectMetrics(): Promise<void> {
    try {
      const timestamp = Date.now()

      // Server metrics
      const memoryUsage = process.memoryUsage()
      const cpuUsage = process.cpuUsage()
      const uptime = process.uptime()

      // Calculate requests per second
      const now = Date.now()
      this.requestTimestamps = this.requestTimestamps.filter((ts) => now - ts < 60000) // Last minute
      const requestsPerSecond = this.requestTimestamps.length / 60

      // Database metrics
      const dbMetrics = await databaseClusterService.getMetrics()

      // Cache metrics
      const cacheMetrics = redisClusterService.getMetrics()

      // Queue metrics
      const workerManager = getWorkerManagerInstance()
      const queueHealth = workerManager ? await workerManager.getStats() : null
      const queueMetrics = this.calculateQueueMetrics(queueHealth)

      // CDN metrics
      const cdnMetrics = cdnService.getMetrics()

      // Game metrics (placeholder - would integrate with game service)
      const gameMetrics = await this.collectGameMetrics()

      const systemMetrics: SystemMetrics = {
        timestamp,
        server: {
          uptime,
          memoryUsage,
          cpuUsage,
          activeConnections: 0, // Would track from server
          requestsPerSecond,
        },
        database: {
          totalQueries: dbMetrics.totalQueries,
          avgResponseTime: dbMetrics.avgResponseTime,
          slowQueries: dbMetrics.slowQueries,
          connectionPoolSize: dbMetrics.nodes.reduce((sum, node) => sum + node.connectionCount, 0),
          healthyNodes: dbMetrics.nodes.filter((node) => node.isHealthy).length,
        },
        cache: {
          hitRate: cacheMetrics.hitRate,
          totalRequests: cacheMetrics.totalRequests,
          memoryUsage: 0, // Would get from Redis INFO
          evictions: 0,
        },
        queues: queueMetrics,
        cdn: {
          hitRate: cdnMetrics.cacheHitRate,
          bandwidth: cdnMetrics.bandwidth,
          avgLoadTime: cdnMetrics.avgLoadTime,
          healthyProviders: cdnMetrics.providers,
        },
        game: gameMetrics,
      }

      // Store metrics (keep last 24 hours)
      this.metrics.push(systemMetrics)
      if (this.metrics.length > 2880) {
        // 24 hours * 60 minutes * 2 (30-second intervals)
        this.metrics.shift()
      }

      logger.debug('📊 Metrics collected', {
        timestamp,
        database: systemMetrics.database.avgResponseTime,
        cache: systemMetrics.cache.hitRate,
        memory: Math.round(systemMetrics.server.memoryUsage.heapUsed / 1024 / 1024),
      })
    } catch (error) {
      logger.error('❌ Failed to collect metrics:', error)
    }
  }

  private calculateQueueMetrics(queueStats: WorkerQueueSnapshot | null): SystemMetrics['queues'] {
    let totalJobs = 0
    let activeJobs = 0
    let waitingJobs = 0
    let failedJobs = 0
    let processedJobs = 0
    let deadLetterJobs = 0

    if (queueStats?.queues) {
      for (const queue of Object.values(queueStats.queues)) {
        activeJobs += queue.active || 0
        waitingJobs += queue.waiting || 0
        failedJobs += queue.failed || 0
        processedJobs += queue.completed || 0
        deadLetterJobs += queue.deadLetter || 0
        totalJobs +=
          (queue.active || 0) +
          (queue.waiting || 0) +
          (queue.failed || 0) +
          (queue.completed || 0) +
          (queue.deadLetter || 0)
      }
    }

    return {
      totalJobs,
      activeJobs,
      waitingJobs,
      failedJobs,
      processedJobs,
      deadLetterJobs,
    }
  }

  private async collectGameMetrics(): Promise<SystemMetrics['game']> {
    // Placeholder - would integrate with actual game service
    return {
      activeGames: 0,
      totalPlayers: 0,
      avgPlayersPerGame: 0,
      completedGames: 0,
    }
  }

  private checkPerformanceAlerts(): void {
    if (this.metrics.length === 0) return

    const latestMetrics = this.metrics[this.metrics.length - 1]
    const newAlerts: PerformanceAlert[] = []

    // Database alerts
    if (latestMetrics.database.avgResponseTime > this.thresholds.database.maxResponseTime) {
      newAlerts.push(
        this.createAlert(
          'critical',
          'database',
          `Database response time is ${latestMetrics.database.avgResponseTime}ms (threshold: ${this.thresholds.database.maxResponseTime}ms)`,
          { responseTime: latestMetrics.database.avgResponseTime },
        ),
      )
    }

    if (latestMetrics.cache.hitRate < this.thresholds.cache.minHitRate) {
      newAlerts.push(
        this.createAlert(
          'high',
          'cache',
          `Cache hit rate is ${latestMetrics.cache.hitRate}% (threshold: ${this.thresholds.cache.minHitRate}%)`,
          { hitRate: latestMetrics.cache.hitRate },
        ),
      )
    }

    // Server alerts
    const memoryUsageMB = latestMetrics.server.memoryUsage.heapUsed
    if (memoryUsageMB > this.thresholds.server.maxMemoryUsage) {
      newAlerts.push(
        this.createAlert(
          'high',
          'server',
          `Memory usage is ${Math.round(memoryUsageMB / 1024 / 1024)}MB (threshold: ${Math.round(this.thresholds.server.maxMemoryUsage / 1024 / 1024)}MB)`,
          { memoryUsage: memoryUsageMB },
        ),
      )
    }

    // Queue alerts
    if (latestMetrics.queues.waitingJobs > this.thresholds.queues.maxWaitingJobs) {
      newAlerts.push(
        this.createAlert(
          'medium',
          'queues',
          `Queue backlog is ${latestMetrics.queues.waitingJobs} jobs (threshold: ${this.thresholds.queues.maxWaitingJobs})`,
          { waitingJobs: latestMetrics.queues.waitingJobs },
        ),
      )
    }

    // Add new alerts
    newAlerts.forEach((alert) => {
      this.alerts.push(alert)
      logger.warn(`🚨 Performance alert: ${alert.message}`, alert.metrics)
    })

    // Clean up old alerts (keep last 24 hours)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    this.alerts = this.alerts.filter((alert) => alert.timestamp > dayAgo)
  }

  private createAlert(
    severity: PerformanceAlert['severity'],
    component: string,
    message: string,
    metrics?: MetricDetails,
  ): PerformanceAlert {
    return {
      id: `${component}-${Date.now()}`,
      severity,
      component,
      message,
      timestamp: Date.now(),
      resolved: false,
      metrics,
    }
  }

  // Public API methods
  trackRequest(): void {
    this.requestCounter++
    this.requestTimestamps.push(Date.now())
  }

  getCurrentMetrics(): SystemMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null
  }

  getMetricsHistory(hours: number = 1): SystemMetrics[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000
    return this.metrics.filter((m) => m.timestamp > cutoff)
  }

  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter((alert) => !alert.resolved)
  }

  getAllAlerts(): PerformanceAlert[] {
    return [...this.alerts]
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId)
    if (alert) {
      alert.resolved = true
      logger.info(`✅ Alert resolved: ${alertId}`)
      return true
    }
    return false
  }

  // Performance dashboard data
  getDashboardData(): {
    summary: {
      uptime: number
      totalRequests: number
      avgResponseTime: number
      errorRate: number
    }
    current: SystemMetrics | null
    trends: {
      responseTime: number[]
      memoryUsage: number[]
      cacheHitRate: number[]
      activeGames: number[]
    }
    alerts: {
      active: number
      critical: number
      resolved: number
    }
  } {
    const current = this.getCurrentMetrics()
    const lastHour = this.getMetricsHistory(1)

    return {
      summary: {
        uptime: process.uptime(),
        totalRequests: this.requestCounter,
        avgResponseTime: current?.database.avgResponseTime || 0,
        errorRate: 0, // Would calculate from actual error tracking
      },
      current,
      trends: {
        responseTime: lastHour.map((m) => m.database.avgResponseTime),
        memoryUsage: lastHour.map((m) => m.server.memoryUsage.heapUsed / 1024 / 1024),
        cacheHitRate: lastHour.map((m) => m.cache.hitRate),
        activeGames: lastHour.map((m) => m.game.activeGames),
      },
      alerts: {
        active: this.getActiveAlerts().length,
        critical: this.alerts.filter((a) => !a.resolved && a.severity === 'critical').length,
        resolved: this.alerts.filter((a) => a.resolved).length,
      },
    }
  }

  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds }
    logger.info('⚙️ Performance thresholds updated', newThresholds)
  }

  async healthCheck(): Promise<{ status: HealthStatus; details: HealthCheckDetails }> {
    const current = this.getCurrentMetrics()
    const activeAlerts = this.getActiveAlerts()
    const criticalAlerts = activeAlerts.filter((a) => a.severity === 'critical')

    return {
      status:
        criticalAlerts.length > 0 ? 'critical' : activeAlerts.length > 0 ? 'warning' : 'healthy',
      details: {
        monitoring: this.isMonitoring,
        metricsCollected: this.metrics.length,
        currentMetrics: current,
        activeAlerts: activeAlerts.length,
        criticalAlerts: criticalAlerts.length,
      },
    }
  }

  async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down Performance Monitor Service...')

    this.isMonitoring = false

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }

    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval)
    }

    logger.info('✅ Performance Monitor Service shutdown complete')
  }
}

// Export singleton instance
export const performanceMonitorService = new PerformanceMonitorService()
