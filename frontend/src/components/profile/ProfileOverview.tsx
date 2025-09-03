import type React from 'react'
import { useEffect, useState } from 'react'
import { useAppSelector } from '../../hooks/redux'
import api from '../../services/api'
import { authService } from '../../services/authService'

interface UserProfile {
  id: string
  username: string
  email: string
  email_verified?: boolean
  avatarUrl?: string
  bio?: string
  elo: number
  joinDate: string
  lastActive: string
  preferences: {
    theme: string
    notifications: boolean
    publicProfile: boolean
  }
}

interface UserStats {
  gamesPlayed: number
  gamesWon: number
  gamesLost: number
  winRate: number
  averageGameDuration: number
  favoriteMap: string
  totalPlayTime: number
  ranking: number
}

interface RecentGame {
  id: string
  mapName: string
  gameMode: string
  result: 'won' | 'lost' | 'draw'
  duration: number
  playedAt: string
  playerCount: number
}

const ProfileOverview: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [recentGames, setRecentGames] = useState<RecentGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resendingVerification, setResendingVerification] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchProfileData()
  }, [user])

  const fetchProfileData = async () => {
    if (!user) {
      setError('Please log in to view your profile')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      
      // Fetch user profile
      const profileResponse = await api.get('/profile')
      const userData = profileResponse.data.user
      
      const userProfile: UserProfile = {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        email_verified: userData.email_verified,
        avatarUrl: userData.avatar_url,
        bio: userData.bio || '',
        elo: userData.elo || 1200,
        joinDate: userData.created_at,
        lastActive: userData.last_active || new Date().toISOString(),
        preferences: {
          theme: 'dark',
          notifications: true,
          publicProfile: true,
        },
      }
      
      // Calculate stats from user data
      const userStats: UserStats = {
        gamesPlayed: userData.games_played || 0,
        gamesWon: userData.wins || 0,
        gamesLost: userData.losses || 0,
        winRate: userData.games_played > 0 ? ((userData.wins || 0) / userData.games_played * 100) : 0,
        averageGameDuration: 0,
        favoriteMap: 'Classic World',
        totalPlayTime: 0,
        ranking: 0,
      }

      setProfile(userProfile)
      setStats(userStats)
      
      // Try to fetch recent games (endpoint might not exist yet)
      try {
        const gamesResponse = await api.get('/game/recent')
        setRecentGames(gamesResponse.data.games || [])
      } catch {
        // No recent games yet
        setRecentGames([])
      }
      
    } catch (err: any) {
      console.error('Failed to fetch profile:', err)
      setError('Failed to load profile data')
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    if (!profile?.email) return
    
    setResendingVerification(true)
    setVerificationMessage(null)
    
    try {
      await authService.resendVerification(profile.email)
      setVerificationMessage('Verification email sent! Please check your inbox.')
      setTimeout(() => setVerificationMessage(null), 5000)
    } catch (err: any) {
      setVerificationMessage(err.message || 'Failed to send verification email')
    } finally {
      setResendingVerification(false)
    }
  }

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

  const getRankTitle = (elo: number): { rank: string; color: string } => {
    if (elo < 1000) return { rank: 'Bronze', color: '#CD7F32' }
    if (elo < 1200) return { rank: 'Silver', color: '#C0C0C0' }
    if (elo < 1500) return { rank: 'Gold', color: '#FFD700' }
    if (elo < 1800) return { rank: 'Platinum', color: '#E5E4E2' }
    if (elo < 2100) return { rank: 'Diamond', color: '#B9F2FF' }
    return { rank: 'Master', color: '#FF69B4' }
  }

  if (loading) {
    return (
      <div className="profile-overview loading">
        <div className="loading-spinner">🎲 Loading profile...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="profile-overview error">
        <div className="error-message">❌ {error}</div>
      </div>
    )
  }

  if (!profile || !stats) {
    return (
      <div className="profile-overview error">
        <div className="error-message">❌ Profile not found</div>
      </div>
    )
  }

  const { rank, color } = getRankTitle(profile.elo)

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
          
          {/* Email Verification Status */}
          {profile.email_verified === false && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">⚠️</span>
                  <span className="text-yellow-300 text-sm">Email not verified</span>
                </div>
                <button
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resendingVerification ? 'Sending...' : 'Resend Email'}
                </button>
              </div>
              {verificationMessage && (
                <div className={`mt-2 text-sm ${verificationMessage.includes('sent') ? 'text-green-400' : 'text-red-400'}`}>
                  {verificationMessage}
                </div>
              )}
            </div>
          )}
          
          {profile.email_verified === true && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-400">✅</span>
              <span className="text-green-400 text-sm">Email verified</span>
            </div>
          )}
          
          <div className="rank-info">
            <span className="rank-badge" style={{ color }}>
              {rank}
            </span>
            <span className="elo-score">ELO: {profile.elo}</span>
          </div>
          {profile.bio && <p className="bio">{profile.bio}</p>}
          <div className="profile-meta">
            <span className="join-date">
              ⏰ Joined {new Date(profile.joinDate).toLocaleDateString()}
            </span>
            {stats.ranking > 0 && (
              <span className="ranking">🏆 Rank #{stats.ranking}</span>
            )}
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
          <div className="stat-icon">✅</div>
          <div className="stat-value">{stats.gamesWon}</div>
          <div className="stat-label">Wins</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <div className="stat-value">{stats.gamesLost}</div>
          <div className="stat-label">Losses</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-value">
            {stats.gamesPlayed > 0 ? `${stats.winRate.toFixed(1)}%` : 'N/A'}
          </div>
          <div className="stat-label">Win Rate</div>
        </div>
      </div>

      {/* Recent Games */}
      <div className="recent-games">
        <h2>📊 Recent Games</h2>
        {recentGames.length > 0 ? (
          <>
            <div className="games-list">
              {recentGames.map((game) => (
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
                  <div className="game-date">{new Date(game.playedAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
            <button className="view-game-history">View Full Game History</button>
          </>
        ) : (
          <div className="no-games">
            <p className="text-gray-400">No games played yet</p>
            <p className="text-sm text-gray-500 mt-2">Start playing to see your game history!</p>
          </div>
        )}
      </div>

      {/* Coming Soon Section */}
      <div className="coming-soon-section">
        <h2>🚀 Coming Soon</h2>
        <div className="coming-soon-grid">
          <div className="coming-soon-card">
            <div className="icon">🏅</div>
            <h3>Achievements</h3>
            <p>Unlock achievements and earn rewards</p>
          </div>
          <div className="coming-soon-card">
            <div className="icon">👥</div>
            <h3>Friends</h3>
            <p>Add friends and challenge them to battles</p>
          </div>
          <div className="coming-soon-card">
            <div className="icon">📈</div>
            <h3>Detailed Stats</h3>
            <p>Track your progress with advanced analytics</p>
          </div>
          <div className="coming-soon-card">
            <div className="icon">🎨</div>
            <h3>Custom Avatars</h3>
            <p>Personalize your profile with unique avatars</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfileOverview