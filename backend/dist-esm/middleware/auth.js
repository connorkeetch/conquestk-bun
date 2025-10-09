"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importStar(require("jsonwebtoken"));
const database_js_1 = require("../config/database.js");
const clanService_js_1 = require("../services/clanService.js");
const errorHelpers_js_1 = require("../utils/errorHelpers.js");
const logger_js_1 = require("../utils/logger.js");
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) {
        res.status(401).json({ message: 'Access token required' });
        return;
    }
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        logger_js_1.logger.error('FATAL: JWT_SECRET environment variable is not set');
        res.status(500).json({ message: 'Server configuration error' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        if (!decoded ||
            typeof decoded !== 'object' ||
            typeof decoded.userId !== 'string') {
            logger_js_1.logger.warn('Token verification succeeded but payload was invalid');
            res.status(403).json({ message: 'Invalid token payload' });
            return;
        }
        const payload = decoded;
        req.userId = payload.userId;
        if (payload.sessionId && typeof payload.sessionId === 'string') {
            req.sessionId = payload.sessionId;
        }
        else {
            req.sessionId = undefined;
        }
        try {
            const statusResult = await (0, database_js_1.query)('SELECT status, reason, expires_at FROM user_account_status WHERE user_id = $1', [
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
            logger_js_1.logger.warn('Failed to check user account status', {
                userId: payload.userId,
                error: (0, errorHelpers_js_1.getErrorMessage)(statusError),
            });
        }
        try {
            const result = await (0, database_js_1.query)(`SELECT id, username, email, is_admin, is_vip, premium_tier, is_beta_user
         FROM users WHERE id = $1`, [payload.userId]);
            if (result.rows[0]) {
                const userRow = result.rows[0];
                const adminResult = await (0, database_js_1.query)('SELECT COUNT(*) as count FROM user_admin_roles WHERE user_id = $1', [payload.userId]);
                const hasAdminRole = Number(adminResult.rows[0]?.count || 0) > 0;
                const premiumTier = userRow.premium_tier || 'free';
                const membership = await clanService_js_1.clanService.getActiveMembership(payload.userId);
                const requestUser = {
                    id: userRow.id,
                    username: userRow.username ?? undefined,
                    email: userRow.email ?? undefined,
                    isAdmin: hasAdminRole || Boolean(userRow.is_admin),
                    isVip: Boolean(userRow.is_vip),
                    isBetaUser: Boolean(userRow.is_beta_user),
                    premiumTier,
                    hasPremium: premiumTier !== 'free',
                    clanMembership: membership,
                };
                req.user = requestUser;
            }
        }
        catch (dbError) {
            logger_js_1.logger.warn('Failed to fetch user details:', (0, errorHelpers_js_1.getErrorMessage)(dbError));
        }
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.TokenExpiredError) {
            logger_js_1.logger.info('Token verification failed: token expired', {
                path: req.path,
                method: req.method,
            });
            res.status(401).json({ message: 'Token expired' });
            return;
        }
        logger_js_1.logger.error('Token verification failed:', (0, errorHelpers_js_1.toKnownError)(error));
        res.status(403).json({ message: 'Invalid token' });
        return;
    }
};
exports.authenticateToken = authenticateToken;
//# sourceMappingURL=auth.js.map