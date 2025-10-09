import { validate as uuidValidate } from 'uuid'
import { getClient, query } from '../config/database'
import { logger } from '../utils/logger'
import { featureFlagService } from './featureFlagService'

const domainPermissionMap: Record<string, string[]> = {
  users: ['users.*', 'user_management', 'system_admin'],
  admin: ['admin.*', 'system_admin'],
  content: ['content.*', 'content_moderation', 'system_admin'],
  games: ['games.*', 'game_management', 'system_admin'],
  system: ['system.*', 'system_admin'],
  logs: ['logs.*', 'system_admin'],
  reports: ['reports.*', 'reports', 'system_admin'],
  maps: ['maps.*', 'map_approval', 'content_moderation', 'system_admin'],
}

export interface AdminRole {
  id: string
  name: string
  description?: string
  permissions: string[]
  isSuperAdmin: boolean
  createdAt: Date
  updatedAt: Date
}

export interface AdminUser {
  userId: string
  roleId: string
  roleName: string
  permissions: string[]
  assignedBy: string
  assignedAt: Date
  expiresAt?: Date
  isActive: boolean
}

export interface UserAccountStatus {
  userId: string
  status: 'active' | 'suspended' | 'banned' | 'pending'
  reason?: string
  adminUserId?: string
  expiresAt?: Date
}

export interface AdminActivityLog {
  id: string
  adminUserId: string
  actionType: string
  actionDetails: Record<string, unknown>
  targetType?: string
  targetId?: string
  ipAddress?: string
  userAgent?: string
  timestamp: Date
}

export interface FeatureFlag {
  id: string
  flagName: string
  description?: string
  isEnabled: boolean
  config: Record<string, unknown>
  accessLevel: 'disabled' | 'internal' | 'beta' | 'public'
  category?: string | null
  dependencies: string[]
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface FeatureFlagSettingsUpdate {
  description?: string | null
  accessLevel?: FeatureFlag['accessLevel']
  config?: Record<string, unknown>
  category?: string | null
  dependencies?: string[]
}

export interface UserFeatureFlagAssignment {
  flagName: string
  description?: string | null
  isEnabled: boolean
  accessLevel: 'disabled' | 'internal' | 'beta' | 'public'
  category?: string | null
  config: Record<string, unknown>
  userOverride: boolean | null
  effectiveValue: boolean | null
  updatedAt: Date
}

export interface AdminUserSummary {
  id: string
  username: string | null
  email: string | null
  status: string | null
  statusReason: string | null
  adminRoles: string[]
  createdAt: Date | string | null
  lastLogin: Date | string | null
  isAdmin: boolean
  isVip: boolean
  vipReason?: string | null
  vipGrantedAt?: Date | string | null
  vipGrantedBy?: string | null
  vipGrantedByName?: string | null
  premiumTier: string
  premiumExpiresAt?: Date | string | null
  gamesPlayed: number
  elo: number
  emailVerified: boolean
  isBetaUser: boolean
  preferredLanguage?: string | null
  timezone?: string | null
}

export interface ContentApprovalQueueItem {
  id: string
  contentType: string
  contentId: string
  contentName: string | null
  submitterId: string
  submitterUsername: string
  status: string
  submittedAt: Date
}

type QueryParam = string | number | boolean | null | Date

type AdminUserQueryRow = {
  id: string
  username: string | null
  email: string | null
  status: string | null
  status_reason: string | null
  admin_roles: string | null
  createdAt: Date | string | null
  lastLogin: Date | string | null
  isAdmin: boolean | null
  isVip: boolean | null
  vipReason: string | null
  vipGrantedAt: Date | string | null
  vipGrantedBy: string | null
  vipGrantedByName: string | null
  premiumTier: string | null
  premiumExpiresAt: Date | string | null
  gamesPlayed: string | number | null
  elo: string | number | null
  isBetaUser: boolean | null
  emailVerified: boolean | null
  preferredLanguage: string | null
  timezone: string | null
}

// ContentApprovalRow type removed (unused)

export class AdminService {
  // ============= PERMISSION CHECKING =============

  async isAdmin(userId: string): Promise<boolean> {
    // First check the is_admin flag on the users table (faster)
    const userResult = await query(`SELECT is_admin FROM users WHERE id = $1`, [userId])

    if (userResult.rows[0]?.is_admin) {
      return true
    }

    // Fallback to checking user_admin_roles (for compatibility)
    const result = await query(
      `
      SELECT 1 FROM user_admin_roles uar
      JOIN admin_roles ar ON uar.role_id = ar.id
      WHERE uar.user_id = $1 
      AND (uar.is_active IS NULL OR uar.is_active = TRUE)
      AND (uar.expires_at IS NULL OR uar.expires_at > CURRENT_TIMESTAMP)
    `,
      [userId],
    )

    return result.rows.length > 0
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const result = await query(
      `
      SELECT ar.permissions, ar.is_super_admin FROM user_admin_roles uar
      JOIN admin_roles ar ON uar.role_id = ar.id
      WHERE uar.user_id = $1 
      AND (uar.is_active IS NULL OR uar.is_active = TRUE)
      AND (uar.expires_at IS NULL OR uar.expires_at > CURRENT_TIMESTAMP)
    `,
      [userId],
    )

    const domain = permission.includes('.') ? permission.split('.')[0] : ''

    for (const row of result.rows) {
      if (row.is_super_admin) return true

      // Handle PostgreSQL TEXT[] array - it comes back as an array already
      let permissions: string[] = []
      if (Array.isArray(row.permissions)) {
        permissions = row.permissions
      } else if (typeof row.permissions === 'string') {
        // Try to parse if it's JSON string
        try {
          permissions = JSON.parse(row.permissions)
        } catch {
          // If not JSON, treat as comma-separated or PostgreSQL array format
          if (row.permissions.startsWith('{') && row.permissions.endsWith('}')) {
            // PostgreSQL array format: {value1,value2}
            permissions = row.permissions
              .slice(1, -1)
              .split(',')
              .map((p: string) => p.trim())
          } else {
            permissions = row.permissions.split(',').map((p: string) => p.trim())
          }
        }
      }

      if (permissions.includes('*') || permissions.includes(permission)) {
        return true
      }

      // Check wildcard permissions (e.g., "users.*" covers "users.edit")
      for (const perm of permissions) {
        if (perm.endsWith('.*') && permission.startsWith(perm.slice(0, -1))) {
          return true
        }
        // Support category permissions like "user_management" that map to scoped domains
        if (domain && domainPermissionMap[domain]?.includes(perm)) {
          return true
        }
      }
    }

    return false
  }

  async getActiveAdminUserIds(): Promise<string[]> {
    const ids = new Set<string>()

    const explicitAdmins = await query<{ id: string }>('SELECT id FROM users WHERE is_admin = TRUE')
    explicitAdmins.rows.forEach((row) => {
      if (row.id) ids.add(row.id)
    })

    const roleAdmins = await query<{ user_id: string }>(
      `
      SELECT DISTINCT user_id FROM user_admin_roles
      WHERE (is_active IS NULL OR is_active = TRUE)
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `,
    )
    roleAdmins.rows.forEach((row) => {
      if (row.user_id) ids.add(row.user_id)
    })

    return Array.from(ids)
  }

  async getUserAdminInfo(userId: string): Promise<AdminUser[]> {
    const result = await query(
      `
      SELECT 
        uar.user_id, uar.role_id, ar.name as role_name, ar.permissions,
        uar.assigned_by, uar.assigned_at, uar.expires_at, uar.is_active
      FROM user_admin_roles uar
      JOIN admin_roles ar ON uar.role_id = ar.id
      WHERE uar.user_id = $1
    `,
      [userId],
    )

    return result.rows.map((row) => ({
      userId: row.user_id,
      roleId: row.role_id,
      roleName: row.role_name,
      permissions: Array.isArray(row.permissions) ? row.permissions : JSON.parse(row.permissions),
      assignedBy: row.assigned_by,
      assignedAt: new Date(row.assigned_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      isActive: row.is_active,
    }))
  }

  // ============= USER MANAGEMENT =============

  async getAllUsers(
    limit = 50,
    offset = 0,
    search?: string,
  ): Promise<{
    users: AdminUserSummary[]
    total: number
  }> {
    let whereClause = ''
    const params: QueryParam[] = []

    if (search) {
      whereClause = 'WHERE u.username ILIKE $1 OR u.email ILIKE $2'
      params.push(`%${search}%`, `%${search}%`)
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM users u ${whereClause}`, params)
    const total = countResult.rows[0].total

    params.push(limit, offset)
    const limitOffset = search ? '$3 OFFSET $4' : '$1 OFFSET $2'
    const result = await query(
      `
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.created_at as "createdAt", 
        u.last_login as "lastLogin",
        u.is_admin as "isAdmin",
        u.is_vip as "isVip", 
        u.vip_reason as "vipReason",
        u.vip_granted_at as "vipGrantedAt",
        u.vip_granted_by as "vipGrantedBy",
        ug.username as "vipGrantedByName",
        u.premium_tier as "premiumTier",
        u.premium_expires_at as "premiumExpiresAt",
        u.is_beta_user as "isBetaUser",
        u.email_verified as "emailVerified",
        u.preferred_language as "preferredLanguage",
        u.timezone as "timezone",
        COALESCE(ps.games_played, 0) as "gamesPlayed",
        COALESCE(u.skill_rating, 800) as "elo",
        COALESCE(uas.status, 'active') as status,
        uas.reason as status_reason,
        STRING_AGG(ar.name, ',') as admin_roles
      FROM users u
      LEFT JOIN player_stats ps ON u.id = ps.user_id
      LEFT JOIN user_account_status uas ON u.id = uas.user_id
      LEFT JOIN user_admin_roles uar ON u.id = uar.user_id AND uar.is_active = TRUE
      LEFT JOIN admin_roles ar ON uar.role_id = ar.id
      LEFT JOIN users ug ON u.vip_granted_by = ug.id
      ${whereClause}
      GROUP BY u.id, u.username, u.email, u.created_at, u.last_login, 
               u.is_admin, u.is_vip, u.vip_reason, u.vip_granted_at, u.vip_granted_by, ug.username,
               u.premium_tier, u.premium_expires_at,
               u.is_beta_user, u.email_verified, u.preferred_language, u.timezone,
               ps.games_played,
               u.skill_rating,
               uas.status, uas.reason
      ORDER BY u.created_at DESC
      LIMIT ${limitOffset}
    `,
      params,
    )

    const rows = result.rows as AdminUserQueryRow[]
    const users = rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      status: row.status,
      statusReason: row.status_reason,
      adminRoles: row.admin_roles ? row.admin_roles.split(',') : [],
      createdAt: row.createdAt,
      lastLogin: row.lastLogin,
      isAdmin: row.isAdmin || false,
      isVip: row.isVip || false,
      vipReason: row.vipReason,
      vipGrantedAt: row.vipGrantedAt,
      vipGrantedBy: row.vipGrantedBy,
      vipGrantedByName: row.vipGrantedByName,
      premiumTier: row.premiumTier || 'free',
      premiumExpiresAt: row.premiumExpiresAt,
      gamesPlayed: Number.parseInt(String(row.gamesPlayed ?? '0'), 10),
      elo: Number.parseInt(String(row.elo ?? '800'), 10),
      emailVerified: Boolean(row.emailVerified),
      isBetaUser: Boolean(row.isBetaUser),
      preferredLanguage: row.preferredLanguage,
      timezone: row.timezone,
    }))

    return { users, total }
  }

  async updateUserStatus(
    targetUserId: string,
    adminUserId: string,
    status: 'active' | 'suspended' | 'banned',
    reason?: string,
    expiresAt?: Date,
  ): Promise<void> {
    const client = await getClient()
    try {
      await client.query('BEGIN')

      // Update or insert user status
      await client.query(
        `
        INSERT INTO user_account_status (user_id, status, reason, admin_user_id, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO UPDATE SET
          status = EXCLUDED.status,
          reason = EXCLUDED.reason,
          admin_user_id = EXCLUDED.admin_user_id,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `,
        [targetUserId, status, reason, adminUserId, expiresAt?.toISOString()],
      )

      // Log admin action
      await this.logAdminAction(
        adminUserId,
        'user_status_change',
        {
          targetUserId,
          newStatus: status,
          reason,
          expiresAt: expiresAt?.toISOString(),
        },
        'user',
        targetUserId,
      )

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      if (client.release) client.release()
    }
  }

  async resetUserPassword(
    targetUserId: string,
    adminUserId: string,
    newPassword: string,
  ): Promise<void> {
    const bcrypt = require('bcrypt')
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, targetUserId])

    await this.logAdminAction(
      adminUserId,
      'password_reset',
      {
        targetUserId,
      },
      'user',
      targetUserId,
    )
  }

  async updateUserVipStatus(
    targetUserId: string,
    adminUserId: string,
    isVip: boolean,
    reason?: string,
  ): Promise<void> {
    // Use database-side functions to ensure vip_granted_by is set correctly
    if (isVip) {
      await query('SELECT grant_vip_status($1, $2, $3) as ok', [
        targetUserId,
        adminUserId,
        reason ?? null,
      ])
    } else {
      await query('SELECT revoke_vip_status($1) as ok', [targetUserId])
    }

    await this.logAdminAction(
      adminUserId,
      'vip_status_change',
      {
        targetUserId,
        isVip,
        reason,
      },
      'user',
      targetUserId,
    )
  }

  async updateUserAdminStatus(
    targetUserId: string,
    adminUserId: string,
    isAdmin: boolean,
  ): Promise<void> {
    if (isAdmin) {
      // Ensure super_admin role exists
      let roleId: string | undefined
      const roleRes = await query<{ id: string }>(
        `SELECT id FROM admin_roles WHERE name = 'super_admin' LIMIT 1`,
      )
      if (roleRes.rows[0]?.id) {
        roleId = roleRes.rows[0].id
      } else {
        const createRes = await query<{ id: string }>(
          `INSERT INTO admin_roles (name, description, permissions, is_super_admin)
           VALUES ('super_admin', 'Full system access', ARRAY['*'], true)
           RETURNING id`,
        )
        roleId = createRes.rows[0].id
      }

      if (!roleId) throw new Error('Failed to resolve super_admin role')
      await this.assignAdminRole(targetUserId, roleId, adminUserId)
    } else {
      // Remove super_admin role if present
      const roleRes = await query<{ id: string }>(
        `SELECT id FROM admin_roles WHERE name = 'super_admin' LIMIT 1`,
      )
      if (roleRes.rows[0]?.id) {
        await this.removeAdminRole(targetUserId, roleRes.rows[0].id, adminUserId)
      }
      // No direct toggle of users.is_admin; trigger will recompute from roles
    }

    await this.logAdminAction(
      adminUserId,
      'admin_status_change',
      {
        targetUserId,
        isAdmin,
      },
      'user',
      targetUserId,
    )
  }

  async updateUserPremiumTier(
    targetUserId: string,
    adminUserId: string,
    tier: string,
    expiresAt?: Date,
  ): Promise<void> {
    await query('UPDATE users SET premium_tier = $1, premium_expires_at = $2 WHERE id = $3', [
      tier,
      expiresAt?.toISOString() || null,
      targetUserId,
    ])

    await this.logAdminAction(
      adminUserId,
      'premium_tier_change',
      {
        targetUserId,
        tier,
        expiresAt: expiresAt?.toISOString(),
      },
      'user',
      targetUserId,
    )
  }

  async assignAdminRole(
    targetUserId: string,
    roleId: string,
    adminUserId: string,
    expiresAt?: Date,
  ): Promise<void> {
    await query(
      `
      INSERT INTO user_admin_roles (user_id, role_id, assigned_by, expires_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, role_id) DO UPDATE SET
        assigned_by = EXCLUDED.assigned_by,
        expires_at = EXCLUDED.expires_at,
        is_active = TRUE
    `,
      [targetUserId, roleId, adminUserId, expiresAt?.toISOString()],
    )

    await this.logAdminAction(
      adminUserId,
      'admin_role_assigned',
      {
        targetUserId,
        roleId,
        expiresAt: expiresAt?.toISOString(),
      },
      'user',
      targetUserId,
    )
  }

  async removeAdminRole(targetUserId: string, roleId: string, adminUserId: string): Promise<void> {
    await query(
      `
      UPDATE user_admin_roles 
      SET is_active = FALSE 
      WHERE user_id = $1 AND role_id = $2
    `,
      [targetUserId, roleId],
    )

    await this.logAdminAction(
      adminUserId,
      'admin_role_removed',
      {
        targetUserId,
        roleId,
      },
      'user',
      targetUserId,
    )
  }

  // ============= CONTENT MODERATION =============

  async getContentApprovalQueue(
    limit = 50,
    offset = 0,
  ): Promise<{
    items: ContentApprovalQueueItem[]
    total: number
  }> {
    // Content approval queue is repurposed for user reports only (maps use map_approval_requests)
    const countResult = await query(`
      SELECT COUNT(*) as total FROM user_reports WHERE status = 'pending'
    `)
    const total = countResult.rows[0].total

    const result = await query(
      `
      SELECT 
        ur.id,
        ur.reporter_id,
        u1.username as reporter_username,
        ur.reported_user_id,
        u2.username as reported_username,
        ur.status,
        ur.created_at
      FROM user_reports ur
      JOIN users u1 ON ur.reporter_id = u1.id
      JOIN users u2 ON ur.reported_user_id = u2.id
      WHERE ur.status = 'pending'
      ORDER BY ur.created_at ASC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    )

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        contentType: 'user_report',
        contentId: row.reported_user_id,
        contentName: row.reported_username,
        submitterId: row.reporter_id,
        submitterUsername: row.reporter_username,
        status: row.status,
        submittedAt: new Date(row.created_at),
      })),
      total,
    }
  }

  async approveContent(queueId: string, adminUserId: string, notes?: string): Promise<void> {
    const client = await getClient()
    try {
      await client.query('BEGIN')

      // queueId refers to user_reports.id; approve => resolve
      const reportRow = await client.query<{ reported_user_id: string; reporter_id: string }>(
        `SELECT reported_user_id, reporter_id FROM user_reports WHERE id = $1 FOR UPDATE`,
        [queueId],
      )
      if ((reportRow.rowCount ?? 0) === 0) throw new Error('User report not found')

      await client.query(
        `UPDATE user_reports 
         SET status = 'resolved', admin_id = $1, admin_notes = $2, resolved_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [adminUserId, notes ?? null, queueId],
      )

      await this.logAdminAction(
        adminUserId,
        'user_report_resolved',
        {
          reportId: queueId,
          reportedUserId: reportRow.rows[0].reported_user_id,
          reporterId: reportRow.rows[0].reporter_id,
          notes,
        },
        'user_report',
        queueId,
      )

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      if (client.release) client.release()
    }
  }

  async rejectContent(queueId: string, adminUserId: string, reason: string): Promise<void> {
    const client = await getClient()
    try {
      await client.query('BEGIN')

      // queueId refers to user_reports.id; reject => dismiss
      const reportRow = await client.query<{ reported_user_id: string; reporter_id: string }>(
        `SELECT reported_user_id, reporter_id FROM user_reports WHERE id = $1 FOR UPDATE`,
        [queueId],
      )
      if ((reportRow.rowCount ?? 0) === 0) throw new Error('User report not found')

      await client.query(
        `UPDATE user_reports 
         SET status = 'dismissed', admin_id = $1, admin_notes = $2, resolved_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [adminUserId, reason, queueId],
      )

      await this.logAdminAction(adminUserId, 'user_report_dismissed', {
        reportId: queueId,
        reportedUserId: reportRow.rows[0].reported_user_id,
        reporterId: reportRow.rows[0].reporter_id,
        reason,
      })

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      if (client.release) client.release()
    }
  }

  // ============= FEATURE FLAGS =============

  async getFeatureFlags(): Promise<FeatureFlag[]> {
    try {
      const flags = await featureFlagService.listFlags()

      return flags.map((flag) => {
        const targetCriteria =
          typeof flag.target_criteria === 'string'
            ? this.safeJsonParse(flag.target_criteria, {})
            : flag.target_criteria || {}

        return {
          id: flag.id,
          flagName: flag.flag_name,
          description: flag.description,
          isEnabled: flag.is_enabled,
          config: targetCriteria,
          accessLevel: (flag.access_level as FeatureFlag['accessLevel']) ?? 'disabled',
          category: flag.category,
          dependencies: Array.isArray(flag.dependencies)
            ? (flag.dependencies as string[])
            : this.safeJsonParse<string[]>(flag.dependencies as string | null | undefined, []),
          createdBy: flag.created_by ?? 'system',
          createdAt: new Date(flag.created_at),
          updatedAt: new Date(flag.updated_at),
        }
      })
    } catch (error) {
      logger.warn('Error fetching feature flags:', error)
      // Return empty array if table doesn't exist or error occurs
      return []
    }
  }

  private safeJsonParse<T>(json: string | null | undefined, defaultValue: T): T {
    if (!json) return defaultValue
    try {
      return JSON.parse(json)
    } catch {
      return defaultValue
    }
  }

  async toggleFeatureFlag(
    flagName: string,
    enabled: boolean,
    adminUserId: string,
  ): Promise<boolean> {
    const result = await query(
      `
      UPDATE feature_flags
      SET is_enabled = $1,
          rollout_percentage = CASE WHEN $1 THEN 100 ELSE 0 END,
          updated_at = CURRENT_TIMESTAMP
      WHERE flag_name = $2
      RETURNING id
    `,
      [enabled, flagName],
    )

    if (result.rowCount === 0) {
      return false
    }

    featureFlagService.clearCache()

    await this.logAdminAction(
      adminUserId,
      'feature_flag_toggle',
      {
        flagName,
        enabled,
      },
      'system',
      flagName,
    )

    return true
  }

  async updateFeatureFlagSettings(
    flagName: string,
    updates: FeatureFlagSettingsUpdate,
    adminUserId: string,
    reason?: string,
  ): Promise<FeatureFlag | null> {
    const mappedUpdates: Record<string, unknown> = {}

    if (updates.description !== undefined) {
      mappedUpdates.description = updates.description
    }
    if (updates.accessLevel !== undefined) {
      mappedUpdates.access_level = updates.accessLevel
    }
    if (updates.config !== undefined) {
      mappedUpdates.target_criteria = updates.config
    }
    if (updates.category !== undefined) {
      mappedUpdates.category = updates.category
    }
    if (updates.dependencies !== undefined) {
      mappedUpdates.dependencies = updates.dependencies
    }

    const updatedFlag = await featureFlagService.updateFlag(
      flagName,
      mappedUpdates,
      adminUserId,
      reason,
    )

    if (!updatedFlag) {
      return null
    }

    const normalizedFlag = await this.getFeatureFlags().then(
      (flags) => flags.find((flag) => flag.flagName === flagName) ?? null,
    )

    await this.logAdminAction(
      adminUserId,
      'feature_flag_update',
      {
        flagName,
        updates,
        reason,
      },
      'system',
      normalizedFlag?.id ?? flagName,
    )

    return normalizedFlag
  }

  async getUserFeatureFlagAssignments(userId: string): Promise<UserFeatureFlagAssignment[]> {
    const flags = await featureFlagService.listFlags()
    const overrides = await featureFlagService.listUserOverrides(userId)

    const userResult = await query(
      `SELECT id, username, is_admin, is_vip, premium_tier, is_beta_user
       FROM users WHERE id = $1`,
      [userId],
    )

    const userRow = userResult.rows[0] as
      | {
          id: string
          username?: string | null
          is_admin?: boolean | null
          is_vip?: boolean | null
          premium_tier?: string | null
          is_beta_user?: boolean | null
        }
      | undefined

    const userContext = userRow
      ? {
          id: userRow.id,
          role: undefined,
          isAdmin: Boolean(userRow.is_admin),
          isVip: Boolean(userRow.is_vip),
          isBetaUser: Boolean(userRow.is_beta_user),
          premiumTier: userRow.premium_tier ?? undefined,
          hasPremium: (userRow.premium_tier ?? 'free') !== 'free',
        }
      : undefined

    const assignments: UserFeatureFlagAssignment[] = []

    for (const flag of flags) {
      const targetCriteria =
        typeof flag.target_criteria === 'string'
          ? this.safeJsonParse(flag.target_criteria, {})
          : flag.target_criteria || {}

      let effectiveValue: boolean | null = null
      if (userContext) {
        try {
          effectiveValue = await featureFlagService.evaluateFlagByName(flag.flag_name, userContext)
        } catch (error) {
          logger.warn('Failed to evaluate feature flag for user', {
            userId,
            flagName: flag.flag_name,
            error,
          })
        }
      }

      assignments.push({
        flagName: flag.flag_name,
        description: flag.description,
        isEnabled: Boolean(flag.is_enabled),
        accessLevel: (flag.access_level as FeatureFlag['accessLevel']) ?? 'disabled',
        category: flag.category,
        config: targetCriteria,
        userOverride: overrides.get(flag.flag_name) ?? null,
        effectiveValue,
        updatedAt: new Date(flag.updated_at),
      })
    }

    return assignments.sort((a, b) => a.flagName.localeCompare(b.flagName))
  }

  async setUserFeatureFlagOverride(
    targetUserId: string,
    flagName: string,
    enabled: boolean,
    adminUserId: string,
  ): Promise<void> {
    await featureFlagService.setUserOverride(targetUserId, flagName, enabled)

    await this.logAdminAction(
      adminUserId,
      'feature_flag_user_override_set',
      {
        targetUserId,
        flagName,
        enabled,
      },
      'user',
      targetUserId,
    )
  }

  async clearUserFeatureFlagOverride(
    targetUserId: string,
    flagName: string,
    adminUserId: string,
  ): Promise<void> {
    await featureFlagService.clearUserOverride(targetUserId, flagName)

    await this.logAdminAction(
      adminUserId,
      'feature_flag_user_override_cleared',
      {
        targetUserId,
        flagName,
      },
      'user',
      targetUserId,
    )
  }

  // ============= LOGGING =============

  async logAdminAction(
    adminUserId: string,
    actionType: string,
    actionDetails: Record<string, unknown>,
    targetType?: string,
    targetId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const targetIdIsValidUuid = Boolean(targetId && uuidValidate(targetId))
    const normalizedTargetId = targetIdIsValidUuid ? targetId : null
    const actionPayload =
      targetId && !targetIdIsValidUuid
        ? { ...actionDetails, targetIdentifier: targetId }
        : actionDetails

    await query(
      `
      INSERT INTO admin_activity_logs 
      (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        adminUserId,
        actionType,
        JSON.stringify(actionPayload),
        targetType,
        normalizedTargetId,
        ipAddress,
        userAgent,
      ],
    )
  }

  async logUserActivity(
    userId: string,
    actionType: string,
    actionDetails?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await query(
      `
      INSERT INTO user_activity_logs 
      (user_id, action_type, action_details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [
        userId,
        actionType,
        actionDetails ? JSON.stringify(actionDetails) : null,
        ipAddress,
        userAgent,
      ],
    )
  }

  async getAdminActivityLogs(limit = 100, offset = 0): Promise<AdminActivityLog[]> {
    const result = await query(
      `
      SELECT 
        aal.*,
        u.username as admin_username,
        aal.created_at as log_timestamp
      FROM admin_activity_logs aal
      JOIN users u ON aal.admin_user_id = u.id
      ORDER BY aal.created_at DESC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    )

    return result.rows.map((row) => {
      const rawActionDetails = row.action_details ?? {}
      const actionDetails =
        typeof rawActionDetails === 'string'
          ? this.safeJsonParse<Record<string, unknown>>(rawActionDetails, {})
          : (rawActionDetails as Record<string, unknown>)

      return {
        id: row.id,
        adminUserId: row.admin_user_id,
        adminUsername: row.admin_username,
        actionType: row.action_type,
        actionDetails,
        targetType: row.target_type,
        targetId: row.target_id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        timestamp: new Date(row.log_timestamp ?? row.created_at),
      }
    })
  }
}

export const adminService = new AdminService()
