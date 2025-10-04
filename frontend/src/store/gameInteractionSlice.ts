import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface GameInteractionState {
  hoveredTargetId: string | null
  invalidShakeId: string | null
}

const initialState: GameInteractionState = {
  hoveredTargetId: null,
  invalidShakeId: null,
}

const gameInteractionSlice = createSlice({
  name: 'gameInteraction',
  initialState,
  reducers: {
    setHoveredTarget(state, action: PayloadAction<string | null>) {
      state.hoveredTargetId = action.payload
    },
    triggerInvalidShake(state, action: PayloadAction<string>) {
      state.invalidShakeId = action.payload
    },
    clearInvalidShake(state) {
      state.invalidShakeId = null
    },
  },
})

export const { setHoveredTarget, triggerInvalidShake, clearInvalidShake } =
  gameInteractionSlice.actions

export default gameInteractionSlice.reducer
