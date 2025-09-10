import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RiskGameBoard } from '../components/RiskGameBoard'
import { useAppSelector } from '../hooks/redux'
import audioService from '../services/audioService'
import { socketService } from '../services/socketService'
import TabbedGameChat from '../components/chat/TabbedGameChat'

export default function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { currentRoom } = useAppSelector((state) => state.room)
  const { currentGame } = useAppSelector((state) => state.game)
  const { user } = useAppSelector((state) => state.auth)
  const [isMuted, setIsMuted] = useState(audioService.isMutedState())

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

  const handleToggleMute = () => {
    audioService.toggleMute()
    setIsMuted(audioService.isMutedState())
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
        <div className="flex gap-2">
          <button
            onClick={handleToggleMute}
            className="bg-surface-2 hover:brightness-110 px-4 py-2 rounded flex items-center gap-2"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🔊'} {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button
            onClick={handleLeaveRoom}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
          >
            Leave Room
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Game Board */}
        <div className="lg:col-span-3">
          <div className="h-[600px]">
            {currentGame ? (
              <RiskGameBoard
                onTerritoryClick={(_territoryId) => {
                  // TODO: Handle territory interactions based on game phase
                }}
              />
            ) : (
              <div className="bg-surface-1 rounded-lg p-6 h-full flex items-center justify-center">
                <div className="text-center text-muted">
                  <h2 className="text-xl font-bold mb-4">Waiting for game to start...</h2>
                  <p>Need at least 2 players to begin</p>
                  <div className="mt-6">
                    <RiskGameBoard onTerritoryClick={(_territoryId) => {}} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Players */}
          <div className="bg-surface-1 rounded-lg p-4">
            <h3 className="text-lg font-bold mb-3">
              Players ({currentRoom.players?.length || 0}/{currentRoom.maxPlayers})
            </h3>
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
            <div className="bg-surface-1 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">Game Controls</h3>
              <div className="space-y-2">
                <button className="w-full bg-primary hover:brightness-110 px-3 py-2 rounded text-sm">
                  Deploy Armies
                </button>
                <button className="w-full bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm">
                  Attack
                </button>
                <button className="w-full bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm">
                  Fortify
                </button>
                <button className="w-full bg-surface-2 hover:brightness-110 px-3 py-2 rounded text-sm">
                  End Turn
                </button>
              </div>
            </div>
          )}

          {/* Chat */}
          <div className="bg-surface-1 rounded-lg overflow-hidden" style={{ height: '400px' }}>
            {roomId && user && (
              <TabbedGameChat
                gameId={roomId}
                players={currentRoom.players || []}
                currentUserId={user.id}
                userTeamId={currentGame?.players?.find(p => p.userId === user.id)?.teamId}
                className="h-full"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
