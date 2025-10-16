import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'

export interface ClientMetricsPayload {
  userId?: string | null
  sessionId: string
  gameId?: string | null
  metrics: Record<string, unknown>
  stats: Record<string, unknown>
}

export async function insertClientMetrics(payload: ClientMetricsPayload): Promise<void> {
  const { userId, sessionId, gameId, metrics, stats } = payload

  try {
    await query(
      `INSERT INTO client_metrics (user_id, session_id, game_id, metrics, stats)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [userId ?? null, sessionId, gameId ?? null, JSON.stringify(metrics), JSON.stringify(stats)],
    )
  } catch (error) {
    logger.error('Failed to insert client metrics', {
      sessionId,
      gameId,
      error: error instanceof Error ? error.message : error,
    })
    throw error
  }
}

export async function getClientMetricsSummary(hours = 24): Promise<{
  sessionCount: number
  avgLatency: number
  avgSuccessRate: number
  totalReconnects: number
}> {
  const result = await query(
    `SELECT
        COUNT(*)::int AS session_count,
        COALESCE(AVG((metrics->>'avgLatency')::numeric), 0) AS avg_latency,
        COALESCE(AVG((stats->>'actionSuccessRate')::numeric), 0) AS avg_success_rate,
        COALESCE(SUM((metrics->>'reconnectCount')::integer), 0) AS total_reconnects
      FROM client_metrics
      WHERE created_at >= NOW() - ($1::text || ' hours')::interval`,
    [String(hours)],
  )

  const row = result.rows[0]
  return {
    sessionCount: Number(row?.session_count ?? 0),
    avgLatency: Number(row?.avg_latency ?? 0),
    avgSuccessRate: Number(row?.avg_success_rate ?? 0),
    totalReconnects: Number(row?.total_reconnects ?? 0),
  }
}
