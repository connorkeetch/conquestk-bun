import fs from 'node:fs'
import path from 'node:path'
import { writeHeapSnapshot } from 'node:v8'

import { getErrorMessage } from '../utils/errorHelpers'
import { logger } from '../utils/logger'

const MB = 1024 * 1024

interface MemorySample {
  timestamp: number
  heapUsed: number
  rss: number
  external: number
}

interface MemoryDiagnosticsOptions {
  intervalMs?: number
  growthThresholdMb?: number
  minSamples?: number
  alertCooldownMs?: number
  historySize?: number
  snapshotDirectory?: string | null
}

/**
 * Lightweight process memory monitor that looks for sustained heap growth.
 *
 * The goal is to surface potential leaks early and capture a heap snapshot
 * automatically when suspicious growth is detected so we can investigate
 * offline with DevTools.
 */
class MemoryDiagnosticsService {
  private readonly intervalMs: number
  private readonly growthThresholdBytes: number
  private readonly minSamples: number
  private readonly alertCooldownMs: number
  private readonly historySize: number
  private readonly snapshotDirectory: string | null

  private samples: MemorySample[] = []
  private monitorInterval: NodeJS.Timeout | null = null
  private lastAlertAt = 0

  constructor(options: MemoryDiagnosticsOptions = {}) {
    this.intervalMs = Math.max(5000, options.intervalMs ?? this.readNumberEnv('MEMORY_MONITOR_INTERVAL_MS', 15000))
    this.growthThresholdBytes = (options.growthThresholdMb ?? this.readNumberEnv('MEMORY_MONITOR_GROWTH_THRESHOLD_MB', 120)) * MB
    this.minSamples = Math.max(4, options.minSamples ?? this.readNumberEnv('MEMORY_MONITOR_MIN_SAMPLES', 8))
    this.alertCooldownMs = Math.max(
      60000,
      options.alertCooldownMs ?? this.readNumberEnv('MEMORY_MONITOR_ALERT_COOLDOWN_MS', 10 * 60 * 1000),
    )
    this.historySize = Math.max(
      this.minSamples,
      options.historySize ?? this.readNumberEnv('MEMORY_MONITOR_HISTORY_SIZE', this.minSamples * 3),
    )

    const directory = options.snapshotDirectory ?? process.env.MEMORY_MONITOR_SNAPSHOT_DIR ?? null
    this.snapshotDirectory = directory ? path.resolve(directory) : null
  }

  /** Start collecting memory samples */
  start(): void {
    const isDisabled = process.env.MEMORY_MONITOR_ENABLED === 'false'
    if (isDisabled) {
      logger.info('🧠 Memory diagnostics disabled via MEMORY_MONITOR_ENABLED=false')
      return
    }

    if (this.monitorInterval) {
      return
    }

    logger.info('🧠 Memory diagnostics monitor starting', {
      intervalMs: this.intervalMs,
      growthThresholdMb: Math.round((this.growthThresholdBytes / MB) * 10) / 10,
      minSamples: this.minSamples,
      historySize: this.historySize,
      snapshotDirectory: this.snapshotDirectory ?? 'disabled',
    })

    this.captureSample('startup')

    this.monitorInterval = setInterval(() => {
      try {
        this.captureSample('interval')
        this.evaluateTrend()
      } catch (error) {
        logger.error('❌ Memory diagnostics failed', { error: getErrorMessage(error) })
      }
    }, this.intervalMs)

    if (typeof this.monitorInterval.unref === 'function') {
      this.monitorInterval.unref()
    }

    process.once('exit', () => this.stop())
  }

  /** Stop sampling (primarily for tests or graceful shutdown) */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = null
    }
  }

  /**
   * Log the current memory usage on demand.
   */
  reportUsage(context: string): void {
    const usage = process.memoryUsage()
    logger.info('🧠 Memory usage snapshot', {
      context,
      rssMb: this.toMb(usage.rss),
      heapTotalMb: this.toMb(usage.heapTotal),
      heapUsedMb: this.toMb(usage.heapUsed),
      externalMb: this.toMb(usage.external),
      arrayBuffersMb: this.toMb(usage.arrayBuffers ?? 0),
    })
  }

  private captureSample(reason: 'startup' | 'interval'): void {
    const usage = process.memoryUsage()
    const sample: MemorySample = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      rss: usage.rss,
      external: usage.external,
    }

    this.samples.push(sample)
    if (this.samples.length > this.historySize) {
      this.samples.shift()
    }

    this.reportUsage(reason)
  }

  private evaluateTrend(): void {
    if (this.samples.length < this.minSamples) {
      return
    }

    const baseline = this.samples[0]
    const latest = this.samples[this.samples.length - 1]
    const heapGrowth = latest.heapUsed - baseline.heapUsed

    if (heapGrowth < this.growthThresholdBytes) {
      return
    }

    const increasingSamples = this.samples
      .slice(1)
      .reduce((count, sample, index) => {
        const previous = this.samples[index]
        return sample.heapUsed >= previous.heapUsed * 0.9 ? count + 1 : count
      }, 0)

    const trendRatio = increasingSamples / (this.samples.length - 1)
    if (trendRatio < 0.6) {
      return
    }

    const now = Date.now()
    if (now - this.lastAlertAt < this.alertCooldownMs) {
      return
    }

    this.lastAlertAt = now

    const heapGrowthMb = this.toMb(heapGrowth)
    const rssGrowthMb = this.toMb(latest.rss - baseline.rss)

    logger.warn('⚠️ Potential memory leak detected', {
      heapGrowthMb,
      rssGrowthMb,
      sampleWindowMs: latest.timestamp - baseline.timestamp,
      samples: this.samples.length,
    })

    this.captureHeapSnapshot('auto-leak-warning')
  }

  private captureHeapSnapshot(reason: string): void {
    if (!this.snapshotDirectory) {
      return
    }

    try {
      fs.mkdirSync(this.snapshotDirectory, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filePath = path.join(this.snapshotDirectory, `${timestamp}-${reason}.heapsnapshot`)
      const snapshotPath = writeHeapSnapshot(filePath)
      logger.warn('🧠 Heap snapshot captured for analysis', { snapshotPath })
    } catch (error) {
      logger.error('❌ Failed to capture heap snapshot', { error: getErrorMessage(error) })
    }
  }

  private toMb(value: number): number {
    return Math.round((value / MB) * 10) / 10
  }

  private readNumberEnv(envName: string, fallback: number): number {
    const raw = process.env[envName]
    if (!raw) {
      return fallback
    }
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  }
}

export const memoryDiagnosticsService = new MemoryDiagnosticsService()
