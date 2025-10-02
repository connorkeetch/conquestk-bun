import type React from 'react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'

import friendsService, {
  type RelationshipInfo,
  type RelationshipStatus,
} from '@/services/friendsService'
import { ensureDirectConversation, messagesActions } from '@/store/messagesSlice'
import {
  ensureReadableOnDark,
  extractFirstHexColor,
  getRelativeLuminance,
  hexToRgba,
  isGradientValue,
  lightenColor,
  pickTextOnColor,
  // mixColors,
} from '@/utils/color'
import {
  getColorDisplayName,
  getColorValue,
  PLAYER_COLORS,
  type PlayerColor,
  PREMIUM_PLAYER_COLORS,
} from '../constants/colors'
import { FEATURE_FLAGS } from '../constants/featureFlags'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import {
  type MatchHistoryEntry,
  type ProfileSummary,
  profileService,
} from '../services/profileService'
import type { RootState } from '../store'
import AchievementsPanel from './profile/AchievementsPanel'
import UserStats from './profile/UserStats'
import { CONQUEST_RANKS, getConquestRank, getRankTierInfo } from './RankInsignia'

type TabType = 'overview' | 'stats' | 'friends' | 'matches' | 'achievements'

// color helpers moved to '@/utils/color'

const MATCH_HISTORY_PAGE_SIZE = 10

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

  // const heroGradientOverlay =
  //   'linear-gradient(160deg, rgba(15, 17, 23, 0.92) 0%, rgba(11, 14, 23, 0.78) 60%, rgba(9, 11, 18, 0.72) 100%)'

  // Neutralize hero background; avoid tinting whole card with signature color
  const heroBackgroundStyle: React.CSSProperties = {
    backgroundImage:
      'linear-gradient(160deg, rgba(15,17,23,0.92) 0%, rgba(11,14,23,0.86) 60%, rgba(9,11,18,0.82) 100%)',
  }

  const heroBorderColor = 'rgba(255,255,255,0.08)'

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
    // Keep crest glow available for internal badges only; not used on hero
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

  const {
    index: rankTierIndex,
    label: rankTierLabel,
    total: totalRankTiers,
  } = getRankTierInfo({
    minRating: rankDetails.minRating,
    rating: profile.elo,
  })
  const rankSegmentsFilled = Math.min(rankTierIndex + 1, totalRankTiers)

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
    rankTierLabel,
    rankSegmentsFilled,
    totalRankTiers,
  }
}

const ProfilePage: React.FC = () => {
  const { username } = useParams<{ username: string }>()
  const { user: currentUser } = useAppSelector((state) => state.auth)
  const [searchParams] = useSearchParams()
  const settings = useAppSelector((state) => state.settings)
  const [profile, setProfile] = useState<ProfileSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const requestControllerRef = useRef<AbortController | null>(null)
  const comingSoonUiEnabled = useFeatureFlag(FEATURE_FLAGS.COMING_SOON_UI)
  const profileExtrasEnabled = useFeatureFlag(FEATURE_FLAGS.PROFILE_EXTRAS)
  const [relationship, setRelationship] = useState<RelationshipStatus>('none')
  const [friendSince, setFriendSince] = useState<string | undefined>(undefined)
  const [mutual, setMutual] = useState<{
    total: number
    users: Array<{ userId: string; username: string }>
  } | null>(null)
  const [relBusy, setRelBusy] = useState<string>('')
  const dispatch = useAppDispatch()
  const [friendsTabLoading, setFriendsTabLoading] = useState(false)
  const [friendsList, setFriendsList] = useState<
    Array<{ userId: string; username: string; since?: string }>
  >([])
  const [compareFriend, setCompareFriend] = useState<{
    userId: string
    username: string
    loading: boolean
    error?: string | null
    profile?: ProfileSummary | null
  } | null>(null)
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([])
  const [matchHistoryLoading, setMatchHistoryLoading] = useState(false)
  const [matchHistoryError, setMatchHistoryError] = useState<string | null>(null)
  const [matchHistoryHasMore, setMatchHistoryHasMore] = useState(false)
  const [matchHistoryInitialized, setMatchHistoryInitialized] = useState(false)
  const matchHistoryRequestRef = useRef<AbortController | null>(null)
  const matchHistoryOffsetRef = useRef(0)
  // Bio editing state
  const BIO_MAX = 160
  const [editingBio, setEditingBio] = useState(false)
  const [bioDraft, setBioDraft] = useState('')
  const [bioSaving, setBioSaving] = useState(false)
  const bioTextareaId = useId()

  const isOwnProfile = currentUser?.username === username

  const matchSummary = useMemo(() => {
    const gamesPlayed = profile?.gamesPlayed ?? 0
    const wins = profile?.wins ?? 0
    const losses = profile ? Math.max(0, gamesPlayed - wins) : 0
    const winRate =
      profile?.winRate ?? (gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 1000) / 10 : 0)

    const durations = matchHistory
      .map((entry) =>
        entry.durationMinutes && entry.durationMinutes > 0 ? entry.durationMinutes : null,
      )
      .filter((value): value is number => value !== null)

    const averageDuration =
      durations.length > 0
        ? Math.round((durations.reduce((acc, value) => acc + value, 0) / durations.length) * 10) /
          10
        : null

    const recentRecord = matchHistory.slice(0, 5)
    const recentWins = recentRecord.filter((entry) => entry.result === 'won').length
    const recentLosses = recentRecord.filter((entry) => entry.result === 'lost').length

    return {
      gamesPlayed,
      wins,
      losses,
      winRate,
      averageDuration,
      recentRecord,
      recentWins,
      recentLosses,
    }
  }, [profile, matchHistory])

  const formatMatchDuration = (minutes: number | null) => {
    if (minutes === null || Number.isNaN(minutes)) {
      return '—'
    }

    if (minutes < 1) {
      return '<1 min'
    }

    if (minutes < 60) {
      return `${Math.round(minutes)} min`
    }

    const hours = Math.floor(minutes / 60)
    const remainingMinutes = Math.round(minutes % 60)

    if (remainingMinutes <= 0) {
      return `${hours} hr`
    }

    return `${hours} hr ${remainingMinutes} min`
  }

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
    setMatchHistory([])
    setMatchHistoryHasMore(false)
    setMatchHistoryError(null)
    setMatchHistoryInitialized(false)
    matchHistoryOffsetRef.current = 0
    matchHistoryRequestRef.current?.abort()
    matchHistoryRequestRef.current = null
    if (!username) {
      return
    }
  }, [username])

  useEffect(() => {
    return () => {
      matchHistoryRequestRef.current?.abort()
    }
  }, [])

  // Keep bio draft in sync with loaded profile
  useEffect(() => {
    setBioDraft(profile?.bio ?? '')
  }, [profile?.bio])

  // Pick initial tab from query string if provided
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'overview' || t === 'stats' || t === 'friends') {
      setActiveTab(t)
    }
  }, [searchParams])

  useEffect(() => {
    if (!comingSoonUiEnabled && activeTab === 'achievements') {
      setActiveTab('overview')
    }
  }, [comingSoonUiEnabled, activeTab])

  // Load friends/followers data for Friends tab
  useEffect(() => {
    const load = async () => {
      if (activeTab !== 'friends' || !profile) return
      setFriendsTabLoading(true)
      try {
        if (isOwnProfile) {
          const friends = await friendsService.listFriends()
          setFriendsList(friends)
        } else {
          const mf = await friendsService.mutual(profile.id, 50)
          setFriendsList(mf.users.map((u) => ({ userId: u.userId, username: u.username })))
        }
      } catch (_e) {
        setFriendsList([])
      } finally {
        setFriendsTabLoading(false)
      }
    }
    void load()
  }, [activeTab, isOwnProfile, profile])

  const handleCompare = async (userId: string, username: string) => {
    setCompareFriend({ userId, username, loading: true, error: null, profile: null })
    try {
      const other = await profileService.getProfileByUsername(username)
      setCompareFriend({ userId, username, loading: false, error: null, profile: other })
    } catch (_e) {
      setCompareFriend({
        userId,
        username,
        loading: false,
        error: 'Failed to load profile',
        profile: null,
      })
    }
  }

  const closeCompare = () => setCompareFriend(null)

  const handleRefreshProfile = useCallback(() => {
    void fetchProfile()
  }, [fetchProfile])

  const fetchMatchHistory = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {
      if (!username) {
        return
      }

      if (reset) {
        matchHistoryOffsetRef.current = 0
        setMatchHistory([])
        setMatchHistoryHasMore(false)
        setMatchHistoryError(null)
      }

      setMatchHistoryInitialized(true)
      matchHistoryRequestRef.current?.abort()
      const controller = new AbortController()
      matchHistoryRequestRef.current = controller

      try {
        setMatchHistoryLoading(true)
        const response = await profileService.getMatchHistory(username, {
          limit: MATCH_HISTORY_PAGE_SIZE,
          offset: reset ? 0 : matchHistoryOffsetRef.current,
          isOwnProfile,
          signal: controller.signal,
        })

        if (controller.signal.aborted) {
          return
        }

        setMatchHistory((prev) => (reset ? response.matches : [...prev, ...response.matches]))
        matchHistoryOffsetRef.current = response.nextOffset
        setMatchHistoryHasMore(response.hasMore)
        setMatchHistoryError(null)
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        setMatchHistoryError('Unable to load match history right now. Please try again soon.')
        if (reset) {
          matchHistoryOffsetRef.current = 0
        }
      } finally {
        if (!controller.signal.aborted) {
          setMatchHistoryLoading(false)
        }
        if (matchHistoryRequestRef.current === controller) {
          matchHistoryRequestRef.current = null
        }
      }
    },
    [username, isOwnProfile],
  )

  // Load relationship status when viewing another user's profile
  useEffect(() => {
    const run = async () => {
      try {
        if (!profile || isOwnProfile) return
        const info: RelationshipInfo = await friendsService.status(profile.id)
        setRelationship(info.status)
        setFriendSince(info.since)
        const mf = await friendsService.mutual(profile.id, 6)
        setMutual(mf)
      } catch (_e) {
        setRelationship('none')
        setFriendSince(undefined)
        setMutual(null)
      }
    }
    void run()
  }, [profile, isOwnProfile])

  useEffect(() => {
    if (activeTab === 'matches' && profile && !matchHistoryInitialized) {
      void fetchMatchHistory({ reset: true })
      return () => {
        matchHistoryRequestRef.current?.abort()
      }
    }

    if (activeTab !== 'matches') {
      matchHistoryRequestRef.current?.abort()
    }
  }, [activeTab, profile, matchHistoryInitialized, fetchMatchHistory])

  const sendFriendRequest = async () => {
    if (!profile) return
    setRelBusy('send')
    try {
      await friendsService.sendRequest(profile.id)
      const info = await friendsService.status(profile.id)
      setRelationship(info.status)
      setFriendSince(info.since)
      const mf = await friendsService.mutual(profile.id, 6)
      setMutual(mf)
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
      const mf = await friendsService.mutual(profile.id, 6)
      setMutual(mf)
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
      const mf = await friendsService.mutual(profile.id, 6)
      setMutual(mf)
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
      const mf = await friendsService.mutual(profile.id, 6)
      setMutual(mf)
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
      const mf = await friendsService.mutual(profile.id, 6)
      setMutual(mf)
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
      // Open the inbox drawer globally
      const { openInbox } = await import('@/store/uiSlice')
      dispatch(openInbox())
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
    heroBackgroundStyle,
    heroBorderColor,
    preferredColorDisplayName,
    premiumColorEntry,
    signatureHex,
    signatureCallToActionStyle,
  } = signatureVisuals
  const signatureColorName = premiumColorEntry
    ? getColorDisplayName(premiumColorEntry[1].solid)
    : preferredColorDisplayName

  const {
    rankDetails,
    nextRank,
    rankAccentColor,
    rankHeaderAccentStyle,
    rankProgressFill,
    rankProgress,
    ratingToNextRank,
    rankPrimaryHex,
    rankTierLabel,
    rankSegmentsFilled,
    totalRankTiers,
  } = rankVisuals

  const rankTierIds = Array.from({ length: totalRankTiers }, (_, i) => `rank-tier-${i}`)

  // Removed header rank badge; rank appears only on the dedicated card

  // Neutral avatar ring; avoid large signature color usage
  const avatarRingStyle: React.CSSProperties = {
    borderColor: 'rgba(255,255,255,0.15)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
    background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, transparent 70%)',
  }

  // signatureCardStyle applied inline where needed; remove unused local alias

  const tabs: { id: TabType; label: string; icon: string; available: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: '👤', available: true },
    { id: 'stats', label: 'Statistics', icon: '📊', available: true },
    { id: 'friends', label: 'Friends', icon: '🤝', available: true },
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
        {/* Profile Header Card with glass effect */}
        <div
          className="relative glass-box-lg shadow-2xl mb-8 overflow-hidden border"
          style={{ ...heroBackgroundStyle, borderColor: heroBorderColor }}
        >
          {/* Removed signature glow across whole hero for clarity */}
          <div
            className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-35 pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          />
          <div className="relative flex flex-col sm:flex-row gap-6">
            {/* Avatar & identity section */}
            <div className="flex flex-col items-center sm:items-start gap-4">
              <div className="relative group">
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
              {/* Removed separate signature color chip; moved inline with stats below */}
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
                  {profile.tagline && profile.tagline.trim().length > 0
                    ? profile.tagline
                    : premiumColorEntry
                      ? premiumColorEntry[1].description
                      : 'Commander of the Conquest Realms'}
                </p>
                {/* Rank summary under username */}
                <div className="mt-2 flex flex-col items-center gap-3 text-sm sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <span className="text-xl" title="Rank insignia">
                      {rankDetails.insignia}
                    </span>
                    <span className="font-semibold">{rankDetails.name}</span>
                    <span className="font-semibold text-white/70">{rankTierLabel}</span>
                  </div>
                  <div className="flex w-full flex-col items-center gap-1 text-muted sm:w-auto sm:items-start">
                    <div
                      className="flex items-center justify-center gap-1 sm:justify-start"
                      role="img"
                      aria-label={`${rankSegmentsFilled} of ${totalRankTiers} rank tiers completed`}
                    >
                      {rankTierIds.map((tierId, index) => (
                        <span
                          key={tierId}
                          className="h-1.5 w-6 rounded-full transition-all duration-300"
                          style={
                            index < rankSegmentsFilled
                              ? {
                                  background: rankProgressFill,
                                  boxShadow: `0 0 6px ${hexToRgba(rankAccentColor, 0.4)}`,
                                }
                              : { backgroundColor: 'rgba(255,255,255,0.12)' }
                          }
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 text-xs uppercase tracking-[0.35em] text-muted">
                <span className="flex items-center gap-1">
                  <span className="text-lg">🎯</span>
                  {profile.elo} CP
                </span>
                <span className="hidden sm:inline text-white/30">•</span>
                <span className="flex items-center gap-1">
                  <span className="text-lg">🌠</span>
                  Peak {profile.peakRating}
                </span>
                <span className="hidden sm:inline text-white/30">•</span>
                <span className="flex items-center gap-2">
                  <span className="text-lg">🎨</span>
                  <span
                    className="px-2 py-0.5 rounded-full border text-[10px] tracking-wide"
                    style={(() => {
                      const text = pickTextOnColor(ensureReadableOnDark(signatureHex))
                      return signatureColorSwatchStyle.backgroundImage
                        ? ({
                            // gradient signature color
                            backgroundImage: signatureColorSwatchStyle.backgroundImage,
                            color: text,
                            borderColor: hexToRgba(ensureReadableOnDark(signatureHex), 0.4),
                          } as React.CSSProperties)
                        : ({
                            backgroundColor: signatureHex,
                            color: text,
                            borderColor: hexToRgba(ensureReadableOnDark(signatureHex), 0.4),
                          } as React.CSSProperties)
                    })()}
                  >
                    Signature Color: {signatureColorName}
                  </span>
                </span>
              </div>

              {/* Bio */}
              {isOwnProfile ? (
                editingBio ? (
                  <div className="p-4 rounded-xl bg-surface-2/60 border border-white/10 backdrop-blur-sm">
                    <label className="block text-sm text-muted mb-2" htmlFor={bioTextareaId}>
                      Your Bio
                    </label>
                    <textarea
                      className="form-textarea w-full resize-y min-h-[96px]"
                      id={bioTextareaId}
                      maxLength={BIO_MAX}
                      value={bioDraft}
                      onChange={(e) => setBioDraft(e.target.value)}
                      placeholder="Share a short intro, e.g. favorite maps or playstyle."
                    />
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span
                        className={
                          bioDraft.length > BIO_MAX
                            ? 'text-[color:var(--color-danger)]'
                            : 'text-muted'
                        }
                      >
                        {Math.min(bioDraft.length, BIO_MAX)} / {BIO_MAX}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setEditingBio(false)
                            setBioDraft(profile?.bio ?? '')
                          }}
                          disabled={bioSaving}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={async () => {
                            const next = bioDraft.trim()
                            if (next.length === 0 || next.length > BIO_MAX) return
                            try {
                              setBioSaving(true)
                              await profileService.updateMyProfile({ bio: next })
                              setProfile((prev) => (prev ? { ...prev, bio: next } : prev))
                              setEditingBio(false)
                            } catch (_e) {
                              // noop; could surface a toast in the future
                            } finally {
                              setBioSaving(false)
                            }
                          }}
                          disabled={
                            bioSaving ||
                            bioDraft.trim().length === 0 ||
                            bioDraft.trim().length > BIO_MAX
                          }
                        >
                          {bioSaving ? 'Saving…' : 'Save Bio'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : profile.bio && profile.bio.trim().length > 0 ? (
                  <div className="p-4 rounded-xl bg-surface-2/60 border border-white/10 backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-muted text-base leading-relaxed whitespace-pre-line flex-1">
                        {profile.bio}
                      </p>
                      <button
                        type="button"
                        className="btn btn-tertiary btn-sm"
                        onClick={() => setEditingBio(true)}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-surface-2/60 border border-dashed border-white/10 backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-muted text-base leading-relaxed">
                        Introduce yourself to other commanders. Add a short bio to share your
                        playstyle and favorite strategies.
                      </p>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setEditingBio(true)}
                      >
                        Add Bio
                      </button>
                    </div>
                  </div>
                )
              ) : profile.bio && profile.bio.trim().length > 0 ? (
                <div className="p-4 rounded-xl bg-surface-2/60 border border-white/10 backdrop-blur-sm">
                  <p className="text-muted text-base leading-relaxed whitespace-pre-line">
                    {profile.bio}
                  </p>
                </div>
              ) : null}

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
              {!isOwnProfile && friendSince && (
                <div className="mt-2 text-xs text-muted">
                  Friends since {new Date(friendSince).toLocaleDateString()}
                </div>
              )}
              {!isOwnProfile && mutual && mutual.total > 0 && (
                <div className="mt-2 text-sm text-muted">
                  Mutual friends ({mutual.total}):{' '}
                  {mutual.users.map((u, i) => (
                    <span key={u.userId}>
                      {u.username}
                      {i < mutual.users.length - 1 ? ', ' : ''}
                    </span>
                  ))}
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
                  <span>{profile.elo} CP</span>
                  <span>{nextRank.minRating} CP</span>
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
                    ? `${ratingToNextRank} CP to reach ${nextRank.name}.`
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
              Joined {formatDate(profile.joinDate)} · Peak CP {profile.peakRating}
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
                  <span>📈</span> CP History
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <div className="text-muted text-sm mb-1">Current CP</div>
                    <div className="text-3xl font-bold text-primary">{profile.elo}</div>
                  </div>
                  <div>
                    <div className="text-muted text-sm mb-1">Peak CP</div>
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

          {activeTab === 'friends' && (
            <div className="relative glass-box-xl shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🤝</span>
                  {isOwnProfile ? 'Your Friends' : `Friends with ${profile.username}`}
                </h2>
                {!isOwnProfile && mutual?.total !== undefined && (
                  <span className="text-sm text-muted">Mutual: {mutual?.total ?? 0}</span>
                )}
              </div>
              {compareFriend && (
                <div className="mb-4 glass-box-sm border border-white/10 bg-surface-2/70 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-muted">Comparing</div>
                      <div className="text-lg font-semibold text-white">
                        {profile.username} vs {compareFriend.username}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-tertiary btn-sm"
                      onClick={closeCompare}
                    >
                      ✖ Close
                    </button>
                  </div>
                  {compareFriend.loading ? (
                    <div className="text-muted mt-3">Loading comparison…</div>
                  ) : compareFriend.error ? (
                    <div className="text-danger mt-3">{compareFriend.error}</div>
                  ) : compareFriend.profile ? (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(() => {
                        const other = compareFriend.profile as NonNullable<
                          typeof compareFriend.profile
                        >
                        const base = profile
                        const metric = (
                          label: string,
                          lhs: number,
                          rhs: number,
                          formatter: (n: number) => string = (n) => String(n),
                        ) => {
                          const delta = rhs - lhs
                          const up = delta > 0
                          const same = delta === 0
                          return (
                            <div className="p-3 rounded-lg bg-surface-3/40 border border-white/10">
                              <div className="text-xs uppercase tracking-wide text-muted mb-1">
                                {label}
                              </div>
                              <div className="text-white text-sm font-semibold">
                                {formatter(lhs)} <span className="text-white/40">→</span>{' '}
                                {formatter(rhs)}
                              </div>
                              {!same && (
                                <div
                                  className={up ? 'text-green-400 text-xs' : 'text-red-400 text-xs'}
                                >
                                  {up ? '▲' : '▼'} {formatter(Math.abs(delta))}
                                </div>
                              )}
                              {same && <div className="text-muted text-xs">No change</div>}
                            </div>
                          )
                        }
                        return (
                          <>
                            {metric('CP', base.elo, other.elo)}
                            {metric(
                              'Win Rate %',
                              Math.round(base.winRate),
                              Math.round(other.winRate),
                              (n) => `${n}%`,
                            )}
                            {metric('Games Played', base.gamesPlayed, other.gamesPlayed)}
                            {metric('Peak CP', base.peakRating, other.peakRating)}
                          </>
                        )
                      })()}
                    </div>
                  ) : null}
                </div>
              )}
              {friendsTabLoading ? (
                <div className="text-center text-muted py-8">Loading friends...</div>
              ) : friendsList.length === 0 ? (
                <div className="text-center text-muted py-8">
                  {isOwnProfile
                    ? 'No friends yet. Find players in the Community tab!'
                    : 'No mutual friends to show.'}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {friendsList.map((f) => (
                    <div
                      key={f.userId}
                      className="glass-box-sm flex items-center justify-between p-3 border border-white/10 bg-surface-2/70"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-surface-3 text-xs flex items-center justify-center border border-white/10">
                          {f.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <Link
                            to={`/profile/${f.username}`}
                            className="font-semibold hover:underline"
                          >
                            {f.username}
                          </Link>
                          {f.since && (
                            <div className="text-[11px] text-muted">
                              Since {new Date(f.since).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/profile/${f.username}?tab=stats`}
                          className="btn btn-tertiary btn-sm"
                          title="View stats"
                        >
                          📊 Stats
                        </Link>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCompare(f.userId, f.username)}
                          title={`Compare ${profile.username} with ${f.username}`}
                        >
                          ⚖️ Compare
                        </button>
                        {isOwnProfile && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              // lazy open DM via existing helper
                              void (async () => {
                                try {
                                  const detail = await dispatch(
                                    ensureDirectConversation(f.userId),
                                  ).unwrap()
                                  dispatch(
                                    messagesActions.setActiveConversationId(detail.conversation.id),
                                  )
                                  const { openInbox } = await import('@/store/uiSlice')
                                  dispatch(openInbox())
                                } catch {
                                  // ignore failures to open inbox
                                }
                              })()
                            }}
                          >
                            💬 Message
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'matches' && profile && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                    <span>🎮</span>
                    Battle Ledger
                  </h2>
                  <p className="text-sm text-muted">
                    {isOwnProfile
                      ? 'Track your latest conquests, win streaks, and match pacing.'
                      : `A quick look at ${profile.username}'s recent campaigns.`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void fetchMatchHistory({ reset: true })}
                    disabled={matchHistoryLoading}
                  >
                    {matchHistoryLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-box-sm p-5 border border-white/10 bg-surface-2/70">
                  <p className="text-xs uppercase tracking-[0.35em] text-muted">Total Battles</p>
                  <p className="text-3xl font-bold text-white mt-2">{matchSummary.gamesPlayed}</p>
                  <p className="text-sm text-muted mt-2">
                    {matchSummary.gamesPlayed > 0
                      ? `${matchSummary.wins} victories · ${matchSummary.losses} defeats`
                      : isOwnProfile
                        ? 'Jump into a game to start your campaign.'
                        : `${profile.username} has not recorded a battle yet.`}
                  </p>
                </div>

                <div className="glass-box-sm p-5 border border-primary/20 bg-gradient-to-br from-primary/20 via-transparent to-transparent">
                  <p className="text-xs uppercase tracking-[0.35em] text-muted">Win Rate</p>
                  <p className="text-3xl font-bold text-white mt-2">
                    {matchSummary.gamesPlayed > 0 ? `${matchSummary.winRate.toFixed(1)}%` : '—'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="px-2 py-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                      {matchSummary.recentWins} recent wins
                    </span>
                    <span className="px-2 py-1 rounded-full border border-rose-400/30 bg-rose-500/10 text-rose-200">
                      {matchSummary.recentLosses} recent losses
                    </span>
                  </div>
                </div>

                <div className="glass-box-sm p-5 border border-white/10 bg-surface-2/70">
                  <p className="text-xs uppercase tracking-[0.35em] text-muted">Tempo</p>
                  <p className="text-3xl font-bold text-white mt-2">
                    {matchSummary.averageDuration
                      ? formatMatchDuration(matchSummary.averageDuration)
                      : '—'}
                  </p>
                  <p className="text-sm text-muted mt-2">
                    {matchSummary.averageDuration
                      ? 'Average duration of your recent matches.'
                      : 'We need a few completed matches to analyze pacing.'}
                  </p>
                </div>
              </div>

              {matchHistoryLoading && matchHistory.length === 0 ? (
                <div className="glass-box p-6 text-center text-muted">
                  <div className="text-4xl mb-3 animate-pulse">🔄</div>
                  <p>Loading match history…</p>
                </div>
              ) : matchHistoryError ? (
                <div className="p-5 border border-red-500/30 bg-red-500/10 rounded-xl text-red-200 text-sm">
                  <div className="font-semibold mb-2">Could not load matches</div>
                  <p className="mb-3">{matchHistoryError}</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void fetchMatchHistory({ reset: true })}
                    disabled={matchHistoryLoading}
                  >
                    Try again
                  </button>
                </div>
              ) : matchHistory.length === 0 ? (
                <div className="glass-box p-6 text-center text-muted">
                  <div className="text-4xl mb-3">🧭</div>
                  <p>
                    {isOwnProfile
                      ? 'No battles on record yet. Your first conquest will appear here.'
                      : `${profile.username} has not logged any public matches yet.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {matchSummary.recentRecord.length > 0 && (
                    <div className="glass-box-sm p-4 border border-white/10 bg-surface-2/70">
                      <p className="text-xs uppercase tracking-[0.35em] text-muted mb-2">
                        Recent streak
                      </p>
                      <div className="flex gap-2">
                        {matchSummary.recentRecord.map((entry, index) => (
                          <span
                            key={`${entry.gameId}-${index}`}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                              entry.result === 'won'
                                ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40'
                                : 'bg-rose-500/15 text-rose-200 border-rose-400/40'
                            }`}
                          >
                            {entry.result === 'won' ? 'Victory' : 'Defeat'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {matchHistory.map((match) => {
                      const startedAt = match.startedAt ? new Date(match.startedAt) : null
                      const endedAt = match.endedAt ? new Date(match.endedAt) : null
                      const startedLabel = startedAt
                        ? startedAt.toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : 'Unknown start'
                      const statusLabel = match.status
                        ? match.status.replace(/_/g, ' ').toUpperCase()
                        : 'UNKNOWN'

                      return (
                        <div
                          key={`${match.gameId}-${match.startedAt ?? 'unknown'}`}
                          className="glass-box-sm border border-white/10 bg-surface-2/70 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <span>{match.result === 'won' ? '🏆' : '⚔️'}</span>
                                {match.gameName ?? 'Unnamed Battle'}
                              </h3>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-2">
                                <span>{startedLabel}</span>
                                <span className="hidden sm:inline text-white/20">•</span>
                                <span>
                                  {match.gameMode
                                    ? match.gameMode.replace(/_/g, ' ')
                                    : 'Mode unknown'}
                                </span>
                                {endedAt && (
                                  <>
                                    <span className="hidden sm:inline text-white/20">•</span>
                                    <span>{formatMatchDuration(match.durationMinutes)}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                                  match.result === 'won'
                                    ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40'
                                    : 'bg-rose-500/15 text-rose-200 border-rose-400/40'
                                }`}
                              >
                                {match.result === 'won' ? 'Victory' : 'Defeat'}
                              </span>
                              <span className="text-xs uppercase tracking-[0.35em] text-muted">
                                {statusLabel}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {matchHistoryHasMore && (
                    <div className="text-center">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void fetchMatchHistory()}
                        disabled={matchHistoryLoading}
                      >
                        {matchHistoryLoading ? 'Loading…' : 'Load more matches'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {profileExtrasEnabled && activeTab === 'achievements' && (
            <div className="relative glass-box-xl shadow-xl">
              <AchievementsPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
