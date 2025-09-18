import { getClient, query } from '../config/database'
import { logger } from '../utils/logger'

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
  actionDetails: unknown
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
  config: unknown
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

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
    users: unknown[]
    total: number
  }> {
    let whereClause = ''
    const params: unknown[] = []

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
        u.premium_tier as "premiumTier",
        u.premium_expires_at as "premiumExpiresAt",
        COALESCE(ps.games_played, 0) as "gamesPlayed",
        COALESCE(u.skill_rating, 1000) as "elo",
        COALESCE(uas.status, 'active') as status,
        uas.reason as status_reason,
        STRING_AGG(ar.name, ',') as admin_roles
      FROM users u
      LEFT JOIN player_stats ps ON u.id = ps.user_id
      LEFT JOIN user_account_status uas ON u.id = uas.user_id
      LEFT JOIN user_admin_roles uar ON u.id = uar.user_id AND uar.is_active = TRUE
      LEFT JOIN admin_roles ar ON uar.role_id = ar.id
      ${whereClause}
      GROUP BY u.id, u.username, u.email, u.created_at, u.last_login, 
               u.is_admin, u.is_vip, u.vip_reason, u.vip_granted_at, 
               u.premium_tier, u.premium_expires_at,
               ps.games_played,
               u.skill_rating,
               uas.status, uas.reason
      ORDER BY u.created_at DESC
      LIMIT ${limitOffset}
    `,
      params,
    )

    const users = result.rows.map((row) => ({
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
      premiumTier: row.premiumTier || 'free',
      premiumExpiresAt: row.premiumExpiresAt,
      gamesPlayed: parseInt(row.gamesPlayed || '0', 10),
      elo: parseInt(row.elo || '1000', 10),
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
    const updateData = {
      is_vip: isVip,
      vip_reason: isVip ? reason : null,
      vip_granted_at: isVip ? new Date().toISOString() : null,
    }

    await query(
      'UPDATE users SET is_vip = $1, vip_reason = $2, vip_granted_at = $3 WHERE id = $4',
      [updateData.is_vip, updateData.vip_reason, updateData.vip_granted_at, targetUserId],
    )

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

  async updateUserAdminStatus(targetUserId: string, adminUserId: string, isAdmin: boolean): Promise<void> {
    await query('UPDATE users SET is_admin = $1 WHERE id = $2', [isAdmin, targetUserId])

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
    items: unknown[]
    total: number
  }> {
    const countResult = await query(`
      SELECT COUNT(*) as total FROM content_approval_queue 
      WHERE status = 'pending'
    `)
    const total = countResult.rows[0].total

    const result = await query(
      `
      SELECT 
        caq.*,
        u.username as submitter_username,
        CASE 
          WHEN caq.content_type = 'map' THEN m.name
          ELSE NULL
        END as content_name
      FROM content_approval_queue caq
      JOIN users u ON caq.submitter_id = u.id
      LEFT JOIN maps m ON caq.content_type = 'map' AND caq.content_id = m.id
      WHERE caq.status = 'pending'
      ORDER BY caq.submitted_at DESC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    )

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        contentType: row.content_type,
        contentId: row.content_id,
        contentName: row.content_name,
        submitterId: row.submitter_id,
        submitterUsername: row.submitter_username,
        status: row.status,
        submittedAt: new Date(row.submitted_at),
      })),
      total,
    }
  }

  async approveContent(queueId: string, adminUserId: string, notes?: string): Promise<void> {
    const client = await getClient()
    try {
      await client.query('BEGIN')

      // Update approval queue
      await client.query(
        `
        UPDATE content_approval_queue 
        SET status = 'approved', admin_user_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `,
        [adminUserId, notes, queueId],
      )

      // Get the content details
      const result = await client.query(
        `
        SELECT content_type, content_id FROM content_approval_queue WHERE id = $1
      `,
        [queueId],
      )

      if (result.rows.length > 0) {
        const { content_type, content_id } = result.rows[0]

        // Update content to be public/approved
        if (content_type === 'map') {
          await client.query(
            `UPDATE maps 
             SET is_public = TRUE, 
                 status = 'approved',
                 reviewed_at = CURRENT_TIMESTAMP,
                 reviewed_by = $1,
                 review_notes = $2
             WHERE id = $3`,
            [adminUserId, notes, content_id],
          )
        }

        await this.logAdminAction(
          adminUserId,
          'content_approved',
          {
            queueId,
            contentType: content_type,
            contentId: content_id,
            notes,
          },
          content_type,
          content_id,
        )
      }

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

      // Update approval queue
      await client.query(
        `
        UPDATE content_approval_queue 
        SET status = 'rejected', admin_user_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `,
        [adminUserId, reason, queueId],
      )

      // Get the content details
      const result = await client.query(
        `SELECT content_type, content_id FROM content_approval_queue WHERE id = $1`,
        [queueId],
      )

      if (result.rows.length > 0) {
        const { content_type, content_id } = result.rows[0]

        // Update map status to rejected
        if (content_type === 'map') {
          await client.query(
            `UPDATE maps 
             SET status = 'rejected',
                 reviewed_at = CURRENT_TIMESTAMP,
                 reviewed_by = $1,
                 rejection_reason = $2
             WHERE id = $3`,
            [adminUserId, reason, content_id],
          )
        }

        await this.logAdminAction(adminUserId, 'content_rejected', {
          queueId,
          contentType: content_type,
          contentId: content_id,
          reason,
        })
      }

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
      const result = await query(`
        SELECT * FROM feature_flags ORDER BY flag_name
      `)

      return result.rows.map((row) => ({
        id: row.id,
        flagName: row.flag_name,
        description: row.description,
        isEnabled: row.is_enabled,
        config: this.safeJsonParse(row.config, {}),
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }))
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

  async toggleFeatureFlag(flagName: string, enabled: boolean, adminUserId: string): Promise<void> {
    await query(
      `
      UPDATE feature_flags 
      SET is_enabled = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE flag_name = $2
    `,
      [enabled, flagName],
    )

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
  }

  // ============= LOGGING =============

  async logAdminAction(
    adminUserId: string,
    actionType: string,
    actionDetails: unknown,
    targetType?: string,
    targetId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await query(
      `
      INSERT INTO admin_activity_logs 
      (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        adminUserId,
        actionType,
        JSON.stringify(actionDetails),
        targetType,
        targetId,
        ipAddress,
        userAgent,
      ],
    )
  }

  async logUserActivity(
    userId: string,
    actionType: string,
    actionDetails?: unknown,
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
        u.username as admin_username
      FROM admin_activity_logs aal
      JOIN users u ON aal.admin_user_id = u.id
      ORDER BY aal.timestamp DESC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    )

    return result.rows.map((row) => ({
      id: row.id,
      adminUserId: row.admin_user_id,
      adminUsername: row.admin_username,
      actionType: row.action_type,
      actionDetails: JSON.parse(row.action_details || '{}'),
      targetType: row.target_type,
      targetId: row.target_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      timestamp: new Date(row.timestamp),
    }))
  }
}

export const adminService = new AdminService()
