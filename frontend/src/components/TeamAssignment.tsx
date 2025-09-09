import { useState } from 'react'
import type { Player } from '../types/game'

interface TeamAssignmentProps {
  players: Player[]
  numberOfTeams: number
  isHost: boolean
  onTeamChange?: (playerId: string, teamId: number) => void
}

const TEAM_COLORS = [
  { id: 1, name: 'Team Red', color: 'bg-red-600', border: 'border-red-500' },
  { id: 2, name: 'Team Blue', color: 'bg-violet', border: 'border-violet' },
  { id: 3, name: 'Team Green', color: 'bg-green-600', border: 'border-green-500' },
  { id: 4, name: 'Team Yellow', color: 'bg-yellow-600', border: 'border-yellow-500' },
]

export default function TeamAssignment({
  players,
  numberOfTeams,
  isHost,
  onTeamChange
}: TeamAssignmentProps) {
  const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null)
  
  // Group players by team
  const teams = Array.from({ length: numberOfTeams }, (_, i) => ({
    ...TEAM_COLORS[i],
    players: players.filter(p => p.teamId === i + 1)
  }))
  
  // Unassigned players
  const unassignedPlayers = players.filter(p => !p.teamId || p.teamId === 0)
  
  const handleDragStart = (playerId: string) => {
    if (!isHost) return
    setDraggedPlayer(playerId)
  }
  
  const handleDragEnd = () => {
    setDraggedPlayer(null)
  }
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }
  
  const handleDrop = (e: React.DragEvent, teamId: number) => {
    e.preventDefault()
    if (!isHost || !draggedPlayer) return
    
    onTeamChange?.(draggedPlayer, teamId)
    setDraggedPlayer(null)
  }
  
  const handleAutoBalance = () => {
    if (!isHost) return
    
    // Distribute players evenly across teams
    const shuffled = [...players].sort(() => Math.random() - 0.5)
    shuffled.forEach((player, index) => {
      const teamId = (index % numberOfTeams) + 1
      onTeamChange?.(player.id, teamId)
    })
  }
  
  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Team Assignment</h3>
        {isHost && (
          <button
            onClick={handleAutoBalance}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Auto Balance Teams
          </button>
        )}
      </div>
      
      {/* Team containers */}
      <div className="grid grid-cols-2 gap-4">
        {teams.map(team => (
          <div
            key={team.id}
            className={`p-4 rounded-lg border-2 ${team.border} bg-surface-1 ${
              isHost ? 'cursor-pointer' : ''
            }`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, team.id)}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-4 h-4 rounded-full ${team.color}`} />
              <h4 className="font-semibold text-white">{team.name}</h4>
              <span className="text-sm text-muted">
                ({team.players.length} players)
              </span>
            </div>
            
            <div className="space-y-2 min-h-[60px]">
              {team.players.map(player => (
                <div
                  key={player.id}
                  draggable={isHost}
                  onDragStart={() => handleDragStart(player.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 p-2 bg-surface-2 rounded ${
                    isHost ? 'cursor-move hover:bg-gray-600' : ''
                  } ${draggedPlayer === player.id ? 'opacity-50' : ''}`}
                >
                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                  <span className="text-sm text-white">{player.username}</span>
                  {player.isAI && (
                    <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">AI</span>
                  )}
                </div>
              ))}
              
              {team.players.length === 0 && (
                <div className="text-center text-muted text-sm py-2">
                  {isHost ? 'Drag players here' : 'No players yet'}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Unassigned players */}
      {unassignedPlayers.length > 0 && (
        <div className="mt-4 p-4 bg-surface-1 rounded-lg border-2 border-border">
          <h4 className="font-semibold text-white mb-3">Unassigned Players</h4>
          <div className="flex flex-wrap gap-2">
            {unassignedPlayers.map(player => (
              <div
                key={player.id}
                draggable={isHost}
                onDragStart={() => handleDragStart(player.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 p-2 bg-surface-2 rounded ${
                  isHost ? 'cursor-move hover:bg-gray-600' : ''
                } ${draggedPlayer === player.id ? 'opacity-50' : ''}`}
              >
                <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                <span className="text-sm text-white">{player.username}</span>
                {player.isAI && (
                  <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">AI</span>
                )}
              </div>
            ))}
          </div>
          
          {isHost && (
            <p className="text-xs text-muted mt-2">
              Drag players to teams or click "Auto Balance" to distribute evenly
            </p>
          )}
        </div>
      )}
      
      {/* Instructions */}
      {!isHost && (
        <p className="text-sm text-muted text-center">
          Waiting for host to assign teams...
        </p>
      )}
    </div>
  )
}