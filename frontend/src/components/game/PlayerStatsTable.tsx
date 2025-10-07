import type React from 'react'
import { memo, useCallback, useMemo, useState } from 'react'
import TreasureHud from '@/components/game/TreasureHud'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
import { getConquestRank } from '@/components/RankInsignia'
import { getColorValue } from '@/constants/colors'
import type { GamePlayer } from '@/types/game'
import { resolveAssetPath } from '@/utils/assets'

interface PlayerStatsTableProps {
  players: GamePlayer[]
  currentPlayerId?: string
  territories: Record<string, { owner?: string | null; armies?: number }>
  variant?: 'full' | 'compact' | 'minimal'
}

export const PlayerStatsTable: React.FC<PlayerStatsTableProps> = memo(
  ({ players, currentPlayerId, territories, variant = 'full' }) => {
    const [profileUsername, setProfileUsername] = useState<string | null>(null)

    // Memoize expensive stats calculation
    const sortedPlayers = useMemo(() => {
      return players.map((player) => {
        const terrList = Object.values(territories)
        const owned = terrList.filter((t) => t.owner === player.id)
        const territoryCount = owned.length

        // Armies should reflect total armies currently on the board for the player
        // including starting armies and any transfers, minus losses or transfers away
        const totalArmies = owned.reduce((sum, t) => sum + Math.max(0, t.armies ?? 0), 0)

        const treasureCount = Array.isArray(player.treasures)
          ? player.treasures.length
          : player.cards?.length || 0

        // Calculate reinforcements per turn (territories / 3, rounded down, min 3)
        const baseReinforcements = player.isEliminated ? 0 : Math.max(3, Math.floor(territoryCount / 3))

        return {
          ...player,
          territoryCount,
          totalArmies: player.isEliminated ? 0 : totalArmies,
          treasureCount,
          reinforcements: baseReinforcements,
          isCurrentTurn: player.id === currentPlayerId,
        }
      })
    }, [players, currentPlayerId, territories])

    const handleProfileClick = useCallback((username: string) => {
      setProfileUsername(username)
    }, [])

    return (
      <>
        <div className="panel p-0 overflow-hidden">
          <div className="bg-[color:var(--surface-2)] px-3 py-2 border-b border-[color:var(--panel-border)] flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[color:var(--heading)]">Player Stats</h3>
            <div className="shrink-0">
              <TreasureHud variant="compact" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-[color:var(--surface-2)] sticky top-0">
                <tr className="border-b border-[color:var(--panel-border)] select-none">
                  <th className="px-2 py-2 text-left font-medium text-muted">Player</th>
                  <th className="px-2 py-2 text-left font-medium text-muted" title="Rank & CP">
                    Rank
                  </th>
                  <th className="px-2 py-2 text-right font-medium text-muted">
                    <img
                      src={resolveAssetPath('static/icons/stats/armies.svg')}
                      alt=""
                      title="Total armies on the board"
                      aria-hidden
                      width={16}
                      height={16}
                      className="inline-block align-middle opacity-90"
                    />
                    <span className="sr-only">Armies</span>
                  </th>
                  <th className="px-2 py-2 text-right font-medium text-muted">
                    <img
                      src={resolveAssetPath('static/icons/stats/territories.svg')}
                      alt=""
                      title="Territories owned"
                      aria-hidden
                      width={16}
                      height={16}
                      className="inline-block align-middle opacity-90"
                    />
                    <span className="sr-only">Territories</span>
                  </th>
                  {variant === 'full' && (
                    <th className="px-2 py-2 text-right font-medium text-muted">
                      <img
                        src={resolveAssetPath('static/icons/stats/reinforcements.svg')}
                        alt=""
                        title="Base reinforcements each turn"
                        aria-hidden
                        width={16}
                        height={16}
                        className="inline-block align-middle opacity-90"
                      />
                      <span className="sr-only">Reinforcements per turn</span>
                    </th>
                  )}
                  {variant === 'full' && (
                    <th className="px-2 py-2 text-right font-medium text-muted">
                      <img
                        src={resolveAssetPath('static/icons/stats/treasures.svg')}
                        alt=""
                        title="Treasures in hand"
                        aria-hidden
                        width={16}
                        height={16}
                        className="inline-block align-middle opacity-90"
                      />
                      <span className="sr-only">Treasures</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player, _index) => {
                  const skillRating = player.skillRating ?? 1000
                  const rank = getConquestRank(skillRating)
                  return (
                    <tr
                      key={player.id}
                      className={`border-b border-[color:var(--panel-border)] last:border-b-0 ${
                        player.isCurrentTurn
                          ? 'bg-[color:var(--color-accent)]/20 ring-2 ring-[color:var(--color-accent)]/50'
                          : 'hover:bg-[color:var(--surface-2)]'
                      }`}
                    >
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div
                            className="w-3.5 h-3.5 rounded-full border-2 border-[color:var(--panel-border)] shrink-0"
                            style={{ backgroundColor: getColorValue(player.color) }}
                          />
                          <button
                            type="button"
                            className="truncate text-[color:var(--text)] hover:underline text-left font-medium"
                            onClick={() => handleProfileClick(player.username)}
                            title={player.isEliminated ? 'Eliminated' : `${player.username} (${skillRating} CP)`}
                          >
                            {player.isEliminated ? (
                              <>
                                <span title="Eliminated">💀</span> {player.username}
                              </>
                            ) : (
                              player.username
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-xs">
                          <span
                            style={{ color: rank.color }}
                            title={`${rank.name} (${skillRating} CP)`}
                          >
                            {rank.insignia}
                          </span>
                          <span className="text-muted">({skillRating})</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[color:var(--text)] whitespace-nowrap">
                        {player.totalArmies}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[color:var(--text)] whitespace-nowrap">
                        {player.territoryCount}
                      </td>
                      {variant === 'full' && (
                        <td className="px-2 py-1.5 text-right font-mono text-[color:var(--color-success)] whitespace-nowrap">
                          +{player.reinforcements}
                        </td>
                      )}
                      {variant === 'full' && (
                        <td className="px-2 py-1.5 text-right font-mono text-[color:var(--text)] whitespace-nowrap">
                          {player.treasureCount}
                        </td>
                      )}
                    </tr>
                  )
                })}
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
  },
  (prevProps, nextProps) => {
    // Custom comparison for better memoization
    return (
      prevProps.currentPlayerId === nextProps.currentPlayerId &&
      prevProps.players === nextProps.players &&
      prevProps.territories === nextProps.territories
    )
  },
)
