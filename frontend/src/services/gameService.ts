import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

const api = axios.create({
  baseURL: API_URL,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const gameService = {
  async getRooms() {
    const response = await api.get('/game/rooms')
    return response.data
  },

  async createRoom(roomData: { name: string; maxPlayers: number; isPrivate: boolean }) {
    const response = await api.post('/game/rooms', roomData)
    return response.data
  },

  async joinRoom(roomId: string) {
    const response = await api.post(`/game/rooms/${roomId}/join`)
    return response.data
  },

  async leaveRoom(roomId: string) {
    const response = await api.delete(`/game/rooms/${roomId}/leave`)
    return response.data
  },

  async getRoomDetails(roomId: string) {
    const response = await api.get(`/game/rooms/${roomId}`)
    return response.data
  },
}