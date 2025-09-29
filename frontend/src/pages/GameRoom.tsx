import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
import { logger } from '@/utils/logger'
import { RiskGameBoard } from '../components/RiskGameBoard'
import TeamAssignment from '../components/TeamAssignment'
import { Skeleton } from '../components/ui/Skeleton'
import { getColorDisplayName, getColorValue, PLAYER_COLORS } from '../constants/colors'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import audioService from '../services/audioService'
import { gameService } from '../services/gameService'
import { mapService } from '../services/mapService'
import { socketService } from '../services/socketService'
import { clearGame, fetchGameState } from '../store/gameSlice'
import { setCurrentRoom } from '../store/roomSlice'
import type { AIDifficulty } from '../types/game'
import { ensureReadableOnDark, extractFirstHexColor } from '../utils/color'
import { lazyWithRetry } from '../utils/lazyWithRetry'
import { hostDisplay, seatUsage } from '../utils/lobby'

const AI_DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  recruit: 'Recruit',
  commander: 'Commander',
  grandmaster: 'Grandmaster',
}

const AI_DIFFICULTY_DESCRIPTIONS: Record<AIDifficulty, string> = {
  recruit: 'Fast, forgiving baseline opponent',
  commander: 'Balanced with threat awareness',
  grandmaster: 'Advanced tactics and deeper lookahead',
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
  const { user } = useAppSelector((state) => state.auth)
  const [searchParams] = useSearchParams()
  const isSpectator = searchParams.get('spectate') === 'true'
  const [isRoomLoading, setIsRoomLoading] = useState(false)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(audioService.isMutedState())
  const [teamUpdating, setTeamUpdating] = useState(false)
  const [teamUpdateError, setTeamUpdateError] = useState<string | null>(null)
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
  const [aiSaving, setAiSaving] = useState(false)
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null)
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

  const currentPlayer = useMemo(() => {
    if (!currentRoom?.players || !user?.id) {
      return undefined
    }
    return currentRoom.players.find((player) => player.userId === user.id)
  }, [currentRoom?.players, user?.id])

  const isMember = Boolean(currentPlayer)

  const isHost = currentRoom?.hostId === user?.id

  const lobbyFull = Boolean(
    currentRoom && (currentRoom.players?.length ?? 0) >= currentRoom.maxPlayers,
  )

  const showTeamAssignment = useMemo(() => {
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

  const lobbyTeamPlayers = useMemo(
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

  const ratingToTier = useCallback(
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

  const romanNumeral = useCallback((index1: number) => {
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
  const aiSlotsRemaining = Math.max(0, maxAiCapacity - draftTotalAi)

  const hasAiChanges = useMemo(() => {
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

  const updateAiCount = useCallback(
    (difficulty: AIDifficulty, value: number) => {
      setAiDraftDirty(true)
      setAiErrorMessage(null)
      setAiDraftCounts((previous) => normalizeAiDraftCounts({ ...previous, [difficulty]: value }))
    },
    [normalizeAiDraftCounts],
  )

  const stepAiCount = useCallback(
    (difficulty: AIDifficulty, delta: number) => {
      setAiDraftDirty(true)
      setAiErrorMessage(null)
      setAiDraftCounts((previous) =>
        normalizeAiDraftCounts({ ...previous, [difficulty]: (previous[difficulty] ?? 0) + delta }),
      )
    },
    [normalizeAiDraftCounts],
  )

  const resetAiDraft = useCallback(() => {
    setAiDraftCounts(normalizeAiDraftCounts(existingAiCounts))
    setAiDraftDirty(false)
    setAiErrorMessage(null)
  }, [existingAiCounts, normalizeAiDraftCounts])

  const handleAiSave = useCallback(async () => {
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
  }, [currentRoom, dispatch, roomId])

  useEffect(() => {
    if (isMember) {
      setJoinError(null)
    }
  }, [isMember])

  useEffect(() => {
    if (!roomId) {
      return
    }

    if (currentGame && currentGame.roomId === roomId) {
      return
    }

    void dispatch(fetchGameState({ roomId, allowSpectate: isSpectator }))
  }, [currentGame, dispatch, isSpectator, roomId])

  const handleLeaveRoom = () => {
    navigate('/lobby')
  }

  const handleToggleMute = () => {
    audioService.toggleMute()
    setIsMuted(audioService.isMutedState())
  }

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

  const handleTeamChange = useCallback(
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-12 pt-8 lg:px-10">
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
          {isHost &&
            currentRoom.status === 'lobby' &&
            (currentRoom.players?.length || 0) >= currentRoom.maxPlayers && (
              <button
                type="button"
                className="btn btn-success"
                onClick={async () => {
                  if (!roomId) return
                  try {
                    await gameService.setReadyState(roomId, true)
                  } catch (err) {
                    logger.warn('Failed to trigger start via ready-state', err)
                  }
                }}
                title="Start game now"
              >
                Start Game
              </button>
            )}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-8">
        {/* Game Board */}
        <div className="lg:col-span-3">
          <div className="panel h-auto min-h-[clamp(520px,65vh,920px)] p-0">
            {currentGame ? (
              <RiskGameBoard
                mapId={currentRoom?.mapId || 'classic'}
                onTerritoryClick={(_territoryId) => {
                  // TODO: Handle territory interactions based on game phase
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
          <div
            ref={chatContainerRef}
            className="panel p-0 overflow-hidden"
            style={{ height: 'min(40vh, 460px)' }}
          >
            {roomId && user ? (
              shouldHydrateChat ? (
                <Suspense
                  fallback={
                    <div className="h-full flex items-center justify-center p-4">
                      <Skeleton variant="rectangular" width="100%" height="100%" />
                    </div>
                  }
                >
                  <LazyTabbedGameChat
                    gameId={currentRoom.id}
                    currentUserId={user.id}
                    userTeamId={currentGame?.players?.find((p) => p.userId === user.id)?.teamId}
                    className="h-full"
                  />
                </Suspense>
              ) : (
                <div className="h-full flex items-center justify-center p-4 text-sm text-muted">
                  Preparing chat…
                </div>
              )
            ) : null}
          </div>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <div className="panel space-y-5">
            <h3 className="text-lg font-semibold text-[color:var(--heading)]">
              Players ({currentRoom.players?.length || 0}/{currentRoom.maxPlayers})
            </h3>
            <ul className="list border border-border rounded-md overflow-hidden">
              {currentRoom.players?.map((player) => {
                const isCurrentUser = player.userId === user?.id
                const rawColor =
                  ((player as { selected_color?: string | null }).selected_color as
                    | string
                    | null) ||
                  (player.preferred_color as string | null) ||
                  null
                const colorValue = rawColor ? getColorValue(rawColor) : '#9CA3AF'
                const colorHex = extractFirstHexColor(colorValue) || '#9CA3AF'
                const usernameColor = ensureReadableOnDark(colorHex)
                const tier = ratingToTier(
                  typeof player.skill_rating === 'number' ? player.skill_rating : null,
                )
                const tierIndex = tier ? TIER_BOUNDS.findIndex((t) => t.name === tier.name) + 1 : 0
                return (
                  <li key={player.id} className="list-item last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex h-3.5 w-3.5 shrink-0 rounded-full border border-border"
                        style={{ background: colorValue }}
                        title={rawColor ? `Color: ${rawColor}` : undefined}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Name + badges */}
                        <div className="flex items-center gap-2">
                          {player.isAi || !player.userId ? (
                            <span
                              className={`truncate text-sm ${isCurrentUser ? 'font-semibold' : ''}`}
                              style={{ color: usernameColor }}
                            >
                              {player.username}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={`truncate text-sm underline-offset-2 hover:underline ${
                                isCurrentUser ? 'font-semibold' : ''
                              }`}
                              style={{ color: usernameColor }}
                              title={`View ${player.username}'s profile`}
                              onClick={() => setProfileUsername(player.username)}
                            >
                              {player.username}
                            </button>
                          )}
                          {player.userId === currentRoom.hostId && (
                            <span className="badge border-[color:var(--color-warning)] text-[color:var(--color-warning)]">
                              👑 Host
                            </span>
                          )}
                          {player.isAi && player.aiDifficulty && (
                            <span className="badge border-[color:var(--color-accent)] text-[color:var(--color-accent)]">
                              🤖 {AI_DIFFICULTY_LABELS[player.aiDifficulty]}
                            </span>
                          )}
                        </div>
                        {/* Row 2: Tier + rating + team */}
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span>
                            {tier ? `${tier.name} — Rank ${romanNumeral(tierIndex)}` : 'Unranked'}
                          </span>
                          {typeof player.skill_rating === 'number' && (
                            <span className="opacity-80">· {player.skill_rating} CP</span>
                          )}
                          {currentRoom.allowTeamPlay &&
                            currentRoom.teamMode !== 'none' &&
                            typeof player.teamId === 'number' &&
                            player.teamId > 0 && (
                              <span className="chip text-xs">Team {player.teamId}</span>
                            )}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {showAiControls && (
            <div className="panel space-y-4">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold text-[color:var(--heading)]">AI Opponents</h3>
                <span className="badge border-[color:var(--panel-border)] text-muted">
                  {aiPlayersInRoom.length}/{Math.max(0, maxAiCapacity)} slots filled
                </span>
              </div>
              {allowedAiDifficulties.length === 0 ? (
                <p className="text-xs text-muted">
                  No AI tiers are currently available. Enable an AI difficulty flag to add computer
                  opponents to this lobby.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted">
                    Reserve seats for AI.{' '}
                    {aiSlotsRemaining > 0
                      ? `${aiSlotsRemaining} open slot${aiSlotsRemaining === 1 ? '' : 's'} remaining.`
                      : 'All available AI slots are reserved. Remove one or free a player seat to add more.'}
                  </p>
                  <div className="space-y-3">
                    {allowedAiDifficulties.map((difficulty) => {
                      const label = AI_DIFFICULTY_LABELS[difficulty]
                      const description = AI_DIFFICULTY_DESCRIPTIONS[difficulty]
                      const count = aiDraftCounts[difficulty] ?? 0
                      const canDecrease = count > 0 && !aiSaving
                      const canIncrease = aiSlotsRemaining > 0 && !aiSaving
                      return (
                        <div
                          key={difficulty}
                          className="panel-outline flex items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-[color:var(--heading)]">
                              {label}
                            </div>
                            <p className="text-xs text-muted">{description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => stepAiCount(difficulty, -1)}
                              disabled={!canDecrease}
                              className="btn btn-secondary btn-icon"
                              aria-label={`Remove ${label} AI opponent`}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={maxAiCapacity}
                              value={count}
                              onChange={(event) => {
                                const nextValue = Number.parseInt(event.target.value, 10)
                                updateAiCount(
                                  difficulty,
                                  Number.isNaN(nextValue) ? 0 : Math.max(0, nextValue),
                                )
                              }}
                              className="form-input w-16 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => stepAiCount(difficulty, 1)}
                              disabled={!canIncrease}
                              className="btn btn-secondary btn-icon"
                              aria-label={`Add ${label} AI opponent`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {aiErrorMessage && (
                    <div className="panel border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)] text-xs text-[color:var(--color-danger)]">
                      {aiErrorMessage}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={resetAiDraft}
                      disabled={aiSaving || (!aiDraftDirty && !hasAiChanges)}
                      className="btn btn-secondary btn-sm"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={handleAiSave}
                      disabled={aiSaving || !hasAiChanges}
                      className="btn btn-primary btn-sm"
                    >
                      {aiSaving ? 'Saving...' : 'Save AI Slots'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {showTeamAssignment && currentRoom.numberOfTeams && currentRoom.numberOfTeams > 0 && (
            <div className="panel space-y-3">
              <TeamAssignment
                players={lobbyTeamPlayers}
                numberOfTeams={currentRoom.numberOfTeams}
                isHost={Boolean(isHost) && !teamUpdating}
                onTeamChange={handleTeamChange}
              />
              {teamUpdating && (
                <p className="text-xs text-[color:var(--color-primary-soft)]">
                  Updating team assignments...
                </p>
              )}
              {teamUpdateError && (
                <p className="text-xs text-[color:var(--color-danger)]">{teamUpdateError}</p>
              )}
            </div>
          )}

          {/* Contextual controls live inside RiskGameBoard -> GamePhaseControls; duplicate panel removed */}
        </div>
        {/* SR-only live region for announcements */}
        <div className="sr-only" aria-live="polite">
          {liveMessage}
        </div>
      </div>
      <PlayerProfileModal
        open={profileUsername !== null}
        username={profileUsername}
        onClose={() => setProfileUsername(null)}
      />
    </div>
  )
}
