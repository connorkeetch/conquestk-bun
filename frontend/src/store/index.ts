import { configureStore } from '@reduxjs/toolkit'
import authSlice from './authSlice'
import gameSlice from './gameSlice'
import messagesReducer from './messagesSlice'
import roomSlice from './roomSlice'
import settingsSlice from './settingsSlice'
import uiRoomReducer from './uiRoomSlice'
import uiReducer from './uiSlice'

export const store = configureStore({
  reducer: {
    auth: authSlice,
    game: gameSlice,
    room: roomSlice,
    settings: settingsSlice,
    messages: messagesReducer,
    ui: uiReducer,
    uiRoom: uiRoomReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
