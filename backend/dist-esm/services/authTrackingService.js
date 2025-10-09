"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authTrackingService = void 0;
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
class AuthTrackingService {
    parseUserAgentLite(userAgent) {
        if (!userAgent)
            return {};
        const ua = userAgent;
        const isMobile = /Mobi|Mobile|iPhone|Android/.test(ua);
        const isTablet = /iPad|Tablet/.test(ua);
        let os = 'unknown';
        if (/Windows NT/i.test(ua))
            os = 'Windows';
        else if (/Mac OS X/i.test(ua))
            os = 'macOS';
        else if (/Android/i.test(ua))
            os = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua))
            os = 'iOS';
        else if (/Linux/i.test(ua))
            os = 'Linux';
        let browser = 'unknown';
        let browserVersion;
        const matchers = [
            { name: 'Edge', regex: /Edg\/(\d+[.\d+]*)/ },
            { name: 'Chrome', regex: /Chrome\/(\d+[.\d+]*)/ },
            { name: 'Firefox', regex: /Firefox\/(\d+[.\d+]*)/ },
            { name: 'Safari', regex: /Version\/(\d+[.\d+]*)\s+Safari\// },
            { name: 'Opera', regex: /OPR\/(\d+[.\d+]*)/ },
        ];
        for (const m of matchers) {
            const match = ua.match(m.regex);
            if (match) {
                browser = m.name;
                browserVersion = match[1];
                break;
            }
        }
        const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';
        return {
            os,
            browser,
            browserVersion,
            deviceType,
            ua,
        };
    }
    async recordAuthEvent({ userId, eventType, sessionId, ipAddress, userAgent, metadata, }) {
        try {
            await (0, database_js_1.query)(`INSERT INTO events (user_id, session_id, event_type, event_data, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`, [
                userId,
                sessionId ?? null,
                eventType,
                metadata ?? {},
                ipAddress ?? null,
                userAgent ?? null,
            ]);
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to record auth event', {
                context: 'authTrackingService.recordAuthEvent',
                error,
                userId,
                eventType,
            });
        }
    }
    async startUserSession({ userId, ipAddress, userAgent, deviceInfo, sessionData, }) {
        try {
            const effectiveDeviceInfo = deviceInfo && Object.keys(deviceInfo).length > 0
                ? deviceInfo
                : this.parseUserAgentLite(userAgent);
            const result = await (0, database_js_1.query)(`INSERT INTO user_sessions (user_id, ip_address, user_agent, device_info, session_data)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`, [
                userId,
                ipAddress ?? null,
                userAgent ?? null,
                effectiveDeviceInfo ?? {},
                sessionData ?? {},
            ]);
            return result.rows[0]?.id ?? null;
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to create user session record', {
                context: 'authTrackingService.startUserSession',
                error,
                userId,
            });
            return null;
        }
    }
    async endUserSession(sessionId) {
        try {
            await (0, database_js_1.query)(`UPDATE user_sessions
         SET ended_at = CURRENT_TIMESTAMP,
             duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::integer
         WHERE id = $1 AND ended_at IS NULL`, [sessionId]);
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to close user session record', {
                context: 'authTrackingService.endUserSession',
                error,
                sessionId,
            });
        }
    }
    async closeStaleSessions(maxAgeHours) {
        const hours = Number.isFinite(maxAgeHours) && maxAgeHours > 0 ? maxAgeHours : 168;
        try {
            const result = await (0, database_js_1.query)(`UPDATE user_sessions
         SET ended_at = CURRENT_TIMESTAMP,
             duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::integer
         WHERE ended_at IS NULL
           AND started_at < CURRENT_TIMESTAMP - ($1 || ' hours')::interval
         RETURNING id`, [String(hours)]);
            const closed = result.rows.length;
            if (closed > 0) {
                logger_js_1.logger.info('Closed stale user sessions', { count: closed, maxAgeHours: hours });
            }
            return closed;
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to close stale user sessions', {
                context: 'authTrackingService.closeStaleSessions',
                error,
                maxAgeHours: hours,
            });
            return 0;
        }
    }
}
exports.authTrackingService = new AuthTrackingService();
//# sourceMappingURL=authTrackingService.js.map