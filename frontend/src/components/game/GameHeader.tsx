import type React from 'react'
import { useState } from 'react'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
import { getColorValue } from '@/constants/colors'
import { useAppSelector } from '@/hooks/redux'
import { TurnTimer } from './TurnTimer'
import { DiceResultsBar } from './DiceResultsBar'

interface GameHeaderProps {
  currentPhase: string
  turn: number
  currentPlayerInfo?: {
    id: string
    username: string
    color: string
    troops?: number
  }
  zoom?: number
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomReset?: () => void
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  currentPhase,
  turn,
  currentPlayerInfo,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}) => {
  const connection = useAppSelector((s) => s.uiRoom.connectionStatus)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  return (
    <div className="bg-[color:var(--surface-2)] border-b border-[color:var(--panel-border)] px-4 py-3">
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-4 text-sm flex-1">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded font-medium bg-[color:var(--surface-1)] text-[color:var(--text)]">
            {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}
          </span>
          <span className="text-[color:var(--text)]">Turn {turn}</span>
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
          </span>
        </div>

        {/* Zoom controls */}
        {zoom !== undefined && onZoomIn && onZoomOut && onZoomReset && (
          <div className="flex gap-1 bg-[color:var(--surface-1)] px-1.5 py-1 rounded shadow-sm">
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-[color:var(--surface-3)] transition-colors text-sm font-bold"
              onClick={onZoomOut}
              title="Zoom out"
            >
              −
            </button>
            <div className="text-xs self-center min-w-[44px] text-center text-muted font-mono">
              {Math.round(zoom * 100)}%
            </div>
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-[color:var(--surface-3)] transition-colors text-sm font-bold"
              onClick={onZoomIn}
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-[color:var(--surface-3)] transition-colors text-xs"
              onClick={onZoomReset}
              title="Reset zoom"
            >
              1:1
            </button>
          </div>
        )}

        {currentPlayerInfo && (
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-muted">Current Turn:</span>
            <div
              className="w-3 h-3 rounded-full border border-[color:var(--panel-border)]"
              style={{ backgroundColor: getColorValue(currentPlayerInfo.color) }}
            />
            <button
              type="button"
              className="font-semibold underline-offset-2 hover:underline text-[color:var(--text)]"
              onClick={() => setProfileUsername(currentPlayerInfo.username)}
              title={`View ${currentPlayerInfo.username}'s profile`}
            >
              {currentPlayerInfo.username}
            </button>
          </div>
        )}
      </div>
      {/* Dice recap bar (last battle) */}
      <DiceResultsBar />
      <PlayerProfileModal
        open={profileUsername !== null}
        username={profileUsername}
        onClose={() => setProfileUsername(null)}
      />
    </div>
  )
}
