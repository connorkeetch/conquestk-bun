import type { TreasureConfig } from '@shared/types'
import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { GameOverModal } from '@/components/GameOverModal'
import { ConnectionBanner } from '@/components/game/ConnectionBanner'
import { GameActionBar } from '@/components/game/GameActionBar'
import { ResyncBanner } from '@/components/game/ResyncBanner'
import { TurnTimer } from '@/components/game/TurnTimer'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
/* Unused after merge cleanup
import RankInsignia from '@/components/RankInsignia'
import { toggleMuteUser } from '@/store/uiRoomSlice'
*/
import { logger } from '@/utils/logger'
import { PlayerStatsTable } from '../components/game/PlayerStatsTable'
import { RiskGameBoard } from '../components/RiskGameBoard'
import { Skeleton } from '../components/ui/Skeleton'
import { getColorDisplayName, getColorValue, PLAYER_COLORS } from '../constants/colors'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import audioService from '../services/audioService'
import { gameService } from '../services/gameService'
import { mapService } from '../services/mapService'
import { socketService } from '../services/socketService'
import { store } from '../store'
import { endTurn, undoLastPlacement } from '../store/gameActions'
import {
  clearGame,
  fetchGameState,
  selectTargetTerritory,
  selectTerritory,
  setPendingAction,
} from '../store/gameSlice'
import { setCurrentRoom } from '../store/roomSlice'
import { hydrateFromStorage, setDice, setOverlay } from '../store/uiRoomSlice'
import type { AIDifficulty } from '../types/game'
// import { ensureReadableOnDark, extractFirstHexColor } from '../utils/color'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import { hostDisplay, seatUsage } from '../utils/lobby'

const AI_DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  recruit: 'Recruit',
  commander: 'Commander',
  grandmaster: 'Grandmaster',
}

const AI_DIFFICULTY_ORDER: AIDifficulty[] = ['recruit', 'commander', 'grandmaster']

export default function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { currentRoom } = useAppSelector((state) => state.room)
  const {
    currentGame,
    isLoading: isGameLoading,
    error: gameError,
  } = useAppSelector((state) => state.game)
  const activeGameRoomId = currentGame?.roomId ?? null
  const { user } = useAppSelector((state) => state.auth)
  const [searchParams] = useSearchParams()
  const isSpectator = searchParams.get('spectate') === 'true'
  const [isRoomLoading, setIsRoomLoading] = useState(false)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(audioService.isMutedState())
  const [_teamUpdating, setTeamUpdating] = useState(false)
  const [_teamUpdateError, setTeamUpdateError] = useState<string | null>(null)
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const [selectedJoinColor, setSelectedJoinColor] = useState<string | null>(null)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  // AI opponents generally available in non-ranked lobbies (no flags)
  const [aiDraftCounts, setAiDraftCounts] = useState<Record<AIDifficulty, number>>({
    recruit: 0,
    commander: 0,
    grandmaster: 0,
  })
  const [aiDraftDirty, setAiDraftDirty] = useState(false)
  const [_aiSaving, setAiSaving] = useState(false)
  const [_aiErrorMessage, setAiErrorMessage] = useState<string | null>(null)
  const [mapPreview, setMapPreview] = useState<{
    imageUrl: string | null
    width?: number
    height?: number
    name?: string
    territoryCount?: number
  } | null>(null)
  const [mapPreviewLoading, setMapPreviewLoading] = useState(false)
  const [mapPreviewError, setMapPreviewError] = useState<string | null>(null)
  const [liveMessage, setLiveMessage] = useState('')
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false)
  const [showGameOver, setShowGameOver] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [mobileDrawerTab, setMobileDrawerTab] = useState<'actions' | 'chat'>('actions')
  const [resignDialogOpen, setResignDialogOpen] = useState(false)
  const resignDialogRef = useRef<HTMLDivElement | null>(null)
  const resignDialogTitleId = useId()
  const [rightRailOpen, setRightRailOpen] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('ui.rightRailOpen')
      if (raw === 'true') return true
      if (raw === 'false') return false
    } catch {
      // ignore storage errors (quota, privacy)
    }
    return true
  })
  const mobileDrawerId = useId()
  const lifecycleAutoFetchTimeoutRef = useRef<number | null>(null)
  const lifecycleAutoFetchInFlightRef = useRef(false)

  // Prevent background scroll when the bottom drawer is open
  useEffect(() => {
    if (!mobileDrawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileDrawerOpen])
  // AFK grace prompt state
  const graceActorUserId = useMemo(
    () =>
      (currentRoom as unknown as { graceActorUserId?: string | null })?.graceActorUserId ?? null,
    [currentRoom],
  )
  const graceExpiresAt = useMemo(
    () => (currentRoom as unknown as { graceExpiresAt?: string | null })?.graceExpiresAt ?? null,
    [currentRoom],
  )
  const isGraceActor = Boolean(user?.id && graceActorUserId && user.id === graceActorUserId)
  const [graceNow, setGraceNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (!isGraceActor || !graceExpiresAt) return
    const id = window.setInterval(() => setGraceNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [isGraceActor, graceExpiresAt])

  const replacementPendingUserId = useMemo(
    () =>
      (currentRoom as unknown as { replacementPendingUserId?: string | null })
        ?.replacementPendingUserId ?? null,
    [currentRoom],
  )
  const replacementPending = Boolean(replacementPendingUserId)

  const currentPlayer = useMemo(() => {
    if (!currentRoom?.players || !user?.id) {
      return undefined
    }
    return currentRoom.players.find((player) => player.userId === user.id)
  }, [currentRoom?.players, user?.id])

  // Open Game Over modal when game finishes
  useEffect(() => {
    if (currentGame?.phase === 'finished') {
      setShowGameOver(true)
    }
  }, [currentGame?.phase])

  const isMember = Boolean(currentPlayer)

  const isHost = currentRoom?.hostId === user?.id

  const lobbyFull = Boolean(
    currentRoom && (currentRoom.players?.length ?? 0) >= currentRoom.maxPlayers,
  )

  const _showTeamAssignment = useMemo(() => {
    if (!currentRoom) {
      return false
    }

    if (!currentRoom.allowTeamPlay) {
      return false
    }

    if (currentRoom.teamMode !== 'teams') {
      return false
    }

    return (currentRoom.numberOfTeams ?? 0) > 1
  }, [currentRoom])

  // Expiration display for lobby/initializing
  const expiresAtDate = useMemo(() => {
    if (!currentRoom) return null
    if (currentRoom.expiresAt) return new Date(currentRoom.expiresAt)
    const created = new Date(currentRoom.createdAt)
    return new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
  }, [currentRoom])

  const formatTimeUntil = useCallback((target?: Date | null) => {
    if (!target) return ''
    const ms = target.getTime() - Date.now()
    if (ms <= 0) return 'Expired'
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    if (days >= 1) return `Expires in ${days} day${days === 1 ? '' : 's'}`
    const hours = Math.floor(ms / (60 * 60 * 1000))
    if (hours >= 1) return `Expires in ${hours}h`
    const minutes = Math.floor(ms / (60 * 1000))
    return `Expires in ${minutes}m`
  }, [])

  const _lobbyTeamPlayers = useMemo(
    () =>
      (currentRoom?.players || []).map((player) => ({
        id: player.id,
        username: player.username,
        teamId: player.teamId ?? null,
        isAi: player.isAi,
        aiDifficulty: player.aiDifficulty ?? undefined,
      })),
    [currentRoom?.players],
  )

  const aiPlayersInRoom = useMemo(
    () => (currentRoom?.players ?? []).filter((player) => player.isAi),
    [currentRoom?.players],
  )

  const existingAiCounts = useMemo(() => {
    const counts: Record<AIDifficulty, number> = {
      recruit: 0,
      commander: 0,
      grandmaster: 0,
    }
    aiPlayersInRoom.forEach((player) => {
      const difficulty = (player.aiDifficulty ?? 'recruit') as AIDifficulty
      if (AI_DIFFICULTY_ORDER.includes(difficulty)) {
        counts[difficulty] += 1
      }
    })
    return counts
  }, [aiPlayersInRoom])

  const flaggedAiDifficulties = useMemo(
    () => ['recruit', 'commander', 'grandmaster'] as AIDifficulty[],
    [],
  )

  const allowedAiDifficulties = useMemo(() => {
    const allowed = new Set<AIDifficulty>(flaggedAiDifficulties)
    AI_DIFFICULTY_ORDER.forEach((difficulty) => {
      if (existingAiCounts[difficulty] > 0) {
        allowed.add(difficulty)
      }
    })
    return Array.from(allowed)
  }, [flaggedAiDifficulties, existingAiCounts])

  const humanPlayersCount = useMemo(
    () => currentRoom?.players?.filter((player) => !player.isAi)?.length ?? 0,
    [currentRoom?.players],
  )

  const mapDisplayName = currentRoom?.mapName || mapPreview?.name || null

  const mapPreviewAspectRatio = useMemo(() => {
    if (mapPreview?.width && mapPreview?.height) {
      return `${mapPreview.width}/${mapPreview.height}`
    }

    return undefined
  }, [mapPreview?.height, mapPreview?.width])

  // Tier mapping and roman numerals for rank display
  const TIER_BOUNDS = useMemo(
    () => [
      { name: 'Chieftain', min: 0, max: 599 },
      { name: 'Warlord', min: 600, max: 799 },
      { name: 'Raider King', min: 800, max: 999 },
      { name: 'Sultan', min: 1000, max: 1199 },
      { name: 'Caesar', min: 1200, max: 1399 },
      { name: 'Khan', min: 1400, max: 1599 },
      { name: 'Emperor', min: 1600, max: 1799 },
      { name: 'The Great King', min: 1800, max: 1999 },
      { name: 'Overlord', min: 2000, max: 2199 },
      { name: 'Worldbreaker', min: 2200, max: 9999 },
    ],
    [],
  )

  const _ratingToTier = useCallback(
    (rating: number | null | undefined) => {
      if (typeof rating !== 'number') return null
      return (
        TIER_BOUNDS.find((t) => rating >= t.min && rating <= t.max) ??
        TIER_BOUNDS.find((t) => t.name === 'Sultan') ??
        null
      )
    },
    [TIER_BOUNDS],
  )

  const _romanNumeral = useCallback((index1: number) => {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
    return romans[Math.max(1, Math.min(index1, romans.length)) - 1] ?? String(index1)
  }, [])

  useEffect(() => {
    let isActive = true
    const mapId = currentRoom?.mapId

    if (!mapId) {
      setMapPreview(null)
      setMapPreviewError(null)
      setMapPreviewLoading(false)
      return undefined
    }

    setMapPreviewLoading(true)
    setMapPreviewError(null)

    const loadMap = async () => {
      try {
        const data = await mapService.getMap(mapId)
        if (!isActive) {
          return
        }
        const preview = {
          imageUrl: data.map.imageUrl ?? null,
          width: data.map.imageWidth,
          height: data.map.imageHeight,
          name: data.map.name,
          territoryCount: Array.isArray(data.territories) ? data.territories.length : undefined,
        }
        setMapPreview(preview)
      } catch (error) {
        if (!isActive) {
          return
        }
        logger.error('Failed to load map preview', error)
        setMapPreview(null)
        setMapPreviewError('Unable to load map preview right now')
      } finally {
        if (isActive) {
          setMapPreviewLoading(false)
        }
      }
    }

    void loadMap()

    return () => {
      isActive = false
    }
  }, [currentRoom?.mapId])

  useEffect(() => {
    if (!inviteLinkCopied) return
    const t = window.setTimeout(() => setInviteLinkCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [inviteLinkCopied])

  const handleCopyInviteLink = useCallback(async () => {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : ''
      if (!url) return
      if (navigator?.share) {
        try {
          const shareTitle = currentRoom
            ? `${currentRoom.name}${
                typeof currentRoom.roomCode === 'number' ? ` — Room ${currentRoom.roomCode}` : ''
              }`
            : 'ConquestK Lobby'
          await navigator.share({ title: shareTitle, url })
          return
        } catch {
          // fall back to clipboard
        }
      }
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setInviteLinkCopied(true)
      }
    } catch (error) {
      logger.warn('Failed to copy invite link', error)
    }
  }, [currentRoom?.name, currentRoom?.roomCode, currentRoom])

  // Screen reader announcements for players joining/leaving
  useEffect(() => {
    const onJoined: Parameters<typeof socketService.on<'player-joined'>>[1] = (payload) => {
      if (!payload || payload.roomId !== currentRoom?.id) return
      const name = payload.player.username
      setLiveMessage(`${name} joined the lobby.`)
    }
    const onLeft: Parameters<typeof socketService.on<'player-left'>>[1] = (payload) => {
      if (!payload || payload.roomId !== currentRoom?.id) return
      setLiveMessage('A player left the lobby.')
    }
    socketService.on('player-joined', onJoined)
    socketService.on('player-left', onLeft)
    return () => {
      socketService.off('player-joined', onJoined)
      socketService.off('player-left', onLeft)
    }
  }, [currentRoom?.id])

  // Lazy-hydrate chat when visible or after idle
  const LazyTabbedGameChat = useMemo(
    () => lazyWithRetry(() => import('../components/chat/TabbedGameChat')),
    [],
  )
  const chatContainerRef = useRef<HTMLDivElement | null>(null)
  const [shouldHydrateChat, setShouldHydrateChat] = useState(false)
  useEffect(() => {
    if (shouldHydrateChat) return
    let hydrated = false
    const mark = () => {
      if (!hydrated) {
        hydrated = true
        setShouldHydrateChat(true)
      }
    }
    const el = chatContainerRef.current
    if ('IntersectionObserver' in window && el) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              io.disconnect()
              mark()
              break
            }
          }
        },
        { rootMargin: '120px' },
      )
      io.observe(el)
      type RIC = (cb: () => void, opts?: { timeout?: number }) => number
      const rIC = (window as unknown as { requestIdleCallback?: RIC }).requestIdleCallback
      const cIC = (window as unknown as { cancelIdleCallback?: (id: number) => void })
        .cancelIdleCallback
      const idleId =
        typeof rIC === 'function' ? rIC(mark, { timeout: 1200 }) : window.setTimeout(mark, 900)
      return () => {
        io.disconnect()
        if (typeof cIC === 'function') {
          cIC(idleId)
        } else {
          window.clearTimeout(idleId)
        }
      }
    }
    const t = window.setTimeout(mark, 600)
    return () => window.clearTimeout(t)
  }, [shouldHydrateChat])

  // Accessible Join dialog focus trap
  const joinDialogRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const joinDialogTitleId = useId()
  useEffect(() => {
    if (!joinDialogOpen) {
      previouslyFocusedRef.current?.focus()
      return
    }
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    const container = joinDialogRef.current
    if (!container) return
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    ;(first ?? container).focus()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setJoinDialogOpen(false)
        return
      }
      if (e.key === 'Tab') {
        if (focusable.length === 0) {
          e.preventDefault()
          return
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [joinDialogOpen])

  const roomMaxPlayers = currentRoom?.maxPlayers ?? 0
  const maxAiCapacity = useMemo(
    () => Math.max(0, roomMaxPlayers - humanPlayersCount),
    [roomMaxPlayers, humanPlayersCount],
  )

  // In-room AI controls are disabled; AI should be set at creation time
  const showAiControls = false

  const normalizeAiDraftCounts = useCallback(
    (counts: Record<AIDifficulty, number>): Record<AIDifficulty, number> => {
      const baseline: Record<AIDifficulty, number> = {
        recruit: 0,
        commander: 0,
        grandmaster: 0,
      }

      if (!showAiControls || allowedAiDifficulties.length === 0) {
        return baseline
      }

      const sanitized: Record<AIDifficulty, number> = { ...baseline }
      let total = 0

      allowedAiDifficulties.forEach((difficulty) => {
        const raw = counts[difficulty] ?? 0
        const value = Math.max(0, Math.trunc(raw))
        sanitized[difficulty] = value
        total += value
      })

      let overflow = total - maxAiCapacity
      if (overflow > 0) {
        const reductionOrder = [...AI_DIFFICULTY_ORDER].reverse()
        while (overflow > 0) {
          const target = reductionOrder.find(
            (difficulty) => allowedAiDifficulties.includes(difficulty) && sanitized[difficulty] > 0,
          )
          if (!target) {
            break
          }
          sanitized[target] -= 1
          overflow -= 1
        }
      }

      return sanitized
    },
    [allowedAiDifficulties, maxAiCapacity],
  )

  useEffect(() => {
    setAiDraftCounts((previous) => normalizeAiDraftCounts(previous))
  }, [normalizeAiDraftCounts])

  useEffect(() => {
    if (!showAiControls) {
      if (aiDraftDirty || aiPlayersInRoom.length === 0) {
        setAiDraftCounts({ recruit: 0, commander: 0, grandmaster: 0 })
        setAiDraftDirty(false)
        setAiErrorMessage(null)
      }
      return
    }

    if (!aiDraftDirty) {
      setAiDraftCounts(normalizeAiDraftCounts(existingAiCounts))
    }
  }, [aiDraftDirty, aiPlayersInRoom.length, existingAiCounts, normalizeAiDraftCounts])

  const draftTotalAi = allowedAiDifficulties.reduce(
    (sum, difficulty) => sum + (aiDraftCounts[difficulty] ?? 0),
    0,
  )
  const _aiSlotsRemaining = Math.max(0, maxAiCapacity - draftTotalAi)

  const _hasAiChanges = useMemo(() => {
    if (!showAiControls) {
      return false
    }
    return AI_DIFFICULTY_ORDER.some(
      (difficulty) => (aiDraftCounts[difficulty] ?? 0) !== (existingAiCounts[difficulty] ?? 0),
    )
  }, [aiDraftCounts, existingAiCounts])

  const buildAiOpponentPayload = useCallback(
    (counts: Record<AIDifficulty, number>) => {
      const payload: Array<{ difficulty: AIDifficulty; personalitySeed?: number | null }> = []
      allowedAiDifficulties.forEach((difficulty) => {
        const count = counts[difficulty] ?? 0
        for (let index = 0; index < count; index += 1) {
          payload.push({ difficulty })
        }
      })
      return payload
    },
    [allowedAiDifficulties],
  )

  const _updateAiCount = useCallback(
    (difficulty: AIDifficulty, value: number) => {
      setAiDraftDirty(true)
      setAiErrorMessage(null)
      setAiDraftCounts((previous) => normalizeAiDraftCounts({ ...previous, [difficulty]: value }))
    },
    [normalizeAiDraftCounts],
  )

  const _stepAiCount = useCallback(
    (difficulty: AIDifficulty, delta: number) => {
      setAiDraftDirty(true)
      setAiErrorMessage(null)
      setAiDraftCounts((previous) =>
        normalizeAiDraftCounts({ ...previous, [difficulty]: (previous[difficulty] ?? 0) + delta }),
      )
    },
    [normalizeAiDraftCounts],
  )

  const _resetAiDraft = useCallback(() => {
    setAiDraftCounts(normalizeAiDraftCounts(existingAiCounts))
    setAiDraftDirty(false)
    setAiErrorMessage(null)
  }, [existingAiCounts, normalizeAiDraftCounts])

  const _handleAiSave = useCallback(async () => {
    if (!currentRoom) {
      return
    }
    setAiSaving(true)
    setAiErrorMessage(null)
    try {
      const payload = buildAiOpponentPayload(normalizeAiDraftCounts(aiDraftCounts))
      const response = await gameService.updateAiOpponents(currentRoom.id, payload)
      if (response?.room) {
        dispatch(setCurrentRoom(response.room))
      }
      setAiDraftDirty(false)
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'response' in error) {
        const apiError = error as { response?: { data?: { message?: string } } }
        setAiErrorMessage(apiError.response?.data?.message ?? 'Failed to update AI opponents')
      } else if (error instanceof Error) {
        setAiErrorMessage(error.message)
      } else {
        setAiErrorMessage('Failed to update AI opponents')
      }
    } finally {
      setAiSaving(false)
    }
  }, [aiDraftCounts, buildAiOpponentPayload, currentRoom, dispatch, normalizeAiDraftCounts])

  const joinActionDisabled =
    joinSubmitting || !currentRoom || currentRoom.status !== 'lobby' || lobbyFull

  const joinButtonLabel = (() => {
    if (joinSubmitting) {
      return 'Joining...'
    }
    if (!currentRoom || currentRoom.status !== 'lobby') {
      return 'Spectate only'
    }
    if (lobbyFull) {
      return 'Lobby full'
    }
    return 'Join Game'
  })()

  const joinButtonTitle = (() => {
    if (joinSubmitting) {
      return 'Joining game...'
    }
    if (!currentRoom || currentRoom.status !== 'lobby') {
      return 'Game has already started'
    }
    if (lobbyFull) {
      return 'Lobby is full'
    }
    return 'Join this lobby'
  })()

  // Ready-check removed; joining implies ready

  const takenColors = useMemo(() => {
    const set = new Set<string>()
    for (const p of currentRoom?.players ?? []) {
      const c = (p as { selected_color?: string | null }).selected_color
      if (c && c.length > 0) set.add(c.toUpperCase())
    }
    return set
  }, [currentRoom?.players])

  // Open join dialog with preselected preferred color if available
  const openJoinDialog = useCallback(() => {
    if (!currentRoom || currentRoom.status !== 'lobby' || lobbyFull) return
    // Find preferred color
    // Pull from settings (preferred color stored elsewhere)
    try {
      const preferred = (JSON.parse(localStorage.getItem('userSettings') || '{}')?.game
        ?.preferredColor || null) as string | null
      let defaultColor: string | null = null
      if (preferred && !takenColors.has(preferred.toUpperCase())) {
        defaultColor = preferred
      } else {
        defaultColor = PLAYER_COLORS.find((hex) => !takenColors.has(hex.toUpperCase())) ?? null
      }
      setSelectedJoinColor(defaultColor)
    } catch {
      setSelectedJoinColor(PLAYER_COLORS.find((hex) => !takenColors.has(hex.toUpperCase())) ?? null)
    }
    setJoinDialogOpen(true)
  }, [currentRoom, lobbyFull, takenColors])

  useEffect(() => {
    if (!roomId) {
      navigate('/lobby')
      return
    }

    socketService.connect()
    // Load persisted UI prefs (e.g., animation speed)
    dispatch(hydrateFromStorage())

    return () => {
      dispatch(clearGame())
      dispatch(setCurrentRoom(null))
    }
  }, [dispatch, navigate, roomId])

  // Join the socket room only if the user is a member (or host) and not spectating
  useEffect(() => {
    if (!roomId || isSpectator || !isMember) {
      return
    }

    socketService.joinRoom(roomId)
    return () => {
      socketService.leaveRoom(roomId)
    }
  }, [roomId, isMember, isSpectator])

  useEffect(() => {
    if (!roomId) {
      return
    }

    if (
      currentRoom &&
      (currentRoom.id === roomId || String(currentRoom.roomCode ?? '') === roomId)
    ) {
      setRoomError(null)
      return
    }

    let isMounted = true

    const loadRoomDetails = async () => {
      setIsRoomLoading(true)
      try {
        const response = await gameService.getRoomDetails(roomId)
        if (!isMounted) {
          return
        }
        dispatch(setCurrentRoom(response.room))
        setRoomError(null)

        // Normalize route param to canonical UUID id, preserving query params
        const canonicalId = response.room.id
        if (roomId !== canonicalId) {
          const qs = searchParams.toString()
          navigate(`/room/${canonicalId}${qs ? `?${qs}` : ''}`, { replace: true })
        }
      } catch (error: unknown) {
        if (!isMounted) {
          return
        }
        let message = 'Failed to load room details'
        if (typeof error === 'object' && error && 'response' in error) {
          const apiError = error as { response?: { data?: { message?: string } } }
          message = apiError.response?.data?.message ?? message
        } else if (error instanceof Error) {
          message = error.message
        }
        setRoomError(message)
      } finally {
        if (isMounted) {
          setIsRoomLoading(false)
        }
      }
    }

    void loadRoomDetails()

    return () => {
      isMounted = false
    }
  }, [currentRoom, dispatch, roomId, navigate, searchParams])

  useEffect(() => {
    if (isMember) {
      setJoinError(null)
    }
  }, [isMember])

  useEffect(() => {
    if (!roomId) {
      return
    }

    if (activeGameRoomId === roomId) {
      return
    }

    void dispatch(fetchGameState({ roomId, allowSpectate: isSpectator }))
  }, [activeGameRoomId, dispatch, isSpectator, roomId])

  useEffect(() => {
    return () => {
      if (lifecycleAutoFetchTimeoutRef.current !== null) {
        window.clearTimeout(lifecycleAutoFetchTimeoutRef.current)
        lifecycleAutoFetchTimeoutRef.current = null
      }
      lifecycleAutoFetchInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!roomId) {
      if (lifecycleAutoFetchTimeoutRef.current !== null) {
        window.clearTimeout(lifecycleAutoFetchTimeoutRef.current)
        lifecycleAutoFetchTimeoutRef.current = null
      }
      lifecycleAutoFetchInFlightRef.current = false
      return
    }

    const status = currentRoom?.status ?? null
    const gameLoaded = activeGameRoomId === roomId

    if (status === null || status === 'lobby' || status === 'completed' || status === 'abandoned') {
      if (lifecycleAutoFetchTimeoutRef.current !== null) {
        window.clearTimeout(lifecycleAutoFetchTimeoutRef.current)
        lifecycleAutoFetchTimeoutRef.current = null
      }
      lifecycleAutoFetchInFlightRef.current = false
      return
    }

    if (gameLoaded) {
      if (lifecycleAutoFetchTimeoutRef.current !== null) {
        window.clearTimeout(lifecycleAutoFetchTimeoutRef.current)
        lifecycleAutoFetchTimeoutRef.current = null
      }
      return
    }

    const shouldAttemptFetch =
      status === 'initializing' || status === 'active' || status === 'paused'

    if (!shouldAttemptFetch) {
      return
    }

    if (lifecycleAutoFetchInFlightRef.current || lifecycleAutoFetchTimeoutRef.current !== null) {
      return
    }

    const attemptFetch = () => {
      lifecycleAutoFetchTimeoutRef.current = null

      if (lifecycleAutoFetchInFlightRef.current) {
        return
      }

      lifecycleAutoFetchInFlightRef.current = true

      void dispatch(fetchGameState({ roomId, allowSpectate: isSpectator }))
        .unwrap()
        .catch((error: unknown) => {
          if (error === 'NOT_READY') {
            const latestState = store.getState()
            const latestRoom = latestState.room.currentRoom
            if (
              latestRoom &&
              latestRoom.id === roomId &&
              (latestRoom.status === 'initializing' ||
                latestRoom.status === 'active' ||
                latestRoom.status === 'paused')
            ) {
              lifecycleAutoFetchTimeoutRef.current = window.setTimeout(attemptFetch, 750)
            }
            return
          }

          if (typeof error === 'string') {
            logger.error('Failed to fetch game state after lifecycle update', {
              roomId,
              error,
            })
            return
          }

          if (error instanceof Error) {
            logger.error('Failed to fetch game state after lifecycle update', {
              roomId,
              error: error.message,
            })
            return
          }

          logger.error('Failed to fetch game state after lifecycle update', {
            roomId,
            error,
          })
        })
        .finally(() => {
          lifecycleAutoFetchInFlightRef.current = false
        })
    }

    attemptFetch()
  }, [activeGameRoomId, currentRoom?.status, dispatch, isSpectator, roomId])

  const handleLeaveRoom = () => {
    navigate('/lobby')
  }

  const handleToggleMute = () => {
    audioService.toggleMute()
    setIsMuted(audioService.isMutedState())
  }

  // Keyboard shortcuts for quick gameplay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Read current state from store to avoid stale closures
      const state = store.getState()
      const currentRoom = state.room.currentRoom
      const currentGame = state.game.currentGame

      if (!currentRoom || !currentGame) return

      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      // Ignore if modifier keys are pressed (except allowed combos)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const key = e.key.toLowerCase()
      if (key === 'e' || key === 't') {
        e.preventDefault()
        dispatch(endTurn())
        return
      }
      // Dice 1/2/3
      if (key === '1' || key === '2' || key === '3') {
        e.preventDefault()
        dispatch(setDice(Number(key) as 1 | 2 | 3))
        return
      }
      // Mode intents
      if (key === 'a') {
        e.preventDefault()
        dispatch(setPendingAction('attack'))
        return
      }
      if (key === 'f') {
        e.preventDefault()
        dispatch(setPendingAction('fortify'))
        return
      }
      if (key === 'd') {
        e.preventDefault()
        dispatch(setPendingAction('deploy'))
        return
      }
      // Undo placement (Z key) - only in reinforcement phase
      if (key === 'z') {
        e.preventDefault()
        const phase = currentGame?.phase
        const hasUndo = state.uiRoom?.placementHistory && state.uiRoom.placementHistory.length > 0
        if (phase === 'reinforcement' && hasUndo) {
          dispatch(undoLastPlacement())
        } else {
          // Fallback to clear selection if not in reinforcement or no history
          dispatch(selectTerritory(null))
          dispatch(selectTargetTerritory(null))
          dispatch(setPendingAction(null))
        }
        return
      }
      // Escape to clear selection
      if (key === 'escape') {
        e.preventDefault()
        dispatch(selectTerritory(null))
        dispatch(selectTargetTerritory(null))
        dispatch(setPendingAction(null))
        return
      }
      // Toggle overlays
      if (key === 'g' || key === 'h') {
        e.preventDefault()
        const overlays = state.uiRoom?.overlays
        if (key === 'g') {
          dispatch(setOverlay({ key: 'continents', value: !overlays?.continents }))
        } else {
          dispatch(setOverlay({ key: 'threat', value: !overlays?.threat }))
        }
        return
      }
      // Focus last log/last action territory
      if (key === 'l') {
        e.preventDefault()
        const hist = state.game.territoryActionHistory
        const last = hist.length > 0 ? hist[hist.length - 1]?.territoryId : null
        if (last) dispatch(selectTerritory(last))
        return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dispatch])

  // No ready toggle; start triggers when lobby is full

  const handleConfirmJoin = useCallback(async () => {
    if (!roomId || isMember || !currentRoom || currentRoom.status !== 'lobby' || lobbyFull) {
      return
    }
    try {
      setJoinSubmitting(true)
      setJoinError(null)
      const response = await gameService.joinRoom(roomId, selectedJoinColor ?? undefined)
      if (response.room) {
        dispatch(setCurrentRoom(response.room))
      } else {
        const refreshed = await gameService.getRoomDetails(roomId)
        dispatch(setCurrentRoom(refreshed.room))
      }
      setJoinDialogOpen(false)
      await dispatch(fetchGameState({ roomId, allowSpectate: false }))
    } catch (error: unknown) {
      let message = 'Failed to join game'
      if (typeof error === 'object' && error !== null) {
        if ('response' in error) {
          const apiError = error as { response?: { data?: { message?: string } } }
          message = apiError.response?.data?.message ?? message
        } else if (
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
        ) {
          message = (error as { message: string }).message
        }
      } else if (error instanceof Error) {
        message = error.message
      }
      setJoinError(message)
    } finally {
      setJoinSubmitting(false)
    }
  }, [roomId, isMember, currentRoom, lobbyFull, dispatch, selectedJoinColor])

  const _handleTeamChange = useCallback(
    async (playerId: string, teamId: number) => {
      if (!roomId || !isHost) {
        return
      }

      const existingTeamId =
        currentRoom?.players?.find((player) => player.id === playerId)?.teamId ?? null

      if (existingTeamId === teamId) {
        return
      }

      try {
        setTeamUpdating(true)
        setTeamUpdateError(null)
        const response = await gameService.assignPlayerTeam(roomId, playerId, teamId)
        if (response?.room) {
          dispatch(setCurrentRoom(response.room))
        }
      } catch (error: unknown) {
        let message = 'Failed to update team assignment'
        if (typeof error === 'object' && error !== null) {
          if ('response' in error) {
            const apiError = error as { response?: { data?: { message?: string } } }
            message = apiError.response?.data?.message ?? message
          } else if (
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
          ) {
            message = (error as { message: string }).message
          }
        } else if (error instanceof Error) {
          message = error.message
        }

        setTeamUpdateError(message)
      } finally {
        setTeamUpdating(false)
      }
    },
    [roomId, dispatch, isHost, currentRoom],
  )

  if (roomError) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="max-w-md space-y-4 text-center">
          <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)] text-[color:var(--color-danger)]">
            {roomError}
          </div>
          <button type="button" onClick={() => navigate('/lobby')} className="btn btn-primary">
            Return to Lobby
          </button>
        </div>
      </div>
    )
  }

  if (isRoomLoading || !currentRoom) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="panel space-y-2 text-center">
          <div className="text-lg font-semibold text-[color:var(--heading)]">Loading room...</div>
          <p className="text-sm text-muted">Hang tight while we fetch the latest state.</p>
        </div>
      </div>
    )
  }

  if (isGameLoading && !currentGame) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="panel space-y-2 text-center">
          <div className="text-lg font-semibold text-[color:var(--heading)]">
            Loading game state...
          </div>
          <p className="text-sm text-muted">Preparing the board...</p>
        </div>
      </div>
    )
  }

  if (gameError && !currentGame) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)] text-center text-[color:var(--color-danger)]">
          {gameError}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-20 pt-8 lg:px-10">
      {/* Mini HUD for mobile */}
      {currentGame && (
        <div className="md:hidden fixed top-2 left-1/2 z-40 -translate-x-1/2">
          <button
            type="button"
            onClick={() => {
              setMobileDrawerOpen(true)
              setMobileDrawerTab('chat')
            }}
            className="flex items-center gap-2 rounded-full border border-border bg-surface-2/80 backdrop-blur px-4 py-2 text-sm shadow min-h-[44px]"
            title="Open sidebar"
            aria-controls={mobileDrawerId}
            aria-expanded={!!mobileDrawerOpen}
          >
            <span className="chip text-[10px]">
              {currentGame.phase.charAt(0).toUpperCase() + currentGame.phase.slice(1)}
            </span>
            <TurnTimer />
            {(() => {
              const p = currentGame.players.find((pl) => pl.id === currentGame.currentPlayer)
              return (
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full border border-white/50"
                    style={{ background: p?.color || '#9CA3AF' }}
                  />
                  <span className="max-w-[120px] truncate">{p?.username || 'Player'}</span>
                </span>
              )
            })()}
          </button>
        </div>
      )}
      <ConnectionBanner />
      <ResyncBanner roomId={currentRoom.id} allowSpectate={isSpectator} />
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-[color:var(--heading)]">
            {currentRoom.name}
            {typeof currentRoom.roomCode === 'number' ? ` — Room ${currentRoom.roomCode}` : ''}
          </h1>
          <p className="text-sm text-muted">
            Hosted by{' '}
            <span className="text-[color:var(--heading)]">{hostDisplay(currentRoom)}</span>
            <span className="mx-2 text-xs text-muted">•</span>
            {seatUsage(currentRoom).label}
            <span className="mx-2 text-xs text-muted">•</span>
            {currentRoom.isRanked ? 'Ranked match' : 'Casual lobby'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isMember && (
            <button
              onClick={() => openJoinDialog()}
              disabled={joinActionDisabled}
              type="button"
              title={joinButtonTitle}
              className="btn btn-primary"
            >
              {joinButtonLabel}
            </button>
          )}
          {/* Ready control removed; joining implies ready */}
          <button
            onClick={handleToggleMute}
            className="btn btn-ghost"
            type="button"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🔊'} {isMuted ? 'Unmute' : 'Mute'}
          </button>
          {(currentRoom.status === 'lobby' || currentRoom.status === 'initializing') && (
            <>
              <button
                onClick={() => void handleCopyInviteLink()}
                type="button"
                className="btn btn-secondary"
                title="Copy invite link"
                aria-live="polite"
              >
                {inviteLinkCopied ? 'Link copied ✓' : 'Copy Link'}
              </button>
              <button onClick={handleLeaveRoom} type="button" className="btn btn-danger">
                Leave Room
              </button>
            </>
          )}
        </div>
      </div>

      {joinError && (
        <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)] text-sm text-[color:var(--color-danger)]">
          {joinError}
        </div>
      )}

      {(currentRoom.status === 'lobby' || currentRoom.status === 'initializing') &&
        currentRoom.gameMode === 'assassination' && (
          <div className="panel border-[color:var(--color-accent)]/30 bg-[color:var(--surface-2)] text-sm text-[color:var(--heading)]">
            <div className="flex items-center gap-2 text-base font-semibold text-[color:var(--heading)]">
              <span aria-hidden>🎯</span>
              <span>Assassination rules</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              Eliminate the secret target assigned to you. The first hunter whose contract target
              falls wins instantly—even if another player delivers the finishing blow.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
              <li>Teams are disabled; every player is hunting solo.</li>
              <li>Your contract card appears as soon as the match begins.</li>
            </ul>
          </div>
        )}

      {(currentRoom.status === 'lobby' || currentRoom.status === 'initializing') &&
        currentRoom.gameMode === 'king_of_the_hill' && (
          <div className="panel border-[color:var(--color-warning)]/40 bg-[color:var(--surface-2)] text-sm text-[color:var(--heading)]">
            <div className="flex items-center gap-2 text-base font-semibold text-[color:var(--heading)]">
              <span aria-hidden>⛰️</span>
              <span>King of the Hill rules</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              Secure the highlighted territory to earn victory points at the end of each global
              turn. The first player—or team—to reach the target total wins the match.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
              <li>
                The hill starts heavily defended by neutral forces. Break through to claim it.
              </li>
              <li>Hold the hill through every player&apos;s turn to bank a point.</li>
              <li>
                Some lobbies rotate the hill periodically—watch the scoreboard for the next
                objective announcement.
              </li>
            </ul>
          </div>
        )}

      {/* Resign dialog */}
      {resignDialogOpen && currentRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            ref={resignDialogRef}
            className="panel w-full max-w-sm space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={resignDialogTitleId}
            tabIndex={-1}
          >
            <h2
              id={resignDialogTitleId}
              className="text-lg font-semibold text-[color:var(--heading)]"
            >
              Resign from game?
            </h2>
            <p className="text-sm text-muted">
              This will request to resign and set your territories to neutral. This action cannot be
              undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setResignDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  try {
                    socketService.emit('player:resign', { roomId: currentRoom.id })
                    const { addClientLog } =
                      require('../store/uiRoomSlice') as typeof import('../store/uiRoomSlice')
                    dispatch(
                      addClientLog({ text: 'You requested to resign.', roomId: currentRoom.id }),
                    )
                    toast.success('Resign requested')
                  } catch {
                    // ignore resign emit/logging failures
                  }
                  setResignDialogOpen(false)
                }}
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {joinDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            ref={joinDialogRef}
            className="panel w-full max-w-md space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={joinDialogTitleId}
            tabIndex={-1}
          >
            <h2
              id={joinDialogTitleId}
              className="text-lg font-semibold text-[color:var(--heading)]"
            >
              Choose your color
            </h2>
            <p className="text-sm text-muted">
              Each player must pick a unique color for this game.
            </p>
            <div className="grid grid-cols-6 gap-2">
              {PLAYER_COLORS.map((hex) => {
                const taken = takenColors.has(hex.toUpperCase())
                const isSelected = selectedJoinColor?.toUpperCase() === hex.toUpperCase()
                return (
                  <button
                    key={hex}
                    type="button"
                    className={`h-8 w-8 rounded-full border ${
                      isSelected ? 'ring-2 ring-white' : ''
                    } ${taken ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                    style={{
                      background: getColorValue(hex),
                      borderColor: 'rgba(255,255,255,0.25)',
                    }}
                    onClick={() => {
                      if (!taken) setSelectedJoinColor(hex)
                    }}
                    disabled={taken}
                    aria-label={`Select color ${hex}`}
                    title={taken ? 'Already taken' : 'Available'}
                  />
                )
              })}
            </div>
            {selectedJoinColor && (
              <div className="text-xs text-muted">
                Selected:{' '}
                <span className="text-white">{getColorDisplayName(selectedJoinColor)}</span> (
                {selectedJoinColor})
              </div>
            )}
            {joinError && (
              <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)] text-xs text-[color:var(--color-danger)]">
                {joinError}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setJoinDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleConfirmJoin()}
                disabled={joinSubmitting || !selectedJoinColor}
              >
                {joinSubmitting ? 'Joining…' : 'Join Game'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No ready errors expected */}

      <div className="flex flex-col gap-6">
        {/* Game Board - full width */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="panel flex-1 p-0 overflow-hidden">
            {currentGame ? (
              <RiskGameBoard
                mapId={currentRoom?.mapId || 'classic'}
                onTerritoryClick={(_territoryId) => {
                  // TODO: Handle territory interactions based on game phase
                }}
              />
            ) : currentRoom ? (
              <RiskGameBoard
                mapId={currentRoom.mapId || 'classic'}
                lobbyMode={true}
                lobbyPlayers={
                  currentRoom.players?.map((p) => ({
                    id: p.id,
                    username: p.username,
                    // biome-ignore lint/suspicious/noExplicitAny: Lobby snapshot still exposes legacy snake_case color field
                    color: (p as any).selected_color || p.preferred_color || '#9CA3AF',
                  })) || []
                }
                onTerritoryClick={(_territoryId) => {
                  // No interaction in lobby mode
                }}
              />
            ) : (
              <div className="flex h-full flex-col">
                <div
                  className="relative flex flex-1 items-center justify-center overflow-hidden bg-[color:var(--surface-2)] p-6"
                  style={mapPreviewAspectRatio ? { aspectRatio: mapPreviewAspectRatio } : undefined}
                >
                  {mapPreviewLoading ? (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--color-accent)] border-t-transparent"></div>
                      <p className="text-sm text-muted">Loading map preview...</p>
                    </div>
                  ) : mapPreview?.imageUrl ? (
                    <img
                      src={mapPreview.imageUrl}
                      alt={
                        mapDisplayName
                          ? `Map preview for ${mapDisplayName}`
                          : 'Selected map preview'
                      }
                      className="max-h-full max-w-full object-contain"
                      style={
                        mapPreviewAspectRatio ? { aspectRatio: mapPreviewAspectRatio } : undefined
                      }
                    />
                  ) : (
                    <div className="px-6 text-center text-muted">
                      <p>{mapPreviewError ?? 'Map preview will appear once it is ready.'}</p>
                    </div>
                  )}
                  {mapDisplayName && (
                    <div className="pointer-events-none absolute left-6 top-6 rounded-full bg-black/65 px-4 py-1 text-sm font-medium text-white backdrop-blur">
                      {mapDisplayName}
                      {typeof mapPreview?.territoryCount === 'number' &&
                        mapPreview.territoryCount > 0 && (
                          <span className="ml-2 text-xs text-white/80">
                            · {mapPreview.territoryCount}{' '}
                            {mapPreview.territoryCount === 1 ? 'territory' : 'territories'}
                          </span>
                        )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center justify-center gap-3 px-6 pb-6 pt-4 text-center">
                  <h2 className="text-xl font-semibold text-[color:var(--heading)]">
                    Waiting for game to start...
                  </h2>
                  <p className="text-sm text-muted">
                    {(() => {
                      const total = currentRoom.maxPlayers
                      const joined = currentRoom.players?.length || 0
                      const needed = Math.max(0, total - joined)
                      return needed > 0
                        ? `Need ${needed} more ${needed === 1 ? 'player' : 'players'} to begin`
                        : `All players present • ${joined}/${total}`
                    })()}
                  </p>
                  {(currentRoom.status === 'lobby' || currentRoom.status === 'initializing') && (
                    <p
                      className="text-xs text-muted"
                      title={
                        expiresAtDate ? `Expires ${expiresAtDate.toLocaleString()}` : undefined
                      }
                    >
                      {formatTimeUntil(expiresAtDate)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Player Stats & Chat Row - below map */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Player Stats */}
          {currentGame ? (
            <PlayerStatsTable
              players={currentGame.players || []}
              currentPlayerId={currentGame.currentPlayer}
              territories={Object.fromEntries(
                (currentGame.board || []).map((t) => [t.id, { owner: t.owner }]),
              )}
            />
          ) : (
            <div className="panel space-y-3">
              <h3 className="text-sm font-semibold text-[color:var(--heading)]">
                Players ({currentRoom.players?.length || 0}/{currentRoom.maxPlayers})
              </h3>
              <ul className="space-y-1">
                {currentRoom.players?.map((player) => {
                  const rawColor =
                    ((player as { selected_color?: string | null }).selected_color as
                      | string
                      | null) ||
                    (player.preferred_color as string | null) ||
                    null
                  const colorValue = rawColor ? getColorValue(rawColor) : '#9CA3AF'
                  return (
                    <li
                      key={player.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[color:var(--surface-2)]"
                    >
                      <div
                        className="w-3 h-3 rounded-full border border-[color:var(--panel-border)] shrink-0"
                        style={{ backgroundColor: colorValue }}
                      />
                      <span className="text-sm text-[color:var(--text)] truncate">
                        {player.username}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Chat & Log panel */}
          {currentGame && (
            <div className="panel p-0 overflow-hidden shrink-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <h3 className="text-sm font-semibold text-[color:var(--heading)]">Chat & Log</h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    try {
                      localStorage.setItem('ui.rightRailOpen', String(!rightRailOpen))
                    } catch {
                      // ignore storage errors
                    }
                    setRightRailOpen((v) => !v)
                  }}
                  title={rightRailOpen ? 'Collapse' : 'Expand'}
                >
                  {rightRailOpen ? 'Hide' : 'Show'}
                </button>
              </div>
              {rightRailOpen && (
                <div ref={chatContainerRef} style={{ height: 'min(40vh, 400px)' }}>
                  {roomId && user ? (
                    shouldHydrateChat ? (
                      <Suspense
                        fallback={
                          <div className="h-40 flex items-center justify-center p-4">
                            <Skeleton variant="rectangular" width="100%" height="100%" />
                          </div>
                        }
                      >
                        <LazyTabbedGameChat
                          gameId={currentRoom.id}
                          currentUserId={user.id}
                          userTeamId={
                            currentGame?.players?.find((p) => p.userId === user.id)?.teamId
                          }
                          className="h-full"
                          onLogFocus={(territories) => {
                            const focus = territories[territories.length - 1]
                            if (focus) dispatch(selectTerritory(focus))
                          }}
                        />
                      </Suspense>
                    ) : (
                      <div className="h-40 flex items-center justify-center p-4 text-sm text-muted">
                        Preparing chat…
                      </div>
                    )
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Removed duplicate player list section and AI controls - now only showing once in left rail */}
        {/* SR-only live region for announcements */}
        <div className="sr-only" aria-live="polite">
          {liveMessage}
        </div>
      </div>
      {/* AFK grace action bar for the next player */}
      {isGraceActor && graceExpiresAt && (
        <div className="fixed inset-x-0 bottom-14 z-40 mx-auto max-w-[1200px] px-2">
          <div className="flex items-center justify-between gap-3 rounded-md bg-[color:var(--surface-2)]/90 px-3 py-2 text-sm shadow">
            <div>
              {(() => {
                const targetId = currentRoom?.currentTurnUserId
                const player = currentRoom?.players?.find((p) => (p.userId ?? p.id) === targetId)
                const targetName = player?.username ?? 'A player'
                const expireMs = Date.parse(graceExpiresAt)
                const remaining = Math.max(0, expireMs - graceNow)
                const seconds = Math.ceil(remaining / 1000)
                return (
                  <>
                    {targetName} is AFK. Decide before timer runs out.
                    <span className="ml-2 text-[color:var(--color-warning)]">{seconds}s</span>
                  </>
                )
              })()}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  currentRoom && socketService.emit('afk:remind', { roomId: currentRoom.id })
                }
                className="btn btn-secondary btn-sm"
                type="button"
              >
                Remind
              </button>
              <button
                onClick={() =>
                  currentRoom && socketService.emit('afk:skip', { roomId: currentRoom.id })
                }
                className="btn btn-danger btn-sm"
                type="button"
              >
                Skip Turn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host replacement decision prompt */}
      {isHost && replacementPending && (
        <div className="fixed inset-x-0 bottom-24 z-40 mx-auto max-w-[1200px] px-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[color:var(--surface-2)]/90 px-3 py-2 text-sm shadow">
            <div className="flex items-center gap-2">
              <strong>Replacement needed:</strong>
              <span>
                {(() => {
                  const targetId = replacementPendingUserId
                  const player = currentRoom?.players?.find((p) => (p.userId ?? p.id) === targetId)
                  return player?.username ?? 'Kicked player'
                })()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  currentRoom &&
                  replacementPendingUserId &&
                  socketService.emit('host:replacement', {
                    roomId: currentRoom.id,
                    targetUserId: replacementPendingUserId,
                    choice: 'neutral',
                  })
                }
                className="btn btn-danger btn-sm"
                type="button"
              >
                Set Neutral
              </button>
              {(['recruit', 'commander', 'grandmaster'] as AIDifficulty[]).map((diff) => (
                <button
                  key={diff}
                  onClick={() =>
                    currentRoom &&
                    replacementPendingUserId &&
                    socketService.emit('host:replacement', {
                      roomId: currentRoom.id,
                      targetUserId: replacementPendingUserId,
                      choice: 'ai',
                      aiDifficulty: diff,
                    })
                  }
                  className="btn btn-secondary btn-sm"
                  type="button"
                  title={`Replace with ${AI_DIFFICULTY_LABELS[diff]}`}
                >
                  AI: {AI_DIFFICULTY_LABELS[diff]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Desktop action bar */}
      {currentGame && (
        <div className="hidden md:block">
          <GameActionBar />
        </div>
      )}

      {/* Mobile FAB */}
      {currentGame && (
        <button
          type="button"
          className="md:hidden fixed z-50 rounded-full bg-[color:var(--color-primary)] text-white shadow-lg px-4 py-3"
          onClick={() => setMobileDrawerOpen((v) => !v)}
          title={mobileDrawerOpen ? 'Close drawer' : 'Open actions/chat'}
          style={{
            bottom: 'calc(1rem + env(safe-area-inset-bottom))',
            right: 'calc(1rem + env(safe-area-inset-right))',
          }}
        >
          {mobileDrawerOpen ? '✕' : mobileDrawerTab === 'actions' ? '⚔️ Actions' : '💬 Chat'}
        </button>
      )}

      {/* Mobile backdrop */}
      {currentGame && (
        <button
          className={`md:hidden fixed inset-0 ${mobileDrawerOpen ? 'block' : 'hidden'}`}
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setMobileDrawerOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setMobileDrawerOpen(false)
          }}
          type="button"
          aria-label="Close actions/chat drawer"
        />
      )}

      {/* Mobile bottom drawer */}
      {currentGame && (
        <div
          id={mobileDrawerId}
          className={`md:hidden fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${mobileDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="rounded-t-xl border border-border bg-surface-1 shadow-2xl"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
              paddingLeft: 'calc(env(safe-area-inset-left) + 12px)',
              paddingRight: 'calc(env(safe-area-inset-right) + 12px)',
            }}
          >
            <div className="flex items-center justify-between px-3 pt-2">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/30" />
            </div>
            <div className="flex items-center gap-2 px-3 pb-2">
              <button
                type="button"
                className={`btn btn-ghost btn-sm ${mobileDrawerTab === 'actions' ? 'ring-1 ring-white' : ''}`}
                onClick={() => setMobileDrawerTab('actions')}
              >
                ⚔️ Actions
              </button>
              <button
                type="button"
                className={`btn btn-ghost btn-sm ${mobileDrawerTab === 'chat' ? 'ring-1 ring-white' : ''}`}
                onClick={() => setMobileDrawerTab('chat')}
              >
                💬 Chat
              </button>
              <div className="ml-auto pr-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-2 pb-3">
              {mobileDrawerTab === 'actions' ? (
                <GameActionBar mode="inline" />
              ) : roomId && user ? (
                shouldHydrateChat ? (
                  <Suspense
                    fallback={
                      <div className="h-40 flex items-center justify-center p-4">
                        <Skeleton variant="rectangular" width="100%" height="100%" />
                      </div>
                    }
                  >
                    <LazyTabbedGameChat
                      gameId={currentRoom.id}
                      currentUserId={user.id}
                      userTeamId={currentGame?.players?.find((p) => p.userId === user.id)?.teamId}
                      className="h-full"
                      onLogFocus={(territories) => {
                        const focus = territories[territories.length - 1]
                        if (focus) dispatch(selectTerritory(focus))
                      }}
                    />
                  </Suspense>
                ) : (
                  <div className="h-40 flex items-center justify-center p-4 text-sm text-muted">
                    Preparing chat…
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Post-game results modal */}
      {showGameOver && currentGame && (
        <GameOverModal
          isOpen={showGameOver}
          winner={(() => {
            const alive = currentGame.players.find((p) => !p.isEliminated)
            return alive ?? null
          })()}
          eliminatedPlayers={currentGame.players.filter((p) => p.isEliminated).map((p) => p.id)}
          onClose={() => setShowGameOver(false)}
          onBackToMenu={() => navigate('/lobby')}
          roomId={currentRoom?.id}
          onNewGame={async () => {
            try {
              if (!currentRoom) return
              const aiOpponents = (currentRoom.players ?? [])
                .filter((p) => p.isAi)
                .map((p) => ({
                  difficulty: (p.aiDifficulty ?? 'recruit') as AIDifficulty,
                  personalitySeed:
                    typeof p.aiPersonalitySeed === 'number' ? p.aiPersonalitySeed : undefined,
                }))

              const payload = {
                name: `${currentRoom.name} (Rematch)`,
                maxPlayers: currentRoom.maxPlayers,
                isPrivate: currentRoom.isPrivate,
                isRanked: currentRoom.isRanked ?? false,
                mapId: currentRoom.mapId ?? undefined,
                movementType: currentRoom.movementType ?? undefined,
                fogOfWar: currentRoom.fogOfWar ?? undefined,
                turnTimerSeconds: currentRoom.turnTimerSeconds ?? undefined,
                aiOpponents,
                teamMode: (currentRoom.teamMode ?? 'none') as 'none' | 'teams' | 'auto_balance',
                numberOfTeams: currentRoom.numberOfTeams ?? undefined,
                treasureConfig: (currentRoom as unknown as { treasureConfig?: unknown })
                  .treasureConfig as Partial<TreasureConfig> | undefined,
              }
              const res = await gameService.createRoom(payload)
              const newRoomId =
                (res?.room?.id as string | undefined) ?? (res?.id as string | undefined)
              if (newRoomId) {
                setShowGameOver(false)
                navigate(`/room/${newRoomId}`)
              }
            } catch (e) {
              logger.error('Failed to create rematch room', e)
            }
          }}
          newGameLabel="Rematch Same Seats"
        />
      )}

      <PlayerProfileModal
        open={profileUsername !== null}
        username={profileUsername}
        onClose={() => setProfileUsername(null)}
      />
    </div>
  )
}
