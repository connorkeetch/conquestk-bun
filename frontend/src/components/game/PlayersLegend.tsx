import type React from 'react'
import { useState } from 'react'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
import { getColorValue } from '@/constants/colors'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { toggleMuteUser } from '@/store/uiRoomSlice'

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
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  const dispatch = useAppDispatch()
  const muted = useAppSelector((s) => new Set(s.uiRoom.mutedUserIds ?? []))

  return (
    <div className="panel-outline p-3">
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
                style={{ backgroundColor: getColorValue(player.color) }}
              />
              <button
                type="button"
                className="font-medium underline-offset-2 hover:underline"
                onClick={() => setProfileUsername(player.username)}
                title={`View ${player.username}'s profile`}
              >
                {player.username}
              </button>
            </div>
            <div className="text-sm text-gray-600 flex items-center gap-3">
              <div className="text-right">
                <span>{player.territoriesOwned} territories</span>
                <br />
                <span>{player.totalArmies} armies</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={`btn btn-ghost btn-xs ${muted.has(player.id) ? 'text-yellow-300' : 'text-muted'}`}
                  onClick={() => dispatch(toggleMuteUser(player.id))}
                  title={muted.has(player.id) ? 'Unmute player' : 'Mute player'}
                >
                  {muted.has(player.id) ? 'Unmute' : 'Mute'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-muted"
                  onClick={() => {
                    // Placeholder: surface a future report UI
                    alert(`Report submitted for ${player.username}`)
                  }}
                  title="Report player"
                >
                  Report
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <PlayerProfileModal
        open={profileUsername !== null}
        username={profileUsername}
        onClose={() => setProfileUsername(null)}
      />
    </div>
  )
}

export type { PlayerSummary }
