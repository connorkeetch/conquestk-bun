import { configureStore } from '@reduxjs/toolkit'
import authSlice from './authSlice'
import gameInteractionReducer from './gameInteractionSlice'
import gameSlice from './gameSlice'
import mapViewReducer from './mapViewSlice'
import messagesReducer from './messagesSlice'
import panelsReducer from './panelsSlice'
import replayReducer from './replaySlice'
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
    mapView: mapViewReducer,
    gameInteraction: gameInteractionReducer,
    panels: panelsReducer,
    replay: replayReducer,
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
