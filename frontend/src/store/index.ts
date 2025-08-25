import { configureStore } from '@reduxjs/toolkit'
import authSlice from './authSlice'
import gameSlice from './gameSlice'
import roomSlice from './roomSlice'
import settingsSlice from './settingsSlice'

export const store = configureStore({
  reducer: {
    auth: authSlice,
    game: gameSlice,
    room: roomSlice,
    settings: settingsSlice,
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