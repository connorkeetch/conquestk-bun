import type React from 'react'
import { useState } from 'react'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
import { useAppSelector } from '@/hooks/redux'
import { TurnTimer } from './TurnTimer'

interface GameHeaderProps {
  currentPhase: string
  turn: number
  currentPlayerInfo?: {
    id: string
    username: string
    color: string
    troops?: number
  }
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  currentPhase,
  turn,
  currentPlayerInfo,
}) => {
  const connection = useAppSelector((s) => s.uiRoom.connectionStatus)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  return (
    <div className="bg-blue-900 text-white p-4">
      <div className="flex justify-between items-center gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold truncate">Risk Game Board</h2>
          <div className="flex items-center gap-3 text-sm opacity-75 mt-1">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-surface-2 text-ink-2`}
            >
              {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}
            </span>
            <span>Turn {turn}</span>
            <TurnTimer />
            <span
              className="inline-flex items-center gap-1 text-xs"
              title={
                connection === 'connected'
                  ? 'Connected'
                  : connection === 'connecting'
                    ? 'Reconnecting'
                    : 'Disconnected'
              }
            >
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  connection === 'connected'
                    ? 'bg-green-500'
                    : connection === 'connecting'
                      ? 'bg-yellow-400'
                      : 'bg-red-500'
                }`}
              />
              {connection}
            </span>
          </div>
        </div>
        {currentPlayerInfo && (
          <div className="flex items-center space-x-2">
            <span>Current Turn:</span>
            <div
              className="w-3 h-3 rounded-full border border-white"
              style={{ backgroundColor: currentPlayerInfo.color }}
            ></div>
            <button
              type="button"
              className="font-semibold underline-offset-2 hover:underline"
              onClick={() => setProfileUsername(currentPlayerInfo.username)}
              title={`View ${currentPlayerInfo.username}'s profile`}
            >
              {currentPlayerInfo.username}
            </button>
            <span className="text-sm opacity-75">
              ({currentPlayerInfo.troops ?? 0} troops to deploy)
            </span>
          </div>
        )}
      </div>
      <PlayerProfileModal
        open={profileUsername !== null}
        username={profileUsername}
        onClose={() => setProfileUsername(null)}
      />
    </div>
  )
}
