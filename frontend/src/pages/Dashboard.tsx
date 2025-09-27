import type React from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FEATURE_FLAGS } from '../constants/featureFlags'
import { useAppSelector } from '../hooks/redux'
import { useFeatureFlag } from '../hooks/useFeatureFlag'

// import Breadcrumb from '../components/Breadcrumb';

interface RecentGame {
  id: string
  roomCode?: number
  mapName: string
  players: number
  status: 'completed' | 'in_progress' | 'waiting'
  result?: 'won' | 'lost'
  lastPlayed: Date
}

interface FriendActivity {
  id: string
  username: string
  activity: string
  timestamp: Date
  online: boolean
}

interface UserStats {
  gamesPlayed: number
  gamesWon: number
  winRate: number
  favoriteMap: string
  totalPlaytime: number
  currentStreak: number
}

const Dashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const comingSoonUiEnabled = useFeatureFlag(FEATURE_FLAGS.COMING_SOON_UI)
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [recentGames, setRecentGames] = useState<RecentGame[]>([])
  const [friendsActivity, setFriendsActivity] = useState<FriendActivity[]>([])
  const [notifications, _setNotifications] = useState<number>(3) // Mock notification count

  useEffect(() => {
    // Mock data - replace with actual API calls
    setUserStats({
      gamesPlayed: 127,
      gamesWon: 89,
      winRate: 70,
      favoriteMap: 'Classic World',
      totalPlaytime: 2340, // minutes
      currentStreak: 3,
    })

    setRecentGames([
      {
        id: '1',
        mapName: 'Classic World',
        players: 6,
        status: 'completed',
        result: 'won',
        lastPlayed: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      },
      {
        id: '2',
        mapName: 'Europe',
        players: 4,
        status: 'in_progress',
        lastPlayed: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      },
      {
        id: '3',
        mapName: 'Training Grounds',
        players: 5,
        status: 'completed',
        result: 'lost',
        lastPlayed: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      },
    ])

    setFriendsActivity([
      {
        id: '1',
        username: 'DragonLord',
        activity: 'Won a game on Classic World',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        online: true,
      },
      {
        id: '2',
        username: 'IceQueen',
        activity: 'Created a new map: Arctic Wasteland',
        timestamp: new Date(Date.now() - 45 * 60 * 1000),
        online: true,
      },
      {
        id: '3',
        username: 'ForestWarden',
        activity: comingSoonUiEnabled ? 'Joined a tournament' : 'Joined a ranked match',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        online: false,
      },
    ])
  }, [comingSoonUiEnabled])

  const getTimeAgo = (date: Date) => {
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  const formatPlaytime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m`
  }

  const getGameStatusColor = (status: string, result?: string) => {
    if (status === 'in_progress') return 'text-warning'
    if (status === 'completed' && result === 'won') return 'text-success'
    if (status === 'completed' && result === 'lost') return 'text-danger'
    return 'text-primary-soft'
  }

  const getGameStatusText = (status: string, result?: string) => {
    if (status === 'in_progress') return 'In Progress'
    if (status === 'completed' && result === 'won') return 'Victory'
    if (status === 'completed' && result === 'lost') return 'Defeat'
    return 'Waiting'
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Welcome Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Welcome back, {user?.username}! 👋</h1>
            <p className="text-muted mt-2">Ready to conquer some territories?</p>
          </div>
          {notifications > 0 && (
            <div className="bg-[color:var(--color-danger)] text-[color:var(--color-white)] px-3 py-1 rounded-[var(--radius-sm)] text-sm font-medium">
              {notifications} new notifications
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Link
          to="/lobby"
          className="panel group relative text-center transition-transform duration-200 hover:-translate-y-1"
        >
          <div className="text-3xl mb-3">🎮</div>
          <h3 className="text-xl font-bold text-[color:var(--heading)] mb-2">Casual Play</h3>
          <p className="text-sm text-[color:var(--text-muted)]">Find a relaxed match</p>
        </Link>

        <Link
          to="/create"
          className="panel group relative text-center transition-transform duration-200 hover:-translate-y-1"
        >
          <div className="text-3xl mb-3">➕</div>
          <h3 className="text-xl font-bold text-[color:var(--heading)] mb-2">Create Lobby</h3>
          <p className="text-sm text-[color:var(--color-success)]">Host a custom game</p>
        </Link>

        <Link
          to="/maps"
          className="panel group relative text-center transition-transform duration-200 hover:-translate-y-1"
        >
          <div className="text-3xl mb-3">🗺️</div>
          <h3 className="text-xl font-bold text-[color:var(--heading)] mb-2">Explore Maps</h3>
          <p className="text-sm text-[color:var(--color-warning)]">Discover new territories</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Stats Overview */}
        <div className="lg:col-span-1">
          <div className="panel space-y-6">
            <h2 className="text-xl font-bold text-[color:var(--heading)] flex items-center">
              <span className="mr-2">📊</span>
              Your Stats
            </h2>
            {userStats && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted">Games Played</span>
                  <span className="text-[color:var(--heading)] font-bold">
                    {userStats.gamesPlayed}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">Games Won</span>
                  <span className="text-success font-bold">{userStats.gamesWon}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">Win Rate</span>
                  <span className="text-primary-soft font-bold">{userStats.winRate}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">Current Streak</span>
                  <span className="text-warning font-bold">{userStats.currentStreak}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">Total Playtime</span>
                  <span className="text-primary-soft font-bold">
                    {formatPlaytime(userStats.totalPlaytime)}
                  </span>
                </div>
                <div className="pt-2 border-t border-border">
                  <span className="text-muted text-sm">Favorite Map</span>
                  <div className="text-[color:var(--heading)] font-medium">
                    {userStats.favoriteMap}
                  </div>
                </div>
              </div>
            )}
            <Link
              to="/profile/stats"
              className="block text-center text-[color:var(--color-primary-soft)] hover:text-[color:var(--color-primary)] text-sm font-medium"
            >
              View Detailed Stats →
            </Link>
          </div>
        </div>

        {/* Recent Games */}
        <div className="lg:col-span-2 space-y-8">
          <div className="panel space-y-6">
            <h2 className="text-xl font-bold text-[color:var(--heading)] flex items-center">
              <span className="mr-2">🎮</span>
              Recent Games
            </h2>
            <div className="space-y-4">
              {recentGames.map((game) => (
                <div
                  key={game.id}
                  className="panel-muted flex items-center justify-between p-4 transition-colors duration-200 hover:bg-[color:var(--hover-bg)] hover:border-[color:var(--hover-border)]"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 flex items-center justify-center rounded-[var(--radius-md)] border border-[color:var(--panel-border)] bg-[color:var(--surface-2)]">
                      🗺️
                    </div>
                    <div>
                      <div className="font-medium text-[color:var(--heading)]">{game.mapName}</div>
                      <div className="text-sm text-muted">
                        {game.players} players • {getTimeAgo(game.lastPlayed)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${getGameStatusColor(game.status, game.result)}`}>
                      {getGameStatusText(game.status, game.result)}
                    </div>
                    {game.status === 'in_progress' && (
                      <Link
                        to={`/room/${game.roomCode ?? game.id}`}
                        className="text-sm text-[color:var(--color-primary-soft)] hover:text-[color:var(--color-primary)]"
                      >
                        Continue →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/profile/history"
              className="block text-center text-[color:var(--color-primary-soft)] hover:text-[color:var(--color-primary)] text-sm font-medium"
            >
              View All Games →
            </Link>
          </div>

          {/* Friends Activity */}
          <div className="panel space-y-6">
            <h2 className="text-xl font-bold text-[color:var(--heading)] flex items-center">
              <span className="mr-2">👥</span>
              Friends Activity
            </h2>
            <div className="space-y-4">
              {friendsActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="panel-muted flex items-center space-x-4 p-3 transition-colors duration-200 hover:bg-[color:var(--hover-bg)] hover:border-[color:var(--hover-border)]"
                >
                  <div className="relative">
                    <div className="w-10 h-10 bg-[color:var(--color-primary)] rounded-full flex items-center justify-center text-sm font-bold text-[color:var(--color-white)]">
                      {activity.username.charAt(0)}
                    </div>
                    {activity.online && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[color:var(--color-success)] rounded-full border-2 border-[color:var(--surface-1)]" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-[color:var(--heading)] font-medium">
                      {activity.username}
                    </div>
                    <div className="text-muted text-sm">{activity.activity}</div>
                  </div>
                  <div className="text-muted text-xs">{getTimeAgo(activity.timestamp)}</div>
                </div>
              ))}
            </div>
            <Link
              to="/community/friends"
              className="block text-center text-[color:var(--color-primary-soft)] hover:text-[color:var(--color-primary)] text-sm font-medium"
            >
              View All Friends →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
