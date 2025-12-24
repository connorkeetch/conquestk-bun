import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type AnimationSpeed = 'normal' | 'fast' | 'instant'

export interface UIRoomState {
  selectedTerritory: string | null
  highlightTargets: string[]
  hoverTerritory: string | null
  dice: 1 | 2 | 3
  attackCommit: number
  animationSpeed: AnimationSpeed
  overlays: { sectors: boolean; attackable: boolean; threat: boolean }
  connectionStatus: 'connected' | 'connecting' | 'disconnected'
  conquestOverlay?: { fromId: string; toId: string } | null
  optimisticMarkers?: Record<string, { actionIds: string[]; label?: string }>
  // Global UI toggle for auto-attack so non-ActionBar UI (e.g., map tooltip) can start/stop it
  autoAttacking?: boolean
  desyncDetected: boolean
  resyncing: boolean
  // Transient map pings for display (expires client-side)
  pings?: Array<{
    id: string
    territoryId: string
    userId?: string
    username?: string | null
    createdAt: number
    expiresAt: number
  }>
  mutedUserIds?: string[]
  clientLogs?: Array<{ id: string; ts: number; text: string; roomId?: string }>
  // Simple per-user cooldown tracking for ping button
  lastPingAt?: number
  // Client-side reinforcement placement history (for undo within the same phase)
  placementHistory?: Array<{ territoryId: string; armies: number; ts: number }>
  // Server baseline spent count for reinforcement phase (for UX reconciliation only)
  placementServerSpent?: number
  // Rolling, non-blocking history of battle results for header dice UI
  battleHistory?: Array<{
    id: string
    ts: number
    fromId: string
    toId: string
    attackerId?: string | null
    defenderId?: string | null
    attackerDice: number[]
    defenderDice: number[]
    attackerLosses: number
    defenderLosses: number
    conquered: boolean
  }>
  // Centralized treasure trade modal visibility
  treasureModalOpen?: boolean
}

const initialState: UIRoomState = {
  selectedTerritory: null,
  highlightTargets: [],
  hoverTerritory: null,
  dice: 3,
  attackCommit: 1,
  animationSpeed: 'normal',
  overlays: { sectors: false, attackable: false, threat: false },
  connectionStatus: 'disconnected',
  conquestOverlay: null,
  optimisticMarkers: {},
  autoAttacking: false,
  desyncDetected: false,
  resyncing: false,
  pings: [],
  mutedUserIds: [],
  clientLogs: [],
  lastPingAt: 0,
  placementHistory: [],
  placementServerSpent: 0,
  battleHistory: [],
  treasureModalOpen: false,
}

const uiRoomSlice = createSlice({
  name: 'uiRoom',
  initialState,
  reducers: {
    setSelectedTerritory(state, action: PayloadAction<string | null>) {
      state.selectedTerritory = action.payload
    },
    setHighlightTargets(state, action: PayloadAction<string[]>) {
      state.highlightTargets = action.payload
    },
    setHoverTerritory(state, action: PayloadAction<string | null>) {
      state.hoverTerritory = action.payload
    },
    setDice(state, action: PayloadAction<1 | 2 | 3>) {
      state.dice = action.payload
    },
    setAttackCommit(state, action: PayloadAction<number>) {
      state.attackCommit = Math.max(1, Math.trunc(action.payload) || 1)
      try {
        localStorage.setItem('ui.attackCommit', String(state.attackCommit))
      } catch {
        // ignore storage errors (quota, privacy, SSR)
      }
    },
    setAnimationSpeed(state, action: PayloadAction<AnimationSpeed>) {
      state.animationSpeed = action.payload
      try {
        localStorage.setItem('ui.animationSpeed', state.animationSpeed)
      } catch {
        // ignore storage errors (quota, privacy, SSR)
      }
    },
    setOverlay(
      state,
      action: PayloadAction<{ key: keyof UIRoomState['overlays']; value: boolean }>,
    ) {
      state.overlays[action.payload.key] = action.payload.value
      try {
        localStorage.setItem('ui.overlays', JSON.stringify(state.overlays))
      } catch {
        // ignore storage errors (quota, privacy, SSR)
      }
    },
    setConnectionStatus(state, action: PayloadAction<UIRoomState['connectionStatus']>) {
      state.connectionStatus = action.payload
    },
    addOptimisticMarkers(
      state,
      action: PayloadAction<{ keys: string[]; actionId: string; label?: string }>,
    ) {
      const { keys, actionId, label } = action.payload
      const markers = state.optimisticMarkers ?? {}
      for (const key of keys) {
        if (!key) continue
        const entry = markers[key] ?? { actionIds: [] as string[], label }
        if (!entry.actionIds.includes(actionId)) {
          entry.actionIds.push(actionId)
        }
        if (label) {
          entry.label = label
        }
        markers[key] = entry
      }
      state.optimisticMarkers = markers
    },
    removeOptimisticMarkers(state, action: PayloadAction<{ keys: string[]; actionId: string }>) {
      if (!state.optimisticMarkers) return
      const { keys, actionId } = action.payload
      for (const key of keys) {
        const entry = state.optimisticMarkers[key]
        if (!entry) continue
        entry.actionIds = entry.actionIds.filter((id) => id !== actionId)
        if (entry.actionIds.length === 0) {
          delete state.optimisticMarkers[key]
        } else {
          state.optimisticMarkers[key] = entry
        }
      }
    },
    clearOptimisticMarkers(state) {
      state.optimisticMarkers = {}
    },
    showConquestOverlay(state, action: PayloadAction<{ fromId: string; toId: string }>) {
      state.conquestOverlay = { fromId: action.payload.fromId, toId: action.payload.toId }
    },
    hideConquestOverlay(state) {
      state.conquestOverlay = null
    },
    setAutoAttacking(state, action: PayloadAction<boolean>) {
      state.autoAttacking = Boolean(action.payload)
    },
    setDesyncDetected(state, action: PayloadAction<boolean>) {
      state.desyncDetected = action.payload
    },
    setResyncing(state, action: PayloadAction<boolean>) {
      state.resyncing = action.payload
    },
    addPing(
      state,
      action: PayloadAction<{
        id: string
        territoryId: string
        userId?: string
        username?: string | null
        ttlMs?: number
      }>,
    ) {
      const now = Date.now()
      const ttl = Math.max(500, Math.min(10_000, action.payload.ttlMs ?? 3000))
      const ping: NonNullable<UIRoomState['pings']>[number] = {
        id: action.payload.id,
        territoryId: action.payload.territoryId,
        ...(typeof action.payload.userId === 'string' ? { userId: action.payload.userId } : {}),
        username: action.payload.username ?? null,
        createdAt: now,
        expiresAt: now + ttl,
      }
      const list = state.pings ?? []
      // Keep a short buffer of recent pings to handle overlap
      state.pings = [...list.filter((p) => p.expiresAt > now), ping].slice(-20)
    },
    prunePings(state) {
      const now = Date.now()
      state.pings = (state.pings ?? []).filter((p) => p.expiresAt > now)
    },
    addClientLog(
      state,
      action: PayloadAction<{ text: string; roomId?: string; ts?: number; id?: string }>,
    ) {
      const id = action.payload.id ?? `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
      const ts = action.payload.ts ?? Date.now()
      const list = state.clientLogs ?? []
      const entry: NonNullable<UIRoomState['clientLogs']>[number] = {
        id,
        ts,
        text: action.payload.text,
        ...(typeof action.payload.roomId === 'string' ? { roomId: action.payload.roomId } : {}),
      }
      state.clientLogs = [entry, ...list].slice(0, 300)
    },
    clearClientLogs(state) {
      state.clientLogs = []
    },
    setLastPingAt(state, action: PayloadAction<number>) {
      state.lastPingAt = Math.max(0, Math.trunc(action.payload) || 0)
    },
    recordPlacement(
      state,
      action: PayloadAction<{ territoryId: string; armies: number; ts?: number }>,
    ) {
      const list = state.placementHistory ?? []
      const entry = {
        territoryId: action.payload.territoryId,
        armies: Math.max(1, Math.trunc(action.payload.armies) || 1),
        ts: action.payload.ts ?? Date.now(),
      }
      state.placementHistory = [...list, entry].slice(-100)
    },
    removeLastPlacement(state) {
      const list = state.placementHistory ?? []
      state.placementHistory = list.slice(0, Math.max(0, list.length - 1))
    },
    clearPlacementHistory(state) {
      state.placementHistory = []
    },
    setPlacementServerSpent(state, action: PayloadAction<number>) {
      const n = Math.max(0, Math.trunc(action.payload) || 0)
      state.placementServerSpent = n
    },
    // Record a battle result for quick dice recap UI
    recordBattleResult(
      state,
      action: PayloadAction<{
        id?: string
        ts?: number
        fromId: string
        toId: string
        attackerId?: string | null
        defenderId?: string | null
        attackerDice: number[]
        defenderDice: number[]
        attackerLosses: number
        defenderLosses: number
        conquered: boolean
      }>,
    ) {
      const entry = {
        id: action.payload.id ?? `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        ts: action.payload.ts ?? Date.now(),
        fromId: action.payload.fromId,
        toId: action.payload.toId,
        attackerId: action.payload.attackerId ?? null,
        defenderId: action.payload.defenderId ?? null,
        attackerDice: [...action.payload.attackerDice],
        defenderDice: [...action.payload.defenderDice],
        attackerLosses: Math.max(0, Math.trunc(action.payload.attackerLosses) || 0),
        defenderLosses: Math.max(0, Math.trunc(action.payload.defenderLosses) || 0),
        conquered: Boolean(action.payload.conquered),
      }
      const list = state.battleHistory ?? []
      // Keep the last 20 results for quick recall
      state.battleHistory = [...list, entry].slice(-20)
    },
    clearBattleHistory(state) {
      state.battleHistory = []
    },
    setTreasureModalOpen(state, action: PayloadAction<boolean>) {
      state.treasureModalOpen = Boolean(action.payload)
    },
    toggleMuteUser(state, action: PayloadAction<string>) {
      const id = action.payload
      const list = new Set(state.mutedUserIds ?? [])
      if (list.has(id)) list.delete(id)
      else list.add(id)
      state.mutedUserIds = Array.from(list)
      try {
        localStorage.setItem('ui.mutedUserIds', JSON.stringify(state.mutedUserIds))
      } catch {
        // ignore storage errors (quota, privacy, SSR)
      }
    },
    hydrateMutedFromStorage(state) {
      try {
        const raw = localStorage.getItem('ui.mutedUserIds')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed))
            state.mutedUserIds = parsed.filter((x) => typeof x === 'string')
        }
      } catch {
        // ignore storage errors (quota, privacy, SSR)
      }
    },
    hydrateFromStorage(state) {
      try {
        const speed = localStorage.getItem('ui.animationSpeed') as AnimationSpeed | null
        if (speed === 'normal' || speed === 'fast' || speed === 'instant') {
          state.animationSpeed = speed
        }
      } catch {
        // ignore storage errors (quota, privacy, SSR)
      }
      try {
        const raw = localStorage.getItem('ui.overlays')
        if (raw) {
          const parsed = JSON.parse(raw)
          // Validate the parsed structure to prevent corruption
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            typeof parsed.sectors === 'boolean' &&
            typeof parsed.attackable === 'boolean' &&
            typeof parsed.threat === 'boolean'
          ) {
            state.overlays = parsed as UIRoomState['overlays']
          }
        }
      } catch {
        // ignore storage errors (quota, privacy, SSR)
      }
      try {
        const ac = Number.parseInt(localStorage.getItem('ui.attackCommit') || '', 10)
        if (Number.isFinite(ac) && ac > 0) state.attackCommit = ac
      } catch {
        // ignore storage errors (quota, privacy, SSR)
      }
    },
  },
})

export const {
  setSelectedTerritory,
  setHighlightTargets,
  setHoverTerritory,
  setDice,
  setAnimationSpeed,
  setAttackCommit,
  setOverlay,
  setConnectionStatus,
  addOptimisticMarkers,
  removeOptimisticMarkers,
  clearOptimisticMarkers,
  showConquestOverlay,
  hideConquestOverlay,
  setAutoAttacking,
  setDesyncDetected,
  setResyncing,
  hydrateFromStorage,
  addPing,
  prunePings,
  addClientLog,
  clearClientLogs,
  toggleMuteUser,
  setLastPingAt,
  recordPlacement,
  removeLastPlacement,
  clearPlacementHistory,
  setPlacementServerSpent,
  recordBattleResult,
  clearBattleHistory,
  setTreasureModalOpen,
} = uiRoomSlice.actions

export default uiRoomSlice.reducer
