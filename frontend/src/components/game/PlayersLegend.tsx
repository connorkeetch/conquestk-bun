import type React from 'react'

interface PlayerSummary {
  id: string
  username: string
  color: string
  territoriesOwned: number
  totalArmies: number
  isCurrentPlayer: boolean
}

interface PlayersLegendProps {
  players: PlayerSummary[]
}

export const PlayersLegend: React.FC<PlayersLegendProps> = ({ players }) => {
  return (
    <div className="p-4 border-b border-gray-200">
      <h3 className="text-lg font-semibold mb-3">Players</h3>
      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.id}
            className={`flex items-center justify-between p-2 rounded ${
              player.isCurrentPlayer ? 'bg-blue-100 border border-blue-300' : ''
            }`}
          >
            <div className="flex items-center space-x-2">
              <div
                className="w-4 h-4 rounded-full border border-gray-400"
                style={{ backgroundColor: player.color }}
              />
              <span className="font-medium">{player.username}</span>
            </div>
            <div className="text-sm text-gray-600">
              <span>{player.territoriesOwned} territories</span>
              <br />
              <span>{player.totalArmies} armies</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export type { PlayerSummary }
