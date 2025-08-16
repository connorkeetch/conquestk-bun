import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { socketService } from '../services/socketService'
import { RiskGameBoard } from '../components/RiskGameBoard'

export default function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { currentRoom } = useAppSelector((state) => state.room)
  const { currentGame } = useAppSelector((state) => state.game)
  const { user } = useAppSelector((state) => state.auth)

  useEffect(() => {
    if (!roomId) {
      navigate('/lobby')
      return
    }

    socketService.joinRoom(roomId)

    return () => {
      if (roomId) {
        socketService.leaveRoom(roomId)
      }
    }
  }, [roomId, navigate])

  const handleLeaveRoom = () => {
    navigate('/lobby')
  }

  if (!currentRoom) {
    return (
      <div className="text-center">
        <div className="text-xl">Loading room...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{currentRoom.name}</h1>
        <button
          onClick={handleLeaveRoom}
          className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
        >
          Leave Room
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Game Board */}
        <div className="lg:col-span-3">
          <div className="h-[600px]">
            {currentGame ? (
              <RiskGameBoard
                onTerritoryClick={(territoryId) => {
                  console.log('Territory clicked:', territoryId);
                  // TODO: Handle territory interactions based on game phase
                }}
              />
            ) : (
              <div className="bg-gray-800 rounded-lg p-6 h-full flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <h2 className="text-xl font-bold mb-4">Waiting for game to start...</h2>
                  <p>Need at least 2 players to begin</p>
                  <div className="mt-6">
                    <RiskGameBoard
                      onTerritoryClick={(territoryId) => {
                        console.log('Preview territory clicked:', territoryId);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Players */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Players ({currentRoom.players?.length || 0}/{currentRoom.maxPlayers})</h3>
            <div className="space-y-2">
              {currentRoom.players?.map((player) => (
                <div key={player.userId} className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className={player.userId === user?.id ? 'font-bold' : ''}>
                    {player.username}
                  </span>
                  {player.userId === currentRoom.hostId && (
                    <span className="text-xs bg-yellow-600 px-2 py-1 rounded">HOST</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Game Controls */}
          {currentGame && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">Game Controls</h3>
              <div className="space-y-2">
                <button className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm">
                  Deploy Armies
                </button>
                <button className="w-full bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm">
                  Attack
                </button>
                <button className="w-full bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm">
                  Fortify
                </button>
                <button className="w-full bg-gray-600 hover:bg-gray-700 px-3 py-2 rounded text-sm">
                  End Turn
                </button>
              </div>
            </div>
          )}

          {/* Chat */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">Chat</h3>
            <div className="h-32 bg-gray-700 rounded p-2 mb-2 overflow-y-auto">
              <div className="text-sm text-gray-400">Chat messages will appear here...</div>
            </div>
            <div className="flex">
              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded-l text-sm"
              />
              <button className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-r text-sm">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}