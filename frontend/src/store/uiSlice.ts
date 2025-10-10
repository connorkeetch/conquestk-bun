import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type Phase = 'idle' | 'deploy' | 'attack' | 'fortify' | 'trade'

export interface UIState {
  // existing flags
  inboxOpen: boolean
  // interaction highlights
  phase: Phase
  selectedId?: string
  targetId?: string
  hoverId?: string
  eligibleIds: string[]
}

const initialState: UIState = {
  inboxOpen: false,
  phase: 'idle',
  eligibleIds: [],
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // existing
    setInboxOpen(state, action: PayloadAction<boolean>) {
      state.inboxOpen = action.payload
    },
    openInbox(state) {
      state.inboxOpen = true
    },
    closeInbox(state) {
      state.inboxOpen = false
    },
    // new interaction state
    setPhase(state, action: PayloadAction<Phase>) {
      state.phase = action.payload
    },
    setSelected(state, action: PayloadAction<string | undefined>) {
      if (typeof action.payload === 'string') state.selectedId = action.payload
      else delete state.selectedId
      if (!action.payload) {
        delete state.targetId
        state.eligibleIds = []
      }
    },
    setTarget(state, action: PayloadAction<string | undefined>) {
      if (typeof action.payload === 'string') state.targetId = action.payload
      else delete state.targetId
    },
    setHover(state, action: PayloadAction<string | undefined>) {
      if (typeof action.payload === 'string') state.hoverId = action.payload
      else delete state.hoverId
    },
    setEligible(state, action: PayloadAction<string[]>) {
      // Maintain incoming order (e.g., proximity-precomputed elsewhere)
      state.eligibleIds = Array.isArray(action.payload) ? action.payload.slice() : []
    },
    clearInteraction(state) {
      delete state.selectedId
      delete state.targetId
      delete state.hoverId
      state.eligibleIds = []
      state.phase = 'idle'
    },
  },
})

export const {
  setInboxOpen,
  openInbox,
  closeInbox,
  setPhase,
  setSelected,
  setTarget,
  setHover,
  setEligible,
  clearInteraction,
} = uiSlice.actions
export default uiSlice.reducer
