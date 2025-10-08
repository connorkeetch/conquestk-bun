import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { gameService } from '../services/gameService'
import type { GameRoom, Player as RoomPlayer } from '../types/gameRoom'

interface RoomState {
  rooms: GameRoom[]
  currentRoom: GameRoom | null
  isLoading: boolean
  error: string | null
}

const initialState: RoomState = {
  rooms: [],
  currentRoom: null,
  isLoading: false,
  error: null,
}

export interface LifecycleUpdatePayload {
  roomId: string
  status: GameRoom['status']
  lifecyclePhase?: GameRoom['lifecyclePhase']
  turnNumber?: number
  currentTurnUserId?: string | null
  turnExpiresAt?: string | null
  readyCheckStartedAt?: string | null
  timeBankSecondsRemaining?: number | null
  usingTimeBank?: boolean
  replacementPendingUserId?: string | null
  statusMessage?: string
  statusMessageLevel?: 'error' | 'info' | 'warn'
  readyStates?: Array<{ userId: string; isReady: boolean; readyAt: string | null }>
  players?: RoomPlayer[]
}

export const fetchRooms = createAsyncThunk('room/fetchRooms', async () => {
  const response = await gameService.getRooms()
  return response.rooms
})

export const createRoom = createAsyncThunk(
  'room/createRoom',
  async (roomData: { name: string; maxPlayers: number; isPrivate: boolean }) => {
    const response = await gameService.createRoom(roomData)
    return response.room
  },
)

export const joinRoom = createAsyncThunk('room/joinRoom', async (roomId: string) => {
  await gameService.joinRoom(roomId)
  return roomId
})

export const leaveRoom = createAsyncThunk('room/leaveRoom', async (roomId: string) => {
  await gameService.leaveRoom(roomId)
  return roomId
})

const roomSlice = createSlice({
  name: 'room',
  initialState,
  reducers: {
    setCurrentRoom: (state, action: PayloadAction<GameRoom | null>) => {
      state.currentRoom = action.payload
    },
    updateRoom: (state, action: PayloadAction<Partial<GameRoom>>) => {
      if (state.currentRoom) {
        state.currentRoom = { ...state.currentRoom, ...action.payload }
      }

      const roomIndex = state.rooms.findIndex((room) => room.id === action.payload.id)
      if (roomIndex !== -1) {
        state.rooms[roomIndex] = { ...state.rooms[roomIndex], ...action.payload }
      }
    },
    addPlayerToRoom: (state, action: PayloadAction<{ roomId: string; player: RoomPlayer }>) => {
      const { roomId, player } = action.payload

      if (state.currentRoom && state.currentRoom.id === roomId) {
        state.currentRoom.players = state.currentRoom.players || []
        const exists = state.currentRoom.players.some(
          (p) => p.id === player.id || (player.userId && p.userId === player.userId),
        )
        if (!exists) {
          state.currentRoom.players.push(player)
        }
      }
    },
    removePlayerFromRoom: (
      state,
      action: PayloadAction<{
        roomId: string
        playerSlotId: string
        userId?: string | null
        aiPlayerId?: string | null
      }>,
    ) => {
      const { roomId, playerSlotId, userId, aiPlayerId } = action.payload

      if (state.currentRoom && state.currentRoom.id === roomId) {
        state.currentRoom.players =
          state.currentRoom.players?.filter((player) => {
            if (player.id === playerSlotId) {
              return false
            }
            if (userId && player.userId === userId) {
              return false
            }
            if (aiPlayerId && player.aiPlayerId === aiPlayerId) {
              return false
            }
            return true
          }) || []
      }
    },
    applyLifecycleUpdate: (state, action: PayloadAction<LifecycleUpdatePayload>) => {
      const {
        roomId,
        status,
        lifecyclePhase,
        turnNumber,
        currentTurnUserId,
        turnExpiresAt,
        readyCheckStartedAt,
        readyStates,
        players,
      } = action.payload

      const applyUpdate = (room?: GameRoom | null) => {
        if (!room || room.id !== roomId) {
          return
        }

        room.status = status
        if (lifecyclePhase) {
          room.lifecyclePhase = lifecyclePhase
        }

        if (typeof turnNumber === 'number') {
          room.turnNumber = turnNumber
        }

        if (currentTurnUserId !== undefined) {
          room.currentTurnUserId = currentTurnUserId
        }

        if (turnExpiresAt !== undefined) {
          room.turnExpiresAt = turnExpiresAt
        }

        if (action.payload.timeBankSecondsRemaining !== undefined) {
          room.timeBankSecondsRemaining = action.payload.timeBankSecondsRemaining ?? null
        }

        if (action.payload.usingTimeBank !== undefined) {
          room.usingTimeBank = action.payload.usingTimeBank
        }
        if (action.payload.replacementPendingUserId !== undefined) {
          room.replacementPendingUserId = action.payload.replacementPendingUserId
        }

        if (readyCheckStartedAt !== undefined) {
          room.readyCheckStartedAt = readyCheckStartedAt
        }

        if (players && players.length > 0) {
          room.players = players
          return
        }

        if (readyStates) {
          const readyMap = new Map(readyStates.map((entry) => [entry.userId, entry]))
          room.players = room.players?.map((player) => {
            const readyEntry = readyMap.get(player.userId ?? player.id)
            if (!readyEntry) {
              return player
            }
            return {
              ...player,
              isReady: readyEntry.isReady,
              readyAt: readyEntry.readyAt,
            }
          })
        }

        // Apply status message if provided
        if (action.payload.statusMessage !== undefined) {
          room.statusMessage = action.payload.statusMessage ?? null
          room.statusMessageLevel = action.payload.statusMessageLevel ?? 'info'
        }
      }

      applyUpdate(state.currentRoom)

      const index = state.rooms.findIndex((room) => room.id === roomId)
      if (index !== -1) {
        applyUpdate(state.rooms[index])
      }
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRooms.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchRooms.fulfilled, (state, action) => {
        state.isLoading = false
        state.rooms = action.payload
      })
      .addCase(fetchRooms.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Failed to fetch rooms'
      })
      .addCase(createRoom.fulfilled, (state, action) => {
        state.rooms.unshift(action.payload)
        state.currentRoom = action.payload
      })
      .addCase(createRoom.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to create room'
      })
  },
})

export const {
  setCurrentRoom,
  updateRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  applyLifecycleUpdate,
  clearError,
} = roomSlice.actions

export default roomSlice.reducer
