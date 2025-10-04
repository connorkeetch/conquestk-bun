import type React from 'react'
import { memo, useCallback, useState } from 'react'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { endTurn } from '@/store/gameActions'
import { DiceResultsBar } from './DiceResultsBar'
import { TurnTimer } from './TurnTimer'

interface GameHeaderProps {
  currentPhase: string
  currentPlayerInfo?: {
    id: string
    username: string
    color: string
    troops?: number
  }
}

export const GameHeader: React.FC<GameHeaderProps> = memo(
  ({ currentPhase }) => {
    const dispatch = useAppDispatch()
    const connection = useAppSelector((s) => s.uiRoom.connectionStatus)
    const game = useAppSelector((s) => s.game.currentGame)
    const userId = useAppSelector((s) => s.auth.user?.id)
    const [profileUsername, setProfileUsername] = useState<string | null>(null)
    const isMyTurn = Boolean(userId && game?.currentPlayer === userId)
    const phase = game?.phase ?? currentPhase
    const endPhaseLabel =
      phase === 'reinforcement'
        ? 'End Phase → Attack'
        : phase === 'attack'
          ? 'End Phase → Fortify'
          : phase === 'fortify'
            ? 'End Phase → End Turn'
            : 'End Phase'

    const handleEndTurn = useCallback(() => {
      void dispatch(endTurn())
    }, [dispatch])

    return (
      <div className="bg-[color:var(--surface-2)] border-b border-[color:var(--panel-border)] px-4 py-3">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-center gap-4 text-sm flex-1">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded font-medium bg-[color:var(--surface-1)] text-[color:var(--text)]">
              {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}
            </span>
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
          {/* Current turn label removed; show End Phase button when it's my turn */}
          {isMyTurn && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleEndTurn}
                title={endPhaseLabel}
              >
                {endPhaseLabel}
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
  },
  (prevProps, nextProps) => {
    // Only re-render if phase changes
    return prevProps.currentPhase === nextProps.currentPhase
  },
)
