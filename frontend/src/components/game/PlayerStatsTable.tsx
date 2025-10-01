import type React from 'react'
import { useState } from 'react'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
import { getColorValue } from '@/constants/colors'
import type { GamePlayer } from '@/types/game'

interface PlayerStatsTableProps {
  players: GamePlayer[]
  currentPlayerId?: string
  territories: Record<string, { owner?: string | null }>
}

export const PlayerStatsTable: React.FC<PlayerStatsTableProps> = ({
  players,
  currentPlayerId,
  territories,
}) => {
  const [profileUsername, setProfileUsername] = useState<string | null>(null)

  // Calculate stats for each player
  const playerStats = players.map((player) => {
    const territoryCount = Object.values(territories).filter((t) => t.owner === player.id).length

    const totalArmies = player.armies ?? 0
    const treasureCount = Array.isArray(player.treasures)
      ? player.treasures.length
      : player.cards?.length || 0

    // Calculate reinforcements per turn (territories / 3, rounded down, min 3)
    const baseReinforcements = Math.max(3, Math.floor(territoryCount / 3))

    return {
      ...player,
      territoryCount,
      totalArmies,
      treasureCount,
      reinforcements: baseReinforcements,
      isCurrentTurn: player.id === currentPlayerId,
    }
  })

  // Sort by turn order (if available) or keep original order
  const sortedPlayers = [...playerStats].sort((a, b) => {
    if (typeof a.turnOrder === 'number' && typeof b.turnOrder === 'number') {
      return a.turnOrder - b.turnOrder
    }
    return 0
  })

  return (
    <>
      <div className="panel p-0 overflow-hidden">
        <div className="bg-[color:var(--surface-2)] px-3 py-2 border-b border-[color:var(--panel-border)]">
          <h3 className="text-sm font-semibold text-[color:var(--heading)]">Player Stats</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface-2)] sticky top-0">
              <tr className="border-b border-[color:var(--panel-border)]">
                <th className="px-2 py-2 text-left font-medium text-muted">#</th>
                <th className="px-2 py-2 text-left font-medium text-muted">Player</th>
                <th className="px-2 py-2 text-right font-medium text-muted">Armies</th>
                <th className="px-2 py-2 text-right font-medium text-muted">Terr.</th>
                <th className="px-2 py-2 text-right font-medium text-muted">+/Turn</th>
                <th className="px-2 py-2 text-right font-medium text-muted">Cards</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player, index) => (
                <tr
                  key={player.id}
                  className={`border-b border-[color:var(--panel-border)] last:border-b-0 ${
                    player.isCurrentTurn
                      ? 'bg-[color:var(--color-accent)]/20 ring-2 ring-[color:var(--color-accent)]/50'
                      : 'hover:bg-[color:var(--surface-2)]'
                  }`}
                >
                  <td className="px-3 py-3 text-muted whitespace-nowrap">
                    {player.isCurrentTurn && (
                      <span className="inline-block w-3 h-3 rounded-full bg-[color:var(--color-accent)] mr-2 animate-pulse" />
                    )}
                    {index + 1}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-4 h-4 rounded-full border-2 border-[color:var(--panel-border)] shrink-0"
                        style={{ backgroundColor: getColorValue(player.color) }}
                      />
                      <button
                        type="button"
                        className="truncate text-[color:var(--text)] hover:underline text-left font-medium"
                        onClick={() => setProfileUsername(player.username)}
                        title={player.username}
                      >
                        {player.username}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[color:var(--text)] whitespace-nowrap">
                    {player.totalArmies}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[color:var(--text)] whitespace-nowrap">
                    {player.territoryCount}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[color:var(--color-success)] whitespace-nowrap">
                    +{player.reinforcements}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[color:var(--text)] whitespace-nowrap">
                    {player.treasureCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <PlayerProfileModal
        open={profileUsername !== null}
        username={profileUsername}
        onClose={() => setProfileUsername(null)}
      />
    </>
  )
}
