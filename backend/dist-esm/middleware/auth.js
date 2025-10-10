import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { clanService } from '../services/clanService.js';
import { getErrorMessage, toKnownError } from '../utils/errorHelpers.js';
import { logger } from '../utils/logger.js';
export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) {
        res.status(401).json({ message: 'Access token required' });
        return;
    }
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        logger.error('FATAL: JWT_SECRET environment variable is not set');
        res.status(500).json({ message: 'Server configuration error' });
        return;
    }
    try {
        const decoded = jwt.verify(token, jwtSecret);
        if (!decoded ||
            typeof decoded !== 'object' ||
            typeof decoded.userId !== 'string') {
            logger.warn('Token verification succeeded but payload was invalid');
            res.status(403).json({ message: 'Invalid token payload' });
            return;
        }
        const payload = decoded;
        req.userId = payload.userId;
        if (payload.sessionId && typeof payload.sessionId === 'string') {
            req.sessionId = payload.sessionId;
        }
        else {
            delete req.sessionId;
        }
        try {
            const statusResult = await query('SELECT status, reason, expires_at FROM user_account_status WHERE user_id = $1', [
                payload.userId,
            ]);
            const row = statusResult.rows[0];
            if (row) {
                const status = (row.status || '').toLowerCase();
                const isBlocking = status === 'banned' || status === 'suspended';
                if (isBlocking) {
                    const now = Date.now();
                    const expiresAtMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
                    const isExpired = typeof expiresAtMs === 'number' ? expiresAtMs <= now : false;
                    if (!isExpired) {
                        const message = status === 'banned' ? 'Account is banned' : 'Account is suspended';
                        res.status(403).json({
                            message,
                            status,
                            reason: row.reason ?? undefined,
                            expiresAt: row.expires_at ?? undefined,
                        });
                        return;
                    }
                }
            }
        }
        catch (statusError) {
            logger.warn('Failed to check user account status', {
                userId: payload.userId,
                error: getErrorMessage(statusError),
            });
        }
        try {
            const result = await query(`SELECT id, username, email, is_admin, is_vip, premium_tier, is_beta_user
         FROM users WHERE id = $1`, [payload.userId]);
            if (result.rows[0]) {
                const userRow = result.rows[0];
                const adminResult = await query('SELECT COUNT(*) as count FROM user_admin_roles WHERE user_id = $1', [payload.userId]);
                const hasAdminRole = Number(adminResult.rows[0]?.count || 0) > 0;
                const premiumTier = userRow.premium_tier || 'free';
                const membership = await clanService.getActiveMembership(payload.userId);
                const requestUser = {
                    id: userRow.id,
                    isAdmin: hasAdminRole || Boolean(userRow.is_admin),
                    isVip: Boolean(userRow.is_vip),
                    isBetaUser: Boolean(userRow.is_beta_user),
                    premiumTier,
                    hasPremium: premiumTier !== 'free',
                    clanMembership: membership,
                    ...(userRow.username ? { username: userRow.username } : {}),
                    ...(userRow.email ? { email: userRow.email } : {}),
                };
                req.user = requestUser;
            }
        }
        catch (dbError) {
            logger.warn('Failed to fetch user details:', getErrorMessage(dbError));
        }
        next();
    }
    catch (error) {
        const { TokenExpiredError } = jwt;
        if (error instanceof TokenExpiredError) {
            logger.info('Token verification failed: token expired', {
                path: req.path,
                method: req.method,
            });
            res.status(401).json({ message: 'Token expired' });
            return;
        }
        logger.error('Token verification failed:', toKnownError(error));
        res.status(403).json({ message: 'Invalid token' });
        return;
    }
};
//# sourceMappingURL=auth.js.map