import { Clock, Gamepad2, Trophy } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryParam } from '@/hooks/useQueryParam'
import { formatTurnTimer as formatTurnTimerWord } from '@/utils/lobby'
import { logger } from '@/utils/logger'
import { GameCardSkeleton, SkeletonGroup } from '../components/ui/Skeleton'
import { useAppSelector } from '../hooks/redux'
import api from '../services/api'
import authService from '../services/authService'
import { gameService } from '../services/gameService'
import type { GameRoom } from '../types/gameRoom'

interface GameInfo {
  id: string
  name: string
  status: GameRoom['status']
  playerCount: number
  maxPlayers: number
  roomCode?: number
  isYourTurn?: boolean
  winner?: string | null
  createdAt: string
}

type RawLobbyRoom = GameRoom & {
  is_ranked?: boolean
  current_players?: number | string
  turnTimerSeconds?: number | string | null
  turn_timer?: number | string | null
  fogOfWar?: string | null
  fog_of_war?: string | null
  cardTradeMode?: string | null
  card_trade_mode?: string | null
  bonusType?: string | null
  bonus_type?: string | null
}

type NormalizedLobbyRoom = GameRoom & {
  isRanked?: boolean
  playerCount?: number
  currentPlayers?: number
  turnTimerSeconds?: number
  fogOfWar?: 'off' | 'adjacent' | 'persistent'
  cardTradeMode?: string | null
  bonusType?: string | null
}

type LobbyFilters = {
  showFull: boolean
  showInProgress: boolean
  minPlayers: number
  maxPlayers: number
  gameType: 'all' | 'casual' | 'ranked'
  gameMode: 'all' | string
  map: 'all' | string
  teamPreference: 'all' | 'ffa' | 'teams'
}

const DEFAULT_LOBBY_FILTERS: LobbyFilters = {
  showFull: true,
  showInProgress: true,
  minPlayers: 2,
  maxPlayers: 12,
  gameType: 'all',
  gameMode: 'all',
  map: 'all',
  teamPreference: 'all',
}

const normalizeLobbyRoom = (room: RawLobbyRoom): NormalizedLobbyRoom => {
  const isRanked =
    typeof room.isRanked === 'boolean'
      ? room.isRanked
      : typeof room.is_ranked === 'boolean'
        ? room.is_ranked
        : undefined

  const currentPlayers = (() => {
    if (typeof room.currentPlayers === 'number') return room.currentPlayers
    if (typeof room.playerCount === 'number') return room.playerCount
    if (typeof room.current_players === 'number') return room.current_players
    if (typeof room.current_players === 'string') {
      const parsed = Number(room.current_players)
      return Number.isNaN(parsed) ? undefined : parsed
    }
    return undefined
  })()

  const turnTimerSeconds = (() => {
    if (typeof room.turnTimerSeconds === 'number') return room.turnTimerSeconds
    if (typeof room.turn_timer === 'number') return room.turn_timer
    if (typeof room.turn_timer === 'string') {
      const parsed = Number(room.turn_timer)
      return Number.isNaN(parsed) ? undefined : parsed
    }
    return undefined
  })()

  const normalizeFog = (value: unknown) => {
    if (typeof value !== 'string') {
      return undefined
    }
    const normalized = value.toLowerCase()
    if (normalized === 'off' || normalized === 'adjacent' || normalized === 'persistent') {
      return normalized
    }
    return undefined
  }

  const fogOfWar = normalizeFog(room.fogOfWar ?? room.fog_of_war)
  const cardTradeMode = (room.cardTradeMode ?? room.card_trade_mode) || undefined
  const bonusType = (room.bonusType ?? room.bonus_type) || undefined

  const playerCount = currentPlayers ?? room.playerCount ?? room.currentPlayers

  return {
    ...room,
    isRanked,
    currentPlayers,
    playerCount,
    turnTimerSeconds,
    fogOfWar,
    cardTradeMode,
    bonusType,
  }
}

const formatGameMode = (mode?: string | null) => {
  if (!mode) return 'Classic Risk'
  const normalized = mode.toLowerCase()
  if (normalized === 'classic') return 'Classic Risk'
  if (normalized === 'capitals') return 'Capitals'
  if (normalized === 'blitz') return 'Blitz'
  return mode.replace(/_/g, ' ')
}

const formatTeamSetup = (room: NormalizedLobbyRoom) => {
  if (!room.allowTeamPlay) {
    return 'Teams: Free-for-all'
  }
  if (room.numberOfTeams && room.numberOfTeams > 1) {
    return `Teams: ${room.numberOfTeams}`
  }
  if (room.teamMode === 'auto_balance') {
    return 'Teams: Auto-balance'
  }
  return 'Teams: Enabled'
}

const formatTurnTimer = (seconds?: number) => {
  if (!seconds || Number.isNaN(seconds)) {
    return 'Turn timer: 1m (default)'
  }
  const label = formatTurnTimerWord(seconds)
  return `Turn timer: ${label}`
}

const formatFogOfWar = (fog?: NormalizedLobbyRoom['fogOfWar']) => {
  switch (fog) {
    case 'adjacent':
      return 'Fog: Adjacent'
    case 'persistent':
      return 'Fog: Persistent'
    case 'off':
      return 'Fog: Off'
    default:
      return 'Fog: Default'
  }
}

const formatCardMode = (mode?: string | null) => {
  if (!mode) {
    return 'Cards: Progressive (default)'
  }
  const normalized = mode.toLowerCase()
  if (normalized === 'fixed') return 'Cards: Fixed'
  if (normalized === 'progressive' || normalized === 'escalating') return 'Cards: Progressive'
  if (normalized === 'none' || normalized === 'disabled') return 'Cards: Disabled'
  return `Cards: ${mode}`
}

const formatBonusType = (bonus?: string | null) => {
  if (!bonus) {
    return undefined
  }
  const normalized = bonus.replace(/_/g, ' ')
  const formatted = normalized.charAt(0).toUpperCase() + normalized.slice(1)
  return `Bonus: ${formatted}`
}

const formatTreasureMode = (
  treasureConfig: NormalizedLobbyRoom['treasureConfig'],
): string | undefined => {
  if (!treasureConfig) return undefined
  const enabled = treasureConfig.enabled !== false
  if (!enabled) return 'Treasures: Off'
  const mode = treasureConfig.payoutMode || 'classic'
  if (mode === 'fixed') {
    return `Treasures: Fixed (${Math.max(1, Math.min(50, treasureConfig.fixedValue ?? 8))})`
  }
  const labelMap: Record<string, string> = {
    triangular: 'Progressive',
    classic: 'Classic',
    none: 'None',
  }
  return `Treasures: ${labelMap[mode] || mode}`
}

// Format seconds as mm:ss for compact countdown display
const formatCountdown = (secs: number) => {
  const s = Math.max(0, Math.trunc(secs))
  const m = Math.floor(s / 60)
  const r = s % 60
  const mm = m.toString().padStart(2, '0')
  const ss = r.toString().padStart(2, '0')
  return `${mm}:${ss}`
}

const LobbyPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [activeTab, setActiveTab] = useState<'browse' | 'my-games' | 'private'>('browse')
  const [publicGames, setPublicGames] = useState<NormalizedLobbyRoom[]>([])
  const [myGames, setMyGames] = useState<GameInfo[]>([])
  const [myGamesFilter, setMyGamesFilter] = useState<'all' | 'active' | 'lobby' | 'completed'>(
    'all',
  )
  const [myGamesMeta, setMyGamesMeta] = useState<
    Record<
      string,
      {
        turnEndsAt?: number
        timeBankSecondsRemaining?: number | null
        queueAhead?: number | null
        currentTurnUsername?: string | null
        isYourTurn?: boolean
      }
    >
  >({})
  const [now, setNow] = useState<number>(() => Date.now())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [privateGameCode, setPrivateGameCode] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [resendMessage, setResendMessage] = useState('')
  const [filters, setFilters] = useState<LobbyFilters>({ ...DEFAULT_LOBBY_FILTERS })
  const { section } = useParams<{ section?: string }>()
  const [, setSearchParams] = useSearchParams()
  const filterParam = useQueryParam('filter')

  // Table mode (desktop) state: column toggles and sorting
  type MyGamesColumn =
    | 'name'
    | 'players'
    | 'mode'
    | 'ranked'
    | 'status'
    | 'phase'
    | 'queue'
    | 'timer'
    | 'host'
    | 'updated'
    | 'privacy'
    | 'actions'
  const DEFAULT_COLUMNS: Record<MyGamesColumn, boolean> = {
    name: true,
    players: true,
    mode: false,
    ranked: false,
    status: true,
    phase: false,
    queue: true,
    timer: true,
    host: false,
    updated: true,
    privacy: false,
    actions: true,
  }
  const [visibleCols, setVisibleCols] = useState<Record<MyGamesColumn, boolean>>(() => {
    try {
      const raw = localStorage.getItem('lobbyMyGamesColumns')
      if (raw) {
        const parsed = JSON.parse(raw) as Record<MyGamesColumn, boolean>
        return { ...DEFAULT_COLUMNS, ...parsed }
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_COLUMNS }
  })
  useEffect(() => {
    try {
      localStorage.setItem('lobbyMyGamesColumns', JSON.stringify(visibleCols))
    } catch {
      // ignore
    }
  }, [visibleCols])

  type SortKey = 'name' | 'players' | 'status' | 'queue' | 'timer' | 'updated'
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const mapFieldId = useId()
  const modeFieldId = useId()
  const teamFieldId = useId()
  const minPlayersFieldId = useId()
  const maxPlayersFieldId = useId()

  const mapOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const game of publicGames) {
      const label = game.mapName || 'Unknown map'
      const value = game.mapId || label
      if (!seen.has(value)) {
        seen.set(value, label)
      }
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [publicGames])

  const gameModeOptions = useMemo(() => {
    const modes = new Set<string>()
    for (const game of publicGames) {
      if (game.gameMode) {
        modes.add(game.gameMode)
      }
    }
    return Array.from(modes)
      .map((mode) => ({ value: mode, label: formatGameMode(mode) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [publicGames])

  const hasRankedGames = useMemo(
    () => publicGames.some((game) => game.isRanked === true),
    [publicGames],
  )

  const isLobbyStatus = useCallback((status: GameRoom['status']) => status === 'lobby', [])

  const filteredPublicGames = useMemo(() => {
    return publicGames.filter((game) => {
      const currentPlayers = game.currentPlayers ?? game.playerCount ?? 0
      const isLobby = isLobbyStatus(game.status)
      const isFull = currentPlayers >= game.maxPlayers

      if (!filters.showFull && isFull) {
        return false
      }

      if (!filters.showInProgress && !isLobby) {
        return false
      }

      if (game.maxPlayers < filters.minPlayers || game.maxPlayers > filters.maxPlayers) {
        return false
      }

      if (filters.gameType === 'ranked' && game.isRanked !== true) {
        return false
      }

      if (filters.gameType === 'casual' && game.isRanked === true) {
        return false
      }

      if (filters.gameMode !== 'all') {
        if ((game.gameMode || '').toLowerCase() !== filters.gameMode.toLowerCase()) {
          return false
        }
      }

      if (filters.map !== 'all') {
        const mapValue = game.mapId || game.mapName || 'unknown'
        if (mapValue !== filters.map) {
          return false
        }
      }

      if (filters.teamPreference === 'teams' && !game.allowTeamPlay) {
        return false
      }

      if (filters.teamPreference === 'ffa' && game.allowTeamPlay) {
        return false
      }

      return true
    })
  }, [publicGames, filters, isLobbyStatus])

  // Memoize the loadPublicGames function to prevent infinite re-renders
  const loadPublicGames = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await gameService.getPublicGames()
      const rawRooms = Array.isArray(response.rooms) ? (response.rooms as RawLobbyRoom[]) : []
      const normalizedRooms = rawRooms.map((room) => normalizeLobbyRoom(room))
      setPublicGames(normalizedRooms)
    } catch (err: unknown) {
      logger.error('Failed to load public games', err)

      // Provide helpful error messages based on error type
      const errorObject = err as {
        code?: string
        message?: string
        response?: { status?: number; data?: { message?: string } }
      }

      if (errorObject.code === 'ECONNREFUSED' || errorObject.message?.includes('Network Error')) {
        setError('Cannot connect to server. Make sure the backend is running.')
      } else if (errorObject.response?.status === 404) {
        setError('Game service not available. Please try again later.')
      } else if ((errorObject.response?.status ?? 0) >= 500) {
        setError('Server error. Please try again later.')
      } else {
        setError(
          `Failed to load games: ${
            errorObject.response?.data?.message || errorObject.message || 'Unknown error'
          }`,
        )
      }
      setPublicGames([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Load user's games
  const loadMyGames = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/game/my-games')
      setMyGames(response.data.games || [])
    } catch (err: unknown) {
      logger.error('Failed to load user games', err)

      // Provide helpful error messages based on error type
      const errorObject = err as {
        code?: string
        message?: string
        response?: { status?: number; data?: { message?: string } }
      }

      if (errorObject.code === 'ECONNREFUSED' || errorObject.message?.includes('Network Error')) {
        setError('Cannot connect to server. Make sure the backend is running.')
      } else if (errorObject.response?.status === 404) {
        setError('User games service not available. Please try again later.')
      } else if ((errorObject.response?.status ?? 0) >= 500) {
        setError('Server error. Please try again later.')
      } else {
        setError(
          `Failed to load your games: ${
            errorObject.response?.data?.message || errorObject.message || 'Unknown error'
          }`,
        )
      }
      setMyGames([])
    } finally {
      setLoading(false)
    }
  }, [user])

  // Load meta for user's games (queue position, timer, current player)
  const loadMyGamesMeta = useCallback(async () => {
    if (!user) return
    try {
      const response = await api.get('/game/my-games/meta')
      const meta = (response.data?.meta ?? {}) as Record<
        string,
        {
          turnExpiresAt?: string | null
          timeBankSecondsRemaining?: number | null
          queueAhead?: number | null
          currentTurnUsername?: string | null
          isYourTurn?: boolean
        }
      >
      const map: Record<
        string,
        {
          turnEndsAt?: number
          timeBankSecondsRemaining?: number | null
          queueAhead?: number | null
          currentTurnUsername?: string | null
          isYourTurn?: boolean
        }
      > = {}
      for (const [id, m] of Object.entries(meta)) {
        map[id] = {
          turnEndsAt: m.turnExpiresAt ? Date.parse(m.turnExpiresAt) : undefined,
          timeBankSecondsRemaining:
            typeof m.timeBankSecondsRemaining === 'number'
              ? Math.max(0, Math.trunc(m.timeBankSecondsRemaining))
              : null,
          queueAhead: m.queueAhead ?? null,
          currentTurnUsername: m.currentTurnUsername ?? null,
          isYourTurn: m.isYourTurn ?? undefined,
        }
      }
      setMyGamesMeta(map)
    } catch (err) {
      logger.debug?.('LobbyPage: my-games meta fetch failed', err)
      setMyGamesMeta({})
    }
  }, [user])

  useEffect(() => {
    if (activeTab === 'browse') {
      loadPublicGames()
    } else if (activeTab === 'my-games') {
      loadMyGames()
      loadMyGamesMeta()
    }
  }, [activeTab, loadPublicGames, loadMyGames, loadMyGamesMeta])

  // Tick countdowns while viewing My Games
  useEffect(() => {
    if (activeTab !== 'my-games') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activeTab])

  // ARIA live announcements for turns and timer thresholds
  const [ariaMessages, setAriaMessages] = useState<string[]>([])
  const lastThresholdsRef = useRef<Record<string, Set<number>>>({})
  const prevMetaRef = useRef<typeof myGamesMeta>({})
  useEffect(() => {
    if (activeTab !== 'my-games') return
    const prev = prevMetaRef.current
    for (const game of myGames) {
      const meta = myGamesMeta[game.id]
      const prevMeta = prev[game.id]
      // Announce when it becomes your turn
      if (meta?.isYourTurn && !prevMeta?.isYourTurn) {
        setAriaMessages((m) => [`Your turn in ${game.name}`, ...m.slice(0, 3)])
      }
    }
    prevMetaRef.current = myGamesMeta
  }, [myGamesMeta, myGames, activeTab])

  useEffect(() => {
    if (activeTab !== 'my-games') return
    for (const game of myGames) {
      const meta = myGamesMeta[game.id]
      if (!meta?.isYourTurn || !meta.turnEndsAt) continue
      const remain = Math.max(0, Math.ceil((meta.turnEndsAt - now) / 1000))
      const thresholds = [60, 30, 10]
      if (!lastThresholdsRef.current[game.id]) lastThresholdsRef.current[game.id] = new Set()
      for (const t of thresholds) {
        if (remain === t && !lastThresholdsRef.current[game.id].has(t)) {
          lastThresholdsRef.current[game.id].add(t)
          setAriaMessages((m) => [`${t} seconds remaining in ${game.name}`, ...m.slice(0, 3)])
        }
      }
    }
  }, [now, myGames, myGamesMeta, activeTab])

  // Sync tab with URL param
  useEffect(() => {
    const normalized = (section || '').toLowerCase()
    if (normalized === 'browse' || normalized === 'my-games' || normalized === 'private') {
      setActiveTab(normalized as 'browse' | 'my-games' | 'private')
    } else {
      setActiveTab('browse')
    }
  }, [section])

  // Deep-link: sync my-games filter with query param (read-only -> state)
  useEffect(() => {
    if (activeTab !== 'my-games') return
    const raw = filterParam
    const allowed = new Set(['all', 'active', 'lobby', 'completed'])
    const next = allowed.has(raw) ? (raw as 'all' | 'active' | 'lobby' | 'completed') : 'all'
    if (next !== myGamesFilter) {
      setMyGamesFilter(next)
    }
  }, [activeTab, filterParam, myGamesFilter])

  // Reflect state back to the URL when it changes (state -> write-only URL)
  useEffect(() => {
    if (activeTab !== 'my-games') return
    const current = filterParam
    if (current !== myGamesFilter) {
      // Avoid depending on captured URLSearchParams identity
      const nextParams = new URLSearchParams(window.location.search)
      nextParams.set('filter', myGamesFilter)
      // Use replace to avoid spamming history when toggling quickly
      setSearchParams(nextParams, { replace: true })
    }
  }, [myGamesFilter, activeTab, filterParam, setSearchParams])

  useEffect(() => {
    // Check email verification status
    const checkVerificationStatus = async () => {
      try {
        const response = await authService.getProfile()
        setEmailVerified(response.user?.emailVerified)
      } catch (error) {
        logger.error('Failed to fetch profile for verification status', error)
      }
    }

    if (user) {
      checkVerificationStatus()
    }
  }, [user])

  const handleResendVerification = async () => {
    if (!user?.email) return

    try {
      await authService.resendVerification(user.email)
      setResendMessage('Verification email sent! Please check your inbox.')
      setTimeout(() => setResendMessage(''), 5000)
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } }
      setResendMessage(apiError.response?.data?.message || 'Failed to resend verification email')
      setTimeout(() => setResendMessage(''), 5000)
    }
  }

  const handleJoinPrivateGame = async () => {
    const trimmedCode = privateGameCode.trim().toUpperCase()

    if (!trimmedCode) {
      setError('Please enter a game code')
      return
    }

    if (trimmedCode.length < 4) {
      setError('Game code must be at least 4 characters')
      return
    }

    try {
      setError(null)
      setLoading(true)

      // Navigate to room; selection and join happen on the room page
      navigate(`/room/${trimmedCode}`)
    } catch (err: unknown) {
      const apiError = err as { response?: { status?: number; data?: { message?: string } } }
      // Provide specific error messages based on the error
      if (apiError.response?.status === 404) {
        setError(`No game found with code "${trimmedCode}". Please check the code and try again.`)
      } else if (apiError.response?.status === 403) {
        setError('This game is full or already started.')
      } else if (apiError.response?.status === 401) {
        setError('You need to be logged in to join games.')
      } else {
        setError(apiError.response?.data?.message || 'Failed to join game. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const getGameStatusColor = (status: GameRoom['status']) => {
    switch (status) {
      case 'lobby':
        return 'text-green-400'
      case 'initializing':
        return 'text-blue-300'
      case 'active':
        return 'text-yellow-400'
      case 'completed':
        return 'text-muted'
      case 'paused':
        return 'text-orange-300'
      case 'abandoned':
        return 'text-muted'
      default:
        return 'text-muted'
    }
  }

  const getStatusLabel = (status: GameRoom['status']) => {
    switch (status) {
      case 'lobby':
        return 'Waiting for players'
      case 'initializing':
        return 'Launching game'
      case 'active':
        return 'In progress'
      case 'completed':
        return 'Completed'
      case 'paused':
        return 'Paused'
      case 'abandoned':
        return 'Closed'
      default:
        return status
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Email Verification Banner */}
      {emailVerified === false && (
        <div className="panel mb-6 border-[color:var(--color-warning)] bg-[color:var(--hover-bg)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-[color:var(--color-warning)] mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h3 className="font-medium text-[color:var(--color-warning)]">Verify Your Email</h3>
                <p className="text-muted text-sm mt-1">
                  Please verify your email address to access all features. Check your inbox for the
                  verification link.
                </p>
                {resendMessage && (
                  <p className="text-sm text-[color:var(--color-success)] mt-2">{resendMessage}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleResendVerification}
              className="btn btn-secondary btn-sm text-[color:var(--color-warning)] border-[color:var(--color-warning)]"
            >
              Resend Email
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-[color:var(--color-primary-soft)] mb-2">
            Game Lobby
          </h1>
          <p className="text-muted">Find and join games, or create your own</p>
        </div>
        <div className="flex gap-3">
          <Link to="/create" className="btn-primary">
            🎮 Create Game
          </Link>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-tertiary ${showFilters ? 'is-active' : ''}`}
            aria-pressed={showFilters}
          >
            🔍 Filter Games
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="panel mb-6 space-y-6">
          <h3 className="text-lg font-semibold text-[color:var(--heading)]">Filter Options</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-sm text-muted mb-2">Game Type</p>
              <div className="segmented-control">
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, gameType: 'all' }))}
                  className={filters.gameType === 'all' ? 'segmented-active' : ''}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, gameType: 'casual' }))}
                  className={filters.gameType === 'casual' ? 'segmented-active' : ''}
                >
                  Casual
                </button>
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, gameType: 'ranked' }))}
                  className={filters.gameType === 'ranked' ? 'segmented-active' : ''}
                >
                  Ranked
                </button>
              </div>
            </div>

            <div>
              <label
                className="block text-sm text-[color:var(--heading)] mb-2"
                htmlFor={mapFieldId}
              >
                Map
              </label>
              <select
                id={mapFieldId}
                value={filters.map}
                onChange={(e) => setFilters((prev) => ({ ...prev, map: e.target.value }))}
                className="form-select w-full"
              >
                <option value="all">All maps</option>
                {mapOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="block text-sm text-[color:var(--heading)] mb-2"
                htmlFor={modeFieldId}
              >
                Game Mode
              </label>
              <select
                id={modeFieldId}
                value={filters.gameMode}
                onChange={(e) => setFilters((prev) => ({ ...prev, gameMode: e.target.value }))}
                className="form-select w-full"
              >
                <option value="all">All modes</option>
                {gameModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="block text-sm text-[color:var(--heading)] mb-2"
                htmlFor={teamFieldId}
              >
                Team Setup
              </label>
              <select
                id={teamFieldId}
                value={filters.teamPreference}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    teamPreference: e.target.value as LobbyFilters['teamPreference'],
                  }))
                }
                className="form-select w-full"
              >
                <option value="all">All team settings</option>
                <option value="ffa">Free-for-all</option>
                <option value="teams">Teams enabled</option>
              </select>
            </div>

            <div>
              <label
                className="block text-sm text-[color:var(--heading)] mb-2"
                htmlFor={minPlayersFieldId}
              >
                Min Players
              </label>
              <input
                id={minPlayersFieldId}
                type="number"
                min="2"
                max="12"
                value={filters.minPlayers}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    minPlayers: Number.parseInt(e.target.value, 10) || 2,
                  }))
                }
                className="form-input w-full"
              />
            </div>

            <div>
              <label
                className="block text-sm text-[color:var(--heading)] mb-2"
                htmlFor={maxPlayersFieldId}
              >
                Max Players
              </label>
              <input
                id={maxPlayersFieldId}
                type="number"
                min="2"
                max="12"
                value={filters.maxPlayers}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    maxPlayers: Number.parseInt(e.target.value, 10) || 12,
                  }))
                }
                className="form-input w-full"
              />
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-[color:var(--text)]">
                <input
                  type="checkbox"
                  checked={filters.showFull}
                  onChange={(e) => setFilters((prev) => ({ ...prev, showFull: e.target.checked }))}
                  className="form-checkbox"
                />
                <span>Show full games</span>
              </label>
              <label className="flex items-center gap-2 text-[color:var(--text)]">
                <input
                  type="checkbox"
                  checked={filters.showInProgress}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, showInProgress: e.target.checked }))
                  }
                  className="form-checkbox"
                />
                <span>Show in-progress games</span>
              </label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setFilters({ ...DEFAULT_LOBBY_FILTERS })}
              className="btn btn-secondary"
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tabs mb-8">
        <button
          type="button"
          className={`tab ${activeTab === 'browse' ? 'tab-active' : ''}`}
          onClick={() => navigate('/lobby/browse')}
        >
          🌍 Browse Games
        </button>
        {user && (
          <button
            type="button"
            className={`tab ${activeTab === 'my-games' ? 'tab-active' : ''}`}
            onClick={() => {
              const currentFilter = filterParam || myGamesFilter || 'all'
              navigate(`/lobby/my-games?filter=${encodeURIComponent(currentFilter)}`)
            }}
          >
            🎮 My Games
          </button>
        )}
        <button
          type="button"
          className={`tab ${activeTab === 'private' ? 'tab-active' : ''}`}
          onClick={() => navigate('/lobby/private')}
        >
          🔒 Private Game
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="panel mb-6 border-[color:var(--color-danger)] bg-[color:var(--hover-bg)] text-[color:var(--color-danger)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true">❌</span>
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="btn btn-ghost btn-sm text-[color:var(--color-danger)]"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="min-h-96">
        {activeTab === 'browse' && (
          <div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-[color:var(--heading)]">Public Games</h2>
                <p className="text-sm text-muted mt-1">
                  Showing {filteredPublicGames.length} of {publicGames.length} available rooms
                </p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                {hasRankedGames && (
                  <div className="segmented-control">
                    <button
                      type="button"
                      onClick={() => setFilters((prev) => ({ ...prev, gameType: 'all' }))}
                      className={filters.gameType === 'all' ? 'segmented-active' : ''}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilters((prev) => ({ ...prev, gameType: 'casual' }))}
                      className={filters.gameType === 'casual' ? 'segmented-active' : ''}
                    >
                      Casual
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilters((prev) => ({ ...prev, gameType: 'ranked' }))}
                      className={filters.gameType === 'ranked' ? 'segmented-active' : ''}
                    >
                      Ranked
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={loadPublicGames}
                  disabled={loading}
                  className={`btn btn-secondary btn-sm ${loading ? 'opacity-75' : ''}`}
                >
                  {loading ? '🔄 Loading...' : '🔄 Refresh'}
                </button>
              </div>
            </div>

            {loading ? (
              <SkeletonGroup count={6} className="grid gap-4">
                {() => <GameCardSkeleton />}
              </SkeletonGroup>
            ) : publicGames.length === 0 ? (
              <div className="panel text-center py-16">
                <div className="text-6xl mb-4">🎲</div>
                <p className="text-lg mb-2 text-[color:var(--heading)]">
                  No public games available
                </p>
                <p className="text-sm mb-6 text-muted">
                  Be the first to create a game for others to join!
                </p>
                <Link to="/create" className="btn btn-primary">
                  🎮 Create Game
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredPublicGames.length === 0 ? (
                  <div className="panel text-center py-16">
                    <div className="text-6xl mb-4">🔍</div>
                    <p className="text-lg mb-2 text-[color:var(--heading)]">
                      No games match your filters
                    </p>
                    <p className="text-sm mb-6 text-muted">
                      Try adjusting your filter settings or create a new game
                    </p>
                    <button
                      type="button"
                      onClick={() => setFilters({ ...DEFAULT_LOBBY_FILTERS })}
                      className="btn btn-secondary"
                    >
                      Reset Filters
                    </button>
                  </div>
                ) : (
                  filteredPublicGames.map((game) => {
                    const currentPlayers = game.currentPlayers ?? game.playerCount ?? 0
                    const isFull = currentPlayers >= game.maxPlayers
                    const statusLabel = getStatusLabel(game.status)
                    const statusClass = getGameStatusColor(game.status)
                    const gameTypeClass =
                      game.isRanked === true
                        ? 'badge bg-[color:var(--color-primary)] text-[color:var(--color-white)] border-[color:var(--color-primary)]'
                        : 'badge bg-[color:var(--color-success)] text-[color:var(--color-white)] border-[color:var(--color-success)]'

                    const openSlots = Math.max(game.maxPlayers - currentPlayers, 0)
                    const capacityLabel = isLobbyStatus(game.status)
                      ? isFull
                        ? 'Lobby full'
                        : `${openSlots} ${openSlots === 1 ? 'seat' : 'seats'} open`
                      : statusLabel

                    const detailBadges: string[] = []
                    detailBadges.push(`Map: ${game.mapName || 'Unknown'}`)
                    detailBadges.push(`Mode: ${formatGameMode(game.gameMode)}`)
                    detailBadges.push(formatTeamSetup(game))
                    detailBadges.push(formatTurnTimer(game.turnTimerSeconds))
                    detailBadges.push(formatFogOfWar(game.fogOfWar))
                    detailBadges.push(formatCardMode(game.cardTradeMode))
                    const bonusLabel = formatBonusType(game.bonusType)
                    if (bonusLabel) {
                      detailBadges.push(bonusLabel)
                    }
                    const treasureLabel = formatTreasureMode(game.treasureConfig)
                    if (treasureLabel) {
                      detailBadges.push(treasureLabel)
                    }

                    const uniqueDetailBadges = Array.from(new Set(detailBadges))

                    const expiresAt = (() => {
                      if (game.expiresAt) return new Date(game.expiresAt)
                      const created = new Date(game.createdAt)
                      // Fallback: 30 days after creation if backend didn't provide expiresAt
                      return new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
                    })()

                    const formatTimeUntil = (target: Date) => {
                      const now = Date.now()
                      const ms = target.getTime() - now
                      if (ms <= 0) return 'Expired'
                      const days = Math.floor(ms / (24 * 60 * 60 * 1000))
                      if (days >= 1) return `Expires in ${days} day${days === 1 ? '' : 's'}`
                      const hours = Math.floor(ms / (60 * 60 * 1000))
                      if (hours >= 1) return `Expires in ${hours}h`
                      const minutes = Math.floor(ms / (60 * 1000))
                      return `Expires in ${minutes}m`
                    }

                    return (
                      <Link
                        key={game.id}
                        to={`/room/${game.roomCode ?? game.id}`}
                        className="panel block group transition-shadow hover:border-[color:var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold text-[color:var(--heading)] truncate">
                              {game.name}
                              {typeof game.roomCode === 'number' ? ` — Room ${game.roomCode}` : ''}
                            </h3>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted mt-1">
                              <span className={statusClass}>{statusLabel}</span>
                              <span>• Created {formatTimeAgo(game.createdAt)}</span>
                              {isLobbyStatus(game.status) && (
                                <span>• {formatTimeUntil(expiresAt)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={gameTypeClass}>
                              {game.isRanked === true ? 'Ranked' : 'Casual'}
                            </span>
                            {game.hostUsername && (
                              <span className="text-xs text-muted">Host {game.hostUsername}</span>
                            )}
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {uniqueDetailBadges.map((badge) => (
                            <span key={`${game.id}-${badge}`} className="chip text-xs">
                              {badge}
                            </span>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm text-muted">
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <span>
                              {currentPlayers}/{game.maxPlayers} players
                            </span>
                            <span>• {capacityLabel}</span>
                          </div>
                          <span className="text-[color:var(--color-primary-soft)] font-medium flex items-center gap-1">
                            Open lobby
                            <span aria-hidden="true">→</span>
                          </span>
                        </div>
                      </Link>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'my-games' && user && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[color:var(--heading)]">My Games</h2>
              <button
                type="button"
                onClick={loadMyGames}
                disabled={loading}
                className={`btn btn-secondary btn-sm ${loading ? 'opacity-75' : ''}`}
              >
                {loading ? '🔄 Loading...' : '🔄 Refresh'}
              </button>
            </div>

            {/* Filter buttons for My Games - Using Segmented Control */}
            <div className="segmented-control mb-6">
              <button
                type="button"
                onClick={() => setMyGamesFilter('all')}
                className={myGamesFilter === 'all' ? 'segmented-active' : ''}
              >
                All Games
              </button>
              <button
                type="button"
                onClick={() => setMyGamesFilter('active')}
                className={myGamesFilter === 'active' ? 'segmented-active' : ''}
              >
                <Gamepad2 className="inline w-4 h-4 mr-1" />
                Active
              </button>
              <button
                type="button"
                onClick={() => setMyGamesFilter('lobby')}
                className={myGamesFilter === 'lobby' ? 'segmented-active' : ''}
              >
                <Clock className="inline w-4 h-4 mr-1" />
                Lobby
              </button>
              <button
                type="button"
                onClick={() => setMyGamesFilter('completed')}
                className={myGamesFilter === 'completed' ? 'segmented-active' : ''}
              >
                <Trophy className="inline w-4 h-4 mr-1" />
                Completed
              </button>
            </div>

            {/* Live region for announcements (screen readers) */}
            <output className="sr-only" aria-live="polite">
              {ariaMessages[0] ?? ''}
            </output>

            {loading ? (
              <SkeletonGroup count={6} className="grid gap-4">
                {() => <GameCardSkeleton />}
              </SkeletonGroup>
            ) : myGames.length === 0 ? (
              <div className="panel text-center py-16">
                <div className="text-6xl mb-4">🎮</div>
                <p className="text-lg mb-2 text-[color:var(--heading)]">No games yet</p>
                <p className="text-sm mb-6 text-muted">Join or create a game to get started!</p>
                <div className="flex gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('browse')}
                    className="btn btn-secondary"
                  >
                    🌍 Browse Games
                  </button>
                  <Link to="/create" className="btn btn-primary">
                    ➕ Create Game
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop table (md and up) */}
                <div className="hidden md:block">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-muted">Columns</div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(DEFAULT_COLUMNS) as MyGamesColumn[]).map((key) =>
                        key === 'name' || key === 'actions' ? null : (
                          <label key={key} className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={visibleCols[key]}
                              onChange={(e) =>
                                setVisibleCols((prev) => ({ ...prev, [key]: e.target.checked }))
                              }
                            />
                            <span className="capitalize">{key}</span>
                          </label>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-sm text-muted">
                          <th className="py-2 px-3">Name</th>
                          <th
                            className="py-2 px-3 cursor-pointer"
                            onClick={() => toggleSort('players')}
                            aria-sort={
                              sortKey === 'players'
                                ? sortDir === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            Players
                          </th>
                          {visibleCols.mode && <th className="py-2 px-3">Mode</th>}
                          {visibleCols.ranked && <th className="py-2 px-3">Ranked</th>}
                          <th
                            className="py-2 px-3 cursor-pointer"
                            onClick={() => toggleSort('status')}
                            aria-sort={
                              sortKey === 'status'
                                ? sortDir === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            Status
                          </th>
                          {visibleCols.phase && <th className="py-2 px-3">Phase</th>}
                          {visibleCols.queue && (
                            <th
                              className="py-2 px-3 cursor-pointer"
                              onClick={() => toggleSort('queue')}
                              aria-sort={
                                sortKey === 'queue'
                                  ? sortDir === 'asc'
                                    ? 'ascending'
                                    : 'descending'
                                  : 'none'
                              }
                            >
                              Queue
                            </th>
                          )}
                          {visibleCols.timer && (
                            <th
                              className="py-2 px-3 cursor-pointer"
                              onClick={() => toggleSort('timer')}
                              aria-sort={
                                sortKey === 'timer'
                                  ? sortDir === 'asc'
                                    ? 'ascending'
                                    : 'descending'
                                  : 'none'
                              }
                            >
                              Timer
                            </th>
                          )}
                          {visibleCols.host && <th className="py-2 px-3">Host</th>}
                          {visibleCols.updated && (
                            <th
                              className="py-2 px-3 cursor-pointer"
                              onClick={() => toggleSort('updated')}
                              aria-sort={
                                sortKey === 'updated'
                                  ? sortDir === 'asc'
                                    ? 'ascending'
                                    : 'descending'
                                  : 'none'
                              }
                            >
                              Updated
                            </th>
                          )}
                          {visibleCols.privacy && <th className="py-2 px-3">Privacy</th>}
                          <th className="py-2 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const filtered = myGames.filter((game) => {
                            if (myGamesFilter === 'all') return true
                            return game.status === myGamesFilter
                          })
                          const toNumber = (v: unknown) =>
                            typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0
                          const statusRank: Record<string, number> = {
                            active: 0,
                            lobby: 1,
                            initializing: 2,
                            paused: 3,
                            completed: 4,
                            abandoned: 5,
                          }
                          const sorted = [...filtered].sort((a, b) => {
                            const ma = myGamesMeta[a.id]
                            const mb = myGamesMeta[b.id]
                            const secondsRemain = (m?: { turnEndsAt?: number }) =>
                              m?.turnEndsAt
                                ? Math.max(0, Math.ceil((m.turnEndsAt - now) / 1000))
                                : null
                            let cmp = 0
                            switch (sortKey) {
                              case 'name':
                                cmp = a.name.localeCompare(b.name)
                                break
                              case 'players':
                                cmp = toNumber(a.playerCount) - toNumber(b.playerCount)
                                break
                              case 'status':
                                cmp = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
                                break
                              case 'queue': {
                                const qa =
                                  typeof ma?.queueAhead === 'number' ? ma.queueAhead + 1 : Infinity
                                const qb =
                                  typeof mb?.queueAhead === 'number' ? mb.queueAhead + 1 : Infinity
                                cmp = qa - qb
                                break
                              }
                              case 'timer': {
                                const ra = secondsRemain(ma)
                                const rb = secondsRemain(mb)
                                cmp = (ra ?? Infinity) - (rb ?? Infinity)
                                break
                              }
                              default: {
                                const ua = ((a as unknown as { updatedAt?: string }).updatedAt ||
                                  a.createdAt) as string
                                const ub = ((b as unknown as { updatedAt?: string }).updatedAt ||
                                  b.createdAt) as string
                                cmp = new Date(ua).getTime() - new Date(ub).getTime()
                                break
                              }
                            }
                            return sortDir === 'asc' ? cmp : -cmp
                          })

                          return sorted.map((game) => {
                            const meta = myGamesMeta[game.id]
                            const displayQueue =
                              typeof meta?.queueAhead === 'number' ? meta.queueAhead + 1 : null
                            const remain = meta?.turnEndsAt
                              ? Math.max(0, Math.ceil((meta.turnEndsAt - now) / 1000))
                              : null
                            const timerText = remain == null ? '—' : formatCountdown(remain)
                            return (
                              <tr key={game.id} className="border-t border-border">
                                <td className="py-2 px-3">
                                  <div className="font-medium text-[color:var(--heading)]">
                                    {game.name}
                                  </div>
                                  {typeof (game as unknown as { mapName?: string }).mapName ===
                                    'string' && (
                                    <div className="text-xs text-muted">
                                      {(game as unknown as { mapName?: string }).mapName}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  {game.playerCount}/{game.maxPlayers}
                                </td>
                                {visibleCols.mode && (
                                  <td className="py-2 px-3">
                                    {(game as unknown as { gameMode?: string }).gameMode || '—'}
                                  </td>
                                )}
                                {visibleCols.ranked && (
                                  <td className="py-2 px-3">
                                    {(game as unknown as { isRanked?: boolean }).isRanked
                                      ? '✓'
                                      : '—'}
                                  </td>
                                )}
                                <td className="py-2 px-3">{getStatusLabel(game.status)}</td>
                                {visibleCols.phase && <td className="py-2 px-3">—</td>}
                                {visibleCols.queue && (
                                  <td className="py-2 px-3">
                                    {displayQueue == null ? (
                                      '—'
                                    ) : (
                                      <span className="chip text-xs">{displayQueue}</span>
                                    )}
                                  </td>
                                )}
                                {visibleCols.timer && <td className="py-2 px-3">{timerText}</td>}
                                {visibleCols.host && (
                                  <td className="py-2 px-3">
                                    {(game as unknown as { hostUsername?: string }).hostUsername ||
                                      '—'}
                                  </td>
                                )}
                                {visibleCols.updated && (
                                  <td className="py-2 px-3">
                                    {formatTimeAgo(
                                      ((game as unknown as { updatedAt?: string }).updatedAt ||
                                        game.createdAt) as string,
                                    )}
                                  </td>
                                )}
                                {visibleCols.privacy && (
                                  <td className="py-2 px-3">
                                    {(game as unknown as { isPrivate?: boolean }).isPrivate
                                      ? '🔒'
                                      : '—'}
                                  </td>
                                )}
                                <td className="py-2 px-3">
                                  {game.status === 'lobby' || game.status === 'initializing' ? (
                                    <Link
                                      to={`/room/${game.roomCode ?? game.id}`}
                                      className="btn btn-primary btn-xs"
                                    >
                                      View Lobby
                                    </Link>
                                  ) : game.status === 'active' ? (
                                    <Link
                                      to={`/room/${game.roomCode ?? game.id}`}
                                      className="btn btn-success btn-xs"
                                    >
                                      {meta?.isYourTurn ? 'Play Turn' : 'View Game'}
                                    </Link>
                                  ) : (
                                    <Link
                                      to={`/room/${game.roomCode ?? game.id}`}
                                      className="btn btn-secondary btn-xs"
                                    >
                                      View Results
                                    </Link>
                                  )}
                                </td>
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile cards (below md) */}
                <div className="grid gap-4 md:hidden">
                  {(() => {
                    const filteredGames = myGames.filter((game) => {
                      if (myGamesFilter === 'all') return true
                      return game.status === myGamesFilter
                    })

                    if (filteredGames.length === 0) {
                      return (
                        <div className="panel text-center py-16">
                          <div className="text-6xl mb-4">
                            {myGamesFilter === 'active'
                              ? '🎮'
                              : myGamesFilter === 'lobby'
                                ? '⏰'
                                : '🏆'}
                          </div>
                          <p className="text-lg mb-2 text-[color:var(--heading)]">
                            No {myGamesFilter === 'all' ? '' : myGamesFilter} games
                          </p>
                          <button
                            type="button"
                            onClick={() => setMyGamesFilter('all')}
                            className="btn btn-secondary"
                          >
                            Show All Games
                          </button>
                        </div>
                      )
                    }

                    return filteredGames.map((game) => (
                      <div key={game.id} className="panel">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-[color:var(--heading)]">
                              {game.name}
                              {typeof game.roomCode === 'number' ? ` — Room ${game.roomCode}` : ''}
                            </h3>
                            <div className="flex items-center space-x-4 text-sm text-muted">
                              <span>
                                {game.playerCount}/{game.maxPlayers} players
                              </span>
                              <span className={getGameStatusColor(game.status)}>
                                • {getStatusLabel(game.status)}
                              </span>
                              {(() => {
                                const meta = myGamesMeta[game.id]
                                const isActive = game.status === 'active'
                                const queue = isActive ? meta?.queueAhead : null
                                const displayQueue = typeof queue === 'number' ? queue + 1 : null // 1 means current
                                const remain = meta?.turnEndsAt
                                  ? Math.ceil((meta.turnEndsAt - now) / 1000)
                                  : null
                                const safeRemain = remain == null ? null : Math.max(0, remain)
                                const timerClass =
                                  safeRemain == null
                                    ? ''
                                    : safeRemain <= 10
                                      ? 'text-[color:var(--color-danger)]'
                                      : safeRemain <= 30
                                        ? 'text-amber-400'
                                        : safeRemain <= 60
                                          ? 'text-yellow-300'
                                          : 'text-muted'

                                // Show queue/timer only for in-progress games where user is an alive participant
                                if (!isActive || displayQueue == null) return null
                                return (
                                  <>
                                    <span className="inline-flex items-center gap-1">
                                      • Queue
                                      <span className="chip text-xs font-semibold">
                                        {displayQueue}
                                      </span>
                                    </span>
                                    {meta?.currentTurnUsername && (
                                      <span className="inline-flex items-center gap-1 opacity-80">
                                        • Current:{' '}
                                        <span className="font-medium">
                                          {meta.currentTurnUsername}
                                        </span>
                                      </span>
                                    )}
                                    {safeRemain != null && (
                                      <span
                                        className={`inline-flex items-center gap-1 ${timerClass}`}
                                      >
                                        • {formatCountdown(safeRemain)}
                                      </span>
                                    )}
                                  </>
                                )
                              })()}
                              {game.winner && (
                                <span className="text-[color:var(--color-warning)]">
                                  • Winner: {game.winner}
                                </span>
                              )}
                              <span>• Created {formatTimeAgo(game.createdAt)}</span>
                            </div>
                          </div>
                          <div>
                            {game.status === 'lobby' || game.status === 'initializing' ? (
                              <Link
                                to={`/room/${game.roomCode ?? game.id}`}
                                className="btn btn-primary btn-sm"
                              >
                                📋 View Lobby
                              </Link>
                            ) : game.status === 'active' ? (
                              <Link
                                to={`/room/${game.roomCode ?? game.id}`}
                                className="btn btn-success btn-sm"
                              >
                                {game.isYourTurn ? '🎯 Play Turn' : '👁️ View Game'}
                              </Link>
                            ) : (
                              <Link
                                to={`/room/${game.roomCode ?? game.id}`}
                                className="btn btn-secondary btn-sm"
                              >
                                📊 View Results
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'private' && (
          <div>
            <h2 className="text-2xl font-bold text-[color:var(--heading)] mb-6">
              Join Private Game
            </h2>
            <div className="panel max-w-md mx-auto text-center py-16">
              <div className="text-6xl mb-4">🔐</div>
              <p className="text-lg text-muted mb-2">Enter game code to join private game</p>
              <p className="text-sm text-muted mb-6">
                You'll need the invite code from the game host
              </p>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="ENTER CODE (e.g., GAME123)"
                  value={privateGameCode}
                  onChange={(e) => setPrivateGameCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinPrivateGame()}
                  className="form-input w-full text-center text-lg tracking-wider font-mono"
                />
                <button
                  type="button"
                  onClick={handleJoinPrivateGame}
                  disabled={!privateGameCode.trim()}
                  className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🎮 Join Game
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LobbyPage
