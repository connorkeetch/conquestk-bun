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

type LockstepReasonKey =
  | 'frame_gap'
  | 'unsupported_commands'
  | 'missing_state'
  | 'checksum_mismatch'
  | 'snapshot_error'
  | 'manual'

type SessionBreakdownRow = {
  id: string | null
  label: string | null
  status?: string | null
  sessions: number
  reconnects: number
  resyncs: number
}

const LOCKSTEP_REASONS: LockstepReasonKey[] = [
  'frame_gap',
  'unsupported_commands',
  'missing_state',
  'checksum_mismatch',
  'snapshot_error',
  'manual',
]

const DEFAULT_TOP_LIMIT = 5

export interface ClientMetricsSummary {
  sessionCount: number
  avgLatency: number
  avgSuccessRate: number
  totalReconnects: number
  activeGames: number
  lockstepResyncs: {
    total: number
    successes: number
    failures: number
    failureRate: number
    avgDurationMs: number
    byReason: Array<{ reason: LockstepReasonKey; total: number }>
  }
  sessionsPerGame: Array<
    SessionBreakdownRow & {
      resyncsPerSession: number
    }
  >
  sessionsPerUser: Array<
    SessionBreakdownRow & {
      username: string | null
      resyncsPerSession: number
    }
  >
}

export async function getClientMetricsSummary(hours = 24): Promise<ClientMetricsSummary> {
  const hoursParam = String(hours)

  const summaryResult = await query(
    `WITH latest_sessions AS (
       SELECT DISTINCT ON (session_id)
         session_id,
         user_id,
         game_id,
         metrics,
         stats,
         created_at
       FROM client_metrics
       WHERE created_at >= NOW() - ($1::text || ' hours')::interval
       ORDER BY session_id, created_at DESC
     )
     SELECT
       COUNT(*)::int AS session_count,
       COUNT(DISTINCT NULLIF(game_id, '')) AS active_games,
       COALESCE(AVG((metrics->>'avgLatency')::numeric), 0) AS avg_latency,
       COALESCE(AVG((stats->>'actionSuccessRate')::numeric), 0) AS avg_success_rate,
       COALESCE(SUM((metrics->>'reconnectCount')::integer), 0) AS total_reconnects,
       COALESCE(SUM((metrics->'lockstepResyncs'->>'total')::integer), 0) AS lockstep_total,
       COALESCE(SUM((metrics->'lockstepResyncs'->>'successes')::integer), 0) AS lockstep_successes,
       COALESCE(SUM((metrics->'lockstepResyncs'->>'failures')::integer), 0) AS lockstep_failures,
       COALESCE(AVG(NULLIF((metrics->'lockstepResyncs'->>'avgDurationMs')::numeric, 0)), 0) AS lockstep_avg_duration,
       ${LOCKSTEP_REASONS.map(
         (reason) =>
           `COALESCE(SUM((metrics->'lockstepResyncs'->'byReason'->>'${reason}')::integer), 0) AS reason_${reason}`,
       ).join(', ')}
     FROM latest_sessions`,
    [hoursParam],
  )

  const sessionsPerGameResult = await query(
    `WITH latest_sessions AS (
       SELECT DISTINCT ON (session_id)
         session_id,
         user_id,
         game_id,
         metrics,
         stats,
         created_at
       FROM client_metrics
       WHERE created_at >= NOW() - ($1::text || ' hours')::interval
       ORDER BY session_id, created_at DESC
     )
     SELECT
       ls.game_id AS id,
       gr.name AS label,
       gr.status AS status,
       COUNT(*)::int AS sessions,
       COALESCE(SUM((ls.metrics->>'reconnectCount')::integer), 0) AS reconnects,
       COALESCE(SUM((ls.metrics->'lockstepResyncs'->>'total')::integer), 0) AS resyncs
     FROM latest_sessions ls
     LEFT JOIN game_rooms gr ON gr.id::text = ls.game_id
     WHERE ls.game_id IS NOT NULL AND ls.game_id <> ''
     GROUP BY ls.game_id, gr.name, gr.status
     ORDER BY resyncs DESC, sessions DESC
     LIMIT $2`,
    [hoursParam, DEFAULT_TOP_LIMIT],
  )

  const sessionsPerUserResult = await query(
    `WITH latest_sessions AS (
       SELECT DISTINCT ON (session_id)
         session_id,
         user_id,
         game_id,
         metrics,
         stats,
         created_at
       FROM client_metrics
       WHERE created_at >= NOW() - ($1::text || ' hours')::interval
       ORDER BY session_id, created_at DESC
     )
     SELECT
       ls.user_id AS id,
       u.username AS label,
       COUNT(*)::int AS sessions,
       COALESCE(SUM((ls.metrics->>'reconnectCount')::integer), 0) AS reconnects,
       COALESCE(SUM((ls.metrics->'lockstepResyncs'->>'total')::integer), 0) AS resyncs
     FROM latest_sessions ls
     LEFT JOIN users u ON u.id::text = ls.user_id
     WHERE ls.user_id IS NOT NULL AND ls.user_id <> ''
     GROUP BY ls.user_id, u.username
     ORDER BY resyncs DESC, sessions DESC
     LIMIT $2`,
    [hoursParam, DEFAULT_TOP_LIMIT],
  )

  const row = summaryResult.rows[0]
  const sessionCount = Number(row?.session_count ?? 0)
  const totalResyncs = Number(row?.lockstep_total ?? 0)
  const successes = Number(row?.lockstep_successes ?? 0)
  const failures = Number(row?.lockstep_failures ?? 0)
  const failureRate = totalResyncs > 0 ? failures / totalResyncs : 0
  const avgDurationMs = Number(row?.lockstep_avg_duration ?? 0)
  const lockstepByReason = LOCKSTEP_REASONS.map((reason) => ({
    reason,
    total: Number(row?.[`reason_${reason}`] ?? 0),
  })).filter((entry) => entry.total > 0)

  const buildSessionBreakdown = (
    resultRows: SessionBreakdownRow[],
    mapLabel: (row: SessionBreakdownRow) => string | null,
  ) =>
    resultRows.map((entry) => {
      const sessions = Number(entry.sessions ?? 0)
      const resyncs = Number(entry.resyncs ?? 0)
      return {
        id: entry.id,
        label: mapLabel(entry),
        status: entry.status ?? null,
        sessions,
        reconnects: Number(entry.reconnects ?? 0),
        resyncs,
        resyncsPerSession: sessions > 0 ? resyncs / sessions : 0,
      }
    })

  const sessionsPerGame = buildSessionBreakdown(
    sessionsPerGameResult.rows as SessionBreakdownRow[],
    (entry) => entry.label ?? entry.id,
  )

  const sessionsPerUser = (sessionsPerUserResult.rows as SessionBreakdownRow[]).map((entry) => {
    const sessions = Number(entry.sessions ?? 0)
    const resyncs = Number(entry.resyncs ?? 0)
    return {
      id: entry.id,
      label: entry.label ?? entry.id,
      username: entry.label ?? null,
      sessions,
      reconnects: Number(entry.reconnects ?? 0),
      resyncs,
      resyncsPerSession: sessions > 0 ? resyncs / sessions : 0,
    }
  })

  return {
    sessionCount,
    avgLatency: Number(row?.avg_latency ?? 0),
    avgSuccessRate: Number(row?.avg_success_rate ?? 0),
    totalReconnects: Number(row?.total_reconnects ?? 0),
    activeGames: Number(row?.active_games ?? 0),
    lockstepResyncs: {
      total: totalResyncs,
      successes,
      failures,
      failureRate,
      avgDurationMs,
      byReason: lockstepByReason,
    },
    sessionsPerGame,
    sessionsPerUser,
  }
}
