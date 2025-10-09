export type AccessLevel = 'disabled' | 'internal' | 'beta' | 'public';
export type FeatureCategory = 'gameplay' | 'ui' | 'experimental' | 'premium' | 'vip';
interface FeatureFlag {
    id: string;
    flag_name: string;
    description: string;
    is_enabled: boolean;
    access_level: AccessLevel;
    rollout_percentage: number;
    target_criteria: Record<string, unknown>;
    category: FeatureCategory;
    dependencies: string[];
    created_by?: string | null;
    created_at: Date | string;
    updated_at: Date | string;
}
interface FeatureFlagAuditEntry {
    id: string;
    flag_name: string;
    changed_by: string | null;
    change_type?: string | null;
    previous_value?: Record<string, unknown> | null;
    new_value?: Record<string, unknown> | null;
    reason?: string | null;
    created_at: Date | string;
    username?: string | null;
}
interface User {
    id: string;
    role?: string;
    isAdmin?: boolean;
    isBetaUser?: boolean;
    isVip?: boolean;
    premiumTier?: 'free' | 'premium' | 'pro' | 'enterprise' | string;
    hasPremium?: boolean;
}
export declare class FeatureFlagService {
    private static instance;
    private flagCache;
    private cacheExpiry;
    private lastCacheUpdate;
    private constructor();
    static getInstance(): FeatureFlagService;
    evaluateForUser(user?: User): Promise<Record<string, boolean>>;
    evaluateFlagByName(flagName: string, user?: User): Promise<boolean>;
    private evaluateFlag;
    private checkAccessLevel;
    private matchesTargetCriteria;
    private getUserOverride;
    private getAllFlags;
    listFlags(): Promise<FeatureFlag[]>;
    private getFlag;
    updateFlag(flagName: string, updates: Partial<FeatureFlag>, changedBy: string, reason?: string): Promise<FeatureFlag | null>;
    setUserOverride(userId: string, flagName: string, enabled: boolean): Promise<void>;
    clearUserOverride(userId: string, flagName: string): Promise<void>;
    listUserOverrides(userId: string): Promise<Map<string, boolean>>;
    getAuditLog(flagName?: string, limit?: number): Promise<FeatureFlagAuditEntry[]>;
    clearCache(): void;
}
export declare const featureFlagService: FeatureFlagService;
export {};
//# sourceMappingURL=featureFlagService.d.ts.map