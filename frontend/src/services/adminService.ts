import { apiClient } from './api'

export interface AdminUser {
  userId: string
  adminRoles: Array<{
    roleId: string
    roleName: string
    permissions: string[]
    assignedBy: string
    assignedAt: string
    expiresAt?: string
    isActive: boolean
  }>
  isAdmin: boolean
}

export interface User {
  id: string
  username: string
  email: string
  status: 'active' | 'suspended' | 'banned' | 'pending'
  statusReason?: string
  adminRoles: string[]
  createdAt: string
  lastLogin?: string
  emailVerified?: boolean
  isBetaUser?: boolean
  preferredLanguage?: string | null
  timezone?: string | null
}

export interface ContentApprovalItem {
  id: string
  contentType: string
  contentId: string
  contentName?: string
  submitterId: string
  submitterUsername: string
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
}

export interface FeatureFlag {
  id: string
  flagName: string
  description?: string
  isEnabled: boolean
  config: Record<string, unknown>
  accessLevel: 'disabled' | 'internal' | 'beta' | 'public'
  category: string | null
  rolloutPercentage: number
  dependencies: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface FeatureFlagSettingsUpdate {
  description?: string | null
  accessLevel?: FeatureFlag['accessLevel']
  category?: string | null
  rolloutPercentage?: number
  config?: Record<string, unknown>
  dependencies?: string[]
  reason?: string
}

export interface UserFeatureFlagAssignment {
  flagName: string
  description?: string | null
  isEnabled: boolean
  accessLevel: FeatureFlag['accessLevel']
  category?: string | null
  rolloutPercentage: number
  config: Record<string, unknown>
  userOverride: boolean | null
  effectiveValue: boolean | null
  updatedAt: string
}

export interface AdminActivityLog {
  id: string
  adminUserId: string
  adminUsername: string
  actionType: string
  actionDetails: Record<string, unknown>
  targetType?: string
  targetId?: string
  ipAddress?: string
  userAgent?: string
  timestamp: string
}

export interface AdminGamePlayer {
  id: string
  username: string
  color: string
  status: 'waiting' | 'active' | 'eliminated' | 'disconnected'
  territoriesCount: number
  armiesCount: number
}

export interface AdminGame {
  id: string
  name: string
  mapName: string
  createdBy: string
  createdByUsername: string
  players: AdminGamePlayer[]
  status: 'waiting' | 'active' | 'paused' | 'completed' | 'abandoned'
  currentTurn?: string
  currentTurnUsername?: string
  phase: 'reinforcement' | 'attack' | 'fortify'
  turnCount: number
  createdAt: string
  updatedAt: string
  maxPlayers: number
  isPrivate: boolean
  lastActivity: string
}

export interface SystemStatus {
  timestamp: string
  database: {
    userCount: number
    mapCount: number
    activeGames: number
    pendingApprovals: number
  }
  featureFlags: Record<string, boolean>
}

class AdminService {
  private baseUrl = '/admin'

  // ============= ADMIN INFO =============

  async getAdminInfo(): Promise<AdminUser> {
    const response = await apiClient.get(`${this.baseUrl}/me`)
    return response.data
  }

  // ============= USER MANAGEMENT =============

  async getUsers(
    params: { limit?: number; offset?: number; search?: string } = {},
  ): Promise<{ users: User[]; total: number }> {
    const response = await apiClient.get(`${this.baseUrl}/users`, { params })
    return response.data
  }

  async updateUserStatus(
    userId: string,
    status: 'active' | 'suspended' | 'banned',
    reason?: string,
    expiresAt?: string,
  ): Promise<void> {
    await apiClient.put(`${this.baseUrl}/users/${userId}/status`, {
      status,
      reason,
      expiresAt,
    })
  }

  async resetUserPassword(userId: string, newPassword: string): Promise<void> {
    await apiClient.post(`${this.baseUrl}/users/${userId}/reset-password`, {
      newPassword,
    })
  }

  async assignAdminRole(userId: string, roleId: string, expiresAt?: string): Promise<void> {
    await apiClient.post(`${this.baseUrl}/users/${userId}/admin-roles`, {
      roleId,
      expiresAt,
    })
  }

  async removeAdminRole(userId: string, roleId: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/users/${userId}/admin-roles/${roleId}`)
  }

  // ============= CONTENT MODERATION =============

  async getContentApprovalQueue(
    params: { limit?: number; offset?: number } = {},
  ): Promise<{ items: ContentApprovalItem[]; total: number }> {
    const response = await apiClient.get(`${this.baseUrl}/content/approval-queue`, { params })
    return response.data
  }

  async approveContent(queueId: string, notes?: string): Promise<void> {
    await apiClient.post(`${this.baseUrl}/content/approval-queue/${queueId}/approve`, {
      notes,
    })
  }

  async rejectContent(queueId: string, reason: string): Promise<void> {
    await apiClient.post(`${this.baseUrl}/content/approval-queue/${queueId}/reject`, {
      reason,
    })
  }

  // ============= FEATURE FLAGS =============

  async getFeatureFlags(): Promise<FeatureFlag[]> {
    const response = await apiClient.get(`${this.baseUrl}/feature-flags`)
    return response.data
  }

  async toggleFeatureFlag(flagName: string, enabled: boolean): Promise<void> {
    await apiClient.put(`${this.baseUrl}/feature-flags/${flagName}`, {
      enabled,
    })
  }

  async updateFeatureFlagSettings(
    flagName: string,
    updates: FeatureFlagSettingsUpdate,
  ): Promise<FeatureFlag> {
    const response = await apiClient.patch(`${this.baseUrl}/feature-flags/${flagName}`, updates)
    return response.data.flag
  }

  async getUserFeatureFlags(userId: string): Promise<UserFeatureFlagAssignment[]> {
    const response = await apiClient.get(`${this.baseUrl}/users/${userId}/feature-flags`)
    return response.data
  }

  async setUserFeatureFlagOverride(
    userId: string,
    flagName: string,
    enabled: boolean,
  ): Promise<void> {
    await apiClient.put(`${this.baseUrl}/users/${userId}/feature-flags/${flagName}`, { enabled })
  }

  async clearUserFeatureFlagOverride(userId: string, flagName: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/users/${userId}/feature-flags/${flagName}`)
  }

  // ============= ACTIVITY LOGS =============

  async getAdminActivityLogs(
    params: { limit?: number; offset?: number } = {},
  ): Promise<AdminActivityLog[]> {
    const response = await apiClient.get(`${this.baseUrl}/logs/admin-activity`, { params })
    return response.data
  }

  // ============= GAME MANAGEMENT =============

  async getGames(
    params: { limit?: number; offset?: number; status?: string; search?: string } = {},
  ): Promise<{ games: AdminGame[]; total: number }> {
    const response = await apiClient.get(`${this.baseUrl}/games`, { params })
    return response.data
  }

  async forceEndGame(gameId: string, reason: string): Promise<void> {
    await apiClient.post(`${this.baseUrl}/games/${gameId}/force-end`, {
      reason,
    })
  }

  async pauseGame(gameId: string, reason?: string): Promise<void> {
    await apiClient.post(`${this.baseUrl}/games/${gameId}/pause`, {
      reason,
    })
  }

  async resumeGame(gameId: string, reason?: string): Promise<void> {
    await apiClient.post(`${this.baseUrl}/games/${gameId}/resume`, {
      reason,
    })
  }

  // ============= SYSTEM ACTIONS =============

  async refreshCache(): Promise<void> {
    await apiClient.post(`${this.baseUrl}/cache/refresh`)
  }

  // ============= SYSTEM STATUS =============

  async getSystemStatus(): Promise<SystemStatus> {
    const response = await apiClient.get(`${this.baseUrl}/system/status`)
    return response.data
  }

  // ============= UTILITY METHODS =============

  async checkAdminAccess(): Promise<boolean> {
    try {
      await this.getAdminInfo()
      return true
    } catch (_error) {
      return false
    }
  }

  formatUserStatus(status: string): { text: string; color: string } {
    switch (status) {
      case 'active':
        return { text: 'Active', color: 'text-green-400' }
      case 'suspended':
        return { text: 'Suspended', color: 'text-yellow-400' }
      case 'banned':
        return { text: 'Banned', color: 'text-red-400' }
      case 'pending':
        return { text: 'Pending', color: 'text-muted' }
      default:
        return { text: status, color: 'text-muted' }
    }
  }

  formatContentType(contentType: string): string {
    switch (contentType) {
      case 'map':
        return '🗺️ Map'
      case 'review':
        return '⭐ Review'
      case 'profile':
        return '👤 Profile'
      default:
        return contentType
    }
  }

  formatActionType(actionType: string): string {
    const actionMap: Record<string, string> = {
      user_status_change: 'User Status Changed',
      password_reset: 'Password Reset',
      admin_role_assigned: 'Admin Role Assigned',
      admin_role_removed: 'Admin Role Removed',
      content_approved: 'Content Approved',
      content_rejected: 'Content Rejected',
      feature_flag_toggle: 'Feature Flag Toggled',
      user_edit: 'User Edited',
      content_moderate: 'Content Moderated',
      game_manage: 'Game Managed',
      system_admin: 'System Administration',
    }

    return actionMap[actionType] || actionType
  }
}

export const adminService = new AdminService()
