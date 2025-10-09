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
    actionDetails: Record<string, unknown>;
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
    config: Record<string, unknown>;
    accessLevel: 'disabled' | 'internal' | 'beta' | 'public';
    category?: string | null;
    dependencies: string[];
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface FeatureFlagSettingsUpdate {
    description?: string | null;
    accessLevel?: FeatureFlag['accessLevel'];
    config?: Record<string, unknown>;
    category?: string | null;
    dependencies?: string[];
}
export interface UserFeatureFlagAssignment {
    flagName: string;
    description?: string | null;
    isEnabled: boolean;
    accessLevel: 'disabled' | 'internal' | 'beta' | 'public';
    category?: string | null;
    config: Record<string, unknown>;
    userOverride: boolean | null;
    effectiveValue: boolean | null;
    updatedAt: Date;
}
export interface AdminUserSummary {
    id: string;
    username: string | null;
    email: string | null;
    status: string | null;
    statusReason: string | null;
    adminRoles: string[];
    createdAt: Date | string | null;
    lastLogin: Date | string | null;
    isAdmin: boolean;
    isVip: boolean;
    vipReason?: string | null;
    vipGrantedAt?: Date | string | null;
    vipGrantedBy?: string | null;
    vipGrantedByName?: string | null;
    premiumTier: string;
    premiumExpiresAt?: Date | string | null;
    gamesPlayed: number;
    elo: number;
    emailVerified: boolean;
    isBetaUser: boolean;
    preferredLanguage?: string | null;
    timezone?: string | null;
}
export interface ContentApprovalQueueItem {
    id: string;
    contentType: string;
    contentId: string;
    contentName: string | null;
    submitterId: string;
    submitterUsername: string;
    status: string;
    submittedAt: Date;
}
export declare class AdminService {
    isAdmin(userId: string): Promise<boolean>;
    hasPermission(userId: string, permission: string): Promise<boolean>;
    getActiveAdminUserIds(): Promise<string[]>;
    getUserAdminInfo(userId: string): Promise<AdminUser[]>;
    getAllUsers(limit?: number, offset?: number, search?: string): Promise<{
        users: AdminUserSummary[];
        total: number;
    }>;
    updateUserStatus(targetUserId: string, adminUserId: string, status: 'active' | 'suspended' | 'banned', reason?: string, expiresAt?: Date): Promise<void>;
    resetUserPassword(targetUserId: string, adminUserId: string, newPassword: string): Promise<void>;
    updateUserVipStatus(targetUserId: string, adminUserId: string, isVip: boolean, reason?: string): Promise<void>;
    updateUserAdminStatus(targetUserId: string, adminUserId: string, isAdmin: boolean): Promise<void>;
    updateUserPremiumTier(targetUserId: string, adminUserId: string, tier: string, expiresAt?: Date): Promise<void>;
    assignAdminRole(targetUserId: string, roleId: string, adminUserId: string, expiresAt?: Date): Promise<void>;
    removeAdminRole(targetUserId: string, roleId: string, adminUserId: string): Promise<void>;
    getContentApprovalQueue(limit?: number, offset?: number): Promise<{
        items: ContentApprovalQueueItem[];
        total: number;
    }>;
    approveContent(queueId: string, adminUserId: string, notes?: string): Promise<void>;
    rejectContent(queueId: string, adminUserId: string, reason: string): Promise<void>;
    getFeatureFlags(): Promise<FeatureFlag[]>;
    private safeJsonParse;
    toggleFeatureFlag(flagName: string, enabled: boolean, adminUserId: string): Promise<boolean>;
    updateFeatureFlagSettings(flagName: string, updates: FeatureFlagSettingsUpdate, adminUserId: string, reason?: string): Promise<FeatureFlag | null>;
    getUserFeatureFlagAssignments(userId: string): Promise<UserFeatureFlagAssignment[]>;
    setUserFeatureFlagOverride(targetUserId: string, flagName: string, enabled: boolean, adminUserId: string): Promise<void>;
    clearUserFeatureFlagOverride(targetUserId: string, flagName: string, adminUserId: string): Promise<void>;
    logAdminAction(adminUserId: string, actionType: string, actionDetails: Record<string, unknown>, targetType?: string, targetId?: string, ipAddress?: string, userAgent?: string): Promise<void>;
    logUserActivity(userId: string, actionType: string, actionDetails?: Record<string, unknown>, ipAddress?: string, userAgent?: string): Promise<void>;
    getAdminActivityLogs(limit?: number, offset?: number): Promise<AdminActivityLog[]>;
}
export declare const adminService: AdminService;
//# sourceMappingURL=adminService.d.ts.map