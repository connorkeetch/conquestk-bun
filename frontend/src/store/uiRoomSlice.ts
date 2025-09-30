import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type AnimationSpeed = 'normal' | 'fast' | 'instant'

export interface UIRoomState {
  selectedTerritory: string | null
  highlightTargets: string[]
  hoverTerritory: string | null
  dice: 1 | 2 | 3
  attackCommit: number
  animationSpeed: AnimationSpeed
  overlays: { continents: boolean; attackable: boolean; threat: boolean }
  connectionStatus: 'connected' | 'connecting' | 'disconnected'
  conquestOverlay?: { fromId: string; toId: string } | null
  desyncDetected: boolean
  resyncing: boolean
}

const initialState: UIRoomState = {
  selectedTerritory: null,
  highlightTargets: [],
  hoverTerritory: null,
  dice: 3,
  attackCommit: 1,
  animationSpeed: 'normal',
  overlays: { continents: false, attackable: false, threat: false },
  connectionStatus: 'connected',
  conquestOverlay: null,
  desyncDetected: false,
  resyncing: false,
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
    showConquestOverlay(state, action: PayloadAction<{ fromId: string; toId: string }>) {
      state.conquestOverlay = { fromId: action.payload.fromId, toId: action.payload.toId }
    },
    hideConquestOverlay(state) {
      state.conquestOverlay = null
    },
    setDesyncDetected(state, action: PayloadAction<boolean>) {
      state.desyncDetected = action.payload
    },
    setResyncing(state, action: PayloadAction<boolean>) {
      state.resyncing = action.payload
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
            typeof parsed.continents === 'boolean' &&
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
  showConquestOverlay,
  hideConquestOverlay,
  setDesyncDetected,
  setResyncing,
  hydrateFromStorage,
} = uiRoomSlice.actions

export default uiRoomSlice.reducer
