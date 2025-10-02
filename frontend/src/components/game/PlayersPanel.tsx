import type React from 'react'
import { getColorValue } from '@/constants/colors'

interface Player {
  id: string
  username: string
  color: string
}

interface Territory {
  id: string
  owner?: string
  armies?: number
}

interface PlayersPanelProps {
  players: Player[]
  territories: { [key: string]: Territory }
  currentPlayer: string
}

export const PlayersPanel: React.FC<PlayersPanelProps> = ({
  players,
  territories,
  currentPlayer,
}) => {
  return (
    <div className="p-4 border-b border-gray-200">
      <h3 className="text-lg font-semibold mb-3">Players</h3>
      <div className="space-y-2">
        {players.map((player) => {
          const territoriesOwned = Object.values(territories).filter(
            (t) => t.owner === player.id,
          ).length
          const totalArmies = Object.values(territories)
            .filter((t) => t.owner === player.id)
            .reduce((sum, t) => sum + (t.armies || 0), 0)

          return (
            <div
              key={player.id}
              className={`flex items-center justify-between p-2 rounded ${
                player.id === currentPlayer ? 'bg-blue-100 border border-blue-300' : ''
              }`}
            >
              <div className="flex items-center space-x-2">
                <div
                  className="w-4 h-4 rounded-full border border-gray-400"
                  style={{ backgroundColor: getColorValue(player.color) }}
                ></div>
                <span className="font-medium">{player.username}</span>
              </div>
              <div className="text-sm text-gray-600">
                <span>{territoriesOwned} territories</span>
                <br />
                <span>{totalArmies} armies</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
