/**
 * @fileoverview Service for managing feature flags, allowing for dynamic feature toggling.
 * @module services/featureFlagService
 */
import { query } from '../config/database.js'
import { logger } from '../utils/logger.js'

/** Type representing the access level for a feature flag. */
export type AccessLevel = 'disabled' | 'internal' | 'beta' | 'public'
/** Type representing the category of a feature flag. */
export type FeatureCategory = 'gameplay' | 'ui' | 'experimental' | 'premium' | 'vip'

/**
 * @interface FeatureFlag
 * @description Represents a feature flag in the database.
 */
interface FeatureFlag {
  id: string
  flag_name: string
  description: string
  is_enabled: boolean
  access_level: AccessLevel
  rollout_percentage: number
  target_criteria: Record<string, unknown>
  category: FeatureCategory
  dependencies: string[]
  created_by?: string | null
  created_at: Date | string
  updated_at: Date | string
}

/**
 * @interface FeatureFlagAuditEntry
 * @description Represents an audit log entry for a feature flag change.
 */
interface FeatureFlagAuditEntry {
  id: string
  flag_name: string
  changed_by: string | null
  change_type?: string | null
  previous_value?: Record<string, unknown> | null
  new_value?: Record<string, unknown> | null
  reason?: string | null
  created_at: Date | string
  username?: string | null
}

/**
 * @interface User
 * @description Represents a user for the purpose of feature flag evaluation.
 */
interface User {
  id: string
  role?: string
  isAdmin?: boolean
  isBetaUser?: boolean
  isVip?: boolean
  premiumTier?: 'free' | 'premium' | 'pro' | 'enterprise' | string
  hasPremium?: boolean
}

const PREMIUM_TIER_RANK: Record<string, number> = {
  free: 0,
  premium: 1,
  pro: 2,
  enterprise: 3,
}

/** @private */
const normalizeTier = (tier?: string | null): string => (tier || 'free').toLowerCase()

/**
 * @class FeatureFlagService
 * @description Manages feature flags, including evaluation, caching, and administration.
 */
export class FeatureFlagService {
  private static instance: FeatureFlagService
  private flagCache: Map<string, FeatureFlag> = new Map()
  private cacheExpiry: number = 60000 // 1 minute cache
  private lastCacheUpdate: number = 0

  private constructor() {}

  /**
   * Gets the singleton instance of the FeatureFlagService.
   * @returns {FeatureFlagService} The singleton instance.
   */
  public static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService()
    }
    return FeatureFlagService.instance
  }

  /**
   * Evaluates all feature flags for a given user.
   * @param {User} [user] - The user to evaluate the flags for.
   * @returns {Promise<Record<string, boolean>>} A map of flag names to their evaluated boolean values.
   */
  async evaluateForUser(user?: User): Promise<Record<string, boolean>> {
    const flags = await this.getAllFlags()
    const result: Record<string, boolean> = {}

    for (const flag of flags) {
      result[flag.flag_name] = await this.evaluateFlag(flag, user)
    }

    return result
  }

  /**
   * Evaluates a single feature flag for a user by its name.
   * @param {string} flagName - The name of the flag to evaluate.
   * @param {User} [user] - The user to evaluate the flag for.
   * @returns {Promise<boolean>} The evaluated boolean value of the flag.
   */
  async evaluateFlagByName(flagName: string, user?: User): Promise<boolean> {
    const flag = await this.getFlag(flagName)
    if (!flag) return false
    return this.evaluateFlag(flag, user)
  }

  /**
   * The core logic for evaluating a feature flag.
   * @param {FeatureFlag} flag - The feature flag to evaluate.
   * @param {User} [user] - The user to evaluate the flag for.
   * @returns {Promise<boolean>} The evaluated boolean value of the flag.
   * @private
   */
  private async evaluateFlag(flag: FeatureFlag, user?: User): Promise<boolean> {
    // Check if flag is globally disabled
    if (!flag.is_enabled || flag.access_level === 'disabled') {
      return false
    }

    // Check user-specific override
    if (user?.id) {
      const override = await this.getUserOverride(user.id, flag.flag_name)
      if (override !== null) return override
    }

    // Check access level
    if (!this.checkAccessLevel(flag.access_level, user)) {
      return false
    }

    // Check dependencies
    if (flag.dependencies?.length > 0) {
      for (const dep of flag.dependencies) {
        const depFlag = await this.evaluateFlagByName(dep, user)
        if (!depFlag) return false
      }
    }

    // Check target criteria
    if (!this.matchesTargetCriteria(flag.target_criteria, user)) {
      return false
    }

    return true
  }

  /**
   * Checks if a user meets the access level requirements for a feature flag.
   * @param {AccessLevel} accessLevel - The access level to check.
   * @param {User} [user] - The user to check.
   * @returns {boolean} True if the user meets the requirements, false otherwise.
   * @private
   */
  private checkAccessLevel(accessLevel: AccessLevel, user?: User): boolean {
    switch (accessLevel) {
      case 'disabled':
        return false
      case 'internal':
        return user?.isAdmin === true || user?.role === 'tester'
      case 'beta':
        return user?.isAdmin === true || user?.role === 'tester' || user?.isBetaUser === true
      case 'public':
        return true
      default:
        return false
    }
  }

  /**
   * Checks if a user matches the target criteria for a feature flag.
   * @param {Record<string, unknown>} criteria - The target criteria.
   * @param {User} [user] - The user to check.
   * @returns {boolean} True if the user matches the criteria, false otherwise.
   * @private
   */
  private matchesTargetCriteria(criteria: Record<string, unknown>, user?: User): boolean {
    if (!criteria || Object.keys(criteria).length === 0) {
      return true
    }

    // Check VIP requirement
    const requireVip = criteria.require_vip === true
    if (requireVip && !user?.isVip) {
      return false
    }

    // Check premium requirement
    const userTier = normalizeTier(user?.premiumTier)
    const userHasPremium = user?.hasPremium ?? userTier !== 'free'

    const requirePremium = criteria.require_premium === true
    if (requirePremium && !userHasPremium) {
      return false
    }

    const minimumTierRaw =
      (criteria.minimum_premium_tier as string | undefined) ||
      (criteria.min_premium_tier as string | undefined) ||
      (criteria.required_premium_tier as string | undefined)

    if (minimumTierRaw) {
      const requiredTier = normalizeTier(minimumTierRaw)
      const requiredRank = PREMIUM_TIER_RANK[requiredTier] ?? PREMIUM_TIER_RANK.free
      const userRank = PREMIUM_TIER_RANK[userTier] ?? PREMIUM_TIER_RANK.free
      if (userRank < requiredRank) {
        return false
      }
    }

    const allowedRoles = criteria.allowed_roles as string[] | undefined
    if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
      if (!user?.role || !allowedRoles.includes(user.role)) {
        return false
      }
    }

    const excludedRoles = criteria.excluded_roles as string[] | undefined
    if (Array.isArray(excludedRoles) && excludedRoles.length > 0) {
      if (user?.role && excludedRoles.includes(user.role)) {
        return false
      }
    }

    const requireAdmin = criteria.require_admin === true
    if (requireAdmin && !user?.isAdmin) {
      return false
    }

    // Add more criteria checks as needed
    return true
  }

  /**
   * Gets a user-specific override for a feature flag.
   * @param {string} userId - The ID of the user.
   * @param {string} flagName - The name of the flag.
   * @returns {Promise<boolean | null>} The override value, or null if no override is set.
   * @private
   */
  private async getUserOverride(userId: string, flagName: string): Promise<boolean | null> {
    try {
      const result = await query<{ is_enabled: boolean | null }>(
        'SELECT is_enabled FROM user_feature_flags WHERE user_id = $1 AND flag_name = $2',
        [userId, flagName],
      )

      if (result.rows.length > 0) {
        return result.rows[0].is_enabled
      }
    } catch (error) {
      logger.error('❌ Error fetching user override', {
        userId,
        flagName,
        error,
      })
    }

    return null
  }

  /**
   * Retrieves all feature flags from the database, using a cache to avoid frequent lookups.
   * @returns {Promise<FeatureFlag[]>} A list of all feature flags.
   * @private
   */
  private async getAllFlags(): Promise<FeatureFlag[]> {
    const now = Date.now()

    if (now - this.lastCacheUpdate < this.cacheExpiry && this.flagCache.size > 0) {
      return Array.from(this.flagCache.values())
    }

    try {
      const result = await query<FeatureFlag>('SELECT * FROM feature_flags')
      const flags = result.rows

      this.flagCache.clear()
      for (const flag of flags) {
        this.flagCache.set(flag.flag_name, flag)
      }
      this.lastCacheUpdate = now

      return flags
    } catch (error) {
      logger.error('❌ Error fetching feature flags', { error })
      return []
    }
  }

  /**
   * Lists all raw feature flag records, using the cache.
   * @returns {Promise<FeatureFlag[]>} A list of all feature flags.
   */
  async listFlags(): Promise<FeatureFlag[]> {
    return this.getAllFlags()
  }

  /**
   * Gets a single feature flag from the cache.
   * @param {string} flagName - The name of the flag to get.
   * @returns {Promise<FeatureFlag | null>} The feature flag, or null if not found.
   * @private
   */
  private async getFlag(flagName: string): Promise<FeatureFlag | null> {
    const _flags = await this.getAllFlags()
    return this.flagCache.get(flagName) || null
  }

  /**
   * Updates a feature flag. This is an admin-only operation.
   * @param {string} flagName - The name of the flag to update.
   * @param {Partial<FeatureFlag>} updates - The updates to apply to the flag.
   * @param {string} changedBy - The ID of the user making the change.
   * @param {string} [reason] - The reason for the change.
   * @returns {Promise<FeatureFlag | null>} The updated feature flag, or null if the update failed.
   */
  async updateFlag(
    flagName: string,
    updates: Partial<FeatureFlag>,
    changedBy: string,
    reason?: string,
  ): Promise<FeatureFlag | null> {
    try {
      const updateFields = []
      const values = []
      let paramCount = 1

      if (updates.is_enabled !== undefined) {
        updateFields.push(`is_enabled = $${paramCount++}`)
        values.push(updates.is_enabled)
        updateFields.push(`rollout_percentage = $${paramCount++}`)
        values.push(updates.is_enabled ? 100 : 0)
      }
      if (updates.access_level !== undefined) {
        updateFields.push(`access_level = $${paramCount++}`)
        values.push(updates.access_level)
      }
      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramCount++}`)
        values.push(updates.description)
      }
      if (updates.category !== undefined) {
        updateFields.push(`category = $${paramCount++}`)
        values.push(updates.category)
      }
      if (updates.target_criteria !== undefined) {
        updateFields.push(`target_criteria = $${paramCount++}`)
        values.push(JSON.stringify(updates.target_criteria))
      }
      if (updates.dependencies !== undefined) {
        updateFields.push(`dependencies = $${paramCount++}`)
        values.push(JSON.stringify(updates.dependencies))
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`)
      values.push(flagName)

      const result = await query<FeatureFlag>(
        `UPDATE feature_flags SET ${updateFields.join(', ')} 
         WHERE flag_name = $${paramCount} RETURNING *`,
        values,
      )

      if (result.rows.length > 0) {
        // Clear cache to force refresh
        this.flagCache.clear()
        this.lastCacheUpdate = 0

        // Log the change
        if (reason) {
          await query(
            `UPDATE feature_flag_audit 
             SET reason = $1 
             WHERE flag_name = $2 AND changed_by = $3
             ORDER BY created_at DESC LIMIT 1`,
            [reason, flagName, changedBy],
          )
        }

        return result.rows[0]
      }
    } catch (error) {
      logger.error('❌ Error updating feature flag', {
        flagName,
        updates,
        changedBy,
        error,
      })
    }

    return null
  }

  /**
   * Sets a user-specific override for a feature flag.
   * @param {string} userId - The ID of the user.
   * @param {string} flagName - The name of the flag.
   * @param {boolean} enabled - The override value.
   * @returns {Promise<void>}
   */
  async setUserOverride(userId: string, flagName: string, enabled: boolean): Promise<void> {
    try {
      await query(
        `INSERT INTO user_feature_flags (user_id, flag_name, is_enabled) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (user_id, flag_name) 
         DO UPDATE SET is_enabled = $3, assigned_at = CURRENT_TIMESTAMP`,
        [userId, flagName, enabled],
      )
    } catch (error) {
      logger.error('❌ Error setting user override', {
        userId,
        flagName,
        enabled,
        error,
      })
    }
  }

  /**
   * Clears a user-specific override for a feature flag.
   * @param {string} userId - The ID of the user.
   * @param {string} flagName - The name of the flag.
   * @returns {Promise<void>}
   */
  async clearUserOverride(userId: string, flagName: string): Promise<void> {
    try {
      await query('DELETE FROM user_feature_flags WHERE user_id = $1 AND flag_name = $2', [
        userId,
        flagName,
      ])
    } catch (error) {
      logger.error('❌ Error clearing user override', {
        userId,
        flagName,
        error,
      })
    }
  }

  /**
   * Lists all user-specific overrides for a given user.
   * @param {string} userId - The ID of the user.
   * @returns {Promise<Map<string, boolean>>} A map of flag names to their override values.
   */
  async listUserOverrides(userId: string): Promise<Map<string, boolean>> {
    try {
      const result = await query<{ flag_name: string; is_enabled: boolean }>(
        'SELECT flag_name, is_enabled FROM user_feature_flags WHERE user_id = $1',
        [userId],
      )

      return new Map(result.rows.map((row) => [row.flag_name, row.is_enabled]))
    } catch (error) {
      logger.error('❌ Error fetching user overrides', {
        userId,
        error,
      })
      return new Map()
    }
  }

  /**
   * Gets the audit log for feature flag changes.
   * @param {string} [flagName] - The name of the flag to get the audit log for. If not provided, the log for all flags is returned.
   * @param {number} [limit=50] - The maximum number of log entries to return.
   * @returns {Promise<FeatureFlagAuditEntry[]>} A list of audit log entries.
   */
  async getAuditLog(flagName?: string, limit = 50): Promise<FeatureFlagAuditEntry[]> {
    try {
      let queryStr = `
        SELECT fa.*, u.username 
        FROM feature_flag_audit fa
        LEFT JOIN users u ON fa.changed_by = u.id
      `
      const values = []

      if (flagName) {
        queryStr += ' WHERE fa.flag_name = $1'
        values.push(flagName)
      }

      queryStr += ` ORDER BY fa.created_at DESC LIMIT $${values.length + 1}`
      values.push(limit)

      const result = await query<FeatureFlagAuditEntry>(queryStr, values)
      return result.rows
    } catch (error) {
      logger.error('❌ Error fetching feature flag audit log', {
        flagName,
        limit,
        error,
      })
      return []
    }
  }

  /**
   * Clears the feature flag cache.
   */
  clearCache(): void {
    this.flagCache.clear()
    this.lastCacheUpdate = 0
  }
}

export const featureFlagService = FeatureFlagService.getInstance()
