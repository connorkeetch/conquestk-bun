export interface AdminQueueStats {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed?: number
  isPaused?: boolean
  deadLetter?: number
  stalled?: number
  oldestWaitingMs?: number | null
  avgProcessingMs?: number | null
  lastFailedJob?: {
    id: string | number
    reason: string
    failedAt: string
  } | null
  warnings?: string[]
  events?: {
    completed: number
    failed: number
    stalled: number
  }
  eventsSince?: string
}

export interface AdminQueuesStats {
  initialized: boolean
  queues: Record<string, AdminQueueStats>
  timestamp: string
}

export interface AdminQueuesHealth {
  success: boolean
  status: 'healthy' | 'unhealthy' | 'disabled' | 'not-initialized'
  details: {
    workers: { initialized: boolean }
    queues: Record<string, AdminQueueStats>
    redis?: string
    queueServiceInitialized?: boolean
  }
  timestamp: string
}

// === Performance ===
export interface AdminServiceHealthResult {
  status: string
  [k: string]: unknown
}

export interface AdminPerformanceDetailedHealth {
  success: boolean
  status: 'healthy' | 'degraded' | 'critical'
  data: {
    performance: AdminServiceHealthResult
    redis: AdminServiceHealthResult
    database: AdminServiceHealthResult
    cdn: AdminServiceHealthResult
  }
  timestamp: string
}

export interface AdminPerformanceCurrentMetrics {
  timestamp?: number
  server?: {
    uptime?: number
    memoryUsage?: { heapUsed?: number }
    cpuUsage?: { user: number; system: number }
    activeConnections?: number
    requestsPerSecond?: number
  }
  database?: {
    totalQueries?: number
    avgResponseTime?: number
    slowQueries?: number
    connectionPoolSize?: number
    healthyNodes?: number
  }
  cache?: {
    hitRate?: number
    totalRequests?: number
    memoryUsage?: number
    evictions?: number
  }
  queues?: {
    totalJobs?: number
    activeJobs?: number
    waitingJobs?: number
    failedJobs?: number
    processedJobs?: number
    deadLetterJobs?: number
  }
  cdn?: {
    hitRate?: number
    bandwidth?: number
    avgLoadTime?: number
    healthyProviders?: number
  }
  game?: {
    activeGames?: number
    totalPlayers?: number
    avgPlayersPerGame?: number
    completedGames?: number
  }
  reliability?: {
    sessionCount: number
    avgLatency: number
    avgSuccessRate: number
    totalReconnects: number
    lockstep: {
      total: number
      successes: number
      failures: number
      failureRate: number
      avgDurationMs: number
    }
  }
  [k: string]: unknown
}

export interface AdminPerformanceAlert {
  id?: string
  component?: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  message?: string
  resolved?: boolean
  timestamp?: number
  metrics?: Record<string, unknown>
  [k: string]: unknown
}

// === Match Service ===
export interface AdminMatchSvcStatus {
  ok: boolean
  service: { url: string; health: string; statusCode?: number }
  auth: {
    configured: boolean
    test: 'ok' | 'unauthorized' | 'skipped' | 'error'
    statusCode?: number
  }
  redis: { healthy: boolean; message?: string }
  subscriber: { active: boolean }
  metrics?: {
    queueDepth?: Record<string, number>
    matchesFormedTotal?: number
    presenceOnline?: number
  } | null
  ts: string
}

// === Odds status ===
export interface AdminOddsStatus {
  success: boolean
  data: {
    engine: 'ts' | 'wasm' | 'shadow'
    wasmAvailable: boolean
    wasmVersion?: string
  }
}

// === API Health ===
export interface AdminApiHealth {
  status?: string
  server?: string
  database?: string
  redis?: string
  queues?: string
  environment?: string
  timestamp?: string
  [k: string]: unknown
}
