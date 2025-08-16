import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { fetchRooms, createRoom } from '../store/roomSlice'
import { socketService } from '../services/socketService'

export default function GameLobby() {
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [isPrivate, setIsPrivate] = useState(false)
  
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { rooms, isLoading } = useAppSelector((state) => state.room)

  useEffect(() => {
    dispatch(fetchRooms())
    socketService.connect()
    
    return () => {
      socketService.disconnect()
    }
  }, [dispatch])

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    const action = await dispatch(createRoom({ name: roomName, maxPlayers, isPrivate }))
    if (createRoom.fulfilled.match(action)) {
      navigate(`/room/${action.payload.id}`)
    }
  }

  const handleJoinRoom = (roomId: string) => {
    navigate(`/room/${roomId}`)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Game Lobby</h1>
        <button
          onClick={() => setShowCreateRoom(true)}
          className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
        >
          Create Room
        </button>
      </div>

      {showCreateRoom && (
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-bold mb-4">Create New Room</h2>
          <form onSubmit={handleCreateRoom} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Room Name</label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Max Players</label>
              <select
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              >
                <option value={2}>2 Players</option>
                <option value={3}>3 Players</option>
                <option value={4}>4 Players</option>
                <option value={5}>5 Players</option>
                <option value={6}>6 Players</option>
              </select>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="private"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="private" className="text-sm">Private Room</label>
            </div>
            <div className="flex space-x-2">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreateRoom(false)}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center">Loading rooms...</div>
        ) : rooms.length === 0 ? (
          <div className="text-center text-gray-400">No rooms available. Create one to get started!</div>
        ) : (
          rooms.map((room) => (
            <div key={room.id} className="bg-gray-800 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">{room.name}</h3>
                  <p className="text-gray-400">
                    Players: {room.players?.length || 0}/{room.maxPlayers} | 
                    Status: {room.status}
                  </p>
                </div>
                <button
                  onClick={() => handleJoinRoom(room.id)}
                  disabled={room.status !== 'waiting' || (room.players?.length || 0) >= room.maxPlayers}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded"
                >
                  Join
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}