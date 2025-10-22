/**
 * @fileoverview This file defines the AuthTrackingService class, which is responsible for tracking
 * authentication-related events and managing user sessions.
 * @module services/authTrackingService
 */
import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'

/**
 * The type of authentication event.
 * @typedef {'user_login' | 'user_logout' | 'user_registration'} AuthEventType
 */
export type AuthEventType = 'user_login' | 'user_logout' | 'user_registration'

/**
 * @interface RecordAuthEventParams
 * @description Parameters for recording an authentication event.
 */
interface RecordAuthEventParams {
  userId: string
  eventType: AuthEventType
  sessionId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

/**
 * @interface StartUserSessionParams
 * @description Parameters for starting a new user session.
 */
interface StartUserSessionParams {
  userId: string
  ipAddress?: string | null
  userAgent?: string | null
  deviceInfo?: Record<string, unknown>
  sessionData?: Record<string, unknown>
}

/**
 * A service class for tracking authentication events and user sessions.
 * @class AuthTrackingService
 */
class AuthTrackingService {
  /**
   * A lightweight parser for user agent strings to extract basic device, OS, and browser information.
   * @private
   * @param {string | null | undefined} userAgent - The user agent string to parse.
   * @returns {Record<string, unknown>} An object containing the parsed information.
   */
  private parseUserAgentLite(userAgent: string | null | undefined): Record<string, unknown> {
    if (!userAgent) return {}

    const ua = userAgent
    const isMobile = /Mobi|Mobile|iPhone|Android/.test(ua)
    const isTablet = /iPad|Tablet/.test(ua)

    // OS detection (very light heuristics)
    let os = 'unknown'
    if (/Windows NT/i.test(ua)) os = 'Windows'
    else if (/Mac OS X/i.test(ua)) os = 'macOS'
    else if (/Android/i.test(ua)) os = 'Android'
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
    else if (/Linux/i.test(ua)) os = 'Linux'

    // Browser detection (very light heuristics)
    let browser = 'unknown'
    let browserVersion: string | undefined
    const matchers: Array<{ name: string; regex: RegExp }> = [
      { name: 'Edge', regex: /Edg\/(\d+[.\d+]*)/ },
      { name: 'Chrome', regex: /Chrome\/(\d+[.\d+]*)/ },
      { name: 'Firefox', regex: /Firefox\/(\d+[.\d+]*)/ },
      // Safari version is in Version/x.y but presence of Safari indicates engine
      { name: 'Safari', regex: /Version\/(\d+[.\d+]*)\s+Safari\// },
      { name: 'Opera', regex: /OPR\/(\d+[.\d+]*)/ },
    ]
    for (const m of matchers) {
      const match = ua.match(m.regex)
      if (match) {
        browser = m.name
        browserVersion = match[1]
        break
      }
    }

    const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop'

    return {
      os,
      browser,
      browserVersion,
      deviceType,
      ua,
    }
  }
  /**
   * Records an authentication event in the database.
   * @param {RecordAuthEventParams} params - The parameters for the authentication event.
   * @returns {Promise<void>} A promise that resolves when the event has been recorded.
   */
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

  /**
   * Starts a new user session and records it in the database.
   * @param {StartUserSessionParams} params - The parameters for starting the session.
   * @returns {Promise<string | null>} A promise that resolves to the new session ID, or null if an error occurs.
   */
  async startUserSession({
    userId,
    ipAddress,
    userAgent,
    deviceInfo,
    sessionData,
  }: StartUserSessionParams): Promise<string | null> {
    try {
      const effectiveDeviceInfo =
        deviceInfo && Object.keys(deviceInfo).length > 0
          ? deviceInfo
          : this.parseUserAgentLite(userAgent)

      const result = await query<{ id: string }>(
        `INSERT INTO user_sessions (user_id, ip_address, user_agent, device_info, session_data)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          userId,
          ipAddress ?? null,
          userAgent ?? null,
          effectiveDeviceInfo ?? {},
          sessionData ?? {},
        ],
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

  /**
   * Ends a user session by updating its `ended_at` timestamp.
   * @param {string} sessionId - The ID of the session to end.
   * @returns {Promise<void>} A promise that resolves when the session has been ended.
   */
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

  /**
   * Closes any stale user sessions that have been open for longer than a specified duration.
   * @param {number} maxAgeHours - The maximum age of a session in hours before it is considered stale.
   * @returns {Promise<number>} A promise that resolves to the number of stale sessions that were closed.
   */
  async closeStaleSessions(maxAgeHours: number): Promise<number> {
    // Close sessions that have been open longer than maxAgeHours
    // and have not been explicitly ended
    const hours = Number.isFinite(maxAgeHours) && maxAgeHours > 0 ? maxAgeHours : 168
    try {
      const result = await query<{ count: string }>(
        `UPDATE user_sessions
         SET ended_at = CURRENT_TIMESTAMP,
             duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::integer
         WHERE ended_at IS NULL
           AND started_at < CURRENT_TIMESTAMP - ($1 || ' hours')::interval
         RETURNING id`,
        [String(hours)],
      )
      const closed = result.rows.length
      if (closed > 0) {
        logger.info('Closed stale user sessions', { count: closed, maxAgeHours: hours })
      }
      return closed
    } catch (error) {
      logger.warn('Failed to close stale user sessions', {
        context: 'authTrackingService.closeStaleSessions',
        error,
        maxAgeHours: hours,
      })
      return 0
    }
  }
}

export const authTrackingService = new AuthTrackingService()
