import React, { useState, useEffect } from 'react';

interface StatsPeriod {
  period: 'week' | 'month' | 'year' | 'all';
  label: string;
}

interface DetailedStats {
  general: {
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    winRate: number;
    averageGameDuration: number;
    totalPlayTime: number;
    ranking: number;
    rankingChange: number;
    longestWinStreak: number;
    currentWinStreak: number;
  };
  performance: {
    territoriesConquered: number;
    territoriesLost: number;
    armiesDeployed: number;
    battlesWon: number;
    battlesLost: number;
    averageArmiesPerGame: number;
    quickestVictory: number;
    comebackWins: number;
  };
  maps: {
    favoriteMap: string;
    mapStats: Array<{
      mapName: string;
      gamesPlayed: number;
      winRate: number;
    }>;
  };
  gameModes: {
    classicWins: number;
    capitalConquestWins: number;
    navalSupremacyWins: number;
    resourceWarWins: number;
    asymmetricWins: number;
  };
  monthly: {
    labels: string[];
    gamesPlayed: number[];
    winRate: number[];
  };
}

const UserStats: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year' | 'all'>('month');
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);

  const periods: StatsPeriod[] = [
    { period: 'week', label: 'This Week' },
    { period: 'month', label: 'This Month' },
    { period: 'year', label: 'This Year' },
    { period: 'all', label: 'All Time' }
  ];

  useEffect(() => {
    // Mock data for now - will be replaced with API calls
    const mockStats: DetailedStats = {
      general: {
        gamesPlayed: 147,
        gamesWon: 89,
        gamesLost: 58,
        winRate: 60.5,
        averageGameDuration: 45,
        totalPlayTime: 6825,
        ranking: 342,
        rankingChange: +15,
        longestWinStreak: 12,
        currentWinStreak: 3
      },
      performance: {
        territoriesConquered: 2834,
        territoriesLost: 1967,
        armiesDeployed: 15678,
        battlesWon: 1834,
        battlesLost: 1203,
        averageArmiesPerGame: 106.7,
        quickestVictory: 18,
        comebackWins: 23
      },
      maps: {
        favoriteMap: 'Classic World',
        mapStats: [
          { mapName: 'Classic World', gamesPlayed: 45, winRate: 67 },
          { mapName: 'Europe', gamesPlayed: 32, winRate: 59 },
          { mapName: 'Asia', gamesPlayed: 28, winRate: 54 },
          { mapName: 'Custom Islands', gamesPlayed: 23, winRate: 61 },
          { mapName: 'North America', gamesPlayed: 19, winRate: 58 }
        ]
      },
      gameModes: {
        classicWins: 52,
        capitalConquestWins: 18,
        navalSupremacyWins: 12,
        resourceWarWins: 5,
        asymmetricWins: 2
      },
      monthly: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
        gamesPlayed: [8, 12, 15, 18, 22, 19, 25, 28],
        winRate: [58, 62, 59, 65, 61, 68, 64, 63]
      }
    };

    // Simulate API loading
    setTimeout(() => {
      setStats(mockStats);
      setLoading(false);
    }, 800);
  }, [selectedPeriod]);

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

  const getWinRateColor = (winRate: number): string => {
    if (winRate >= 70) return '#00ff88';
    if (winRate >= 60) return '#4a9eff';
    if (winRate >= 50) return '#ffd700';
    return '#ff6b6b';
  };

  const getTrendIcon = (change: number): string => {
    if (change > 0) return '📈';
    if (change < 0) return '📉';
    return '➡️';
  };

  if (loading) {
    return (
      <div className="user-stats loading">
        <div className="loading-spinner">🎲 Loading statistics...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="user-stats error">
        <div className="error-message">❌ Unable to load statistics</div>
      </div>
    );
  }

  return (
    <div className="user-stats">
      {/* Header with Period Selection */}
      <div className="stats-header">
        <h1>📊 Statistics & Analytics</h1>
        <div className="period-selector">
          {periods.map(period => (
            <button
              key={period.period}
              className={`period-btn ${selectedPeriod === period.period ? 'active' : ''}`}
              onClick={() => setSelectedPeriod(period.period)}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* General Stats Grid */}
      <div className="stats-section">
        <h2>🎮 General Statistics</h2>
        <div className="stats-grid">
          <div className="stat-card large">
            <div className="stat-icon">🏆</div>
            <div className="stat-content">
              <div className="stat-value">{stats.general.gamesWon}</div>
              <div className="stat-label">Games Won</div>
              <div className="stat-sublabel">
                {stats.general.gamesLost} lost • {stats.general.winRate}% win rate
              </div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">🎲</div>
            <div className="stat-content">
              <div className="stat-value">{stats.general.gamesPlayed}</div>
              <div className="stat-label">Total Games</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⏱️</div>
            <div className="stat-content">
              <div className="stat-value">{formatDuration(stats.general.averageGameDuration)}</div>
              <div className="stat-label">Avg Game Time</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <div className="stat-value">#{stats.general.ranking}</div>
              <div className="stat-label">Global Rank</div>
              <div className="stat-trend">
                {getTrendIcon(stats.general.rankingChange)} {Math.abs(stats.general.rankingChange)}
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🔥</div>
            <div className="stat-content">
              <div className="stat-value">{stats.general.currentWinStreak}</div>
              <div className="stat-label">Current Streak</div>
              <div className="stat-sublabel">Best: {stats.general.longestWinStreak}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⏰</div>
            <div className="stat-content">
              <div className="stat-value">{formatPlayTime(stats.general.totalPlayTime)}</div>
              <div className="stat-label">Total Play Time</div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="stats-section">
        <h2>⚔️ Battle Performance</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">🏰</div>
            <div className="stat-content">
              <div className="stat-value">{stats.performance.territoriesConquered}</div>
              <div className="stat-label">Territories Conquered</div>
              <div className="stat-sublabel">{stats.performance.territoriesLost} lost</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⚔️</div>
            <div className="stat-content">
              <div className="stat-value">{stats.performance.battlesWon}</div>
              <div className="stat-label">Battles Won</div>
              <div className="stat-sublabel">
                {Math.round((stats.performance.battlesWon / (stats.performance.battlesWon + stats.performance.battlesLost)) * 100)}% win rate
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🪖</div>
            <div className="stat-content">
              <div className="stat-value">{stats.performance.armiesDeployed.toLocaleString()}</div>
              <div className="stat-label">Armies Deployed</div>
              <div className="stat-sublabel">
                {stats.performance.averageArmiesPerGame} avg/game
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-content">
              <div className="stat-value">{formatDuration(stats.performance.quickestVictory)}</div>
              <div className="stat-label">Fastest Victory</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">💪</div>
            <div className="stat-content">
              <div className="stat-value">{stats.performance.comebackWins}</div>
              <div className="stat-label">Comeback Wins</div>
              <div className="stat-sublabel">From behind</div>
            </div>
          </div>
        </div>
      </div>

      {/* Map Performance */}
      <div className="stats-section">
        <h2>🗺️ Map Performance</h2>
        <div className="map-stats">
          <div className="favorite-map">
            <h3>🌟 Favorite Map: {stats.maps.favoriteMap}</h3>
          </div>
          <div className="map-list">
            {stats.maps.mapStats.map((mapStat, index) => (
              <div key={mapStat.mapName} className="map-stat-item">
                <div className="map-rank">#{index + 1}</div>
                <div className="map-info">
                  <div className="map-name">{mapStat.mapName}</div>
                  <div className="map-games">{mapStat.gamesPlayed} games</div>
                </div>
                <div className="map-winrate" style={{ color: getWinRateColor(mapStat.winRate) }}>
                  {mapStat.winRate}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Game Mode Performance */}
      <div className="stats-section">
        <h2>🎯 Game Mode Wins</h2>
        <div className="gamemode-stats">
          <div className="gamemode-item">
            <div className="gamemode-icon">🌍</div>
            <div className="gamemode-name">Classic</div>
            <div className="gamemode-wins">{stats.gameModes.classicWins} wins</div>
          </div>
          <div className="gamemode-item">
            <div className="gamemode-icon">👑</div>
            <div className="gamemode-name">Capital Conquest</div>
            <div className="gamemode-wins">{stats.gameModes.capitalConquestWins} wins</div>
          </div>
          <div className="gamemode-item">
            <div className="gamemode-icon">⚓</div>
            <div className="gamemode-name">Naval Supremacy</div>
            <div className="gamemode-wins">{stats.gameModes.navalSupremacyWins} wins</div>
          </div>
          <div className="gamemode-item">
            <div className="gamemode-icon">💰</div>
            <div className="gamemode-name">Resource War</div>
            <div className="gamemode-wins">{stats.gameModes.resourceWarWins} wins</div>
          </div>
          <div className="gamemode-item">
            <div className="gamemode-icon">⚖️</div>
            <div className="gamemode-name">Asymmetric</div>
            <div className="gamemode-wins">{stats.gameModes.asymmetricWins} wins</div>
          </div>
        </div>
      </div>

      {/* Monthly Trends */}
      <div className="stats-section">
        <h2>📈 Monthly Trends</h2>
        <div className="trends-chart">
          <div className="chart-legend">
            <div className="legend-item">
              <div className="legend-color games"></div>
              <span>Games Played</span>
            </div>
            <div className="legend-item">
              <div className="legend-color winrate"></div>
              <span>Win Rate %</span>
            </div>
          </div>
          <div className="chart-container">
            {stats.monthly.labels.map((month, index) => (
              <div key={month} className="chart-bar">
                <div className="bar-container">
                  <div 
                    className="bar games" 
                    style={{ height: `${(stats.monthly.gamesPlayed[index] / Math.max(...stats.monthly.gamesPlayed)) * 100}%` }}
                  ></div>
                  <div 
                    className="bar winrate" 
                    style={{ height: `${stats.monthly.winRate[index]}%` }}
                  ></div>
                </div>
                <div className="bar-label">{month}</div>
                <div className="bar-values">
                  <div className="games-value">{stats.monthly.gamesPlayed[index]}</div>
                  <div className="winrate-value">{stats.monthly.winRate[index]}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserStats;