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
  // Shape depends on performanceMonitorService; expose as index signature
  [k: string]: unknown
}

export interface AdminPerformanceAlert {
  id?: string
  severity?: string
  message?: string
  resolved?: boolean
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
