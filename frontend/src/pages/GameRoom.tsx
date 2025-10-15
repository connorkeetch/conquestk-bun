import type { TreasureConfig } from '@conquestk/shared'
import { Activity, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useNavigate, useParams } from 'react-router-dom'
// Lazy-load heavy modals to trim initial bundle
import { lazyWithRetry } from '@/utils/lazyWithRetry'

const LazyGameOverModal = lazyWithRetry(async () => ({
  default: (await import('@/components/GameOverModal')).GameOverModal,
}))

// Chat modal removed; drawers are used on all devices
import { ConnectionBanner } from '@/components/game/ConnectionBanner'
import { DiceResultsBar } from '@/components/game/DiceResultsBar'
import GameRoomFooter from '@/components/game/GameRoomFooter'
import { GameStartModal } from '@/components/game/GameStartModal'
// Player stats modal removed; drawers are used on all devices
import { PausedBanner } from '@/components/game/PausedBanner'
import { ResyncBanner } from '@/components/game/ResyncBanner'
import { TreasureTradeModal } from '@/components/game/TreasureTradeModal'
import { TurnTimer } from '@/components/game/TurnTimer'
// Removed YourTurnBanner in favor of styling the existing header
import { YourTurnModal } from '@/components/game/YourTurnModal'
import DropZone from '@/components/panels/DropZone'

// Lazy-load heavy panels to reduce initial bundle size
const LazyPlayerStatsPanel = lazyWithRetry(() => import('@/components/panels/PlayerStatsPanel'))
const LazyChatLogPanel = lazyWithRetry(() => import('@/components/panels/ChatLogPanel'))
const LazyGameLogPanelWrapper = lazyWithRetry(
  () => import('@/components/panels/GameLogPanelWrapper'),
)
// Keep lightweight sync imports above
const LazyPlayerProfileModal = lazyWithRetry(
  () => import('@/components/profile/PlayerProfileModal'),
)
const LazySettingsModal = lazyWithRetry(() => import('@/components/SettingsModal'))

import { useDrawerResize } from '@/hooks/useDrawerResize'
import { useQueryParam } from '@/hooks/useQueryParam'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import {
  DEFAULT_PANEL_WIDTH,
  type PanelConfig,
  type PanelId,
  type PanelZone,
  resetLayout,
  selectBelowMapLayout,
  selectPanels,
  selectPanelsByZone,
  setBelowMapLayout,
  setDrawerHeight,
  setDrawerPinned,
  setPanelZone,
  togglePin,
} from '@/store/panelsSlice'
import { setTreasureModalOpen } from '@/store/uiRoomSlice'
/* Unused after merge cleanup
import RankInsignia from '@/components/RankInsignia'
import { toggleMuteUser } from '@/store/uiRoomSlice'
*/
import { logger } from '@/utils/logger'
// PlayerStatsTable is used via PlayerStatsPanel tabs
import { ConquestKBoard } from '../components/ConquestKBoard'
import { Skeleton } from '../components/ui/Skeleton'
import {
  getBackgroundMotionPreference,
  setBackgroundMotionPreference,
} from '../config/themes.config'
import {
  COLOR_DISPLAY_NAMES,
  COLOR_HEX_VALUES,
  getColorDisplayName,
  getColorValue,
  PLAYER_COLORS,
  PREMIUM_COLORS,
  STANDARD_COLORS,
} from '../constants/colors'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { gameService } from '../services/gameService'
import { mapService } from '../services/mapService'
import { socketService } from '../services/socketService'
import { store } from '../store'
import {
  endTurn,
  goBackToReinforcement,
  resignFromGame,
  undoFortify,
  undoLastPlacement,
} from '../store/gameActions'
import {
  clearGame,
  fetchGameState,
  selectTargetTerritory,
  selectTerritory,
  setConquestTransfer,
  setPendingAction,
} from '../store/gameSlice'
import { setCurrentRoom } from '../store/roomSlice'
import { addClientLog, hydrateFromStorage, setDice } from '../store/uiRoomSlice'
import type { AIDifficulty, PlayerColor, Player as PlayerType } from '../types/game'
// import { ensureReadableOnDark, extractFirstHexColor } from '../utils/color'
import { formatStatus, hostDisplay, seatUsage } from '../utils/lobby'

const AI_DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  recruit: 'Recruit',
  commander: 'Commander',
  grandmaster: 'Grandmaster',
}

// AI difficulty ordering constant removed (unused here)

export default function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const layout = useResponsiveLayout()
  const { currentRoom } = useAppSelector((state) => state.room)
  const {
    currentGame,
    isLoading: isGameLoading,
    error: gameError,
  } = useAppSelector((state) => state.game)
  const activeGameRoomId = currentGame?.roomId ?? null
  const { user } = useAppSelector((state) => state.auth)
  const placementHistoryLen = useAppSelector(
    (state) => (state.uiRoom.placementHistory ?? []).length,
  )
  const panels = useAppSelector(selectPanels)
  const statsPanel = panels.find((p) => p.id === 'player-stats')
  const chatPanel = panels.find((p) => p.id === 'chat')
  const leftZonePanels = useAppSelector((s) => selectPanelsByZone(s, 'sidebar-left'))
  const rightZonePanels = useAppSelector((s) => selectPanelsByZone(s, 'sidebar-right'))
  const belowZonePanels = useAppSelector((s) => selectPanelsByZone(s, 'below-map'))
  const belowMapLayout = useAppSelector(selectBelowMapLayout)
  const [isDraggingPanel, setIsDraggingPanel] = useState(false)
  const [isEditingLayout, setIsEditingLayout] = useState(false)

  const gridStyle = useMemo(() => {
    if (!layout.isDesktopOrLarger) return undefined
    const DEFAULT_SIDEBAR_WIDTH = 340
    const hasLeft = leftZonePanels.length > 0
    const hasRight = rightZonePanels.length > 0
    let leftWidth = hasLeft
      ? Math.max(...leftZonePanels.map((p) => p.width || 0))
      : isDraggingPanel || isEditingLayout
        ? DEFAULT_SIDEBAR_WIDTH
        : 0
    let rightWidth = hasRight
      ? Math.max(...rightZonePanels.map((p) => p.width || 0))
      : isDraggingPanel || isEditingLayout
        ? DEFAULT_SIDEBAR_WIDTH
        : 0

    // Keep the center column visually centered on wide screens:
    // if exactly one sidebar is present, mirror its width on the opposite side
    if (leftWidth > 0 !== rightWidth > 0) {
      const present = Math.max(leftWidth, rightWidth, DEFAULT_SIDEBAR_WIDTH)
      if (leftWidth === 0) leftWidth = present
      if (rightWidth === 0) rightWidth = present
    }

    if (leftWidth > 0 || rightWidth > 0) {
      return { gridTemplateColumns: `${leftWidth}px 1fr ${rightWidth}px` }
    }
    return undefined
  }, [layout.isDesktopOrLarger, leftZonePanels, rightZonePanels, isDraggingPanel, isEditingLayout])
  const isSpectator = useQueryParam('spectate') === 'true'
  const [isRoomLoading, setIsRoomLoading] = useState(false)
  const [roomError, setRoomError] = useState<string | null>(null)
  // Mute button moved to bottom-right floating control; local state not needed here
  // Removed unused team update state
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const [selectedJoinColor, setSelectedJoinColor] = useState<string | null>(null)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  // AI opponents generally available in non-ranked lobbies (no flags)
  // AI drafting controls disabled (state removed)
  // Removed unused AI update state
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
  // Drawers only (chat + stats) across desktop and mobile
  const [statsDrawerOpen, setStatsDrawerOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [resignDialogOpen, setResignDialogOpen] = useState(false)
  const resignDialogRef = useRef<HTMLDivElement | null>(null)
  const resignDialogTitleId = useId()
  const mobileDrawerId = useId()
  const statsDrawerId = useId()

  // Drawer layout helpers
  const chatPinned = Boolean(chatPanel?.zone === 'drawer' && chatPanel?.isPinned)
  const statsPinned = Boolean(statsPanel?.zone === 'drawer' && statsPanel?.isPinned)
  const chatOpen = Boolean(chatPanel?.zone === 'drawer' && (mobileDrawerOpen || chatPinned))
  const statsOpen = Boolean(statsPanel?.zone === 'drawer' && (statsDrawerOpen || statsPinned))
  const chatOverlayOpen = Boolean(chatPanel?.zone === 'drawer' && mobileDrawerOpen && !chatPinned)
  const statsOverlayOpen = Boolean(statsPanel?.zone === 'drawer' && statsDrawerOpen && !statsPinned)
  const bothPinned = chatPinned && statsPinned
  // Content width baseline (align drawers to main content/boxes)
  const CONTENT_MAX_WIDTH_PX = 1200
  // Wider default widths but bounded by content width so drawers don't exceed boxes
  const MAX_SINGLE_DRAWER_PX = Math.min(960, CONTENT_MAX_WIDTH_PX)
  const MAX_PINNED_DRAWER_PX = Math.floor(CONTENT_MAX_WIDTH_PX / 2)
  // Gate treasure trade modal until turn-intro is dismissed
  const [turnIntroActive, setTurnIntroActive] = useState(false)
  useEffect(() => {
    const rid = currentGame?.roomId
    const uid = user?.id
    if (rid && uid) {
      try {
        setTurnIntroActive(Boolean(sessionStorage.getItem(`ui.turnModal.active:${rid}:${uid}`)))
      } catch {
        setTurnIntroActive(false)
      }
    }
    const onIntro = (e: Event) => {
      const ce = e as CustomEvent
      if (typeof ce.detail?.active === 'boolean') setTurnIntroActive(ce.detail.active)
    }
    window.addEventListener('turn-intro-active', onIntro as EventListener)
    return () => window.removeEventListener('turn-intro-active', onIntro as EventListener)
  }, [currentGame?.roomId, user?.id])
  const lifecycleAutoFetchTimeoutRef = useRef<number | null>(null)
  const lifecycleAutoFetchInFlightRef = useRef(false)
  const lifecycleAutoFetchRetryCountRef = useRef(0)
  const lastConquestHandledRef = useRef<string | null>(null)
  const forcedPanelZonesRef = useRef<Partial<Record<PanelId, PanelZone>>>({})

  // Drawer resize hooks
  const chatDrawerResize = useDrawerResize({
    initialHeight: chatPanel?.drawerHeight ?? 300,
    onResize: (height) => dispatch(setDrawerHeight({ panelId: 'chat', height })),
    disabled: !mobileDrawerOpen,
  })

  const statsDrawerResize = useDrawerResize({
    initialHeight: statsPanel?.drawerHeight ?? 300,
    onResize: (height) => dispatch(setDrawerHeight({ panelId: 'player-stats', height })),
    disabled: !statsDrawerOpen,
  })

  // Prefetchers (hover/viewport intent)
  const prefetchChatPanel = useCallback(() => {
    try {
      void import('@/components/panels/ChatLogPanel')
      void import('@/components/chat/TabbedGameChat')
    } catch (_e) {
      /* prefetch optional panels may fail in dev hot reload */
    }
  }, [])
  const prefetchStatsPanel = useCallback(() => {
    try {
      void import('@/components/panels/PlayerStatsPanel')
      void import('@/components/game/PlayerStatsTable')
    } catch (_e) {
      /* prefetch optional panels may fail in dev hot reload */
    }
  }, [])
  const prefetchGameLogPanel = useCallback(() => {
    try {
      void import('@/components/panels/GameLogPanelWrapper')
      void import('@/components/chat/GameLogPanel')
    } catch (_e) {
      /* prefetch optional panels may fail in dev hot reload */
    }
  }, [])
  const prefetchModalsIdle = useCallback(() => {
    try {
      void import('@/components/GameOverModal')
      void import('@/components/profile/PlayerProfileModal')
      void import('@/components/SettingsModal')
    } catch (_e) {
      /* prefetch optional panels may fail in dev hot reload */
    }
  }, [])

  // Idle/viewport-based prefetch when panels are pinned or visible
  const prefetchedRef = useRef<{ chat?: boolean; stats?: boolean; log?: boolean }>({})
  useEffect(() => {
    const hasChat = panels.some((p) => p.id === 'chat')
    const hasStats = panels.some((p) => p.id === 'player-stats')
    const hasLog = panels.some((p) => p.id === 'game-log')

    const rIC = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
      }
    ).requestIdleCallback
    const schedule = (cb: () => void) =>
      typeof rIC === 'function' ? rIC(cb, { timeout: 1200 }) : window.setTimeout(cb, 600)

    if (hasChat && !prefetchedRef.current.chat) {
      schedule(() => {
        prefetchChatPanel()
        prefetchedRef.current.chat = true
      })
    }
    if (hasStats && !prefetchedRef.current.stats) {
      schedule(() => {
        prefetchStatsPanel()
        prefetchedRef.current.stats = true
      })
    }
    if (hasLog && !prefetchedRef.current.log) {
      schedule(() => {
        prefetchGameLogPanel()
        prefetchedRef.current.log = true
      })
    }
  }, [panels, prefetchChatPanel, prefetchStatsPanel, prefetchGameLogPanel])

  useEffect(() => {
    const rIC = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
      }
    ).requestIdleCallback
    const id =
      typeof rIC === 'function'
        ? rIC(prefetchModalsIdle, { timeout: 2000 })
        : window.setTimeout(prefetchModalsIdle, 1000)
    return () => {
      const w = window as unknown as Record<string, unknown>
      const cancel =
        typeof w.cancelIdleCallback === 'function'
          ? (w.cancelIdleCallback as (handle: number) => void)
          : null
      if (cancel) {
        cancel(id as number)
      } else {
        window.clearTimeout(id)
      }
    }
  }, [prefetchModalsIdle])

  // Drag-and-drop helpers
  const parseDraggedPanelId = useCallback(
    (e: React.DragEvent): ('player-stats' | 'chat' | 'game-log') | null => {
      try {
        const id = e.dataTransfer.getData('application/x-conquestk-panel')
        if (id === 'player-stats' || id === 'chat' || id === 'game-log') return id
      } catch {
        // ignore
      }
      try {
        const txt = e.dataTransfer.getData('text/plain') || ''
        if (txt.startsWith('panel:')) {
          const id = txt.slice('panel:'.length)
          if (id === 'player-stats' || id === 'chat' || id === 'game-log') return id
        }
      } catch {
        // ignore
      }
      return null
    },
    [],
  )

  const handleDropToZone = useCallback(
    (zone: PanelZone, order?: number) => (e: React.DragEvent) => {
      if (!isEditingLayout) return
      const panelId = parseDraggedPanelId(e)
      if (!panelId) return
      dispatch(setPanelZone({ panelId, zone, ...(order !== undefined ? { order } : {}) }))
      setIsDraggingPanel(false)
    },
    [dispatch, parseDraggedPanelId, isEditingLayout],
  )

  const boardMaxWidth = useMemo(() => {
    if (!layout.isDesktopOrLarger) return undefined
    if (layout.isUltrawide) return 1600
    if (layout.isWide) return 1400
    return 1180
  }, [layout.isDesktopOrLarger, layout.isUltrawide, layout.isWide])

  const boardMaxHeight = useMemo(() => {
    if (!layout.isDesktopOrLarger) return undefined
    const viewportHeight = layout.height ?? 0
    if (!viewportHeight) return undefined
    const reserved = 280
    return Math.max(640, viewportHeight - reserved)
  }, [layout.height, layout.isDesktopOrLarger])

  useEffect(() => {
    const panelById = panels.reduce<Record<PanelId, PanelConfig>>(
      (acc, panel) => {
        acc[panel.id] = panel
        return acc
      },
      {} as Record<PanelId, PanelConfig>,
    )

    const rememberZone = (panel: PanelConfig) => {
      if (!forcedPanelZonesRef.current[panel.id]) {
        forcedPanelZonesRef.current[panel.id] = panel.zone
      }
    }

    const releaseZone = (panelId: PanelId, zone: PanelZone) => {
      if (forcedPanelZonesRef.current[panelId] === zone) {
        delete forcedPanelZonesRef.current[panelId]
      }
    }

    const actions: Array<() => void> = []

    if (!layout.isDesktopOrLarger) {
      panels.forEach((panel) => {
        if (panel.zone !== 'drawer') {
          rememberZone(panel)
          actions.push(() => dispatch(setPanelZone({ panelId: panel.id, zone: 'drawer' })))
        }
      })
      actions.forEach((fn) => {
        fn()
      })
      return
    }

    const allowedSidebars: PanelZone[] = []
    if (layout.isUltrawide) {
      allowedSidebars.push('sidebar-left', 'sidebar-right')
    } else if (layout.isWide) {
      const leftWeight = leftZonePanels.reduce(
        (total, panel) => total + (panel.width || DEFAULT_PANEL_WIDTH),
        0,
      )
      const rightWeight = rightZonePanels.reduce(
        (total, panel) => total + (panel.width || DEFAULT_PANEL_WIDTH),
        0,
      )

      let keepZone: PanelZone = 'sidebar-left'
      if (rightWeight > leftWeight) {
        keepZone = 'sidebar-right'
      } else if (rightWeight === leftWeight) {
        if (rightZonePanels.length > leftZonePanels.length) {
          keepZone = 'sidebar-right'
        } else if (rightZonePanels.length === leftZonePanels.length && rightZonePanels.length > 0) {
          keepZone = 'sidebar-right'
        } else if (rightZonePanels.length === 0 && leftZonePanels.length === 0) {
          keepZone = 'sidebar-left'
        }
      }
      if (rightZonePanels.length === 0 && leftZonePanels.length > 0) {
        keepZone = 'sidebar-left'
      }
      if (leftZonePanels.length === 0 && rightZonePanels.length > 0) {
        keepZone = 'sidebar-right'
      }
      allowedSidebars.push(keepZone)
    }

    const allowedZones = new Set<PanelZone>(['below-map', ...allowedSidebars])
    let nextBelowOrder = belowZonePanels.length

    const queueMove = (panel: PanelConfig, zone: PanelZone, order?: number) => {
      if (panel.zone === zone) return
      rememberZone(panel)
      actions.push(() =>
        dispatch(
          setPanelZone({ panelId: panel.id, zone, ...(order !== undefined ? { order } : {}) }),
        ),
      )
    }

    ;(['sidebar-left', 'sidebar-right'] as PanelZone[]).forEach((zone) => {
      const zonePanels = zone === 'sidebar-left' ? leftZonePanels : rightZonePanels
      if (allowedZones.has(zone)) {
        zonePanels.forEach((panel) => {
          releaseZone(panel.id, zone)
        })
        return
      }
      zonePanels.forEach((panel) => {
        queueMove(panel, 'below-map', nextBelowOrder)
        nextBelowOrder += 1
      })
    })

    Object.entries(forcedPanelZonesRef.current).forEach(([id, storedZone]) => {
      const panelId = id as PanelId
      if (!storedZone) return
      if (!allowedZones.has(storedZone)) {
        return
      }
      const panel = panelById[panelId]
      if (!panel) {
        delete forcedPanelZonesRef.current[panelId]
        return
      }
      if (panel.zone === storedZone) {
        delete forcedPanelZonesRef.current[panelId]
        return
      }
      actions.push(() => dispatch(setPanelZone({ panelId, zone: storedZone })))
      delete forcedPanelZonesRef.current[panelId]
    })

    actions.forEach((fn) => {
      fn()
    })
  }, [
    layout.isDesktopOrLarger,
    layout.isWide,
    layout.isUltrawide,
    panels,
    belowZonePanels,
    leftZonePanels,
    rightZonePanels,
    dispatch,
  ])

  // Prevent background scroll when any drawer is open
  useEffect(() => {
    if (!mobileDrawerOpen && !statsDrawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileDrawerOpen, statsDrawerOpen])

  // Ensure overlay drawers never overlap: allow only one overlay at a time
  useEffect(() => {
    if (mobileDrawerOpen && statsDrawerOpen && !chatPinned && !statsPinned) {
      setStatsDrawerOpen(false)
    }
  }, [mobileDrawerOpen, statsDrawerOpen, chatPinned, statsPinned])
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

  // Derived membership/host flags must be declared before downstream hooks that depend on them
  const isMember = Boolean(currentPlayer)
  const isHost = currentRoom?.hostId === user?.id

  // Removed legacy mute offset calculation (mute integrated in footer)

  // Open Game Over modal when game finishes
  useEffect(() => {
    if (currentGame?.phase === 'finished') {
      setShowGameOver(true)
    }
  }, [currentGame?.phase])

  // Auto-disable background animations during active gameplay for better performance
  // Respects user's performance mode preference
  const settings = useAppSelector((state) => state.settings)
  // Centralized Treasure modal state
  const treasureModalOpen = useAppSelector((s) => s.uiRoom.treasureModalOpen === true)
  const userBackgroundMotionRef = useRef<boolean | null>(null)

  useEffect(() => {
    // Skip if performance mode is already enabled (user wants it off permanently)
    if (settings.performance?.mode) {
      return
    }

    const isGameActive =
      currentGame && currentGame.phase !== 'finished' && currentGame.phase !== null

    // Game just started - save user preference and disable animations
    if (isGameActive && userBackgroundMotionRef.current === null) {
      userBackgroundMotionRef.current = getBackgroundMotionPreference()
      setBackgroundMotionPreference(false, false) // don't persist
    }

    // Game ended - restore user preference
    if (!isGameActive && userBackgroundMotionRef.current !== null) {
      setBackgroundMotionPreference(userBackgroundMotionRef.current, false)
      userBackgroundMotionRef.current = null
    }
  }, [currentGame?.phase, settings.performance?.mode, currentGame])

  const lobbyFull = Boolean(
    currentRoom && (currentRoom.players?.length ?? 0) >= currentRoom.maxPlayers,
  )

  // Host-alone detection unused after simplifying close/leave logic

  // Team assignment UI not used here

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

  // Show phase/timer only after game has started
  const showPhaseBar = useMemo(
    () => Boolean(currentGame && currentRoom?.status === 'active'),
    [currentGame, currentRoom?.status],
  )

  const gamePhase = currentGame?.phase ?? 'reinforcement'
  const isFinishedPhase = gamePhase === 'finished' || currentRoom?.status === 'completed'
  const reinforcementArmies = useAppSelector((state) => state.game.reinforcementArmies)
  const isMyTurn = Boolean(user?.id && currentGame?.currentPlayer === user.id)
  const isGameActive =
    gamePhase === 'reinforcement' || gamePhase === 'attack' || gamePhase === 'fortify'
  const canGoBackToReinforcement =
    isMyTurn && isGameActive && gamePhase === 'attack' && !currentGame?.hasAttackedThisTurn
  const hasFortifyUndo = Boolean(
    currentGame && Object.keys(currentGame.movementTracking ?? {}).length > 0,
  )
  const endPhaseLabel =
    gamePhase === 'reinforcement'
      ? 'End Phase → Attack'
      : gamePhase === 'attack'
        ? 'End Phase → Fortify'
        : gamePhase === 'fortify'
          ? 'End Phase → End Turn'
          : 'End Phase'
  const endPhaseTitle =
    gamePhase === 'reinforcement' && reinforcementArmies > 0
      ? `Place ${reinforcementArmies} reinforcements to continue`
      : endPhaseLabel
  const activePlayer = useMemo(
    () => currentGame?.players?.find((player) => player.id === currentGame.currentPlayer),
    [currentGame?.currentPlayer, currentGame?.players],
  )
  const activePlayerColor = activePlayer?.color ? getColorValue(activePlayer.color) : '#9CA3AF'
  const roundNumber = Math.max(1, currentGame?.turn ?? 1)

  // Lobby team details omitted in this view

  // AI-related counters removed (not shown in this view)

  const mapDisplayName = currentRoom?.mapName || mapPreview?.name || null

  const mapPreviewAspectRatio = useMemo(() => {
    if (mapPreview?.width && mapPreview?.height) {
      return `${mapPreview.width}/${mapPreview.height}`
    }

    return undefined
  }, [mapPreview?.height, mapPreview?.width])

  // Tier mapping helpers removed (unused)

  // Tier mapping helpers unused in this component

  // Roman numeral helper unused

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
        const base = {
          imageUrl: data.map.imageUrl ?? null,
          width: data.map.imageWidth,
          height: data.map.imageHeight,
          name: data.map.name,
        }
        const preview = Array.isArray(data.territories)
          ? { ...base, territoryCount: data.territories.length }
          : base
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

  // Track whether a panel is being dragged to toggle zone highlights
  useEffect(() => {
    const onStart = (e: Event) => {
      setIsDraggingPanel(true)
      // Try to get the panel ID from the event detail if available
      const customEvent = e as CustomEvent
      if (customEvent.detail?.panelId) {
        // Panel ID tracked for potential future use
      }
    }
    const onEnd = () => {
      setIsDraggingPanel(false)
      // Clear panel ID
    }
    window.addEventListener('panel-drag-start', onStart as EventListener)
    window.addEventListener('panel-drag-end', onEnd as EventListener)
    return () => {
      window.removeEventListener('panel-drag-start', onStart as EventListener)
      window.removeEventListener('panel-drag-end', onEnd as EventListener)
    }
  }, [])

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

  // In-room AI controls disabled; AI set at creation time

  // AI draft normalization and effects removed

  // Omit derived AI controls (unused)

  // Omit AI save handlers (unused)

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
          const qs = typeof window !== 'undefined' ? window.location.search : ''
          navigate(`/room/${canonicalId}${qs || ''}`, { replace: true })
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
  }, [currentRoom, dispatch, roomId, navigate])

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
      lifecycleAutoFetchRetryCountRef.current = 0
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
            const MAX_RETRIES = 10

            const shouldRetry =
              latestRoom &&
              latestRoom.id === roomId &&
              (latestRoom.status === 'initializing' ||
                latestRoom.status === 'active' ||
                latestRoom.status === 'paused')

            // Lifecycle updates may flip to "active" before the engine exposes a state snapshot,
            // so allow retries for any in-progress lifecycle status rather than only initializing.
            if (shouldRetry && lifecycleAutoFetchRetryCountRef.current < MAX_RETRIES) {
              lifecycleAutoFetchRetryCountRef.current++
              lifecycleAutoFetchTimeoutRef.current = window.setTimeout(attemptFetch, 750)
            } else if (lifecycleAutoFetchRetryCountRef.current >= MAX_RETRIES) {
              logger.warn('Max retries exceeded for fetchGameState', {
                roomId,
                retries: lifecycleAutoFetchRetryCountRef.current,
                status: latestRoom?.status,
              })
              lifecycleAutoFetchRetryCountRef.current = 0
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

  const handleCancelRoom = async () => {
    if (!currentRoom) return
    const ok = window.confirm('Close this room? This will cancel the lobby for everyone.')
    if (!ok) return
    try {
      await gameService.closeRoom(currentRoom.id)
      toast.success('Room closed')
      navigate('/lobby')
    } catch (error) {
      logger.error('Failed to close room', error)
      toast.error('Failed to close room')
    }
  }

  // Inline mute toggle moved to floating button component

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
      // Undo (Z key)
      if (key === 'z') {
        e.preventDefault()
        const phase = currentGame?.phase
        // Reinforcement: undo last placement if any
        const hasPlacementUndo = Boolean(state.uiRoom?.placementHistory?.length)
        if (phase === 'reinforcement' && hasPlacementUndo) {
          void dispatch(undoLastPlacement())
        } else if (
          phase === 'fortify' &&
          Object.keys(currentGame?.movementTracking ?? {}).length > 0
        ) {
          void dispatch(undoFortify())
        } else {
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
      // Removed overlay toggle hotkeys (g/h) for a simpler UI
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

  // Watch for conquest to show army transfer modal
  const battleResult = useAppSelector((s) => s.game.battleResult)
  const conquestTransfer = useAppSelector((s) => s.game.conquestTransfer)

  useEffect(() => {
    if (!battleResult || !battleResult.conquered || !currentGame || !user) return
    // pendingConquestFor contains a player ID, not a user ID
    if (battleResult.pendingConquestFor !== currentGame.currentPlayer) return

    const actingPlayer = currentGame.players.find(
      (player) => player.id === currentGame.currentPlayer,
    )
    const actingUserId = actingPlayer?.userId ?? actingPlayer?.id ?? null

    if (!actingUserId || actingUserId !== user.id) {
      return
    }

    const fromId =
      typeof battleResult.fromTerritory === 'string'
        ? battleResult.fromTerritory
        : battleResult.fromTerritory.id
    const toId =
      typeof battleResult.toTerritory === 'string'
        ? battleResult.toTerritory
        : battleResult.toTerritory.id

    const fromTerritory = currentGame.board.find((territory) => territory.id === fromId)
    const toTerritory = currentGame.board.find((territory) => territory.id === toId)

    if (!fromTerritory || !toTerritory) {
      return
    }

    const availableArmies = Math.max(0, fromTerritory.armies - 1)
    if (availableArmies <= 0) {
      return
    }

    const conquestKey = `${currentGame.turn}:${fromTerritory.id}->${toTerritory.id}`

    if (lastConquestHandledRef.current === conquestKey) {
      if (
        conquestTransfer &&
        (conquestTransfer.fromTerritoryId !== fromTerritory.id ||
          conquestTransfer.toTerritoryId !== toTerritory.id ||
          conquestTransfer.availableArmies !== availableArmies)
      ) {
        dispatch(
          setConquestTransfer({
            fromTerritoryId: fromTerritory.id,
            toTerritoryId: toTerritory.id,
            availableArmies,
          }),
        )
      }
      return
    }

    lastConquestHandledRef.current = conquestKey
    dispatch(
      setConquestTransfer({
        fromTerritoryId: fromTerritory.id,
        toTerritoryId: toTerritory.id,
        availableArmies,
      }),
    )
  }, [battleResult, conquestTransfer, currentGame, user, dispatch])

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

  // Team change handler not used here

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
    <div className="mx-auto flex w-full max-w-none lg:max-w-[min(1600px,100vw-2rem)] 2xl:max-w-none flex-col gap-6 px-0 pb-20 pt-0 lg:px-10">
      {/* Sticky title banner below main header */}
      <div
        className="sticky z-40 sm:-mx-6 sm:px-6 bg-[color:color-mix(in srgb, var(--surface-1) 92%, transparent)] backdrop-blur border-b border-border"
        style={{ top: 'calc(env(safe-area-inset-top) + 56px)' }}
      >
        <div className="mx-auto w-full max-w-[clamp(960px,60vw,1400px)]">
          {/* One-line top banner with room info + actions */}
          <div className="flex items-center justify-between gap-2 rounded border border-border bg-[color:var(--surface-2)] px-3 py-1 text-[length:clamp(12px,1.6vw,14px)]">
            <div
              className="min-w-0 flex-1 truncate text-[color:var(--heading)]"
              title={`${currentRoom.name}${
                typeof currentRoom.roomCode === 'number' ? ` — Room ${currentRoom.roomCode}` : ''
              } • Hosted by ${hostDisplay(currentRoom)} • ${seatUsage(currentRoom).label} • ${formatStatus(currentRoom.status)}`}
            >
              <span className="truncate">
                {currentRoom.name}
                {typeof currentRoom.roomCode === 'number' ? ` — Room ${currentRoom.roomCode}` : ''}
                <span className="mx-2 opacity-60">•</span>
                Hosted by <span className="font-semibold">{hostDisplay(currentRoom)}</span>
                <span className="mx-2 opacity-60">•</span>
                {seatUsage(currentRoom).label}
                <span className="mx-2 opacity-60">•</span>
                <span
                  className={(() => {
                    switch (currentRoom.status) {
                      case 'lobby':
                        return 'text-green-400 font-medium'
                      case 'initializing':
                        return 'text-blue-300 font-medium'
                      case 'active':
                        return 'text-yellow-400 font-medium'
                      case 'paused':
                        return 'text-orange-300 font-medium'
                      default:
                        return 'text-muted font-medium'
                    }
                  })()}
                >
                  {formatStatus(currentRoom.status)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isMember && (
                <button
                  onClick={() => openJoinDialog()}
                  disabled={joinActionDisabled}
                  type="button"
                  title={joinButtonTitle}
                  className="btn btn-primary btn-sm"
                >
                  {joinButtonLabel}
                </button>
              )}
              {(currentRoom.status === 'lobby' || currentRoom.status === 'initializing') && (
                <>
                  <button
                    onClick={() => void handleCopyInviteLink()}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="Copy invite link"
                    aria-live="polite"
                  >
                    {inviteLinkCopied ? 'Link copied ✓' : 'Copy Link'}
                  </button>
                  {isHost ? (
                    <button
                      onClick={() => void handleCancelRoom()}
                      type="button"
                      className="btn btn-danger btn-sm"
                    >
                      Close Room
                    </button>
                  ) : (
                    <button
                      onClick={handleLeaveRoom}
                      type="button"
                      className="btn btn-danger btn-sm"
                    >
                      Leave Room
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {showPhaseBar && currentGame && (
            <div
              className={`chip w-full flex flex-col gap-2 text-xs sm:text-sm ${
                isMyTurn && !isFinishedPhase
                  ? 'ring-1 ring-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12 animate-pulse'
                  : 'bg-[color:var(--surface-2)]'
              }`}
            >
              {/* Unified, wrapping row: info + phases + actions */}
              <div className="flex w-full flex-wrap items-center gap-2">
                {/* Turn info (left) */}
                <div className="flex min-w-0 items-center gap-3">
                  {isFinishedPhase ? (
                    <>
                      <span className="font-semibold uppercase tracking-wide text-[10px] sm:text-xs">
                        Game Complete
                      </span>
                      {(() => {
                        const winners = currentGame.players.filter((p) => !p.isEliminated)
                        if (!winners.length) return null
                        const names = winners.map((w) => w.username)
                        const label =
                          names.length <= 3
                            ? names.join(', ')
                            : `${names.slice(0, 3).join(', ')} +${names.length - 3}`
                        return (
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <span
                              aria-hidden
                              className="inline-block h-2.5 w-2.5 rounded-full border border-white/50"
                              style={{ background: getColorValue(winners[0].color) }}
                              title={label}
                            />
                            <span className="max-w-[200px] truncate font-medium">
                              Winner{winners.length > 1 ? 's' : ''}: {label}
                            </span>
                          </span>
                        )
                      })()}
                    </>
                  ) : (
                    <>
                      <span className="font-semibold uppercase tracking-wide text-[10px] sm:text-xs">
                        Round {roundNumber}
                      </span>
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-2.5 w-2.5 rounded-full border border-white/50"
                          style={{ background: activePlayerColor }}
                        />
                        <span className="max-w-[160px] truncate font-medium">
                          {activePlayer?.username ?? 'Player'}
                        </span>
                      </span>
                      <TurnTimer className="text-xs sm:text-sm" showBank={false} />
                      {!isMyTurn && isGameActive && (
                        <span className="flex items-center gap-2 text-[11px] text-muted">
                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[color:var(--color-accent)]" />
                          <span>
                            Waiting for {activePlayer?.username || 'Opponent'} —{' '}
                            {gamePhase === 'reinforcement'
                              ? 'reinforcing'
                              : gamePhase === 'attack'
                                ? 'attacking'
                                : gamePhase === 'fortify'
                                  ? 'fortifying'
                                  : gamePhase}
                          </span>
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Phases (center on wrap) */}
                {isMyTurn && !isFinishedPhase && (
                  <fieldset
                    aria-label="Turn phases"
                    className="order-3 flex w-full items-center justify-center gap-2 sm:order-none sm:w-auto sm:mx-auto"
                  >
                    <legend className="sr-only">Turn phases</legend>
                    {(['reinforcement', 'attack', 'fortify'] as const).map((phaseKey) => {
                      const active = gamePhase === phaseKey
                      const label =
                        phaseKey === 'reinforcement'
                          ? 'Reinforce'
                          : phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)
                      return (
                        <span
                          key={phaseKey}
                          className={
                            'inline-flex items-center gap-1 rounded px-2 py-1 font-medium ' +
                            (active
                              ? 'bg-[color:var(--color-accent)]/20 ring-1 ring-[color:var(--color-accent)] text-[color:var(--heading)]'
                              : 'bg-[color:var(--surface-1)] text-muted')
                          }
                        >
                          {label}
                        </span>
                      )
                    })}
                  </fieldset>
                )}

                {/* Actions (right on wide, centered below on wrap) */}
                <div className="order-2 flex w-full flex-wrap items-center justify-center gap-2 sm:order-none sm:w-auto sm:ml-auto">
                  {isMyTurn &&
                    !isFinishedPhase &&
                    isGameActive &&
                    gamePhase === 'reinforcement' &&
                    placementHistoryLen > 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void dispatch(undoLastPlacement())}
                        title="Undo last placement (Z)"
                      >
                        ↶ Undo
                      </button>
                    )}
                  {isMyTurn &&
                    !isFinishedPhase &&
                    isGameActive &&
                    gamePhase === 'fortify' &&
                    hasFortifyUndo && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void dispatch(undoFortify())}
                        title="Undo last fortify (Z)"
                      >
                        ↶ Undo
                      </button>
                    )}
                  {isMyTurn && !isFinishedPhase && canGoBackToReinforcement && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void dispatch(goBackToReinforcement())}
                      title="Go back to reinforcement"
                    >
                      ↩ Reinforce
                    </button>
                  )}
                  {isMyTurn && !isFinishedPhase && isGameActive && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void dispatch(endTurn())}
                      title={endPhaseTitle}
                    >
                      {endPhaseLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Banners appear below the sticky title */}
      <ConnectionBanner />
      <PausedBanner />
      <ResyncBanner roomId={currentRoom.id} allowSpectate={isSpectator} />
      <GameStartModal />
      <YourTurnModal />

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:color-mix(in_srgb,var(--surface-1)_8%,black)] backdrop-blur-sm">
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
              This will immediately resign you and set your territories to neutral. This action
              cannot be undone.
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
                    dispatch(resignFromGame(currentRoom.id))
                    dispatch(
                      addClientLog({
                        text: 'You resigned. Territories are now neutral.',
                        roomId: currentRoom.id,
                      }),
                    )
                    toast.success('Resigned')
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:color-mix(in_srgb,var(--surface-1)_8%,black)] backdrop-blur-sm">
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
            <p className="text-sm text-muted">Each player must pick a unique color.</p>

            {/* Standard Colors */}
            <div className="space-y-2">
              <p className="text-xs text-muted">Standard Colors</p>
              <div className="grid grid-cols-6 gap-2">
                {STANDARD_COLORS.map((hex) => {
                  const taken = takenColors.has(hex.toUpperCase())
                  const isSelected = selectedJoinColor?.toUpperCase() === hex.toUpperCase()
                  return (
                    <button
                      key={hex}
                      type="button"
                      className={`h-8 w-8 rounded-full border transition-transform ${
                        isSelected ? 'ring-2 ring-white' : ''
                      } ${taken ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
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
            </div>

            {/* Premium Colors */}
            <div className="space-y-2">
              <p className="text-xs text-muted flex items-center gap-2">
                Premium Colors <span className="text-amber-400">⭐</span>
              </p>
              <div className="grid grid-cols-6 gap-2">
                {PREMIUM_COLORS.map((key) => {
                  const bg = COLOR_HEX_VALUES[key]
                  const display = COLOR_DISPLAY_NAMES[key] || key
                  const isSelected = selectedJoinColor === key
                  // Treat as taken if someone chose the premium key or its solid hex
                  const solidHex = (() => {
                    // COLOR_HEX_VALUES may be a gradient or hex; try to extract likely solid
                    return bg.startsWith('#') ? bg.toUpperCase() : '#FB923C'
                  })()
                  const taken = takenColors.has(key.toUpperCase()) || takenColors.has(solidHex)

                  const isPremiumUser = Boolean(
                    user?.isVip ||
                      (user?.premiumTier && user.premiumTier !== 'free') ||
                      user?.isPremium,
                  )
                  const disabled = taken || !isPremiumUser

                  return (
                    <button
                      key={key}
                      type="button"
                      className={`relative h-8 w-8 rounded-full border transition-transform ${
                        isSelected
                          ? 'ring-2 ring-amber-400 border-amber-400'
                          : 'border-[rgba(255,255,255,0.25)]'
                      } ${
                        disabled
                          ? 'opacity-50 cursor-not-allowed'
                          : 'cursor-pointer hover:scale-105 hover:border-amber-400'
                      }`}
                      style={{ background: bg }}
                      onClick={() => {
                        if (!disabled) setSelectedJoinColor(key)
                      }}
                      disabled={disabled}
                      aria-label={`Select color ${display}${taken ? ' (taken)' : ''}`}
                      title={
                        taken
                          ? `${display} (Already taken)`
                          : isPremiumUser
                            ? display
                            : `${display} (Premium Required)`
                      }
                    >
                      {/* Star badge */}
                      <span className="absolute -top-1 -right-1 text-amber-400 text-xs">⭐</span>
                      {/* Lock overlay for non-premium */}
                      {!isPremiumUser && (
                        <span className="absolute inset-0 grid place-items-center text-[10px] text-amber-300">
                          🔒
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
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

      <div
        className={`
          flex flex-col gap-4
          ${layout.isDesktopOrLarger && (leftZonePanels.length > 0 || rightZonePanels.length > 0 || isEditingLayout) ? 'lg:grid lg:gap-3 xl:gap-2 2xl:gap-1 lg:items-start' : ''}
        `}
        style={gridStyle}
      >
        {/* Left Sidebar Zone (Desktop+) */}
        {layout.isDesktopOrLarger && (leftZonePanels.length > 0 || isEditingLayout) && (
          <aside className="sticky top-6 space-y-3">
            {/* Top drop zone - always show when editing */}
            {isEditingLayout && (
              <DropZone
                onDrop={handleDropToZone('sidebar-left', 0)}
                active={true}
                orientation="vertical"
                className="my-1"
              />
            )}
            {leftZonePanels.map((p) => (
              <div key={p.id} className="space-y-3">
                {p.id === 'player-stats' && (
                  <Suspense
                    fallback={
                      <div className="panel p-0 overflow-hidden">
                        <div className="bg-[color:var(--surface-2)] px-3 py-2 border-b border-[color:var(--panel-border)]">
                          <div className="text-sm font-semibold text-[color:var(--heading)]">
                            Player Stats
                          </div>
                        </div>
                        <div className="p-3">
                          <Skeleton variant="rectangular" width="100%" height={180} />
                        </div>
                      </div>
                    }
                  >
                    <LazyPlayerStatsPanel
                      players={
                        currentGame?.players && currentGame.players.length > 0
                          ? currentGame.players
                          : (currentRoom?.players || []).map((pl) => {
                              const rawColor =
                                ((pl as { selected_color?: string | null }).selected_color as
                                  | string
                                  | null) ||
                                ((pl.preferred_color as string | null) ?? null) ||
                                '#9CA3AF'
                              const base = {
                                id: pl.userId || pl.id,
                                userId: pl.userId || pl.id,
                                username: pl.username,
                                color: rawColor as unknown as PlayerColor,
                                territories: [],
                                armies: 0,
                                cards: [],
                                isEliminated: false,
                                aiDifficulty: pl.aiDifficulty ?? null,
                                treasures: [],
                              }
                              return {
                                ...base,
                                ...(pl.isAi !== undefined ? { isAi: Boolean(pl.isAi) } : {}),
                                ...(pl.teamId !== undefined ? { teamId: pl.teamId } : {}),
                              } as unknown as PlayerType
                            })
                      }
                      {...(currentGame ? { currentPlayerId: currentGame.currentPlayer } : {})}
                      territories={
                        currentGame
                          ? Object.fromEntries(
                              (currentGame.board || []).map((t) => [
                                t.id,
                                { owner: t.ownerId, armies: t.armies },
                              ]),
                            )
                          : {}
                      }
                      isEditingLayout={isEditingLayout}
                      onResignRequest={() => setResignDialogOpen(true)}
                    />
                  </Suspense>
                )}
                {p.id === 'chat' && currentGame && user && (
                  <Suspense
                    fallback={
                      <div className="panel p-0 overflow-hidden">
                        <div className="bg-[color:var(--surface-2)] px-3 py-2 border-b border-[color:var(--panel-border)]">
                          <div className="text-sm font-semibold text-[color:var(--heading)]">
                            Chat & Log
                          </div>
                        </div>
                        <div className="p-3">
                          <Skeleton variant="rectangular" width="100%" height={160} />
                        </div>
                      </div>
                    }
                  >
                    <LazyChatLogPanel
                      gameId={currentRoom?.id ?? roomId ?? ''}
                      currentUserId={user.id}
                      userTeamId={
                        (currentGame?.players?.find((pp) => pp.userId === user.id)?.teamId ??
                          null) as number | null
                      }
                      onLogFocus={(territories) => {
                        const focus = territories[territories.length - 1]
                        if (focus) dispatch(selectTerritory(focus))
                      }}
                      isEditingLayout={isEditingLayout}
                    />
                  </Suspense>
                )}
              </div>
            ))}
            {/* End drop zone */}
            {isEditingLayout && (
              <DropZone
                onDrop={handleDropToZone('sidebar-left', leftZonePanels.length)}
                active={true}
                orientation="vertical"
                className="my-1"
              />
            )}
          </aside>
        )}

        {/* Center Column - Game Board and Action Bar Container */}
        <div
          className="flex flex-col gap-2 min-w-0 w-full"
          style={{
            maxWidth: boardMaxWidth ? `${boardMaxWidth}px` : undefined,
            marginInline: layout.isDesktopOrLarger ? 'auto' : undefined,
          }}
        >
          {/* Game Board - full width */}
          <div
            className="flex-1 min-w-0 flex flex-col w-full max-w-none"
            style={{
              maxHeight: boardMaxHeight ? `${boardMaxHeight}px` : undefined,
            }}
          >
            <div className="flex-1 min-h-0">
              {currentGame ? (
                <ConquestKBoard
                  mapId={currentRoom?.mapId || 'world'}
                  onTerritoryClick={(_territoryId) => {
                    // TODO: Handle territory interactions based on game phase
                  }}
                />
              ) : currentRoom ? (
                <ConquestKBoard
                  mapId={currentRoom.mapId || 'world'}
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
                    className="relative flex flex-1 items-center justify-center overflow-hidden bg-[color:var(--surface-2)] p-0 sm:p-6"
                    style={
                      mapPreviewAspectRatio ? { aspectRatio: mapPreviewAspectRatio } : undefined
                    }
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
                        const cr = currentRoom as {
                          maxPlayers?: number
                          players?: unknown[]
                          status?: string
                        } | null
                        const total = cr?.maxPlayers ?? 0
                        const joined = (cr?.players as unknown[] | undefined)?.length ?? 0
                        const needed = Math.max(0, total - joined)
                        return needed > 0
                          ? `Need ${needed} more ${needed === 1 ? 'player' : 'players'} to begin`
                          : `All players present • ${joined}/${total}`
                      })()}
                    </p>
                    {(() => {
                      const msg = (currentRoom as { statusMessage?: string | null } | null)
                        ?.statusMessage
                      const lvl = (
                        currentRoom as {
                          statusMessageLevel?: 'error' | 'info' | 'warn' | null
                        } | null
                      )?.statusMessageLevel
                      if (!msg) return null
                      const isError = lvl === 'error'
                      const isWarn = lvl === 'warn'
                      const base = 'panel text-xs'
                      const cls = isError
                        ? `${base} border-[color:var(--color-danger)] bg-[color:color-mix(in srgb, var(--color-danger) 12%, transparent)] text-[color:var(--color-danger)]`
                        : isWarn
                          ? `${base} border-[color:var(--color-warning)] bg-[color:color-mix(in srgb, var(--color-warning) 12%, transparent)] text-[color:var(--color-warning)]`
                          : `${base} border-[color:var(--color-accent)] bg-[color:color-mix(in srgb, var(--color-accent) 12%, transparent)] text-[color:var(--color-accent)]`
                      return (
                        <div className={cls} role={isError ? 'alert' : 'status'}>
                          {msg}
                        </div>
                      )
                    })()}
                    {(() => {
                      const cr = currentRoom as {
                        id?: string
                        maxPlayers?: number
                        players?: unknown[]
                        status?: string
                      } | null
                      const joined = (cr?.players as unknown[] | undefined)?.length ?? 0
                      const total = cr?.maxPlayers ?? 0
                      const lobbyPhase = cr?.status === 'lobby'
                      const canManuallyStart = isHost && lobbyPhase && joined >= Math.max(2, total)
                      if (!canManuallyStart || !cr?.id) return null
                      const readyId: string = cr.id as string
                      return (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={async () => {
                            try {
                              await gameService.setReadyState(readyId, true)
                              toast.success('Start requested')
                            } catch (err) {
                              let message: string = 'Failed to start game'
                              if (err && typeof err === 'object' && 'response' in err) {
                                const apiErr = err as { response?: { data?: { message?: string } } }
                                if (typeof apiErr.response?.data?.message === 'string') {
                                  message = apiErr.response.data.message
                                }
                              } else if (err instanceof Error && typeof err.message === 'string') {
                                message = err.message
                              }
                              toast.error(message as string)
                            }
                          }}
                        >
                          Start Now
                        </button>
                      )
                    })()}
                    {((currentRoom as { status?: string } | null)?.status === 'lobby' ||
                      (currentRoom as { status?: string } | null)?.status === 'initializing') && (
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

          {/* Dice results below the map so it doesn't shift the board */}
          <DiceResultsBar />

          {/* Below Map Zone (Desktop+ and larger screens) */}
          {(belowZonePanels.length > 0 || isDraggingPanel || isEditingLayout) && (
            <>
              {/* Layout Toggle + Reset - Only show when editing */}
              {isEditingLayout && (
                <div className="mt-3 mb-1 flex items-center justify-between gap-2 text-[11px] text-muted">
                  <button
                    type="button"
                    onClick={() => dispatch(resetLayout())}
                    className="btn btn-ghost btn-xs"
                    title="Reset panel layout"
                  >
                    Reset layout
                  </button>
                  <span>Layout:</span>
                  <div className="inline-flex overflow-hidden rounded border border-[color:var(--panel-border)]">
                    <button
                      type="button"
                      onClick={() => dispatch(setBelowMapLayout('vertical-stack'))}
                      className={`px-2 py-1 transition-colors ${
                        belowMapLayout === 'vertical-stack'
                          ? 'bg-[color:var(--color-accent)]/20 text-[color:var(--heading)]'
                          : 'bg-[color:var(--surface-1)] text-muted hover:bg-[color:var(--surface-2)]'
                      }`}
                      aria-pressed={belowMapLayout === 'vertical-stack'}
                    >
                      Stack
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch(setBelowMapLayout('horizontal-row'))}
                      className={`px-2 py-1 transition-colors border-l border-[color:var(--panel-border)] ${
                        belowMapLayout === 'horizontal-row'
                          ? 'bg-[color:var(--color-accent)]/20 text-[color:var(--heading)]'
                          : 'bg-[color:var(--surface-1)] text-muted hover:bg-[color:var(--surface-2)]'
                      }`}
                      aria-pressed={belowMapLayout === 'horizontal-row'}
                    >
                      Row
                    </button>
                  </div>
                </div>
              )}

              <div
                className={`${
                  belowMapLayout === 'horizontal-row'
                    ? 'flex flex-row gap-3'
                    : 'flex flex-col space-y-3'
                } mt-1`}
              >
                {/* Leading drop zone */}
                {(isDraggingPanel || isEditingLayout) && (
                  <DropZone
                    onDrop={handleDropToZone('below-map', 0)}
                    active={true}
                    orientation={belowMapLayout === 'horizontal-row' ? 'horizontal' : 'vertical'}
                    className={belowMapLayout === 'horizontal-row' ? '' : 'my-1'}
                  />
                )}

                {belowZonePanels.map((p) => (
                  <div key={p.id}>
                    {p.id === 'player-stats' && (
                      <Suspense
                        fallback={
                          <div className="panel p-0 overflow-hidden">
                            <div className="bg-[color:var(--surface-2)] px-3 py-2 border-b border-[color:var(--panel-border)]">
                              <div className="text-sm font-semibold text-[color:var(--heading)]">
                                Player Stats
                              </div>
                            </div>
                            <div className="p-3">
                              <Skeleton variant="rectangular" width="100%" height={180} />
                            </div>
                          </div>
                        }
                      >
                        <LazyPlayerStatsPanel
                          players={
                            currentGame?.players && currentGame.players.length > 0
                              ? currentGame.players
                              : (currentRoom?.players || []).map((pl) => {
                                  const rawColor =
                                    ((pl as { selected_color?: string | null }).selected_color as
                                      | string
                                      | null) ||
                                    ((pl.preferred_color as string | null) ?? null) ||
                                    '#9CA3AF'
                                  const base = {
                                    id: pl.userId || pl.id,
                                    userId: pl.userId || pl.id,
                                    username: pl.username,
                                    color: rawColor as unknown as PlayerColor,
                                    territories: [],
                                    armies: 0,
                                    cards: [],
                                    isEliminated: false,
                                    isAi: Boolean(pl.isAi),
                                    aiDifficulty: pl.aiDifficulty ?? null,
                                    treasures: [],
                                  }
                                  return pl.teamId != null
                                    ? ({ ...base, teamId: pl.teamId } as unknown as PlayerType)
                                    : (base as unknown as PlayerType)
                                })
                          }
                          {...(currentGame ? { currentPlayerId: currentGame.currentPlayer } : {})}
                          territories={
                            currentGame
                              ? Object.fromEntries(
                                  (currentGame.board || []).map((t) => [
                                    t.id,
                                    { owner: t.ownerId, armies: t.armies },
                                  ]),
                                )
                              : {}
                          }
                          isEditingLayout={isEditingLayout}
                          onResignRequest={() => setResignDialogOpen(true)}
                        />
                      </Suspense>
                    )}
                    {p.id === 'chat' && roomId && user && (
                      <Suspense
                        fallback={
                          <div className="panel p-0 overflow-hidden">
                            <div className="bg-[color:var(--surface-2)] px-3 py-2 border-b border-[color:var(--panel-border)]">
                              <div className="text-sm font-semibold text-[color:var(--heading)]">
                                Chat & Log
                              </div>
                            </div>
                            <div className="p-3">
                              <Skeleton variant="rectangular" width="100%" height={160} />
                            </div>
                          </div>
                        }
                      >
                        <LazyChatLogPanel
                          gameId={currentRoom?.id || roomId}
                          currentUserId={user.id}
                          {...(() => {
                            const teamId = currentGame?.players?.find(
                              (gp) => gp.userId === user.id,
                            )?.teamId
                            return teamId !== undefined
                              ? { userTeamId: teamId }
                              : { userTeamId: null }
                          })()}
                          onLogFocus={(territories) => {
                            const focus = territories[territories.length - 1]
                            if (focus) dispatch(selectTerritory(focus))
                          }}
                          isEditingLayout={isEditingLayout}
                        />
                      </Suspense>
                    )}
                    {p.id === 'game-log' && currentGame && (
                      <Suspense
                        fallback={
                          <div className="panel p-0 overflow-hidden">
                            <div className="bg-[color:var(--surface-2)] px-3 py-2 border-b border-[color:var(--panel-border)]">
                              <div className="text-sm font-semibold text-[color:var(--heading)]">
                                Game Log
                              </div>
                            </div>
                            <div className="p-3">
                              <Skeleton variant="rectangular" width="100%" height={160} />
                            </div>
                          </div>
                        }
                      >
                        <LazyGameLogPanelWrapper
                          gameId={currentRoom?.id ?? roomId ?? ''}
                          onLogFocus={(territories) => {
                            const focus = territories[territories.length - 1]
                            if (focus) dispatch(selectTerritory(focus))
                          }}
                          isEditingLayout={isEditingLayout}
                        />
                      </Suspense>
                    )}
                  </div>
                ))}

                {/* Trailing drop zone */}
                {(isDraggingPanel || isEditingLayout) && (
                  <DropZone
                    onDrop={handleDropToZone('below-map', belowZonePanels.length)}
                    active={true}
                    orientation={belowMapLayout === 'horizontal-row' ? 'horizontal' : 'vertical'}
                    className={belowMapLayout === 'horizontal-row' ? '' : 'my-1'}
                  />
                )}
              </div>
            </>
          )}

          {/* Desktop action bar moved inside the game board as an overlay */}
        </div>

        {/* Right Sidebar Zone (Desktop+) */}
        {layout.isDesktopOrLarger && (rightZonePanels.length > 0 || isEditingLayout) && (
          <aside className="sticky top-6 space-y-3">
            {/* Top drop zone for reordering */}
            {isEditingLayout && (
              <DropZone
                onDrop={handleDropToZone('sidebar-right', 0)}
                active={true}
                orientation="vertical"
                className="my-1"
              />
            )}
            {rightZonePanels.map((p) => (
              <div key={p.id} className="space-y-3">
                {p.id === 'chat' && roomId && user && (
                  <Suspense
                    fallback={
                      <div className="panel p-0 overflow-hidden">
                        <div className="bg-[color:var(--surface-2)] px-3 py-2 border-b border-[color:var(--panel-border)]">
                          <div className="text-sm font-semibold text-[color:var(--heading)]">
                            Chat & Log
                          </div>
                        </div>
                        <div className="p-3">
                          <Skeleton variant="rectangular" width="100%" height={160} />
                        </div>
                      </div>
                    }
                  >
                    <LazyChatLogPanel
                      gameId={currentRoom?.id || roomId}
                      currentUserId={user.id}
                      {...(() => {
                        const teamId = currentGame?.players?.find(
                          (gp) => gp.userId === user.id,
                        )?.teamId
                        return teamId !== undefined ? { userTeamId: teamId } : { userTeamId: null }
                      })()}
                      onLogFocus={(territories) => {
                        const focus = territories[territories.length - 1]
                        if (focus) dispatch(selectTerritory(focus))
                      }}
                      isEditingLayout={isEditingLayout}
                    />
                  </Suspense>
                )}
                {p.id === 'player-stats' && (
                  <Suspense
                    fallback={
                      <div className="panel p-0 overflow-hidden">
                        <div className="bg-[color:var(--surface-2)] px-3 py-2 border-b border-[color:var(--panel-border)]">
                          <div className="text-sm font-semibold text-[color:var(--heading)]">
                            Player Stats
                          </div>
                        </div>
                        <div className="p-3">
                          <Skeleton variant="rectangular" width="100%" height={180} />
                        </div>
                      </div>
                    }
                  >
                    <LazyPlayerStatsPanel
                      players={
                        currentGame?.players && currentGame.players.length > 0
                          ? currentGame.players
                          : (currentRoom?.players || []).map((pl) => {
                              const rawColor =
                                ((pl as { selected_color?: string | null }).selected_color as
                                  | string
                                  | null) ||
                                ((pl.preferred_color as string | null) ?? null) ||
                                '#9CA3AF'
                              const base = {
                                id: pl.userId || pl.id,
                                userId: pl.userId || pl.id,
                                username: pl.username,
                                color: rawColor as unknown as PlayerColor,
                                territories: [],
                                armies: 0,
                                cards: [],
                                isEliminated: false,
                                aiDifficulty: pl.aiDifficulty ?? null,
                                treasures: [],
                              }
                              return {
                                ...base,
                                ...(pl.isAi !== undefined ? { isAi: Boolean(pl.isAi) } : {}),
                                ...(pl.teamId !== undefined ? { teamId: pl.teamId } : {}),
                              } as unknown as PlayerType
                            })
                      }
                      {...(currentGame ? { currentPlayerId: currentGame.currentPlayer } : {})}
                      territories={
                        currentGame
                          ? Object.fromEntries(
                              (currentGame.board || []).map((t) => [
                                t.id,
                                { owner: t.ownerId, armies: t.armies },
                              ]),
                            )
                          : {}
                      }
                      isEditingLayout={isEditingLayout}
                      onResignRequest={() => setResignDialogOpen(true)}
                    />
                  </Suspense>
                )}
              </div>
            ))}
            {isEditingLayout && (
              <DropZone
                onDrop={handleDropToZone('sidebar-right', rightZonePanels.length)}
                active={true}
                orientation="vertical"
                className="my-1"
              />
            )}
          </aside>
        )}

        {/* Removed duplicate player list section and AI controls - now only showing once in left rail */}
        {/* SR-only live region for announcements */}
        <div className="sr-only" aria-live="polite">
          {liveMessage}
        </div>
      </div>
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

      {/* Mobile FAB - REMOVED: Now integrated into footer */}

      {/* Drawer backdrop (chat overlay only) */}
      {currentGame && chatOverlayOpen && (
        <button
          className="fixed inset-0 bg-[color:color-mix(in_srgb,black_50%,transparent)] block"
          onClick={() => setMobileDrawerOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setMobileDrawerOpen(false)
          }}
          type="button"
          aria-label="Close chat drawer"
        />
      )}

      {/* Bottom drawer (chat) */}
      {currentGame && chatPanel?.zone === 'drawer' && (
        <div
          id={mobileDrawerId}
          className={`fixed bottom-0 z-30 ${chatDrawerResize.isDragging ? '' : 'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'} ${chatOpen ? 'translate-y-0' : 'translate-y-full'}`}
          style={{
            height: chatOpen ? `${chatDrawerResize.height}px` : undefined,
            // Chat positioning and width rules
            ...(bothPinned
              ? {
                  left: '0',
                  width: `min(50%, ${MAX_PINNED_DRAWER_PX}px)`,
                }
              : statsPinned && !chatPinned
                ? {
                    left: '0',
                    right: `min(50%, ${MAX_PINNED_DRAWER_PX}px)`,
                  }
                : {
                    // Center single drawer within content width so it doesn't exceed boxes
                    left: `calc((100% - min(100%, ${MAX_SINGLE_DRAWER_PX}px)) / 2)`,
                    width: `min(100%, ${MAX_SINGLE_DRAWER_PX}px)`,
                    right: 'auto',
                  }),
            maxWidth: '100%',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 64px)', // Extra space for footer
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="h-full rounded-t-xl border border-border shadow-2xl flex flex-col"
            style={{
              // Darker, theme-aware glass background
              backgroundColor: 'color-mix(in srgb, var(--surface-1) 72%, black 28%)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
              paddingLeft: 'calc(env(safe-area-inset-left) + 12px)',
              paddingRight: 'calc(env(safe-area-inset-right) + 12px)',
            }}
          >
            {/* Resize handle */}
            <hr
              {...chatDrawerResize.resizeHandleProps}
              className={`px-3 pt-2 h-6 border-0 cursor-ns-resize select-none ${chatDrawerResize.isDragging ? 'bg-[color:var(--color-accent)]/20' : 'hover:bg-[color:var(--surface-2)]'} transition-colors`}
              title="Drag to resize"
              aria-label="Resize drawer"
              aria-orientation="horizontal"
              tabIndex={0}
              aria-valuenow={Number.isFinite(chatDrawerResize.height) ? chatDrawerResize.height : 0}
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm ${chatPanel.isPinned ? 'text-[color:var(--color-accent)]' : ''}`}
                  onClick={() =>
                    dispatch(setDrawerPinned({ panelId: 'chat', isPinned: !chatPanel.isPinned }))
                  }
                  title={chatPanel.isPinned ? 'Unpin drawer' : 'Pin drawer open'}
                  aria-pressed={chatPanel.isPinned}
                >
                  {chatPanel.isPinned ? '📌' : '📍'} {chatPanel.isPinned ? 'Pinned' : 'Pin'}
                </button>
                {layout.isDesktopOrLarger && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => dispatch(togglePin('chat'))}
                    title="Pop out to main view"
                  >
                    🗗 Pop Out
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  if (chatPanel?.isPinned) {
                    dispatch(setDrawerPinned({ panelId: 'chat', isPinned: false }))
                  }
                  setMobileDrawerOpen(false)
                }}
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
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
                      {...(() => {
                        const teamId = currentGame?.players?.find(
                          (p) => p.userId === user.id,
                        )?.teamId
                        return teamId !== undefined ? { userTeamId: teamId } : { userTeamId: null }
                      })()}
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

      {/* Drawer backdrop (stats overlay only) */}
      {currentGame && statsOverlayOpen && (
        <button
          className="fixed inset-0 bg-[color:color-mix(in_srgb,black_50%,transparent)] block"
          onClick={() => setStatsDrawerOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setStatsDrawerOpen(false)
          }}
          type="button"
          aria-label="Close stats drawer"
        />
      )}

      {/* Bottom drawer (stats) */}
      {currentGame && statsPanel?.zone === 'drawer' && (
        <div
          id={statsDrawerId}
          className={`fixed bottom-0 z-30 ${statsDrawerResize.isDragging ? '' : 'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'} ${statsOpen ? 'translate-y-0' : 'translate-y-full'}`}
          style={{
            height: statsOpen ? `${statsDrawerResize.height}px` : undefined,
            // Stats positioning and width rules
            ...(bothPinned
              ? {
                  right: '0',
                  width: `min(50%, ${MAX_PINNED_DRAWER_PX}px)`,
                }
              : chatPinned && !statsPinned
                ? {
                    right: '0',
                    left: `min(50%, ${MAX_PINNED_DRAWER_PX}px)`,
                  }
                : {
                    // Center single drawer within content width so it doesn't exceed boxes
                    left: `calc((100% - min(100%, ${MAX_SINGLE_DRAWER_PX}px)) / 2)`,
                    width: `min(100%, ${MAX_SINGLE_DRAWER_PX}px)`,
                    right: 'auto',
                  }),
            maxWidth: '100%',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 64px)', // Extra space for footer
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="h-full rounded-t-xl border border-border shadow-2xl flex flex-col"
            style={{
              // Darker, theme-aware glass background
              backgroundColor: 'color-mix(in srgb, var(--surface-1) 72%, black 28%)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
              paddingLeft: 'calc(env(safe-area-inset-left) + 12px)',
              paddingRight: 'calc(env(safe-area-inset-right) + 12px)',
            }}
          >
            {/* Resize handle */}
            <hr
              {...statsDrawerResize.resizeHandleProps}
              className={`px-3 pt-2 h-6 border-0 cursor-ns-resize select-none ${statsDrawerResize.isDragging ? 'bg-[color:var(--color-accent)]/20' : 'hover:bg-[color:var(--surface-2)]'} transition-colors`}
              title="Drag to resize"
              aria-label="Resize drawer"
              aria-orientation="horizontal"
              tabIndex={0}
              aria-valuenow={
                Number.isFinite(statsDrawerResize.height) ? statsDrawerResize.height : 0
              }
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <div className="font-medium">Player Stats</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm ${statsPanel.isPinned ? 'text-[color:var(--color-accent)]' : ''}`}
                  onClick={() =>
                    dispatch(
                      setDrawerPinned({ panelId: 'player-stats', isPinned: !statsPanel.isPinned }),
                    )
                  }
                  title={statsPanel.isPinned ? 'Unpin drawer' : 'Pin drawer open'}
                  aria-pressed={statsPanel.isPinned}
                >
                  {statsPanel.isPinned ? '📌' : '📍'}
                  {statsPanel.isPinned ? 'Pinned' : 'Pin'}
                </button>
                {layout.isDesktopOrLarger && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => dispatch(togglePin('player-stats'))}
                    title="Pop out to main view"
                  >
                    🗗 Pop Out
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (statsPanel?.isPinned) {
                      dispatch(setDrawerPinned({ panelId: 'player-stats', isPinned: false }))
                    }
                    setStatsDrawerOpen(false)
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
              <Suspense
                fallback={
                  <div className="panel p-0 overflow-hidden">
                    <div className="bg-[color:var(--surface-2)] px-3 py-2 border-b border-[color:var(--panel-border)]">
                      <div className="text-sm font-semibold text-[color:var(--heading)]">
                        Player Stats
                      </div>
                    </div>
                    <div className="p-3">
                      <Skeleton variant="rectangular" width="100%" height={180} />
                    </div>
                  </div>
                }
              >
                <LazyPlayerStatsPanel
                  players={
                    currentGame.players && currentGame.players.length > 0
                      ? currentGame.players
                      : (currentRoom?.players || []).map((pl) => {
                          const rawColor =
                            ((pl as { selected_color?: string | null }).selected_color as
                              | string
                              | null) ||
                            ((pl.preferred_color as string | null) ?? null) ||
                            '#9CA3AF'
                          const base = {
                            id: pl.userId || pl.id,
                            userId: pl.userId || pl.id,
                            username: pl.username,
                            color: rawColor as unknown as PlayerColor,
                            territories: [],
                            armies: 0,
                            cards: [],
                            isEliminated: false,
                            aiDifficulty: pl.aiDifficulty ?? null,
                            treasures: [],
                          }
                          return {
                            ...base,
                            ...(pl.isAi !== undefined ? { isAi: Boolean(pl.isAi) } : {}),
                            ...(pl.teamId !== undefined ? { teamId: pl.teamId } : {}),
                          } as unknown as PlayerType
                        })
                  }
                  {...(currentGame ? { currentPlayerId: currentGame.currentPlayer } : {})}
                  territories={Object.fromEntries(
                    (currentGame.board || []).map((t) => [
                      t.id,
                      { owner: t.ownerId, armies: t.armies },
                    ]),
                  )}
                  variant="full"
                  onResignRequest={() => setResignDialogOpen(true)}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Modals removed: drawers are the only UI for chat and stats */}

      {/* Centralized Treasure Trade Modal */}
      <TreasureTradeModal
        isOpen={treasureModalOpen && !turnIntroActive}
        onClose={() => dispatch(setTreasureModalOpen(false))}
      />

      {/* Settings Modal */}
      <Suspense fallback={null}>
        <Activity mode={settingsModalOpen ? 'visible' : 'hidden'}>
          <LazySettingsModal
            isOpen={settingsModalOpen}
            onClose={() => setSettingsModalOpen(false)}
          />
        </Activity>
      </Suspense>

      {/* Game Room Footer (mobile + desktop) */}
      {currentGame && (
        <GameRoomFooter
          onChatClick={() =>
            setMobileDrawerOpen((v) => {
              const next = !v
              // If opening chat overlay, ensure stats overlay is closed to avoid overlap
              if (next && !statsPinned) setStatsDrawerOpen(false)
              return next
            })
          }
          onChatHover={prefetchChatPanel}
          onSettingsClick={() => setSettingsModalOpen(true)}
          onStatsClick={() => {
            setStatsDrawerOpen(true)
            setMobileDrawerOpen(false)
          }}
          onStatsHover={prefetchStatsPanel}
          onLayoutClick={() => setIsEditingLayout((v) => !v)}
          isMobileDrawerOpen={mobileDrawerOpen}
          isEditingLayout={isEditingLayout}
          isChatPinned={chatPanel?.isPinned ?? false}
          isStatsPinned={statsPanel?.isPinned ?? false}
        />
      )}

      {/* Post-game results modal */}
      {showGameOver && currentGame && (
        <LazyGameOverModal
          isOpen={showGameOver}
          winners={currentGame.players.filter((p) => !p.isEliminated)}
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
                  ...(typeof p.aiPersonalitySeed === 'number'
                    ? { personalitySeed: p.aiPersonalitySeed }
                    : { personalitySeed: null }),
                }))

              const payload = {
                name: `${currentRoom.name} (Rematch)`,
                maxPlayers: currentRoom.maxPlayers,
                ...(typeof currentRoom.isPrivate === 'boolean'
                  ? { isPrivate: currentRoom.isPrivate }
                  : {}),
                ...(typeof currentRoom.isRanked === 'boolean'
                  ? { isRanked: currentRoom.isRanked }
                  : {}),
                ...(typeof currentRoom.mapId === 'string' ? { mapId: currentRoom.mapId } : {}),
                ...(typeof currentRoom.movementType === 'string'
                  ? { movementType: currentRoom.movementType }
                  : {}),
                ...(typeof currentRoom.fogOfWar === 'string'
                  ? { fogOfWar: currentRoom.fogOfWar as 'off' | 'adjacent' | 'persistent' }
                  : {}),
                ...(typeof currentRoom.turnTimerSeconds === 'number'
                  ? { turnTimerSeconds: currentRoom.turnTimerSeconds }
                  : {}),
                aiOpponents,
                teamMode: (currentRoom.teamMode ?? 'none') as 'none' | 'teams' | 'auto_balance',
                ...(typeof currentRoom.numberOfTeams === 'number'
                  ? { numberOfTeams: currentRoom.numberOfTeams }
                  : {}),
                ...(() => {
                  const tc = (currentRoom as unknown as { treasureConfig?: unknown }).treasureConfig
                  return tc ? { treasureConfig: tc as Partial<TreasureConfig> } : {}
                })(),
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

      <LazyPlayerProfileModal
        open={profileUsername !== null}
        username={profileUsername}
        onClose={() => setProfileUsername(null)}
        context="game"
      />

      {/* Conquest transfer handled inline on map via ConquestTransferPopup */}

      {/* Floating mute control - REMOVED: Now integrated into footer on both mobile and desktop */}
    </div>
  )
}
