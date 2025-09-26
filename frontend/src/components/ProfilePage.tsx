import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import friendsService, {
  type RelationshipInfo,
  type RelationshipStatus,
} from '@/services/friendsService'
import { ensureDirectConversation, messagesActions } from '@/store/messagesSlice'
import { getColorDisplayName, getColorValue, PLAYER_COLORS, type PlayerColor, PREMIUM_PLAYER_COLORS } from '../constants/colors'
import { FEATURE_FLAGS } from '../constants/featureFlags'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { type ProfileSummary, profileService } from '../services/profileService'
import type { RootState } from '../store'
import UserStats from './profile/UserStats'
import { CONQUEST_RANKS, getConquestRank } from './RankInsignia'
import { ensureReadableOnDark, extractFirstHexColor, getRelativeLuminance, hexToRgba, isGradientValue, lightenColor, mixColors } from '@/utils/color'

type TabType = 'overview' | 'stats' | 'matches' | 'achievements'

// color helpers moved to '@/utils/color'

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

  const heroGradientOverlay =
    'linear-gradient(160deg, rgba(15, 17, 23, 0.92) 0%, rgba(11, 14, 23, 0.78) 60%, rgba(9, 11, 18, 0.72) 100%)'

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
    // Signature-derived accents used in cards/headers/cta to avoid rank conflicts
    signatureHeaderAccentStyle: signatureIsGradient
      ? { backgroundImage: resolvedPreferredColor }
      : {
          backgroundImage: `linear-gradient(140deg, ${hexToRgba(
            ensureReadableOnDark(signatureHex),
            0.3,
          )} 0%, transparent 80%)`,
        },
    signatureCardStyle: {
      borderColor: hexToRgba(ensureReadableOnDark(signatureHex), 0.35),
      backgroundImage: `linear-gradient(180deg, ${hexToRgba(
        ensureReadableOnDark(signatureHex),
        0.2,
      )} 0%, rgba(12, 16, 27, 0.9) 90%)`,
    } as React.CSSProperties,
    signatureCallToActionStyle: signatureIsGradient
      ? { backgroundImage: resolvedPreferredColor }
      : {
          backgroundImage: `linear-gradient(90deg, ${hexToRgba(
            ensureReadableOnDark(signatureHex),
            0.95,
          )}, ${hexToRgba(ensureReadableOnDark(signatureHex), 0.7)})`,
        },
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
  const rankPrimaryHex = baseRankHex
  const rankAccentColor = ensureReadableOnDark(baseRankHex)
  const rankAccentSoft = lightenColor(rankAccentColor, 0.35)
  const rankAccentFaint = lightenColor(rankAccentColor, 0.65)
  const rankTextColor = getRelativeLuminance(rankPrimaryHex) > 0.55 ? '#0f172a' : '#F8FAFC'

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
    rankPrimaryHex,
    rankTextColor,
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
  const requestControllerRef = useRef<AbortController | null>(null)
  const comingSoonUiEnabled = useFeatureFlag(FEATURE_FLAGS.COMING_SOON_UI)
  const [relationship, setRelationship] = useState<RelationshipStatus>('none')
  const [friendSince, setFriendSince] = useState<string | undefined>(undefined)
  const [relBusy, setRelBusy] = useState<string>('')
  const dispatch = useAppDispatch()

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
    if (!comingSoonUiEnabled && (activeTab === 'matches' || activeTab === 'achievements')) {
      setActiveTab('overview')
    }
  }, [comingSoonUiEnabled, activeTab])

  const handleRefreshProfile = useCallback(() => {
    void fetchProfile()
  }, [fetchProfile])

  // Load relationship status when viewing another user's profile
  useEffect(() => {
    const run = async () => {
      try {
        if (!profile || isOwnProfile) return
        const info: RelationshipInfo = await friendsService.status(profile.id)
        setRelationship(info.status)
        setFriendSince(info.since)
      } catch (_e) {
        setRelationship('none')
        setFriendSince(undefined)
      }
    }
    void run()
  }, [profile, isOwnProfile])

  const sendFriendRequest = async () => {
    if (!profile) return
    setRelBusy('send')
    try {
      await friendsService.sendRequest(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setFriendSince(info.since)
    } finally {
      setRelBusy('')
    }
  }

  const cancelRequest = async () => {
    if (!profile) return
    setRelBusy('cancel')
    try {
      await friendsService.cancel(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setFriendSince(info.since)
    } finally {
      setRelBusy('')
    }
  }

  const acceptRequest = async () => {
    if (!profile) return
    setRelBusy('accept')
    try {
      await friendsService.accept(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setFriendSince(info.since)
    } finally {
      setRelBusy('')
    }
  }

  const declineRequest = async () => {
    if (!profile) return
    setRelBusy('decline')
    try {
      await friendsService.decline(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setFriendSince(info.since)
    } finally {
      setRelBusy('')
    }
  }

  const unfriend = async () => {
    if (!profile) return
    setRelBusy('unfriend')
    try {
      await friendsService.unfriend(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setFriendSince(info.since)
    } finally {
      setRelBusy('')
    }
  }

  const startDirectMessage = async () => {
    if (!profile) return
    setRelBusy('message')
    try {
      const detail = await dispatch(ensureDirectConversation(profile.id)).unwrap()
      dispatch(messagesActions.setActiveConversationId(detail.conversation.id))
    } catch (_e) {
      // noop
    } finally {
      setRelBusy('')
    }
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatLastActive = (dateString?: string | null): string => {
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
    signatureHeaderAccentStyle,
    signatureCardStyle,
    signatureCallToActionStyle,
  } = signatureVisuals

  const {
    rankDetails,
    nextRank,
    rawRankColor,
    rankColorIsGradient,
    rankAccentColor,
    rankAccentSoft,
    rankGlowStyle,
    rankProgressFill,
    rankProgress,
    ratingToNextRank,
    rankPrimaryHex,
    rankTextColor,
  } = rankVisuals

  // Removed header rank badge; rank appears only on the dedicated card

  // Shift avatar/card accents to signature color to reduce rank dominance
  const avatarRingStyle: React.CSSProperties = {
    borderColor: ensureReadableOnDark(signatureHex),
    boxShadow: `0 12px 32px ${hexToRgba(signatureHex, 0.28)}`,
    background: `linear-gradient(145deg, ${hexToRgba(signatureHex, 0.22)} 0%, transparent 70%)`,
  }

  const cardStyleNeutralToSignature: React.CSSProperties = signatureCardStyle

  const tabs: { id: TabType; label: string; icon: string; available: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: '👤', available: true },
    { id: 'stats', label: 'Statistics', icon: '📊', available: true },
  ]

  if (comingSoonUiEnabled) {
    tabs.push(
      { id: 'matches', label: 'Matches', icon: '🎮', available: true },
      { id: 'achievements', label: 'Achievements', icon: '🏆', available: true },
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-deep via-bg-alt to-bg-deep text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Profile Header Card with glass effect */}
        <div
          className="relative glass-box-lg shadow-2xl mb-8 overflow-hidden border"
          style={{ ...heroBackgroundStyle, borderColor: heroBorderColor }}
        >
                <div className="absolute inset-0 opacity-80 pointer-events-none" style={signatureGlowStyle} />
          <div
            className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-35 pointer-events-none"
            style={{ background: hexToRgba(signatureHex, 0.4) }}
          />
          <div className="relative flex flex-col sm:flex-row gap-6">
            {/* Avatar & identity section */}
            <div className="flex flex-col items-center sm:items-start gap-4">
              <div className="relative group">
                <div className="absolute -inset-4 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-60" style={signatureGlowStyle} />
                <div
                  className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 shadow-2xl transition-transform duration-300 group-hover:scale-105 backdrop-blur-sm"
                  style={avatarRingStyle}
                >
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-4xl sm:text-5xl font-bold text-white drop-shadow-lg"
                      style={signatureCrestStyle}
                    >
                      {profile.username?.[0]?.toUpperCase() ?? '👤'}
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
                  {premiumColorEntry
                    ? `${premiumColorEntry[0]} Colorway`
                    : preferredColorDisplayName}
                </span>
              </div>
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center sm:text-left space-y-5">
              <div>
                <h1
                  className="text-3xl sm:text-4xl font-bold mb-1 bg-clip-text text-transparent"
                  style={{
                    backgroundImage: `linear-gradient(120deg, ${hexToRgba(
                      ensureReadableOnDark(signatureHex),
                      0.95,
                    )}, ${hexToRgba(lightenColor(ensureReadableOnDark(signatureHex), 0.35), 0.6)})`,
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

              {!isOwnProfile && (
                <div className="flex gap-2 mt-2">
                  {relationship === 'friends' && friendSince && (
                    <div className="text-xs text-muted self-center">
                      Friends since {new Date(friendSince).toLocaleDateString()}
                    </div>
                  )}
                  {relationship === 'friends' && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={startDirectMessage}
                      disabled={relBusy === 'message'}
                    >
                      {relBusy === 'message' ? 'Opening…' : 'Message'}
                    </button>
                  )}
                  {relationship === 'none' && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={sendFriendRequest}
                      disabled={relBusy === 'send'}
                    >
                      {relBusy === 'send' ? 'Sending…' : 'Add Friend'}
                    </button>
                  )}
                  {relationship === 'pending_outgoing' && (
                    <>
                      <button type="button" className="btn btn-secondary" disabled>
                        Request Sent
                      </button>
                      <button
                        type="button"
                        className="btn btn-tertiary"
                        onClick={cancelRequest}
                        disabled={relBusy === 'cancel'}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {relationship === 'pending_incoming' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={acceptRequest}
                        disabled={relBusy === 'accept'}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn-tertiary"
                        onClick={declineRequest}
                        disabled={relBusy === 'decline'}
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {relationship === 'friends' && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={unfriend}
                      disabled={relBusy === 'unfriend'}
                    >
                      Unfriend
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Identity highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div
            className="relative glass-box-sm border p-5 overflow-hidden"
            style={{
              borderColor: hexToRgba(rankPrimaryHex, 0.45),
              backgroundImage: `linear-gradient(180deg, ${hexToRgba(rankPrimaryHex, 0.25)} 0%, rgba(12, 16, 27, 0.9) 90%)`,
            }}
          >
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
                backgroundImage: `linear-gradient(160deg, ${hexToRgba(
                  ensureReadableOnDark(signatureHex),
                  0.25,
                )} 0%, transparent 85%)`,
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
                {tab.available && comingSoonUiEnabled && isPreviewTab && (
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
                      style={signatureCallToActionStyle}
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

          {comingSoonUiEnabled && activeTab === 'matches' && (
            <div className="relative glass-box-xl shadow-xl text-center">
              <div className="text-5xl mb-4">🎮</div>
              <h2 className="text-2xl font-bold text-white mb-2">Match History Coming Soon</h2>
              <p className="text-muted">
                View detailed match history, replays, and game analytics.
              </p>
            </div>
          )}

          {comingSoonUiEnabled && activeTab === 'achievements' && (
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
