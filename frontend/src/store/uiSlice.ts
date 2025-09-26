import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface UIState {
  inboxOpen: boolean
}

const initialState: UIState = {
  inboxOpen: false,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setInboxOpen(state, action: PayloadAction<boolean>) {
      state.inboxOpen = action.payload
    },
    openInbox(state) {
      state.inboxOpen = true
    },
    closeInbox(state) {
      state.inboxOpen = false
    },
  },
})

export const { setInboxOpen, openInbox, closeInbox } = uiSlice.actions
export default uiSlice.reducer
