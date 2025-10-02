import { useState } from 'react'

interface TeamAssignmentProps {
  players: TeamAssignmentPlayer[]
  numberOfTeams: number
  isHost: boolean
  onTeamChange?: (playerId: string, teamId: number) => Promise<void> | void
}

interface TeamAssignmentPlayer {
  id: string
  username: string
  teamId?: number | null
  isAi?: boolean
  aiDifficulty?: string | null
}

const formatDifficulty = (difficulty?: string | null) => {
  if (!difficulty) return ''
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
}

const TEAM_COLORS = [
  { id: 1, name: 'Team Red', color: 'bg-red-600', border: 'border-red-500' },
  { id: 2, name: 'Team Blue', color: 'bg-primary', border: 'border-primary' },
  { id: 3, name: 'Team Green', color: 'bg-green-600', border: 'border-green-500' },
  { id: 4, name: 'Team Yellow', color: 'bg-yellow-600', border: 'border-yellow-500' },
  { id: 5, name: 'Team Purple', color: 'bg-purple-600', border: 'border-purple-500' },
  { id: 6, name: 'Team Orange', color: 'bg-orange-500', border: 'border-orange-400' },
]

export default function TeamAssignment({
  players,
  numberOfTeams,
  isHost,
  onTeamChange,
}: TeamAssignmentProps) {
  const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null)

  // Group players by team
  const teams = Array.from({ length: numberOfTeams }, (_, i) => ({
    ...TEAM_COLORS[i],
    players: players.filter((p) => p.teamId === i + 1),
  }))

  // Unassigned players
  const unassignedPlayers = players.filter((p) => !p.teamId || p.teamId === 0)

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

  const handleDrop = async (e: React.DragEvent, teamId: number) => {
    e.preventDefault()
    if (!isHost || !draggedPlayer) return

    await onTeamChange?.(draggedPlayer, teamId)
    setDraggedPlayer(null)
  }

  const handleAutoBalance = async () => {
    if (!isHost) return

    // Distribute players evenly across teams
    const shuffled = [...players].sort(() => Math.random() - 0.5)
    for (let index = 0; index < shuffled.length; index++) {
      const player = shuffled[index]
      const teamId = (index % numberOfTeams) + 1
      await onTeamChange?.(player.id, teamId)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Team Assignment</h3>
        {isHost && (
          <button
            type="button"
            onClick={handleAutoBalance}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Auto Balance Teams
          </button>
        )}
      </div>

      {/* Team containers */}
      <div className="grid grid-cols-2 gap-4">
        {teams.map((team) => (
          <section
            key={team.id}
            className={`p-4 rounded-lg border-2 ${team.border} bg-surface-1 ${
              isHost ? 'cursor-pointer' : ''
            }`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, team.id)}
            aria-label={`${team.name} team drop zone`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-4 h-4 rounded-full ${team.color}`} />
              <h4 className="font-semibold text-white">{team.name}</h4>
              <span className="text-sm text-muted">({team.players.length} players)</span>
            </div>

            <ul className="space-y-2 min-h-[60px]">
              {team.players.map((player) => (
                <li key={player.id}>
                  <button
                    type="button"
                    draggable={isHost}
                    onDragStart={() => handleDragStart(player.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex w-full items-center gap-2 p-2 bg-surface-2 rounded ${
                      isHost ? 'cursor-move hover:bg-gray-600' : ''
                    } ${draggedPlayer === player.id ? 'opacity-50' : ''}`}
                    tabIndex={isHost ? 0 : -1}
                    aria-label={`Move ${player.username}`}
                  >
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                    <span className="text-sm text-white">{player.username}</span>
                    {player.isAi && (
                      <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">
                        AI{player.aiDifficulty ? ` – ${formatDifficulty(player.aiDifficulty)}` : ''}
                      </span>
                    )}
                  </button>
                </li>
              ))}

              {team.players.length === 0 && (
                <li className="text-center text-muted text-sm py-2">
                  {isHost ? 'Drag players here' : 'No players yet'}
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>

      {/* Unassigned players */}
      {unassignedPlayers.length > 0 && (
        <div className="mt-4 p-4 bg-surface-1 rounded-lg border-2 border-border">
          <h4 className="font-semibold text-white mb-3">Unassigned Players</h4>
          <ul className="flex flex-wrap gap-2">
            {unassignedPlayers.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  draggable={isHost}
                  onDragStart={() => handleDragStart(player.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 p-2 bg-surface-2 rounded ${
                    isHost ? 'cursor-move hover:bg-gray-600' : ''
                  } ${draggedPlayer === player.id ? 'opacity-50' : ''}`}
                  tabIndex={isHost ? 0 : -1}
                  aria-label={`Assign ${player.username}`}
                >
                  <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                  <span className="text-sm text-white">{player.username}</span>
                  {player.isAi && (
                    <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">
                      AI{player.aiDifficulty ? ` – ${formatDifficulty(player.aiDifficulty)}` : ''}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {isHost && (
            <p className="text-xs text-muted mt-2">
              Drag players to teams or click "Auto Balance" to distribute evenly
            </p>
          )}
        </div>
      )}

      {/* Instructions */}
      {!isHost && (
        <p className="text-sm text-muted text-center">Waiting for host to assign teams...</p>
      )}
    </div>
  )
}
