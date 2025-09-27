import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { socketService } from '../services/socketService'
import { createRoom, fetchRooms } from '../store/roomSlice'

export default function GameLobby() {
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [isPrivate, setIsPrivate] = useState(false)
  const roomNameId = useId()
  const maxPlayersId = useId()
  const privateRoomId = useId()

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
      navigate(`/room/${action.payload.roomCode ?? action.payload.id}`)
    }
  }

  const handleJoinRoom = (roomId: string) => {
    navigate(`/room/${roomId}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-[color:var(--heading)]">Game Lobby</h1>
        <button type="button" onClick={() => setShowCreateRoom(true)} className="btn btn-success">
          Create Room
        </button>
      </div>

      {showCreateRoom && (
        <div className="panel mb-6 space-y-4">
          <h2 className="text-xl font-semibold text-[color:var(--heading)]">Create New Room</h2>
          <form onSubmit={handleCreateRoom} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor={roomNameId}>
                Room Name
              </label>
              <input
                type="text"
                id={roomNameId}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                required
                className="form-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor={maxPlayersId}>
                Max Players
              </label>
              <select
                id={maxPlayersId}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="form-select"
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
                id={privateRoomId}
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="form-checkbox mr-2"
              />
              <label htmlFor={privateRoomId} className="text-sm">
                Private Room
              </label>
            </div>
            <div className="flex space-x-2">
              <button type="submit" className="btn btn-success">
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreateRoom(false)}
                className="btn btn-secondary"
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
          <div className="panel text-center text-muted">
            No rooms available. Create one to get started!
          </div>
        ) : (
          rooms.map((room) => (
            <div key={room.id} className="panel">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">{room.name}</h3>
                  <p className="text-muted">
                    Players: {room.players?.length || 0}/{room.maxPlayers} | Status: {room.status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleJoinRoom(String(room.roomCode ?? room.id))}
                  disabled={
                    room.status !== 'lobby' || (room.players?.length || 0) >= room.maxPlayers
                  }
                  className="btn btn-primary"
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
