import type { ThemeId } from '@risk-game/shared/types/themes';
export interface UserProfile {
    userId: string;
    avatarUrl?: string;
    bio?: string;
    joinDate: Date;
    lastActive: Date;
    preferences: Record<string, unknown>;
    level: number;
    experiencePoints: number;
    totalPlaytime: number;
    currentStreak: number;
    longestStreak: number;
    favoriteMapId?: string;
}
export interface Achievement {
    id: string;
    name: string;
    description: string;
    iconUrl?: string;
    iconEmoji: string;
    category: string;
    points: number;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    requirements: Record<string, unknown>;
    isHidden: boolean;
    createdAt: Date;
}
export interface UserAchievement {
    userId: string;
    achievementId: string;
    unlockedAt: Date;
    progress: Record<string, unknown>;
    achievement?: Achievement;
}
export interface UserStatistics {
    userId: string;
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    gamesAbandoned: number;
    territoriesConquered: number;
    battlesWon: number;
    battlesLost: number;
    continentsControlled: number;
    averageGameLength: number;
    longestGame: number;
    shortestGame: number;
    bestTurnTime: number;
    mapsCreated: number;
    mapsRated: number;
    tournamentsJoined: number;
    tournamentsWon: number;
    updatedAt: Date;
    best_territories?: number;
    best_armies?: number;
    card_trades?: number;
    cards_traded?: number;
}
export interface GameHistoryEntry {
    gameId: string;
    gameName: string | null;
    gameMode: string | null;
    status: string;
    result: 'won' | 'lost';
    durationMinutes: number | null;
    startedAt: Date | null;
    endedAt: Date | null;
}
export interface UserPreferences {
    userId: string;
    theme: ThemeId;
    language: string;
    timezone: string;
    notificationsEnabled: boolean;
    emailNotifications: boolean;
    soundEffects: boolean;
    backgroundMusic: boolean;
    autoSaveFrequency: number;
    animationSpeed: 'slow' | 'normal' | 'fast';
    showTerritoryNames: boolean;
    showArmyCounts: boolean;
    confirmActions: boolean;
    privacyLevel: 'public' | 'friends' | 'private';
    allowFriendRequests: boolean;
    showOnlineStatus: boolean;
    updatedAt: Date;
}
export interface ProfileUpdateRequest {
    avatarUrl?: string;
    bio?: string;
    preferences?: Partial<UserPreferences>;
}
export interface ProfileResponse {
    profile: UserProfile;
    statistics: UserStatistics;
    achievements: UserAchievement[];
    recentGames: GameHistoryEntry[];
    preferences: UserPreferences;
}
export interface AchievementProgress {
    achievementId: string;
    progress: number;
    target: number;
    current: number;
    isUnlocked: boolean;
}
export interface UserRanking {
    userId: string;
    username: string;
    avatarUrl?: string;
    rank: number;
    rating: number;
    gamesWon: number;
    gamesPlayed: number;
    winRate: number;
    level: number;
}
export interface AggregatedStatsSummary {
    gamesPlayed: number;
    gamesWon: number;
    averageGameLength?: number;
    bestTerritories?: number;
}
export interface StatsBreakdown {
    overall: UserStatistics;
    byMap: Record<string, AggregatedStatsSummary>;
    byGameMode: Record<string, AggregatedStatsSummary>;
    timeline: {
        date: string;
        gamesPlayed: number;
        gamesWon: number;
        playtime: number;
    }[];
}
export declare const ACHIEVEMENT_CATEGORIES: {
    readonly gameplay: {
        readonly name: "Gameplay";
        readonly icon: "🎮";
        readonly color: "blue";
    };
    readonly competitive: {
        readonly name: "Competitive";
        readonly icon: "🏆";
        readonly color: "yellow";
    };
    readonly creative: {
        readonly name: "Creative";
        readonly icon: "🎨";
        readonly color: "purple";
    };
    readonly social: {
        readonly name: "Social";
        readonly icon: "👥";
        readonly color: "green";
    };
    readonly exploration: {
        readonly name: "Exploration";
        readonly icon: "🗺️";
        readonly color: "orange";
    };
    readonly dedication: {
        readonly name: "Dedication";
        readonly icon: "⏰";
        readonly color: "red";
    };
};
export declare const ACHIEVEMENT_RARITIES: {
    readonly common: {
        readonly name: "Common";
        readonly color: "#gray-400";
        readonly glow: false;
    };
    readonly rare: {
        readonly name: "Rare";
        readonly color: "#blue-400";
        readonly glow: true;
    };
    readonly epic: {
        readonly name: "Epic";
        readonly color: "#purple-400";
        readonly glow: true;
    };
    readonly legendary: {
        readonly name: "Legendary";
        readonly color: "#yellow-400";
        readonly glow: true;
    };
};
//# sourceMappingURL=profile.d.ts.map