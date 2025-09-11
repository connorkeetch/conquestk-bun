import type React from 'react'
import { useEffect, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import RankInsignia from './RankInsignia'
import { PLAYER_COLORS, PREMIUM_PLAYER_COLORS, getPlayerColor, COLOR_CLASSES } from '../constants/colors'
import type { PlayerColor } from '../constants/colors'

interface UserProfile {
  id: string
  username: string
  email?: string
  emailVerified?: boolean
  avatarUrl?: string
  bio?: string
  elo: number
  joinDate: string
  lastActive?: string
  gamesPlayed: number
  wins: number
  losses: number
  winRate: number
  peakRating: number
  preferredColor?: string
  rank: {
    name: string
    color: string
    insignia: string
    rating: number
  }
}

const ProfilePage: React.FC = () => {
  const { username } = useParams<{ username: string }>()
  const { user: currentUser } = useAppSelector((state) => state.auth)
  const settings = useAppSelector((state) => state.settings)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check if this is the current user's profile
  const isOwnProfile = currentUser && currentUser.username === username

  useEffect(() => {
    fetchProfile()
  }, [username])

  const fetchProfile = async () => {
    if (!username) {
      setError('Username is required')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const apiUrl = import.meta.env.VITE_API_URL || 
        (import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:5001/api')
      
      const response = await fetch(`${apiUrl}/users/${username}/profile`)

      if (response.ok) {
        const data = await response.json()
        setProfile(data)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to load profile')
      }
    } catch (err: any) {
      console.error('Failed to fetch profile:', err)
      setError('Failed to load profile data')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatLastActive = (dateString?: string): string => {
    if (!dateString) return 'Never'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Active now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`
    return formatDate(dateString)
  }

  if (!username) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bg-deep via-bg-alt to-bg-deep flex items-center justify-center">
        <div className="text-center p-8 bg-surface-1/80 backdrop-blur-lg rounded-2xl border border-border shadow-2xl">
          <div className="text-5xl mb-4 animate-pulse">🎲</div>
          <div className="text-white text-lg font-medium">Loading profile...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bg-deep via-bg-alt to-bg-deep flex items-center justify-center">
        <div className="text-center p-8 bg-surface-1/80 backdrop-blur-lg rounded-2xl border border-border shadow-2xl">
          <div className="text-5xl mb-4">❌</div>
          <div className="text-white text-lg mb-4 font-medium">{error}</div>
          <button
            onClick={fetchProfile}
            className="px-6 py-2 bg-gradient-to-r from-primary to-primary-soft hover:brightness-110 text-white rounded-lg font-medium transition-all hover:scale-105"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bg-deep via-bg-alt to-bg-deep flex items-center justify-center">
        <div className="text-center p-8 bg-surface-1/80 backdrop-blur-lg rounded-2xl border border-border shadow-2xl">
          <div className="text-5xl mb-4">❌</div>
          <div className="text-white text-lg font-medium">Profile not found</div>
        </div>
      </div>
    )
  }

  // Get the player color for avatar background
  const playerColor = profile.preferredColor || settings.game.preferredColor || '#DC2626'
  const colorClass = getPlayerColor(playerColor as PlayerColor)
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-deep via-bg-alt to-bg-deep text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Profile Header Card with glass effect */}
        <div className="relative bg-surface-1/80 backdrop-blur-lg rounded-2xl p-6 border border-border shadow-2xl mb-6 overflow-hidden">
          {/* Gradient overlay for visual interest */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center sm:items-start">
              <div className="relative group">
                {/* Avatar with player color background */}
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-border shadow-xl transition-transform group-hover:scale-105">
                  {profile.avatarUrl ? (
                    <img 
                      src={profile.avatarUrl} 
                      alt={profile.username} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center text-3xl sm:text-5xl font-bold text-white"
                      style={{ backgroundColor: colorClass }}
                    >
                      {profile.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                {/* Color indicator ring */}
                <div 
                  className="absolute inset-0 rounded-full border-4 opacity-50 animate-pulse"
                  style={{ borderColor: colorClass }}
                />
              </div>
              
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-primary-soft bg-clip-text text-transparent mb-2">
                {profile.username}
              </h1>
              
              
              {/* Rank Display */}
              <div className="mb-4">
                <RankInsignia 
                  rating={profile.elo} 
                  size="lg" 
                  showLabel={true} 
                  showRating={true}
                  className="justify-center sm:justify-start"
                />
              </div>
              
              {/* Bio */}
              {profile.bio && (
                <p className="text-muted text-lg mb-4 leading-relaxed">
                  {profile.bio}
                </p>
              )}
              
              {/* Meta Information */}
              <div className="flex flex-col sm:flex-row gap-4 text-sm text-muted">
                <span className="flex items-center gap-2">
                  ⏰ Joined {formatDate(profile.joinDate)}
                </span>
                <span className="flex items-center gap-2">
                  🕒 {formatLastActive(profile.lastActive)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid with enhanced cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="group relative bg-surface-2/60 backdrop-blur-sm rounded-xl p-4 border border-border hover:border-primary/50 transition-all hover:scale-105 hover:shadow-lg overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative text-center">
              <div className="text-2xl mb-2">🎮</div>
              <div className="text-2xl font-bold text-primary-soft">{profile.gamesPlayed}</div>
              <div className="text-muted text-sm">Games Played</div>
            </div>
          </div>
          
          <div className="group relative bg-surface-2/60 backdrop-blur-sm rounded-xl p-4 border border-border hover:border-green-500/50 transition-all hover:scale-105 hover:shadow-lg overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative text-center">
              <div className="text-2xl mb-2">✅</div>
              <div className="text-2xl font-bold text-green-400">{profile.wins}</div>
              <div className="text-muted text-sm">Wins</div>
            </div>
          </div>
          
          <div className="group relative bg-surface-2/60 backdrop-blur-sm rounded-xl p-4 border border-border hover:border-red-500/50 transition-all hover:scale-105 hover:shadow-lg overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative text-center">
              <div className="text-2xl mb-2">❌</div>
              <div className="text-2xl font-bold text-red-400">{profile.losses}</div>
              <div className="text-muted text-sm">Losses</div>
            </div>
          </div>
          
          <div className="group relative bg-surface-2/60 backdrop-blur-sm rounded-xl p-4 border border-border hover:border-yellow-500/50 transition-all hover:scale-105 hover:shadow-lg overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative text-center">
              <div className="text-2xl mb-2">📊</div>
              <div className="text-2xl font-bold text-yellow-400">
                {profile.gamesPlayed > 0 ? `${profile.winRate.toFixed(1)}%` : 'N/A'}
              </div>
              <div className="text-muted text-sm">Win Rate</div>
            </div>
          </div>
        </div>

        {/* Additional Stats with enhanced styling */}
        <div className="relative bg-surface-1/80 backdrop-blur-lg rounded-2xl p-6 border border-border shadow-xl mb-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
          <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-primary-soft bg-clip-text text-transparent mb-4 flex items-center gap-2">
            <span className="text-white">📈</span> Rating History
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="text-muted text-sm mb-1">Current Rating</div>
              <div className="text-3xl font-bold bg-gradient-to-r from-primary to-primary-soft bg-clip-text text-transparent">{profile.elo}</div>
            </div>
            <div>
              <div className="text-muted text-sm mb-1">Peak Rating</div>
              <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">{profile.peakRating}</div>
            </div>
          </div>
        </div>

        {/* Recent Games Section with enhanced styling */}
        <div className="relative bg-surface-1/80 backdrop-blur-lg rounded-2xl p-6 border border-border shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
          <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-primary-soft bg-clip-text text-transparent mb-4 flex items-center gap-2">
            <span className="text-white">📊</span> Recent Games
          </h2>
          <div className="relative text-center py-12">
            <div className="inline-block p-4 bg-surface-2/50 rounded-full mb-4">
              <div className="text-4xl">🎲</div>
            </div>
            <p className="text-white text-lg mb-2 font-medium">No recent games found</p>
            <p className="text-muted text-sm">
              {isOwnProfile 
                ? "Start playing to see your game history!" 
                : `${profile.username} hasn't played any games recently.`
              }
            </p>
            {isOwnProfile && (
              <button className="mt-4 px-6 py-2 bg-gradient-to-r from-primary to-primary-soft hover:brightness-110 text-white rounded-lg font-medium transition-all hover:scale-105">
                Start Playing
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage