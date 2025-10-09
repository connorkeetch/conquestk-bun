"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.featureFlagService = exports.FeatureFlagService = void 0;
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
const PREMIUM_TIER_RANK = {
    free: 0,
    premium: 1,
    pro: 2,
    enterprise: 3,
};
const normalizeTier = (tier) => (tier || 'free').toLowerCase();
class FeatureFlagService {
    constructor() {
        this.flagCache = new Map();
        this.cacheExpiry = 60000;
        this.lastCacheUpdate = 0;
    }
    static getInstance() {
        if (!FeatureFlagService.instance) {
            FeatureFlagService.instance = new FeatureFlagService();
        }
        return FeatureFlagService.instance;
    }
    async evaluateForUser(user) {
        const flags = await this.getAllFlags();
        const result = {};
        for (const flag of flags) {
            result[flag.flag_name] = await this.evaluateFlag(flag, user);
        }
        return result;
    }
    async evaluateFlagByName(flagName, user) {
        const flag = await this.getFlag(flagName);
        if (!flag)
            return false;
        return this.evaluateFlag(flag, user);
    }
    async evaluateFlag(flag, user) {
        if (!flag.is_enabled || flag.access_level === 'disabled') {
            return false;
        }
        if (user?.id) {
            const override = await this.getUserOverride(user.id, flag.flag_name);
            if (override !== null)
                return override;
        }
        if (!this.checkAccessLevel(flag.access_level, user)) {
            return false;
        }
        if (flag.dependencies?.length > 0) {
            for (const dep of flag.dependencies) {
                const depFlag = await this.evaluateFlagByName(dep, user);
                if (!depFlag)
                    return false;
            }
        }
        if (!this.matchesTargetCriteria(flag.target_criteria, user)) {
            return false;
        }
        return true;
    }
    checkAccessLevel(accessLevel, user) {
        switch (accessLevel) {
            case 'disabled':
                return false;
            case 'internal':
                return user?.isAdmin === true || user?.role === 'tester';
            case 'beta':
                return user?.isAdmin === true || user?.role === 'tester' || user?.isBetaUser === true;
            case 'public':
                return true;
            default:
                return false;
        }
    }
    matchesTargetCriteria(criteria, user) {
        if (!criteria || Object.keys(criteria).length === 0) {
            return true;
        }
        const requireVip = criteria.require_vip === true;
        if (requireVip && !user?.isVip) {
            return false;
        }
        const userTier = normalizeTier(user?.premiumTier);
        const userHasPremium = user?.hasPremium ?? userTier !== 'free';
        const requirePremium = criteria.require_premium === true;
        if (requirePremium && !userHasPremium) {
            return false;
        }
        const minimumTierRaw = criteria.minimum_premium_tier ||
            criteria.min_premium_tier ||
            criteria.required_premium_tier;
        if (minimumTierRaw) {
            const requiredTier = normalizeTier(minimumTierRaw);
            const requiredRank = PREMIUM_TIER_RANK[requiredTier] ?? PREMIUM_TIER_RANK.free;
            const userRank = PREMIUM_TIER_RANK[userTier] ?? PREMIUM_TIER_RANK.free;
            if (userRank < requiredRank) {
                return false;
            }
        }
        const allowedRoles = criteria.allowed_roles;
        if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
            if (!user?.role || !allowedRoles.includes(user.role)) {
                return false;
            }
        }
        const excludedRoles = criteria.excluded_roles;
        if (Array.isArray(excludedRoles) && excludedRoles.length > 0) {
            if (user?.role && excludedRoles.includes(user.role)) {
                return false;
            }
        }
        const requireAdmin = criteria.require_admin === true;
        if (requireAdmin && !user?.isAdmin) {
            return false;
        }
        return true;
    }
    async getUserOverride(userId, flagName) {
        try {
            const result = await (0, database_js_1.query)('SELECT is_enabled FROM user_feature_flags WHERE user_id = $1 AND flag_name = $2', [userId, flagName]);
            if (result.rows.length > 0) {
                return result.rows[0].is_enabled;
            }
        }
        catch (error) {
            logger_js_1.logger.error('❌ Error fetching user override', {
                userId,
                flagName,
                error,
            });
        }
        return null;
    }
    async getAllFlags() {
        const now = Date.now();
        if (now - this.lastCacheUpdate < this.cacheExpiry && this.flagCache.size > 0) {
            return Array.from(this.flagCache.values());
        }
        try {
            const result = await (0, database_js_1.query)('SELECT * FROM feature_flags');
            const flags = result.rows;
            this.flagCache.clear();
            for (const flag of flags) {
                this.flagCache.set(flag.flag_name, flag);
            }
            this.lastCacheUpdate = now;
            return flags;
        }
        catch (error) {
            logger_js_1.logger.error('❌ Error fetching feature flags', { error });
            return [];
        }
    }
    async listFlags() {
        return this.getAllFlags();
    }
    async getFlag(flagName) {
        const _flags = await this.getAllFlags();
        return this.flagCache.get(flagName) || null;
    }
    async updateFlag(flagName, updates, changedBy, reason) {
        try {
            const updateFields = [];
            const values = [];
            let paramCount = 1;
            if (updates.is_enabled !== undefined) {
                updateFields.push(`is_enabled = $${paramCount++}`);
                values.push(updates.is_enabled);
                updateFields.push(`rollout_percentage = $${paramCount++}`);
                values.push(updates.is_enabled ? 100 : 0);
            }
            if (updates.access_level !== undefined) {
                updateFields.push(`access_level = $${paramCount++}`);
                values.push(updates.access_level);
            }
            if (updates.description !== undefined) {
                updateFields.push(`description = $${paramCount++}`);
                values.push(updates.description);
            }
            if (updates.category !== undefined) {
                updateFields.push(`category = $${paramCount++}`);
                values.push(updates.category);
            }
            if (updates.target_criteria !== undefined) {
                updateFields.push(`target_criteria = $${paramCount++}`);
                values.push(JSON.stringify(updates.target_criteria));
            }
            if (updates.dependencies !== undefined) {
                updateFields.push(`dependencies = $${paramCount++}`);
                values.push(JSON.stringify(updates.dependencies));
            }
            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(flagName);
            const result = await (0, database_js_1.query)(`UPDATE feature_flags SET ${updateFields.join(', ')} 
         WHERE flag_name = $${paramCount} RETURNING *`, values);
            if (result.rows.length > 0) {
                this.flagCache.clear();
                this.lastCacheUpdate = 0;
                if (reason) {
                    await (0, database_js_1.query)(`UPDATE feature_flag_audit 
             SET reason = $1 
             WHERE flag_name = $2 AND changed_by = $3
             ORDER BY created_at DESC LIMIT 1`, [reason, flagName, changedBy]);
                }
                return result.rows[0];
            }
        }
        catch (error) {
            logger_js_1.logger.error('❌ Error updating feature flag', {
                flagName,
                updates,
                changedBy,
                error,
            });
        }
        return null;
    }
    async setUserOverride(userId, flagName, enabled) {
        try {
            await (0, database_js_1.query)(`INSERT INTO user_feature_flags (user_id, flag_name, is_enabled) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (user_id, flag_name) 
         DO UPDATE SET is_enabled = $3, assigned_at = CURRENT_TIMESTAMP`, [userId, flagName, enabled]);
        }
        catch (error) {
            logger_js_1.logger.error('❌ Error setting user override', {
                userId,
                flagName,
                enabled,
                error,
            });
        }
    }
    async clearUserOverride(userId, flagName) {
        try {
            await (0, database_js_1.query)('DELETE FROM user_feature_flags WHERE user_id = $1 AND flag_name = $2', [
                userId,
                flagName,
            ]);
        }
        catch (error) {
            logger_js_1.logger.error('❌ Error clearing user override', {
                userId,
                flagName,
                error,
            });
        }
    }
    async listUserOverrides(userId) {
        try {
            const result = await (0, database_js_1.query)('SELECT flag_name, is_enabled FROM user_feature_flags WHERE user_id = $1', [userId]);
            return new Map(result.rows.map((row) => [row.flag_name, row.is_enabled]));
        }
        catch (error) {
            logger_js_1.logger.error('❌ Error fetching user overrides', {
                userId,
                error,
            });
            return new Map();
        }
    }
    async getAuditLog(flagName, limit = 50) {
        try {
            let queryStr = `
        SELECT fa.*, u.username 
        FROM feature_flag_audit fa
        LEFT JOIN users u ON fa.changed_by = u.id
      `;
            const values = [];
            if (flagName) {
                queryStr += ' WHERE fa.flag_name = $1';
                values.push(flagName);
            }
            queryStr += ` ORDER BY fa.created_at DESC LIMIT $${values.length + 1}`;
            values.push(limit);
            const result = await (0, database_js_1.query)(queryStr, values);
            return result.rows;
        }
        catch (error) {
            logger_js_1.logger.error('❌ Error fetching feature flag audit log', {
                flagName,
                limit,
                error,
            });
            return [];
        }
    }
    clearCache() {
        this.flagCache.clear();
        this.lastCacheUpdate = 0;
    }
}
exports.FeatureFlagService = FeatureFlagService;
exports.featureFlagService = FeatureFlagService.getInstance();
//# sourceMappingURL=featureFlagService.js.map