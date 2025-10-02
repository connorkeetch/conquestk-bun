import { query } from '../config/database'
import { logger } from '../utils/logger'

export type AuthEventType = 'user_login' | 'user_logout' | 'user_registration'

interface RecordAuthEventParams {
  userId: string
  eventType: AuthEventType
  sessionId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

interface StartUserSessionParams {
  userId: string
  ipAddress?: string | null
  userAgent?: string | null
  deviceInfo?: Record<string, unknown>
  sessionData?: Record<string, unknown>
}

class AuthTrackingService {
  async recordAuthEvent({
    userId,
    eventType,
    sessionId,
    ipAddress,
    userAgent,
    metadata,
  }: RecordAuthEventParams): Promise<void> {
    try {
      await query(
        `INSERT INTO events (user_id, session_id, event_type, event_data, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          sessionId ?? null,
          eventType,
          metadata ?? {},
          ipAddress ?? null,
          userAgent ?? null,
        ],
      )
    } catch (error) {
      logger.warn('Failed to record auth event', {
        context: 'authTrackingService.recordAuthEvent',
        error,
        userId,
        eventType,
      })
    }
  }

  async startUserSession({
    userId,
    ipAddress,
    userAgent,
    deviceInfo,
    sessionData,
  }: StartUserSessionParams): Promise<string | null> {
    try {
      const result = await query<{ id: string }>(
        `INSERT INTO user_sessions (user_id, ip_address, user_agent, device_info, session_data)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, ipAddress ?? null, userAgent ?? null, deviceInfo ?? {}, sessionData ?? {}],
      )

      return result.rows[0]?.id ?? null
    } catch (error) {
      logger.warn('Failed to create user session record', {
        context: 'authTrackingService.startUserSession',
        error,
        userId,
      })
      return null
    }
  }

  async endUserSession(sessionId: string): Promise<void> {
    try {
      await query(
        `UPDATE user_sessions
         SET ended_at = CURRENT_TIMESTAMP,
             duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::integer
         WHERE id = $1 AND ended_at IS NULL`,
        [sessionId],
      )
    } catch (error) {
      logger.warn('Failed to close user session record', {
        context: 'authTrackingService.endUserSession',
        error,
        sessionId,
      })
    }
  }
}

export const authTrackingService = new AuthTrackingService()
