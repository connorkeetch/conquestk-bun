// User Profile and Achievement System Types

export interface UserProfile {
  userId: string;
  avatarUrl?: string;
  bio?: string;
  joinDate: Date;
  lastActive: Date;
  preferences: Record<string, any>;
  level: number;
  experiencePoints: number;
  totalPlaytime: number; // in minutes
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
  requirements: Record<string, any>;
  isHidden: boolean;
  createdAt: Date;
}

export interface UserAchievement {
  userId: string;
  achievementId: string;
  unlockedAt: Date;
  progress: Record<string, any>;
  achievement?: Achievement; // populated in joins
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
  averageGameLength: number; // in minutes
  longestGame: number; // in minutes
  shortestGame: number; // in minutes
  bestTurnTime: number; // in seconds
  mapsCreated: number;
  mapsRated: number;
  tournamentsJoined: number;
  tournamentsWon: number;
  updatedAt: Date;
}

export interface GameHistoryEntry {
  id: string;
  userId: string;
  gameId?: string;
  mapId?: string;
  mapName: string;
  playerCount: number;
  position: number; // final ranking
  result: 'won' | 'lost' | 'abandoned';
  duration: number; // in minutes
  territoriesHeld: number;
  maxTerritories: number;
  turnsTaken: number;
  battlesInitiated: number;
  battlesWon: number;
  continentsHeld: string[]; // array of continent names
  gameMode: string;
  startedAt: Date;
  endedAt: Date;
  createdAt: Date;
}

export interface UserPreferences {
  userId: string;
  theme: 'dark' | 'light';
  language: string;
  timezone: string;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  soundEffects: boolean;
  backgroundMusic: boolean;
  autoSaveFrequency: number; // seconds
  animationSpeed: 'slow' | 'normal' | 'fast';
  showTerritoryNames: boolean;
  showArmyCounts: boolean;
  confirmActions: boolean;
  privacyLevel: 'public' | 'friends' | 'private';
  allowFriendRequests: boolean;
  showOnlineStatus: boolean;
  updatedAt: Date;
}

// API Request/Response Types
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
  progress: number; // 0-100 percentage
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
  winRate: number;
  level: number;
}

export interface StatsBreakdown {
  overall: UserStatistics;
  byMap: Record<string, Partial<UserStatistics>>;
  byGameMode: Record<string, Partial<UserStatistics>>;
  timeline: {
    date: string;
    gamesPlayed: number;
    gamesWon: number;
    playtime: number;
  }[];
}

// Achievement Categories for UI organization
export const ACHIEVEMENT_CATEGORIES = {
  gameplay: { name: 'Gameplay', icon: '🎮', color: 'blue' },
  competitive: { name: 'Competitive', icon: '🏆', color: 'yellow' },
  creative: { name: 'Creative', icon: '🎨', color: 'purple' },
  social: { name: 'Social', icon: '👥', color: 'green' },
  exploration: { name: 'Exploration', icon: '🗺️', color: 'orange' },
  dedication: { name: 'Dedication', icon: '⏰', color: 'red' }
} as const;

// Rarity information for achievements
export const ACHIEVEMENT_RARITIES = {
  common: { name: 'Common', color: '#gray-400', glow: false },
  rare: { name: 'Rare', color: '#blue-400', glow: true },
  epic: { name: 'Epic', color: '#purple-400', glow: true },
  legendary: { name: 'Legendary', color: '#yellow-400', glow: true }
} as const;