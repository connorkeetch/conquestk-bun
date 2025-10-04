import type React from 'react'
import { memo, useMemo } from 'react'
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

export const PlayersPanel: React.FC<PlayersPanelProps> = memo(
  ({ players, territories, currentPlayer }) => {
    // Memoize expensive calculations
    const playerStats = useMemo(() => {
      return players.map((player) => {
        const ownedTerritories = Object.values(territories).filter((t) => t.owner === player.id)
        return {
          id: player.id,
          username: player.username,
          color: player.color,
          territoriesOwned: ownedTerritories.length,
          totalArmies: ownedTerritories.reduce((sum, t) => sum + (t.armies || 0), 0),
        }
      })
    }, [players, territories])
    return (
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold mb-3">Players</h3>
        <div className="space-y-2">
          {playerStats.map((player) => (
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
                <span>{player.territoriesOwned} territories</span>
                <br />
                <span>{player.totalArmies} armies</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison for better memoization
    return (
      prevProps.currentPlayer === nextProps.currentPlayer &&
      prevProps.players === nextProps.players &&
      prevProps.territories === nextProps.territories
    )
  },
)
