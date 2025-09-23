import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  getColorDisplayName,
  getColorValue,
  PLAYER_COLORS,
  type PlayerColor,
  PREMIUM_PLAYER_COLORS,
} from '../constants/colors'
import { FEATURE_FLAGS } from '../constants/featureFlags'
import { useAppSelector } from '../hooks/redux'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { type ProfileSummary, profileService } from '../services/profileService'
import type { RootState } from '../store'
import UserStats from './profile/UserStats'
import RankInsignia, { CONQUEST_RANKS, getConquestRank } from './RankInsignia'

type TabType = 'overview' | 'stats' | 'matches' | 'achievements'

type CopyState = 'idle' | 'copied' | 'error'

interface ActionFeedback {
  type: 'success' | 'error'
  message: string
}

const hexToRgba = (hex: string, alpha = 1): string => {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) {
    return `rgba(220, 38, 38, ${alpha})`
  }

  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const isGradientValue = (value: string): boolean => {
  return value.startsWith('linear-gradient') || value.startsWith('radial-gradient')
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) {
    return null
  }

  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)

  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return null
  }

  return { r, g, b }
}

const rgbComponentToHex = (component: number): string => {
  return clamp(Math.round(component), 0, 255).toString(16).padStart(2, '0')
}

const rgbToHex = (r: number, g: number, b: number): string => {
  return `#${rgbComponentToHex(r)}${rgbComponentToHex(g)}${rgbComponentToHex(b)}`
}

const mixColors = (hexA: string, hexB: string, amount: number): string => {
  const rgbA = hexToRgb(hexA)
  const rgbB = hexToRgb(hexB)

  if (!rgbA || !rgbB) {
    return hexA
  }

  const ratio = clamp(amount, 0, 1)

  return rgbToHex(
    rgbA.r + (rgbB.r - rgbA.r) * ratio,
    rgbA.g + (rgbB.g - rgbA.g) * ratio,
    rgbA.b + (rgbB.b - rgbA.b) * ratio,
  )
}

const lightenColor = (hex: string, amount: number): string => {
  return mixColors(hex, '#FFFFFF', amount)
}

const getRelativeLuminance = (hex: string): number => {
  const rgb = hexToRgb(hex)

  if (!rgb) {
    return 0
  }

  const transform = (channel: number) => {
    const srgb = channel / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }

  const r = transform(rgb.r)
  const g = transform(rgb.g)
  const b = transform(rgb.b)

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const ensureReadableOnDark = (hex: string, minLuminance = 0.3): string => {
  const baseLuminance = getRelativeLuminance(hex)

  if (baseLuminance >= minLuminance) {
    return hex
  }

  const adjustments = [0.35, 0.55, 0.75]

  for (const amount of adjustments) {
    const candidate = lightenColor(hex, amount)
    if (getRelativeLuminance(candidate) >= minLuminance) {
      return candidate
    }
  }

  return lightenColor(hex, 0.85)
}

const extractFirstHexColor = (value: string): string | null => {
  const match = value.match(/#([0-9a-fA-F]{6})/)
  return match ? `#${match[1]}` : null
}

const buildSignatureVisuals = (profile: ProfileSummary | null, settings: RootState['settings']) => {
  const fallbackPlayerColor = PLAYER_COLORS[0]
  const preferredColorSource =
    (profile?.preferredColor as PlayerColor | undefined) ||
    (settings?.game?.preferredColor as PlayerColor | undefined) ||
    fallbackPlayerColor

  const resolvedPreferredColor = getColorValue(preferredColorSource)
  const signatureIsGradient = isGradientValue(resolvedPreferredColor)
  const signatureHex = signatureIsGradient ? fallbackPlayerColor : resolvedPreferredColor

  const signatureCrestStyle: React.CSSProperties = signatureIsGradient
    ? { backgroundImage: resolvedPreferredColor }
    : {
        backgroundImage: `linear-gradient(145deg, ${hexToRgba(signatureHex, 0.85)} 0%, ${hexToRgba(
          signatureHex,
          0.55,
        )} 60%, ${hexToRgba(signatureHex, 0.2)} 100%)`,
      }

  const signatureColorSwatchStyle: React.CSSProperties = signatureIsGradient
    ? { backgroundImage: resolvedPreferredColor }
    : { backgroundColor: signatureHex }

  const signatureGlowStyle: React.CSSProperties = signatureIsGradient
    ? { backgroundImage: resolvedPreferredColor }
    : {
        backgroundImage: `radial-gradient(circle at 30% 30%, ${hexToRgba(signatureHex, 0.45)} 0%, transparent 70%)`,
      }

  const heroGradientOverlay = 'linear-gradient(160deg, rgba(15, 17, 23, 0.92) 0%, rgba(11, 14, 23, 0.78) 60%, rgba(9, 11, 18, 0.72) 100%)'

  const heroBackgroundStyle: React.CSSProperties = signatureIsGradient
    ? {
        backgroundImage: `${heroGradientOverlay}, ${resolvedPreferredColor}`,
      }
    : {
        backgroundImage: `linear-gradient(155deg, ${hexToRgba(signatureHex, 0.88)} 0%, ${hexToRgba(
          mixColors(signatureHex, '#0f1117', 0.4),
          0.92,
        )} 55%, ${hexToRgba(mixColors(signatureHex, '#090b12', 0.7), 0.95)} 100%)`,
      }

  const heroBorderColor = hexToRgba(ensureReadableOnDark(signatureHex), 0.45)

  const preferredColorDisplayName = getColorDisplayName(preferredColorSource)

  const premiumColorEntry = (() => {
    if (!preferredColorSource) return null

    if (preferredColorSource in PREMIUM_PLAYER_COLORS) {
      const entry =
        PREMIUM_PLAYER_COLORS[preferredColorSource as keyof typeof PREMIUM_PLAYER_COLORS]
      return [preferredColorSource, entry] as const
    }

    return (
      Object.entries(PREMIUM_PLAYER_COLORS).find(([_, value]) => {
        if ('gradient' in value && value.gradient) {
          return value.gradient === preferredColorSource
        }

        return value.solid === preferredColorSource
      }) || null
    )
  })()

  return {
    signatureCrestStyle,
    signatureColorSwatchStyle,
    signatureGlowStyle,
    heroBackgroundStyle,
    heroBorderColor,
    preferredColorDisplayName,
    premiumColorEntry,
    signatureHex,
  }
}

const buildRankVisuals = (profile: ProfileSummary) => {
  const fallbackRankDetails = getConquestRank(profile.elo)
  const backendRank = profile.rank

  const rankDetails = {
    name: backendRank?.name ?? fallbackRankDetails.name,
    minRating: backendRank?.minRating ?? fallbackRankDetails.minRating,
    color: backendRank?.color ?? fallbackRankDetails.color,
    insignia: backendRank?.insignia ?? fallbackRankDetails.insignia,
  }

  const nextRankFromBackend = backendRank?.nextRank ?? null
  const nextRankDetails = nextRankFromBackend
    ? (CONQUEST_RANKS.find((rank) => rank.minRating === nextRankFromBackend.minRating) ?? {
        name: nextRankFromBackend.name,
        minRating: nextRankFromBackend.minRating,
        color: rankDetails.color,
        insignia: rankDetails.insignia,
      })
    : CONQUEST_RANKS.find((rank) => rank.minRating > rankDetails.minRating)

  const rawRankColor = rankDetails.color
  const rankColorIsGradient = isGradientValue(rawRankColor)
  const extractedRankHex = rankColorIsGradient ? extractFirstHexColor(rawRankColor) : rawRankColor
  const fallbackRankHex = '#F59E0B'
  const baseRankHex = extractedRankHex?.startsWith('#') ? extractedRankHex : fallbackRankHex
  const rankAccentColor = ensureReadableOnDark(baseRankHex)
  const rankAccentSoft = lightenColor(rankAccentColor, 0.35)
  const rankAccentFaint = lightenColor(rankAccentColor, 0.65)

  const rankGlowStyle: React.CSSProperties = rankColorIsGradient
    ? { backgroundImage: rawRankColor }
    : {
        backgroundImage: `radial-gradient(circle at 20% 20%, ${hexToRgba(rankAccentSoft, 0.45)} 0%, transparent 70%)`,
      }

  const rankHeaderAccentStyle: React.CSSProperties = rankColorIsGradient
    ? { backgroundImage: rawRankColor }
    : {
        backgroundImage: `linear-gradient(140deg, ${hexToRgba(rankAccentSoft, 0.35)} 0%, transparent 80%)`,
      }

  const rankProgressFill = rankColorIsGradient
    ? rawRankColor
    : `linear-gradient(90deg, ${hexToRgba(rankAccentColor, 0.85)}, ${hexToRgba(rankAccentSoft, 0.6)})`

  const rankCallToActionStyle: React.CSSProperties = rankColorIsGradient
    ? { backgroundImage: rawRankColor }
    : {
        backgroundImage: `linear-gradient(90deg, ${rankAccentColor}, ${hexToRgba(rankAccentSoft, 0.7)})`,
      }

  const nextRankTarget = nextRankDetails?.minRating ?? rankDetails.minRating
  const rankProgressRange = Math.max(nextRankTarget - rankDetails.minRating, 1)
  const rankProgress = Math.min(
    100,
    Math.max(0, ((profile.elo - rankDetails.minRating) / rankProgressRange) * 100),
  )
  const ratingToNextRank = Math.max(0, (nextRankDetails?.minRating ?? profile.elo) - profile.elo)

  return {
    rankDetails,
    nextRank: nextRankDetails ?? null,
    rawRankColor,
    rankColorIsGradient,
    rankAccentColor,
    rankAccentSoft,
    rankAccentFaint,
    rankGlowStyle,
    rankHeaderAccentStyle,
    rankProgressFill,
    rankCallToActionStyle,
    rankProgress,
    ratingToNextRank,
  }
}

const ProfilePage: React.FC = () => {
  const { username } = useParams<{ username: string }>()
  const { user: currentUser } = useAppSelector((state) => state.auth)
  const settings = useAppSelector((state) => state.settings)
  const [profile, setProfile] = useState<ProfileSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null)
  const requestControllerRef = useRef<AbortController | null>(null)
  const profileExtrasEnabled = useFeatureFlag(FEATURE_FLAGS.PROFILE_EXTRAS)

  const isOwnProfile = currentUser?.username === username

  const fetchProfile = useCallback(async () => {
    if (!username) {
      setError('Username is required')
      setProfile(null)
      setLoading(false)
      return
    }

    requestControllerRef.current?.abort()
    const controller = new AbortController()
    requestControllerRef.current = controller

    try {
      setLoading(true)
      setError(null)

      const data = await profileService.getProfileByUsername(username, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) {
        return
      }

      setProfile(data)
      setError(null)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }

      setError('Failed to load profile data')
      setProfile(null)
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }

      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
      }
    }
  }, [username])

  useEffect(() => {
    fetchProfile()

    return () => {
      requestControllerRef.current?.abort()
      requestControllerRef.current = null
    }
  }, [fetchProfile])

  useEffect(() => {
    if (copyState === 'idle') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState('idle')
    }, 2500)

    return () => window.clearTimeout(timeoutId)
  }, [copyState])

  useEffect(() => {
    if (!actionFeedback) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setActionFeedback(null)
    }, 4000)

    return () => window.clearTimeout(timeoutId)
  }, [actionFeedback])

  useEffect(() => {
    if (!profileExtrasEnabled && (activeTab === 'matches' || activeTab === 'achievements')) {
      setActiveTab('overview')
    }
  }, [profileExtrasEnabled, activeTab])

  const handleRefreshProfile = useCallback(() => {
    setActionFeedback(null)
    setCopyState('idle')
    void fetchProfile()
  }, [fetchProfile])

  const handleShareProfile = useCallback(async () => {
    if (!profile) {
      return
    }

    const shareUrl = `${window.location.origin}/profile/${profile.username}`

    try {
      if ('share' in navigator && typeof navigator.share === 'function') {
        await navigator.share({ title: `${profile.username} on ConquestK`, url: shareUrl })
        setActionFeedback({ type: 'success', message: 'Share panel opened.' })
        setCopyState('idle')
        return
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(shareUrl)
        setCopyState('copied')
        setActionFeedback({ type: 'success', message: 'Profile link copied to clipboard.' })
        return
      }

      window.prompt('Copy this profile link:', shareUrl)
      setCopyState('copied')
      setActionFeedback({ type: 'success', message: 'Profile link ready to share.' })
    } catch (_err: unknown) {
      setCopyState('error')
      setActionFeedback({ type: 'error', message: 'Unable to share profile link. Try again?' })
    }
  }, [profile])

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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

  const signatureVisuals = buildSignatureVisuals(profile, settings)

  if (!username) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bg-deep via-bg-alt to-bg-deep flex items-center justify-center">
        <div className="text-center glass-box-xl shadow-2xl">
          <div className="text-5xl mb-4 animate-pulse">🎲</div>
          <div className="text-white text-lg font-medium">Loading profile...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-bg-deep via-bg-alt to-bg-deep flex items-center justify-center">
        <div className="text-center glass-box-xl shadow-2xl">
          <div className="text-5xl mb-4">❌</div>
          <div className="text-white text-lg mb-4 font-medium">{error}</div>
          <button
            type="button"
            onClick={handleRefreshProfile}
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
        <div className="text-center glass-box-xl shadow-2xl">
          <div className="text-5xl mb-4">❌</div>
          <div className="text-white text-lg font-medium">Profile not found</div>
        </div>
      </div>
    )
  }

  const rankVisuals = buildRankVisuals(profile)

  const {
    signatureCrestStyle,
    signatureColorSwatchStyle,
    signatureGlowStyle,
    heroBackgroundStyle,
    heroBorderColor,
    preferredColorDisplayName,
    premiumColorEntry,
    signatureHex,
  } = signatureVisuals

  const {
    rankDetails,
    nextRank,
    rawRankColor,
    rankColorIsGradient,
    rankAccentColor,
    rankAccentSoft,
    rankAccentFaint,
    rankGlowStyle,
    rankHeaderAccentStyle,
    rankProgressFill,
    rankCallToActionStyle,
    rankProgress,
    ratingToNextRank,
  } = rankVisuals

  const tabs: { id: TabType; label: string; icon: string; available: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: '👤', available: true },
    { id: 'stats', label: 'Statistics', icon: '📊', available: true },
  ]

  if (profileExtrasEnabled) {
    tabs.push(
      { id: 'matches', label: 'Matches', icon: '🎮', available: true },
      { id: 'achievements', label: 'Achievements', icon: '🏆', available: true },
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-deep via-bg-alt to-bg-deep text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {actionFeedback && (
          <div
            aria-live="polite"
            className={`mb-6 glass-box-sm px-4 py-3 rounded-xl border ${
              actionFeedback.type === 'success'
                ? 'border-emerald-500/50 text-emerald-200'
                : 'border-red-500/60 text-red-200'
            }`}
          >
            <div className="flex items-center gap-3 text-sm font-medium">
              <span aria-hidden="true">{actionFeedback.type === 'success' ? '✅' : '⚠️'}</span>
              <span>{actionFeedback.message}</span>
            </div>
          </div>
        )}

        {/* Profile Header Card with glass effect */}
        <div
          className="relative glass-box-lg shadow-2xl mb-8 overflow-hidden border"
          style={{ ...heroBackgroundStyle, borderColor: heroBorderColor }}
        >
          <div
            className="absolute inset-0 opacity-80 pointer-events-none"
            style={signatureGlowStyle}
          />
          <div
            className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-35 pointer-events-none"
            style={{ background: hexToRgba(signatureHex, 0.4) }}
          />
          <div className="absolute top-4 right-4 flex flex-col items-end gap-2 text-sm">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleRefreshProfile}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-surface-3/80 hover:bg-surface-3/100 border border-white/10 transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span>🔄</span>
                <span className="font-medium">Refresh</span>
              </button>
              <button
                type="button"
                onClick={handleShareProfile}
                className="px-3 py-1.5 rounded-lg bg-surface-3/80 hover:bg-surface-3/100 border border-white/10 transition-colors flex items-center gap-2"
              >
                <span>🔗</span>
                <span className="font-medium">Share</span>
              </button>
              {isOwnProfile && (
                <Link
                  to="/settings"
                  aria-label="Edit your profile settings"
                  className="px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 border border-white/10 transition-colors flex items-center gap-2 font-medium"
                >
                  <span>✏️</span>
                  Edit Profile
                </Link>
              )}
            </div>
            {copyState !== 'idle' && (
              <span
                className={`text-xs ${copyState === 'copied' ? 'text-green-400' : 'text-red-400'}`}
                aria-live="polite"
              >
                {copyState === 'copied' ? 'Profile link copied!' : 'Unable to copy link'}
              </span>
            )}
          </div>
          <div className="relative flex flex-col sm:flex-row gap-6">
            {/* Avatar & identity section */}
            <div className="flex flex-col items-center sm:items-start gap-4">
              <div className="relative group">
                <div
                  className="absolute -inset-4 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-60"
                  style={rankGlowStyle}
                />
                <div
                  className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl transition-transform duration-300 group-hover:scale-105 backdrop-blur-sm"
                  style={{ borderColor: rankAccentColor }}
                >
                  {profile.avatarUrl ? (
                    <>
                      <img
                        src={profile.avatarUrl}
                        alt={profile.username}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-1/4 px-3 py-1 rounded-full bg-surface-3/90 border border-white/10 shadow-lg flex items-center gap-1 backdrop-blur-sm">
                        <span className="text-xl" style={{ color: rankAccentColor }}>
                          {rankDetails.insignia}
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white">
                          {rankDetails.name}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-4xl sm:text-5xl font-bold text-white drop-shadow-lg"
                      style={signatureCrestStyle}
                    >
                      <span style={{ color: rankAccentColor }}>{rankDetails.insignia}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-3/70 backdrop-blur-md border border-white/10 shadow-inner">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    ...signatureColorSwatchStyle,
                    boxShadow: `0 0 12px ${hexToRgba(signatureHex, 0.6)}`,
                  }}
                />
                <span className="text-[11px] font-semibold tracking-[0.45em] uppercase text-muted">
                  {premiumColorEntry ? `${premiumColorEntry[0]} Colorway` : preferredColorDisplayName}
                </span>
              </div>
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center sm:text-left space-y-5">
              <div>
                <h1
                  className="text-3xl sm:text-4xl font-bold mb-1 bg-clip-text text-transparent"
                  style={{
                    backgroundImage: rankColorIsGradient
                      ? rawRankColor
                      : `linear-gradient(120deg, ${rankAccentColor}, ${hexToRgba(rankAccentSoft, 0.6)})`,
                  }}
                >
                  {profile.username}
                </h1>
                <p className="text-xs sm:text-sm uppercase tracking-[0.45em] text-muted">
                  {premiumColorEntry
                    ? premiumColorEntry[1].description
                    : 'Commander of the Conquest Realms'}
                </p>
              </div>

              {/* Rank Display */}
              <RankInsignia
                rating={profile.elo}
                size="lg"
                showLabel={true}
                showRating={true}
                className="justify-center sm:justify-start px-4 py-2 rounded-full bg-surface-3/60 border border-white/10 backdrop-blur-sm shadow-inner"
              />

              <div className="flex flex-col sm:flex-row items-center sm:items-stretch justify-center sm:justify-start gap-3">
                {isOwnProfile && (
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-primary to-primary-soft text-white font-semibold transition-transform hover:scale-105 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft"
                  >
                    <span aria-hidden="true">✏️</span>
                    <span>Edit Profile</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleShareProfile}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-3/60 border border-white/10 text-white/90 hover:text-white transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft"
                >
                  <span aria-hidden="true">🔗</span>
                  <span>Share Profile</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 text-xs uppercase tracking-[0.35em] text-muted">
                <span className="flex items-center gap-1">
                  <span className="text-lg">🎯</span>
                  {profile.elo} ELO
                </span>
                <span className="hidden sm:inline text-white/30">•</span>
                <span className="flex items-center gap-1">
                  <span className="text-lg">🌠</span>
                  Peak {profile.peakRating}
                </span>
              </div>

              {/* Bio */}
              {profile.bio && (
                <div className="p-4 rounded-xl bg-surface-2/60 border border-white/10 backdrop-blur-sm">
                  <p className="text-muted text-base leading-relaxed">{profile.bio}</p>
                </div>
              )}

              {!profile.bio && isOwnProfile && (
                <div className="p-4 rounded-xl bg-surface-2/60 border border-dashed border-white/10 backdrop-blur-sm">
                  <p className="text-muted text-base leading-relaxed">
                    Introduce yourself to other commanders.{' '}
                    <Link to="/settings" className="text-primary-soft hover:underline">
                      Add a short bio
                    </Link>{' '}
                    to share your playstyle and favorite strategies.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Identity highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="relative glass-box-sm p-5 overflow-hidden">
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={rankHeaderAccentStyle}
            />
            <div className="relative flex items-center gap-3">
              <div className="text-3xl" style={{ color: rankAccentColor }}>
                {rankDetails.insignia}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.45em] text-muted">Current Rank</p>
                <p className="text-lg font-semibold text-white">{rankDetails.name}</p>
              </div>
            </div>
            {nextRank ? (
              <div className="relative mt-4">
                <div className="flex justify-between text-[11px] text-muted uppercase tracking-[0.3em] mb-1">
                  <span>{profile.elo} ELO</span>
                  <span>{nextRank.minRating} ELO</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2/60 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${rankProgress}%`,
                      background: rankProgressFill,
                    }}
                  />
                </div>
                <p className="text-xs text-muted mt-2">
                  {ratingToNextRank > 0
                    ? `${ratingToNextRank} rating to reach ${nextRank.name}.`
                    : `Promotion to ${nextRank.name} is imminent.`}
                </p>
              </div>
            ) : (
              <p className="relative text-xs text-muted mt-4 leading-relaxed">
                Legendary commander status secured.
              </p>
            )}
          </div>

          <div className="relative glass-box-sm p-5 overflow-hidden">
            <div
              className="absolute inset-0 opacity-25 pointer-events-none"
              style={{
                backgroundImage: rankColorIsGradient
                  ? rawRankColor
                  : `linear-gradient(160deg, ${hexToRgba(rankAccentFaint, 0.35)} 0%, transparent 85%)`,
              }}
            />
            <div className="relative flex items-center gap-3">
              <div className="text-3xl">🗺️</div>
              <div>
                <p className="text-xs uppercase tracking-[0.45em] text-muted">Campaign Status</p>
                <p className="text-lg font-semibold text-white">
                  {formatLastActive(profile.lastActive)}
                </p>
              </div>
            </div>
            <p className="relative text-xs text-muted mt-4 leading-relaxed">
              Joined {formatDate(profile.joinDate)} · Peak rating {profile.peakRating}
            </p>
            <p className="relative text-xs text-muted mt-2 leading-relaxed">
              {isOwnProfile
                ? 'Set out on your next conquest to keep the momentum going.'
                : `${profile.username} is preparing their next campaign.`}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 border-b border-border overflow-x-auto">
          {tabs.map((tab) => {
            const isPreviewTab = tab.id === 'matches' || tab.id === 'achievements'

            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => tab.available && setActiveTab(tab.id)}
                disabled={!tab.available}
                aria-selected={activeTab === tab.id}
                className={`relative px-5 py-3 font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft ${
                  activeTab === tab.id
                    ? 'text-white bg-gradient-to-r from-primary to-primary-soft border-primary/60 shadow-lg'
                    : tab.available
                      ? 'text-muted border-transparent hover:text-white hover:bg-surface-2/70 hover:border-border'
                      : 'text-muted/50 border-transparent cursor-not-allowed'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {!tab.available && <span className="text-xs">(Soon)</span>}
                {tab.available && profileExtrasEnabled && isPreviewTab && (
                  <span className="text-xs text-muted">(Preview)</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="relative">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats Grid with enhanced cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="relative glass-box-sm border border-white/10 bg-surface-2/70 text-center transition-transform hover:-translate-y-1 hover:shadow-xl">
                  <div className="text-2xl mb-2">🎮</div>
                  <div className="text-2xl font-bold text-white">{profile.gamesPlayed}</div>
                  <div className="text-muted text-sm">Games Played</div>
                </div>

                <div className="relative glass-box-sm border border-white/10 bg-surface-2/70 text-center transition-transform hover:-translate-y-1 hover:shadow-xl">
                  <div className="text-2xl mb-2">✅</div>
                  <div className="text-2xl font-bold text-green-400">{profile.wins}</div>
                  <div className="text-muted text-sm">Wins</div>
                </div>

                <div className="relative glass-box-sm border border-white/10 bg-surface-2/70 text-center transition-transform hover:-translate-y-1 hover:shadow-xl">
                  <div className="text-2xl mb-2">❌</div>
                  <div className="text-2xl font-bold text-red-400">{profile.losses}</div>
                  <div className="text-muted text-sm">Losses</div>
                </div>

                <div className="relative glass-box-sm border border-white/10 bg-surface-2/70 text-center transition-transform hover:-translate-y-1 hover:shadow-xl">
                  <div className="text-2xl mb-2">📊</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {profile.gamesPlayed > 0 ? `${profile.winRate.toFixed(1)}%` : 'N/A'}
                  </div>
                  <div className="text-muted text-sm">Win Rate</div>
                </div>
              </div>

              {/* Additional Stats with enhanced styling */}
              <div className="relative glass-box-lg shadow-xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
                <h2 className="text-xl font-bold text-primary-soft mb-4 flex items-center gap-2">
                  <span>📈</span> Rating History
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <div className="text-muted text-sm mb-1">Current Rating</div>
                    <div className="text-3xl font-bold text-primary">{profile.elo}</div>
                  </div>
                  <div>
                    <div className="text-muted text-sm mb-1">Peak Rating</div>
                    <div className="text-3xl font-bold text-violet-soft">{profile.peakRating}</div>
                  </div>
                </div>
              </div>

              {/* Recent Games Section with enhanced styling */}
              <div className="relative glass-box-lg shadow-xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
                <h2 className="text-xl font-bold text-primary-soft mb-4 flex items-center gap-2">
                  <span>📊</span> Recent Games
                </h2>
                <div className="relative text-center py-12">
                  <div className="inline-block p-4 bg-surface-2/50 rounded-full mb-4">
                    <div className="text-4xl">🎲</div>
                  </div>
                  <p className="text-white text-lg mb-2 font-medium">No recent games found</p>
                  <p className="text-muted text-sm">
                    {isOwnProfile
                      ? 'Start playing to see your game history!'
                      : `${profile.username} hasn't played any games recently.`}
                  </p>
                  {isOwnProfile && (
                    <button
                      type="button"
                      className="mt-4 px-6 py-2 text-white rounded-lg font-medium transition-all hover:scale-105 shadow-lg"
                      style={rankCallToActionStyle}
                    >
                      Start Playing
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <UserStats
              profileSummary={profile}
              isOwnProfile={isOwnProfile}
              username={profile?.username ?? username ?? undefined}
            />
          )}

          {profileExtrasEnabled && activeTab === 'matches' && (
            <div className="relative glass-box-xl shadow-xl text-center">
              <div className="text-5xl mb-4">🎮</div>
              <h2 className="text-2xl font-bold text-white mb-2">Match History Coming Soon</h2>
              <p className="text-muted">
                View detailed match history, replays, and game analytics.
              </p>
            </div>
          )}

          {profileExtrasEnabled && activeTab === 'achievements' && (
            <div className="relative glass-box-xl shadow-xl text-center">
              <div className="text-5xl mb-4">🏆</div>
              <h2 className="text-2xl font-bold text-white mb-2">Achievements Coming Soon</h2>
              <p className="text-muted">
                Unlock achievements, earn badges, and showcase your accomplishments.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
