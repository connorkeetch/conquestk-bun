import type { Worker as ClusterWorker } from 'node:cluster'
import cluster from 'node:cluster'
import os from 'node:os'
import { logger } from '../utils/logger.js'

interface ScalingMetrics {
  totalWorkers: number
  activeWorkers: number
  cpuUsage: number[]
  memoryUsage: number[]
  requestsPerWorker: number[]
  lastScaleEvent: number
  autoScalingEnabled: boolean
}

interface ScalingConfig {
  minWorkers: number
  maxWorkers: number
  scaleUpThreshold: number
  scaleDownThreshold: number
  scaleUpCooldown: number
  scaleDownCooldown: number
  enableAutoScaling: boolean
}

interface WorkerMetrics {
  id: number
  pid: number
  uptime: number
  memoryUsage: NodeJS.MemoryUsage
  cpuUsage: NodeJS.CpuUsage
  requestCount: number
  activeConnections: number
  status: 'active' | 'idle' | 'terminating'
  lastHealthCheck: number
}

export class ScalingService {
  private workers: Map<number, WorkerMetrics> = new Map()
  private scalingMetrics: ScalingMetrics
  private config: ScalingConfig
  private isInitialized = false
  private scalingInterval?: NodeJS.Timeout
  private metricsInterval?: NodeJS.Timeout

  constructor() {
    this.config = {
      minWorkers: parseInt(process.env.MIN_WORKERS || '2', 10),
      maxWorkers: parseInt(process.env.MAX_WORKERS || String(os.cpus().length), 10),
      scaleUpThreshold: 80, // CPU percentage
      scaleDownThreshold: 30,
      scaleUpCooldown: 5 * 60 * 1000, // 5 minutes
      scaleDownCooldown: 10 * 60 * 1000, // 10 minutes
      enableAutoScaling: process.env.ENABLE_AUTO_SCALING !== 'false',
    }

    this.scalingMetrics = {
      totalWorkers: 0,
      activeWorkers: 0,
      cpuUsage: [],
      memoryUsage: [],
      requestsPerWorker: [],
      lastScaleEvent: 0,
      autoScalingEnabled: this.config.enableAutoScaling,
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      logger.info('🔄 Initializing Scaling Service...', {
        environment: process.env.NODE_ENV,
        isMaster: cluster.isPrimary,
        cpuCount: os.cpus().length,
        config: this.config,
      })

      if (cluster.isPrimary) {
        await this.initializeMaster()
      } else {
        await this.initializeWorker()
      }

      this.isInitialized = true
      logger.info('✅ Scaling Service initialized')
    } catch (error) {
      logger.error('❌ Failed to initialize Scaling Service:', error)
      throw error
    }
  }

  private async initializeMaster(): Promise<void> {
    logger.info('👑 Initializing as master process')

    // Set up master process event handlers
    cluster.on('online', (worker) => {
      logger.info(`🟢 Worker ${worker.id} is online (PID: ${worker.process.pid})`)
      this.addWorkerMetrics(worker)
    })

    cluster.on('exit', (worker, code, signal) => {
      logger.warn(`🔴 Worker ${worker.id} died (${signal || code})`)
      this.removeWorkerMetrics(worker.id)

      // Restart worker if it wasn't intentionally killed
      if (!worker.exitedAfterDisconnect) {
        logger.info(`🔄 Restarting worker ${worker.id}...`)
        cluster.fork()
      }
    })

    cluster.on('listening', (worker, address) => {
      logger.info(`📡 Worker ${worker.id} listening on ${address.address}:${address.port}`)
    })

    cluster.on('disconnect', (worker) => {
      logger.warn(`📵 Worker ${worker.id} disconnected`)
    })

    // Fork initial workers
    const initialWorkers = Math.max(this.config.minWorkers, 1)
    for (let i = 0; i < initialWorkers; i++) {
      cluster.fork()
    }

    // Start monitoring and auto-scaling
    this.startMetricsCollection()
    this.startAutoScaling()

    // Graceful shutdown handling
    this.setupShutdownHandlers()
  }

  private async initializeWorker(): Promise<void> {
    logger.info(`👷 Worker ${process.pid} initialized`)

    // Set up worker-specific monitoring
    this.setupWorkerMonitoring()
  }

  private addWorkerMetrics(worker: ClusterWorker): void {
    const pid = worker.process?.pid ?? process.pid
    const metrics: WorkerMetrics = {
      id: worker.id,
      pid,
      uptime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      requestCount: 0,
      activeConnections: 0,
      status: 'active',
      lastHealthCheck: Date.now(),
    }

    this.workers.set(worker.id, metrics)
    this.updateScalingMetrics()
  }

  private removeWorkerMetrics(workerId: number): void {
    this.workers.delete(workerId)
    this.updateScalingMetrics()
  }

  private updateScalingMetrics(): void {
    const activeWorkers = Array.from(this.workers.values()).filter(
      (worker) => worker.status === 'active',
    )

    this.scalingMetrics.totalWorkers = this.workers.size
    this.scalingMetrics.activeWorkers = activeWorkers.length
    this.scalingMetrics.cpuUsage = activeWorkers.map(() => 0) // Would calculate actual CPU
    this.scalingMetrics.memoryUsage = activeWorkers.map(
      (worker) => worker.memoryUsage.heapUsed / 1024 / 1024,
    )
    this.scalingMetrics.requestsPerWorker = activeWorkers.map((worker) => worker.requestCount)
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectWorkerMetrics()
    }, 30000) // Every 30 seconds

    logger.info('📊 Started metrics collection for scaling')
  }

  private collectWorkerMetrics(): void {
    // Send health check to all workers
    const clusterWorkers = cluster.workers ?? {}
    Object.values(clusterWorkers).forEach((worker) => {
      worker?.send?.({ type: 'health-check' })
    })

    this.updateScalingMetrics()

    // Log current metrics
    logger.debug('📊 Scaling metrics collected', {
      totalWorkers: this.scalingMetrics.totalWorkers,
      activeWorkers: this.scalingMetrics.activeWorkers,
      avgMemory:
        this.scalingMetrics.memoryUsage.reduce((a, b) => a + b, 0) /
          this.scalingMetrics.memoryUsage.length || 0,
    })
  }

  private startAutoScaling(): void {
    if (!this.config.enableAutoScaling) {
      logger.info('⚠️ Auto-scaling is disabled')
      return
    }

    this.scalingInterval = setInterval(() => {
      this.evaluateScaling()
    }, 60000) // Every minute

    logger.info('🔄 Started auto-scaling monitor')
  }

  private evaluateScaling(): void {
    const now = Date.now()
    const timeSinceLastScale = now - this.scalingMetrics.lastScaleEvent

    // Calculate average metrics
    const avgCpuUsage =
      this.scalingMetrics.cpuUsage.reduce((a, b) => a + b, 0) /
        this.scalingMetrics.cpuUsage.length || 0

    const avgMemoryUsage =
      this.scalingMetrics.memoryUsage.reduce((a, b) => a + b, 0) /
        this.scalingMetrics.memoryUsage.length || 0

    // Scale up conditions
    if (
      avgCpuUsage > this.config.scaleUpThreshold &&
      this.scalingMetrics.activeWorkers < this.config.maxWorkers &&
      timeSinceLastScale > this.config.scaleUpCooldown
    ) {
      this.scaleUp('High CPU usage detected')
      return
    }

    // Scale down conditions
    if (
      avgCpuUsage < this.config.scaleDownThreshold &&
      avgMemoryUsage < 200 && // MB
      this.scalingMetrics.activeWorkers > this.config.minWorkers &&
      timeSinceLastScale > this.config.scaleDownCooldown
    ) {
      this.scaleDown('Low resource usage detected')
      return
    }

    logger.debug('🔍 Scaling evaluation completed', {
      avgCpuUsage,
      avgMemoryUsage,
      activeWorkers: this.scalingMetrics.activeWorkers,
      decision: 'no scaling needed',
    })
  }

  scaleUp(reason: string): boolean {
    if (this.scalingMetrics.activeWorkers >= this.config.maxWorkers) {
      logger.warn('⚠️ Cannot scale up: already at maximum workers')
      return false
    }

    try {
      const newWorker = cluster.fork()
      this.scalingMetrics.lastScaleEvent = Date.now()

      logger.info('📈 Scaling up: forked new worker', {
        reason,
        workerId: newWorker.id,
        totalWorkers: this.scalingMetrics.totalWorkers + 1,
      })

      return true
    } catch (error) {
      logger.error('❌ Failed to scale up:', error)
      return false
    }
  }

  scaleDown(reason: string): boolean {
    if (this.scalingMetrics.activeWorkers <= this.config.minWorkers) {
      logger.warn('⚠️ Cannot scale down: already at minimum workers')
      return false
    }

    try {
      // Find the least busy worker to terminate
      const leastBusyWorker = this.findLeastBusyWorker()
      if (!leastBusyWorker) {
        logger.warn('⚠️ No suitable worker found for scaling down')
        return false
      }

      const clusterWorkers = cluster.workers ?? {}
      const worker = Object.values(clusterWorkers).find(
        (candidate): candidate is ClusterWorker => candidate?.id === leastBusyWorker.id,
      )

      if (worker) {
        worker.disconnect()
        this.scalingMetrics.lastScaleEvent = Date.now()

        // Mark worker as terminating
        const metrics = this.workers.get(leastBusyWorker.id)
        if (metrics) {
          metrics.status = 'terminating'
        }

        logger.info('📉 Scaling down: terminating worker', {
          reason,
          workerId: leastBusyWorker.id,
          totalWorkers: this.scalingMetrics.totalWorkers - 1,
        })

        // Force kill after timeout if graceful shutdown fails
        setTimeout(() => {
          if (worker && !worker.isDead()) {
            worker.kill()
          }
        }, 30000)

        return true
      }
    } catch (error) {
      logger.error('❌ Failed to scale down:', error)
    }

    return false
  }

  private findLeastBusyWorker(): WorkerMetrics | null {
    const activeWorkers = Array.from(this.workers.values()).filter(
      (worker) => worker.status === 'active',
    )

    if (activeWorkers.length === 0) return null

    return activeWorkers.reduce((least, current) =>
      current.activeConnections < least.activeConnections ? current : least,
    )
  }

  private setupWorkerMonitoring(): void {
    // Listen for health check requests from master
    process.on('message', (message: unknown) => {
      if (typeof message === 'object' && message && 'type' in message) {
        const typedMessage = message as { type?: string }
        if (typedMessage.type === 'health-check') {
          process.send?.({
            type: 'health-response',
            metrics: {
              memoryUsage: process.memoryUsage(),
              cpuUsage: process.cpuUsage(),
              uptime: process.uptime(),
            },
          })
        }
      }
    })

    // Report worker status periodically
    setInterval(() => {
      if (process.send) {
        process.send({
          type: 'worker-metrics',
          data: {
            pid: process.pid,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
          },
        })
      }
    }, 60000)
  }

  private setupShutdownHandlers(): void {
    const shutdown = (signal: string) => {
      logger.info(`🔄 Received ${signal}, starting graceful shutdown...`)

      // Stop auto-scaling
      if (this.scalingInterval) {
        clearInterval(this.scalingInterval)
      }

      if (this.metricsInterval) {
        clearInterval(this.metricsInterval)
      }

      // Gracefully shutdown all workers
      const clusterWorkers = cluster.workers ?? {}
      Object.values(clusterWorkers).forEach((worker) => {
        if (worker) {
          worker.disconnect()
        }
      })

      // Force exit after timeout
      setTimeout(() => {
        logger.warn('⚠️ Force exiting after shutdown timeout')
        process.exit(1)
      }, 30000)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }

  // Public API methods
  getMetrics(): ScalingMetrics {
    return { ...this.scalingMetrics }
  }

  getWorkerMetrics(): WorkerMetrics[] {
    return Array.from(this.workers.values())
  }

  updateConfig(newConfig: Partial<ScalingConfig>): void {
    this.config = { ...this.config, ...newConfig }
    logger.info('⚙️ Scaling configuration updated', newConfig)
  }

  enableAutoScaling(): void {
    if (!this.scalingMetrics.autoScalingEnabled) {
      this.config.enableAutoScaling = true
      this.scalingMetrics.autoScalingEnabled = true
      this.startAutoScaling()
      logger.info('✅ Auto-scaling enabled')
    }
  }

  disableAutoScaling(): void {
    if (this.scalingMetrics.autoScalingEnabled) {
      this.config.enableAutoScaling = false
      this.scalingMetrics.autoScalingEnabled = false

      if (this.scalingInterval) {
        clearInterval(this.scalingInterval)
      }

      logger.info('⏸️ Auto-scaling disabled')
    }
  }

  async healthCheck(): Promise<{ status: string; details: Record<string, unknown> }> {
    const healthyWorkers = Array.from(this.workers.values()).filter(
      (worker) => worker.status === 'active' && Date.now() - worker.lastHealthCheck < 120000,
    )

    const status = healthyWorkers.length >= this.config.minWorkers ? 'healthy' : 'degraded'

    return {
      status,
      details: {
        totalWorkers: this.scalingMetrics.totalWorkers,
        activeWorkers: this.scalingMetrics.activeWorkers,
        healthyWorkers: healthyWorkers.length,
        autoScalingEnabled: this.scalingMetrics.autoScalingEnabled,
        config: this.config,
        workers: this.getWorkerMetrics().map((w) => ({
          id: w.id,
          pid: w.pid,
          status: w.status,
          uptime: w.uptime,
          memoryMB: Math.round(w.memoryUsage.heapUsed / 1024 / 1024),
        })),
      },
    }
  }

  async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down Scaling Service...')

    if (this.scalingInterval) {
      clearInterval(this.scalingInterval)
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
    }

    logger.info('✅ Scaling Service shutdown complete')
  }
}

// Export singleton instance
export const scalingService = new ScalingService()
