import type { Achievement, GameHistoryEntry, ProfileResponse, ProfileUpdateRequest, StatsBreakdown, UserAchievement, UserPreferences, UserProfile, UserRanking } from '../types/profile.js';
export declare class ProfileService {
    getUserProfile(userId: string): Promise<ProfileResponse>;
    updateProfile(userId: string, updates: ProfileUpdateRequest): Promise<UserProfile>;
    getUserStats(userId: string): Promise<StatsBreakdown>;
    getAchievements(userId: string): Promise<{
        unlocked: UserAchievement[];
        available: Achievement[];
    }>;
    unlockAchievement(userId: string, achievementId: string): Promise<UserAchievement>;
    getGameHistory(userId: string, limit?: number, offset?: number): Promise<GameHistoryEntry[]>;
    updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences>;
    getLeaderboard(limit?: number): Promise<UserRanking[]>;
    private createDefaultProfile;
    private createDefaultStats;
    private createDefaultPreferences;
    private camelToSnake;
}
export declare const profileService: ProfileService;
//# sourceMappingURL=profileService.d.ts.map