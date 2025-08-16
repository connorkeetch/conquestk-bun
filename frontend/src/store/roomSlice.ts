import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { gameService } from '../services/gameService'
import { GameRoom } from '../types/gameRoom'

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

export const fetchRooms = createAsyncThunk('room/fetchRooms', async () => {
  const response = await gameService.getRooms()
  return response.rooms
})

export const createRoom = createAsyncThunk(
  'room/createRoom',
  async (roomData: { name: string; maxPlayers: number; isPrivate: boolean }) => {
    const response = await gameService.createRoom(roomData)
    return response.room
  }
)

export const joinRoom = createAsyncThunk(
  'room/joinRoom',
  async (roomId: string) => {
    await gameService.joinRoom(roomId)
    return roomId
  }
)

export const leaveRoom = createAsyncThunk(
  'room/leaveRoom',
  async (roomId: string) => {
    await gameService.leaveRoom(roomId)
    return roomId
  }
)

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
      
      const roomIndex = state.rooms.findIndex(room => room.id === action.payload.id)
      if (roomIndex !== -1) {
        state.rooms[roomIndex] = { ...state.rooms[roomIndex], ...action.payload }
      }
    },
    addPlayerToRoom: (state, action: PayloadAction<{ roomId: string; player: any }>) => {
      const { roomId, player } = action.payload
      
      if (state.currentRoom && state.currentRoom.id === roomId) {
        state.currentRoom.players = state.currentRoom.players || []
        state.currentRoom.players.push(player)
      }
    },
    removePlayerFromRoom: (state, action: PayloadAction<{ roomId: string; playerId: string }>) => {
      const { roomId, playerId } = action.payload
      
      if (state.currentRoom && state.currentRoom.id === roomId) {
        state.currentRoom.players = state.currentRoom.players?.filter(
          player => player.userId !== playerId
        ) || []
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
  clearError 
} = roomSlice.actions

export default roomSlice.reducer