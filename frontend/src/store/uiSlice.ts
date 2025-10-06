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
  selectedId: undefined,
  targetId: undefined,
  hoverId: undefined,
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
      state.selectedId = action.payload
      if (!action.payload) {
        state.targetId = undefined
        state.eligibleIds = []
      }
    },
    setTarget(state, action: PayloadAction<string | undefined>) {
      state.targetId = action.payload
    },
    setHover(state, action: PayloadAction<string | undefined>) {
      state.hoverId = action.payload
    },
    setEligible(state, action: PayloadAction<string[]>) {
      // Maintain incoming order (e.g., proximity-precomputed elsewhere)
      state.eligibleIds = Array.isArray(action.payload) ? action.payload.slice() : []
    },
    clearInteraction(state) {
      state.selectedId = undefined
      state.targetId = undefined
      state.hoverId = undefined
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
