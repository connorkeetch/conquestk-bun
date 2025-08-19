import { query, getClient } from '../config/database';
import { logger } from '../utils/logger';

export interface AdminRole {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isSuperAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminUser {
  userId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  assignedBy: string;
  assignedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface UserAccountStatus {
  userId: string;
  status: 'active' | 'suspended' | 'banned' | 'pending';
  reason?: string;
  adminUserId?: string;
  expiresAt?: Date;
}

export interface AdminActivityLog {
  id: string;
  adminUserId: string;
  actionType: string;
  actionDetails: any;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface FeatureFlag {
  id: string;
  flagName: string;
  description?: string;
  isEnabled: boolean;
  config: any;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AdminService {
  
  // ============= PERMISSION CHECKING =============
  
  async isAdmin(userId: string): Promise<boolean> {
    const result = await query(`
      SELECT 1 FROM user_admin_roles uar
      JOIN admin_roles ar ON uar.role_id = ar.id
      WHERE uar.user_id = ? AND uar.is_active = TRUE
      AND (uar.expires_at IS NULL OR uar.expires_at > CURRENT_TIMESTAMP)
    `, [userId]);
    
    return result.rows.length > 0;
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const result = await query(`
      SELECT ar.permissions, ar.is_super_admin FROM user_admin_roles uar
      JOIN admin_roles ar ON uar.role_id = ar.id
      WHERE uar.user_id = ? AND uar.is_active = TRUE
      AND (uar.expires_at IS NULL OR uar.expires_at > CURRENT_TIMESTAMP)
    `, [userId]);

    for (const row of result.rows) {
      if (row.is_super_admin) return true;
      
      const permissions = JSON.parse(row.permissions);
      if (permissions.includes('*') || permissions.includes(permission)) {
        return true;
      }
      
      // Check wildcard permissions (e.g., "users.*" covers "users.edit")
      for (const perm of permissions) {
        if (perm.endsWith('.*') && permission.startsWith(perm.slice(0, -1))) {
          return true;
        }
      }
    }

    return false;
  }

  async getUserAdminInfo(userId: string): Promise<AdminUser[]> {
    const result = await query(`
      SELECT 
        uar.user_id, uar.role_id, ar.name as role_name, ar.permissions,
        uar.assigned_by, uar.assigned_at, uar.expires_at, uar.is_active
      FROM user_admin_roles uar
      JOIN admin_roles ar ON uar.role_id = ar.id
      WHERE uar.user_id = ?
    `, [userId]);

    return result.rows.map(row => ({
      userId: row.user_id,
      roleId: row.role_id,
      roleName: row.role_name,
      permissions: JSON.parse(row.permissions),
      assignedBy: row.assigned_by,
      assignedAt: new Date(row.assigned_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      isActive: row.is_active
    }));
  }

  // ============= USER MANAGEMENT =============

  async getAllUsers(limit = 50, offset = 0, search?: string): Promise<{
    users: any[];
    total: number;
  }> {
    let whereClause = '';
    const params: any[] = [];

    if (search) {
      whereClause = 'WHERE u.username LIKE ? OR u.email LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM users u ${whereClause}`, params);
    const total = countResult.rows[0].total;

    params.push(limit, offset);
    const result = await query(`
      SELECT 
        u.id, u.username, u.email, u.created_at, u.last_login,
        uas.status, uas.reason as status_reason,
        GROUP_CONCAT(ar.name) as admin_roles
      FROM users u
      LEFT JOIN user_account_status uas ON u.id = uas.user_id
      LEFT JOIN user_admin_roles uar ON u.id = uar.user_id AND uar.is_active = TRUE
      LEFT JOIN admin_roles ar ON uar.role_id = ar.id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, params);

    const users = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      email: row.email,
      status: row.status || 'active',
      statusReason: row.status_reason,
      adminRoles: row.admin_roles ? row.admin_roles.split(',') : [],
      createdAt: new Date(row.created_at),
      lastLogin: row.last_login ? new Date(row.last_login) : null
    }));

    return { users, total };
  }

  async updateUserStatus(
    targetUserId: string, 
    adminUserId: string, 
    status: 'active' | 'suspended' | 'banned',
    reason?: string,
    expiresAt?: Date
  ): Promise<void> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Update or insert user status
      await client.query(`
        INSERT INTO user_account_status (user_id, status, reason, admin_user_id, expires_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
          status = EXCLUDED.status,
          reason = EXCLUDED.reason,
          admin_user_id = EXCLUDED.admin_user_id,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `, [targetUserId, status, reason, adminUserId, expiresAt?.toISOString()]);

      // Log admin action
      await this.logAdminAction(adminUserId, 'user_status_change', {
        targetUserId,
        newStatus: status,
        reason,
        expiresAt: expiresAt?.toISOString()
      }, 'user', targetUserId);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      if (client.release) client.release();
    }
  }

  async resetUserPassword(targetUserId: string, adminUserId: string, newPassword: string): Promise<void> {
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, targetUserId]);

    await this.logAdminAction(adminUserId, 'password_reset', {
      targetUserId
    }, 'user', targetUserId);
  }

  async assignAdminRole(
    targetUserId: string, 
    roleId: string, 
    adminUserId: string,
    expiresAt?: Date
  ): Promise<void> {
    await query(`
      INSERT INTO user_admin_roles (user_id, role_id, assigned_by, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, role_id) DO UPDATE SET
        assigned_by = EXCLUDED.assigned_by,
        expires_at = EXCLUDED.expires_at,
        is_active = TRUE
    `, [targetUserId, roleId, adminUserId, expiresAt?.toISOString()]);

    await this.logAdminAction(adminUserId, 'admin_role_assigned', {
      targetUserId,
      roleId,
      expiresAt: expiresAt?.toISOString()
    }, 'user', targetUserId);
  }

  async removeAdminRole(targetUserId: string, roleId: string, adminUserId: string): Promise<void> {
    await query(`
      UPDATE user_admin_roles 
      SET is_active = FALSE 
      WHERE user_id = ? AND role_id = ?
    `, [targetUserId, roleId]);

    await this.logAdminAction(adminUserId, 'admin_role_removed', {
      targetUserId,
      roleId
    }, 'user', targetUserId);
  }

  // ============= CONTENT MODERATION =============

  async getContentApprovalQueue(limit = 50, offset = 0): Promise<{
    items: any[];
    total: number;
  }> {
    const countResult = await query(`
      SELECT COUNT(*) as total FROM content_approval_queue 
      WHERE status = 'pending'
    `);
    const total = countResult.rows[0].total;

    const result = await query(`
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
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    return {
      items: result.rows.map(row => ({
        id: row.id,
        contentType: row.content_type,
        contentId: row.content_id,
        contentName: row.content_name,
        submitterId: row.submitter_id,
        submitterUsername: row.submitter_username,
        status: row.status,
        submittedAt: new Date(row.submitted_at)
      })),
      total
    };
  }

  async approveContent(
    queueId: string, 
    adminUserId: string, 
    notes?: string
  ): Promise<void> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Update approval queue
      await client.query(`
        UPDATE content_approval_queue 
        SET status = 'approved', admin_user_id = ?, admin_notes = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [adminUserId, notes, queueId]);

      // Get the content details
      const result = await client.query(`
        SELECT content_type, content_id FROM content_approval_queue WHERE id = ?
      `, [queueId]);

      if (result.rows.length > 0) {
        const { content_type, content_id } = result.rows[0];

        // Update content to be public/approved
        if (content_type === 'map') {
          await client.query('UPDATE maps SET is_public = TRUE WHERE id = ?', [content_id]);
        }

        await this.logAdminAction(adminUserId, 'content_approved', {
          queueId,
          contentType: content_type,
          contentId: content_id,
          notes
        }, content_type, content_id);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      if (client.release) client.release();
    }
  }

  async rejectContent(
    queueId: string, 
    adminUserId: string, 
    reason: string
  ): Promise<void> {
    await query(`
      UPDATE content_approval_queue 
      SET status = 'rejected', admin_user_id = ?, admin_notes = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [adminUserId, reason, queueId]);

    await this.logAdminAction(adminUserId, 'content_rejected', {
      queueId,
      reason
    });
  }

  // ============= FEATURE FLAGS =============

  async getFeatureFlags(): Promise<FeatureFlag[]> {
    const result = await query(`
      SELECT * FROM feature_flags ORDER BY flag_name
    `);

    return result.rows.map(row => ({
      id: row.id,
      flagName: row.flag_name,
      description: row.description,
      isEnabled: row.is_enabled,
      config: JSON.parse(row.config || '{}'),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  async toggleFeatureFlag(flagName: string, enabled: boolean, adminUserId: string): Promise<void> {
    await query(`
      UPDATE feature_flags 
      SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE flag_name = ?
    `, [enabled, flagName]);

    await this.logAdminAction(adminUserId, 'feature_flag_toggle', {
      flagName,
      enabled
    }, 'system', flagName);
  }

  // ============= LOGGING =============

  async logAdminAction(
    adminUserId: string,
    actionType: string,
    actionDetails: any,
    targetType?: string,
    targetId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await query(`
      INSERT INTO admin_activity_logs 
      (admin_user_id, action_type, action_details, target_type, target_id, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      adminUserId,
      actionType,
      JSON.stringify(actionDetails),
      targetType,
      targetId,
      ipAddress,
      userAgent
    ]);
  }

  async logUserActivity(
    userId: string,
    actionType: string,
    actionDetails?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await query(`
      INSERT INTO user_activity_logs 
      (user_id, action_type, action_details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `, [
      userId,
      actionType,
      actionDetails ? JSON.stringify(actionDetails) : null,
      ipAddress,
      userAgent
    ]);
  }

  async getAdminActivityLogs(limit = 100, offset = 0): Promise<AdminActivityLog[]> {
    const result = await query(`
      SELECT 
        aal.*,
        u.username as admin_username
      FROM admin_activity_logs aal
      JOIN users u ON aal.admin_user_id = u.id
      ORDER BY aal.timestamp DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    return result.rows.map(row => ({
      id: row.id,
      adminUserId: row.admin_user_id,
      adminUsername: row.admin_username,
      actionType: row.action_type,
      actionDetails: JSON.parse(row.action_details || '{}'),
      targetType: row.target_type,
      targetId: row.target_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      timestamp: new Date(row.timestamp)
    }));
  }
}

export const adminService = new AdminService();