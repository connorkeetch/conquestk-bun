import React, { useState, useEffect } from 'react';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  level: number;
  experiencePoints: number;
  joinDate: string;
  lastActive: string;
  preferences: {
    theme: string;
    notifications: boolean;
    publicProfile: boolean;
  };
}

interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  winRate: number;
  averageGameDuration: number;
  favoriteMap: string;
  totalPlayTime: number;
  ranking: number;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  points: number;
  unlockedAt?: string;
  progress?: number;
  maxProgress?: number;
}

interface RecentGame {
  id: string;
  mapName: string;
  gameMode: string;
  result: 'won' | 'lost' | 'draw';
  duration: number;
  playedAt: string;
  playerCount: number;
}

const ProfileOverview: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Mock data for now - will be replaced with API calls
    const mockProfile: UserProfile = {
      id: '1',
      username: 'RiskCommander',
      email: 'user@example.com',
      avatarUrl: '/avatars/default.png',
      bio: 'Veteran Risk player with a passion for strategic warfare. Always looking for challenging opponents!',
      level: 15,
      experiencePoints: 12450,
      joinDate: '2024-01-15',
      lastActive: new Date().toISOString(),
      preferences: {
        theme: 'dark',
        notifications: true,
        publicProfile: true
      }
    };

    const mockStats: UserStats = {
      gamesPlayed: 147,
      gamesWon: 89,
      gamesLost: 58,
      winRate: 60.5,
      averageGameDuration: 45,
      favoriteMap: 'Classic World',
      totalPlayTime: 6825,
      ranking: 342
    };

    const mockAchievements: Achievement[] = [
      {
        id: '1',
        name: 'First Victory',
        description: 'Win your first game',
        iconUrl: '🏆',
        points: 100,
        unlockedAt: '2024-01-20'
      },
      {
        id: '2',
        name: 'World Conqueror',
        description: 'Control all territories on the world map',
        iconUrl: '🌍',
        points: 500,
        unlockedAt: '2024-02-15'
      },
      {
        id: '3',
        name: 'Speed Demon',
        description: 'Win a game in under 30 minutes',
        iconUrl: '⚡',
        points: 200,
        unlockedAt: '2024-03-10'
      },
      {
        id: '4',
        name: 'Marathon Master',
        description: 'Play for 100 hours total',
        iconUrl: '⏰',
        points: 300,
        progress: 68,
        maxProgress: 100
      },
      {
        id: '5',
        name: 'Map Creator',
        description: 'Create and publish 5 custom maps',
        iconUrl: '🗺️',
        points: 400,
        progress: 2,
        maxProgress: 5
      }
    ];

    const mockRecentGames: RecentGame[] = [
      {
        id: '1',
        mapName: 'Classic World',
        gameMode: 'Classic',
        result: 'won',
        duration: 52,
        playedAt: '2024-08-17T20:30:00Z',
        playerCount: 4
      },
      {
        id: '2',
        mapName: 'Europe',
        gameMode: 'Capital Conquest',
        result: 'lost',
        duration: 38,
        playedAt: '2024-08-16T19:15:00Z',
        playerCount: 6
      },
      {
        id: '3',
        mapName: 'Custom Islands',
        gameMode: 'Naval Supremacy',
        result: 'won',
        duration: 41,
        playedAt: '2024-08-15T21:45:00Z',
        playerCount: 3
      }
    ];

    // Simulate API loading
    setTimeout(() => {
      setProfile(mockProfile);
      setStats(mockStats);
      setAchievements(mockAchievements);
      setRecentGames(mockRecentGames);
      setLoading(false);
    }, 1000);
  }, []);

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatPlayTime = (hours: number): string => {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return days > 0 ? `${days}d ${remainingHours}h` : `${remainingHours}h`;
  };

  const getExperienceToNextLevel = (currentXP: number, level: number): number => {
    const nextLevelXP = level * 1000; // Simple formula: level * 1000
    return Math.max(0, nextLevelXP - currentXP);
  };

  const getExperienceProgress = (currentXP: number, level: number): number => {
    const currentLevelXP = (level - 1) * 1000;
    const nextLevelXP = level * 1000;
    const progress = ((currentXP - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
    return Math.min(100, Math.max(0, progress));
  };

  if (loading) {
    return (
      <div className="profile-overview loading">
        <div className="loading-spinner">🎲 Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="profile-overview error">
        <div className="error-message">❌ {error}</div>
      </div>
    );
  }

  if (!profile || !stats) {
    return (
      <div className="profile-overview error">
        <div className="error-message">❌ Profile not found</div>
      </div>
    );
  }

  return (
    <div className="profile-overview">
      {/* Profile Header */}
      <div className="profile-header">
        <div className="avatar-section">
          <div className="avatar">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.username} />
            ) : (
              <div className="avatar-placeholder">👤</div>
            )}
          </div>
          <button className="edit-avatar-btn">📷 Change</button>
        </div>
        
        <div className="profile-info">
          <h1 className="username">{profile.username}</h1>
          <div className="level-info">
            <span className="level">Level {profile.level}</span>
            <div className="xp-bar">
              <div 
                className="xp-progress" 
                style={{ width: `${getExperienceProgress(profile.experiencePoints, profile.level)}%` }}
              ></div>
            </div>
            <span className="xp-text">
              {profile.experiencePoints} XP ({getExperienceToNextLevel(profile.experiencePoints, profile.level)} to next level)
            </span>
          </div>
          <p className="bio">{profile.bio}</p>
          <div className="profile-meta">
            <span className="join-date">⏰ Joined {new Date(profile.joinDate).toLocaleDateString()}</span>
            <span className="ranking">🏆 Rank #{stats.ranking}</span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="quick-stats">
        <div className="stat-card">
          <div className="stat-icon">🎮</div>
          <div className="stat-value">{stats.gamesPlayed}</div>
          <div className="stat-label">Games Played</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏆</div>
          <div className="stat-value">{stats.winRate}%</div>
          <div className="stat-label">Win Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-value">{formatPlayTime(stats.totalPlayTime)}</div>
          <div className="stat-label">Play Time</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🗺️</div>
          <div className="stat-value">{stats.favoriteMap}</div>
          <div className="stat-label">Favorite Map</div>
        </div>
      </div>

      {/* Recent Achievements */}
      <div className="recent-achievements">
        <h2>🏅 Recent Achievements</h2>
        <div className="achievements-grid">
          {achievements.slice(0, 6).map(achievement => (
            <div key={achievement.id} className={`achievement-card ${achievement.unlockedAt ? 'unlocked' : 'locked'}`}>
              <div className="achievement-icon">{achievement.iconUrl}</div>
              <div className="achievement-info">
                <h3 className="achievement-name">{achievement.name}</h3>
                <p className="achievement-description">{achievement.description}</p>
                {achievement.unlockedAt ? (
                  <div className="achievement-unlocked">
                    ✅ Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
                  </div>
                ) : achievement.progress !== undefined ? (
                  <div className="achievement-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${(achievement.progress! / achievement.maxProgress!) * 100}%` }}
                      ></div>
                    </div>
                    <span className="progress-text">{achievement.progress}/{achievement.maxProgress}</span>
                  </div>
                ) : (
                  <div className="achievement-locked">🔒 Locked</div>
                )}
                <div className="achievement-points">+{achievement.points} XP</div>
              </div>
            </div>
          ))}
        </div>
        <button className="view-all-achievements">View All Achievements</button>
      </div>

      {/* Recent Games */}
      <div className="recent-games">
        <h2>📊 Recent Games</h2>
        <div className="games-list">
          {recentGames.map(game => (
            <div key={game.id} className={`game-card ${game.result}`}>
              <div className="game-result">
                {game.result === 'won' ? '🏆' : game.result === 'lost' ? '❌' : '🤝'}
              </div>
              <div className="game-info">
                <h3 className="game-map">{game.mapName}</h3>
                <div className="game-details">
                  <span className="game-mode">{game.gameMode}</span>
                  <span className="game-players">{game.playerCount} players</span>
                  <span className="game-duration">{formatDuration(game.duration)}</span>
                </div>
              </div>
              <div className="game-date">
                {new Date(game.playedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
        <button className="view-game-history">View Full Game History</button>
      </div>
    </div>
  );
};

export default ProfileOverview;