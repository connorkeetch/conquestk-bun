import crypto from 'crypto'
import { query } from '../config/database'

export type AccessLevel = 'disabled' | 'internal' | 'beta' | 'public'
export type FeatureCategory = 'gameplay' | 'ui' | 'experimental' | 'premium' | 'vip'

interface FeatureFlag {
  id: string
  flag_name: string
  description: string
  is_enabled: boolean
  access_level: AccessLevel
  rollout_percentage: number
  target_criteria: Record<string, any>
  category: FeatureCategory
  dependencies: string[]
}

interface User {
  id: string
  role?: string
  is_admin?: boolean
  is_beta_user?: boolean
  is_vip?: boolean
  has_premium?: boolean
}

class FeatureFlagService {
  private static instance: FeatureFlagService
  private flagCache: Map<string, FeatureFlag> = new Map()
  private cacheExpiry: number = 60000 // 1 minute cache
  private lastCacheUpdate: number = 0

  private constructor() {}

  public static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService()
    }
    return FeatureFlagService.instance
  }

  /**
   * Evaluate all feature flags for a user
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
   * Evaluate a single feature flag for a user
   */
  async evaluateFlagByName(flagName: string, user?: User): Promise<boolean> {
    const flag = await this.getFlag(flagName)
    if (!flag) return false
    return this.evaluateFlag(flag, user)
  }

  /**
   * Core flag evaluation logic
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

    // Apply rollout percentage
    if (flag.rollout_percentage < 100) {
      return this.isInRolloutPercentage(
        user?.id || 'anonymous',
        flag.flag_name,
        flag.rollout_percentage,
      )
    }

    return true
  }

  /**
   * Check if user meets access level requirements
   */
  private checkAccessLevel(accessLevel: AccessLevel, user?: User): boolean {
    switch (accessLevel) {
      case 'disabled':
        return false
      case 'internal':
        return user?.is_admin === true || user?.role === 'tester'
      case 'beta':
        return user?.is_admin === true || user?.role === 'tester' || user?.is_beta_user === true
      case 'public':
        return true
      default:
        return false
    }
  }

  /**
   * Check if user matches target criteria
   */
  private matchesTargetCriteria(criteria: Record<string, any>, user?: User): boolean {
    if (!criteria || Object.keys(criteria).length === 0) {
      return true
    }

    // Check VIP requirement
    if (criteria.require_vip && !user?.is_vip) {
      return false
    }

    // Check premium requirement
    if (criteria.require_premium && !user?.has_premium) {
      return false
    }

    // Add more criteria checks as needed
    return true
  }

  /**
   * Consistent hash-based rollout percentage
   */
  private isInRolloutPercentage(userId: string, flagName: string, percentage: number): boolean {
    const hash = crypto.createHash('md5').update(`${userId}:${flagName}`).digest('hex')

    const hashValue = parseInt(hash.substring(0, 8), 16)
    const userPercentage = (hashValue / 0xffffffff) * 100

    return userPercentage < percentage
  }

  /**
   * Get user-specific flag override
   */
  private async getUserOverride(userId: string, flagName: string): Promise<boolean | null> {
    try {
      const result = await query(
        'SELECT is_enabled FROM user_feature_flags WHERE user_id = $1 AND flag_name = $2',
        [userId, flagName],
      )

      if (result.rows.length > 0) {
        return result.rows[0].is_enabled
      }
    } catch (error) {
      console.error('Error fetching user override:', error)
    }

    return null
  }

  /**
   * Get all feature flags (with caching)
   */
  private async getAllFlags(): Promise<FeatureFlag[]> {
    const now = Date.now()

    if (now - this.lastCacheUpdate < this.cacheExpiry && this.flagCache.size > 0) {
      return Array.from(this.flagCache.values())
    }

    try {
      const result = await query('SELECT * FROM feature_flags')
      const flags = result.rows as FeatureFlag[]

      this.flagCache.clear()
      flags.forEach((flag) => this.flagCache.set(flag.flag_name, flag))
      this.lastCacheUpdate = now

      return flags
    } catch (error) {
      console.error('Error fetching feature flags:', error)
      return []
    }
  }

  /**
   * Get a single feature flag
   */
  private async getFlag(flagName: string): Promise<FeatureFlag | null> {
    const flags = await this.getAllFlags()
    return this.flagCache.get(flagName) || null
  }

  /**
   * Update a feature flag (admin only)
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
      }
      if (updates.access_level !== undefined) {
        updateFields.push(`access_level = $${paramCount++}`)
        values.push(updates.access_level)
      }
      if (updates.rollout_percentage !== undefined) {
        updateFields.push(`rollout_percentage = $${paramCount++}`)
        values.push(updates.rollout_percentage)
      }
      if (updates.target_criteria !== undefined) {
        updateFields.push(`target_criteria = $${paramCount++}`)
        values.push(JSON.stringify(updates.target_criteria))
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`)
      values.push(flagName)

      const result = await query(
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
      console.error('Error updating feature flag:', error)
    }

    return null
  }

  /**
   * Set user-specific flag override
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
      console.error('Error setting user override:', error)
    }
  }

  /**
   * Get audit log for a flag
   */
  async getAuditLog(flagName?: string, limit = 50): Promise<any[]> {
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

      queryStr += ' ORDER BY fa.created_at DESC LIMIT $' + (values.length + 1)
      values.push(limit)

      const result = await query(queryStr, values)
      return result.rows
    } catch (error) {
      console.error('Error fetching audit log:', error)
      return []
    }
  }

  /**
   * Clear the flag cache (useful after updates)
   */
  clearCache(): void {
    this.flagCache.clear()
    this.lastCacheUpdate = 0
  }
}

export const featureFlagService = FeatureFlagService.getInstance()
