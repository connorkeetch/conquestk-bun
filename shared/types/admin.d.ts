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

