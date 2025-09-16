import type React from 'react'
import { useEffect, useState } from 'react'

interface StatsPeriod {
  period: 'week' | 'month' | 'year' | 'all'
  label: string
}

interface DetailedStats {
  general: {
    gamesPlayed: number
    gamesWon: number
    gamesLost: number
    winRate: number
    averageGameDuration: number
    totalPlayTime: number
    ranking: number
    rankingChange: number
    longestWinStreak: number
    currentWinStreak: number
  }
  performance: {
    territoriesConquered: number
    territoriesLost: number
    armiesDeployed: number
    battlesWon: number
    battlesLost: number
    averageArmiesPerGame: number
    quickestVictory: number
    comebackWins: number
  }
  maps: {
    favoriteMap: string
    mapStats: Array<{
      mapName: string
      gamesPlayed: number
      winRate: number
    }>
  }
  gameModes: {
    classicWins: number
    capitalConquestWins: number
    navalSupremacyWins: number
    resourceWarWins: number
    asymmetricWins: number
  }
  monthly: {
    labels: string[]
    gamesPlayed: number[]
    winRate: number[]
  }
}

const UserStats: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year' | 'all'>('month')
  const [stats, setStats] = useState<DetailedStats | null>(null)
  const [loading, setLoading] = useState(true)

  const periods: StatsPeriod[] = [
    { period: 'week', label: 'This Week' },
    { period: 'month', label: 'This Month' },
    { period: 'year', label: 'This Year' },
    { period: 'all', label: 'All Time' },
  ]

  useEffect(() => {
    // TODO: Replace with real API calls when backend is ready
    const emptyStats: DetailedStats = {
      general: {
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        winRate: 0,
        averageGameDuration: 0,
        totalPlayTime: 0,
        ranking: 0,
        rankingChange: 0,
        longestWinStreak: 0,
        currentWinStreak: 0,
      },
      performance: {
        territoriesConquered: 0,
        territoriesLost: 0,
        armiesDeployed: 0,
        battlesWon: 0,
        battlesLost: 0,
        averageArmiesPerGame: 0,
        quickestVictory: 0,
        comebackWins: 0,
      },
      maps: {
        favoriteMap: 'None',
        mapStats: [],
      },
      gameModes: {
        classicWins: 0,
        capitalConquestWins: 0,
        navalSupremacyWins: 0,
        resourceWarWins: 0,
        asymmetricWins: 0,
      },
      monthly: {
        labels: [],
        gamesPlayed: [],
        winRate: [],
      },
    }

    // Simulate API loading
    setTimeout(() => {
      setStats(emptyStats)
      setLoading(false)
    }, 300)
  }, [])

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const formatPlayTime = (hours: number): string => {
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return days > 0 ? `${days}d ${remainingHours}h` : `${remainingHours}h`
  }

  const getWinRateColor = (winRate: number): string => {
    if (winRate >= 70) return '#4ADE80'
    if (winRate >= 60) return '#60A5FA'
    if (winRate >= 50) return 'var(--color-secondary)'
    return '#F87171'
  }

  const getTrendIcon = (change: number): string => {
    if (change > 0) return '📈'
    if (change < 0) return '📉'
    return '➡️'
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-2xl text-center glass-box-lg">
          <div className="text-4xl mb-4 animate-pulse">🎲</div>
          <div className="text-white">Loading statistics...</div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-2xl text-center glass-box-lg">
          <div className="text-4xl mb-4">❌</div>
          <div className="text-white">Unable to load statistics</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto text-white">
      {/* Header with Period Selection */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-12 glass-box-lg">
        <h1 className="text-4xl font-bold mb-4 sm:mb-0 text-primary-soft flex items-center gap-3">
          <span>📊</span> Statistics & Analytics
        </h1>
        <div className="flex gap-2 glass-box-sm p-2">
          {periods.map((period) => (
            <button
              key={period.period}
              className={`px-4 py-2 rounded-lg transition-all font-medium ${
                selectedPeriod === period.period
                  ? 'bg-primary text-white shadow-lg'
                  : 'bg-transparent text-muted hover:bg-surface-2 hover:text-primary'
              }`}
              onClick={() => setSelectedPeriod(period.period)}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* General Stats Grid */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-primary-soft border-b-2 border-primary/30 pb-2 flex items-center gap-2">
          <span>🎮</span> General Statistics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <div className="col-span-1 sm:col-span-2 glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-5xl">🏆</div>
            <div className="flex-1">
              <div className="text-3xl font-bold text-primary">{stats.general.gamesWon}</div>
              <div className="text-lg text-white font-medium">Games Won</div>
              <div className="text-sm text-muted">
                {stats.general.gamesLost} lost • {stats.general.winRate}% win rate
              </div>
            </div>
          </div>

          <div className="glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl">🎲</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary">{stats.general.gamesPlayed}</div>
              <div className="text-white font-medium">Total Games</div>
            </div>
          </div>

          <div className="glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl">⏱️</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary">
                {formatDuration(stats.general.averageGameDuration)}
              </div>
              <div className="text-white font-medium">Avg Game Time</div>
            </div>
          </div>

          <div className="glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all relative">
            <div className="text-4xl">📊</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary">#{stats.general.ranking}</div>
              <div className="text-white font-medium">Global Rank</div>
            </div>
            <div className="absolute top-4 right-4 text-sm bg-green-500/20 text-green-400 px-2 py-1 rounded-md">
              {getTrendIcon(stats.general.rankingChange)} {Math.abs(stats.general.rankingChange)}
            </div>
          </div>

          <div className="glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl">🔥</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary">
                {stats.general.currentWinStreak}
              </div>
              <div className="text-white font-medium">Current Streak</div>
              <div className="text-sm text-muted">Best: {stats.general.longestWinStreak}</div>
            </div>
          </div>

          <div className="glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl">⏰</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary">
                {formatPlayTime(stats.general.totalPlayTime)}
              </div>
              <div className="text-white font-medium">Total Play Time</div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-primary-soft border-b-2 border-primary/30 pb-2 flex items-center gap-2">
          <span>⚔️</span> Battle Performance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl">🏰</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary">
                {stats.performance.territoriesConquered}
              </div>
              <div className="text-white font-medium">Territories Conquered</div>
              <div className="text-sm text-muted">{stats.performance.territoriesLost} lost</div>
            </div>
          </div>

          <div className="glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl">⚔️</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary">{stats.performance.battlesWon}</div>
              <div className="text-white font-medium">Battles Won</div>
              <div className="text-sm text-muted">
                {Math.round(
                  (stats.performance.battlesWon /
                    (stats.performance.battlesWon + stats.performance.battlesLost)) *
                    100,
                )}
                % win rate
              </div>
            </div>
          </div>

          <div className="glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl">🪖</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary">
                {stats.performance.armiesDeployed.toLocaleString()}
              </div>
              <div className="text-white font-medium">Armies Deployed</div>
              <div className="text-sm text-muted">
                {stats.performance.averageArmiesPerGame} avg/game
              </div>
            </div>
          </div>

          <div className="glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl">⚡</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary">
                {formatDuration(stats.performance.quickestVictory)}
              </div>
              <div className="text-white font-medium">Fastest Victory</div>
            </div>
          </div>

          <div className="glass-box flex items-center gap-4 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl">💪</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary">
                {stats.performance.comebackWins}
              </div>
              <div className="text-white font-medium">Comeback Wins</div>
              <div className="text-sm text-muted">From behind</div>
            </div>
          </div>
        </div>
      </div>

      {/* Map Performance */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-primary-soft border-b-2 border-primary/30 pb-2 flex items-center gap-2">
          <span>🗺️</span> Map Performance
        </h2>
        <div className="glass-box-lg">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-semibold text-yellow-400 flex items-center justify-center gap-2">
              <span>🌟</span> Favorite Map: {stats.maps.favoriteMap}
            </h3>
          </div>
          <div className="flex flex-col gap-4">
            {stats.maps.mapStats.map((mapStat, index) => (
              <div
                key={mapStat.mapName}
                className="flex items-center gap-4 p-4 bg-surface-1/50 rounded-lg hover:bg-surface-1/70 transition-colors"
              >
                <div className="text-xl font-bold text-primary w-12">#{index + 1}</div>
                <div className="flex-1">
                  <div className="text-white font-medium">{mapStat.mapName}</div>
                  <div className="text-sm text-muted">{mapStat.gamesPlayed} games</div>
                </div>
                <div
                  className="text-xl font-bold"
                  style={{ color: getWinRateColor(mapStat.winRate) }}
                >
                  {mapStat.winRate}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Game Mode Performance */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-primary-soft border-b-2 border-primary/30 pb-2 flex items-center gap-2">
          <span>🎯</span> Game Mode Wins
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="glass-box text-center hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl mb-2">🌍</div>
            <div className="text-white font-medium mb-1">Classic</div>
            <div className="text-xl font-bold text-primary">{stats.gameModes.classicWins} wins</div>
          </div>
          <div className="glass-box text-center hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl mb-2">👑</div>
            <div className="text-white font-medium mb-1">Capital Conquest</div>
            <div className="text-xl font-bold text-primary">
              {stats.gameModes.capitalConquestWins} wins
            </div>
          </div>
          <div className="glass-box text-center hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl mb-2">⚓</div>
            <div className="text-white font-medium mb-1">Naval Supremacy</div>
            <div className="text-xl font-bold text-primary">
              {stats.gameModes.navalSupremacyWins} wins
            </div>
          </div>
          <div className="glass-box text-center hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl mb-2">💰</div>
            <div className="text-white font-medium mb-1">Resource War</div>
            <div className="text-xl font-bold text-primary">
              {stats.gameModes.resourceWarWins} wins
            </div>
          </div>
          <div className="glass-box text-center hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/20 transition-all">
            <div className="text-4xl mb-2">⚖️</div>
            <div className="text-white font-medium mb-1">Asymmetric</div>
            <div className="text-xl font-bold text-primary">
              {stats.gameModes.asymmetricWins} wins
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Trends */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-primary-soft border-b-2 border-primary/30 pb-2 flex items-center gap-2">
          <span>📈</span> Monthly Trends
        </h2>
        <div className="glass-box-lg">
          <div className="flex gap-6 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-primary rounded"></div>
              <span className="text-white">Games Played</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-400 rounded"></div>
              <span className="text-white">Win Rate %</span>
            </div>
          </div>
          <div className="flex items-end gap-4 h-64">
            {stats.monthly.labels.map((month, index) => (
              <div key={month} className="flex-1 flex flex-col items-center">
                <div className="relative h-full w-full flex items-end justify-center gap-2">
                  <div
                    className="w-1/3 bg-primary rounded-t transition-all hover:brightness-110"
                    style={{
                      height: `${(stats.monthly.gamesPlayed[index] / Math.max(...stats.monthly.gamesPlayed)) * 100}%`,
                    }}
                  ></div>
                  <div
                    className="w-1/3 bg-green-400 rounded-t transition-all hover:brightness-110"
                    style={{ height: `${stats.monthly.winRate[index]}%` }}
                  ></div>
                </div>
                <div className="text-muted text-sm mt-2">{month}</div>
                <div className="flex gap-2 text-xs">
                  <div className="text-primary">{stats.monthly.gamesPlayed[index]}</div>
                  <div className="text-green-400">{stats.monthly.winRate[index]}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserStats
