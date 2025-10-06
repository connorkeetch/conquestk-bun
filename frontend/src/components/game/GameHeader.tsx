import type React from 'react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import PlayerProfileModal from '@/components/profile/PlayerProfileModal'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { endTurn, goBackToReinforcement, undoFortify, undoLastPlacement } from '@/store/gameActions'
import { resolveAssetPath } from '@/utils/assets'
import { DiceResultsBar } from './DiceResultsBar'
import { TreasureTradeModal } from './TreasureTradeModal'

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
    const game = useAppSelector((s) => s.game.currentGame)
    const userId = useAppSelector((s) => s.auth.user?.id)
    const placementHistoryLen = useAppSelector((s) => (s.uiRoom.placementHistory ?? []).length)
    const treasureConfig = useAppSelector((s) => s.room.currentRoom?.treasureConfig) as
      | ({ payoutMode?: string; fixedValue?: number } & Record<string, unknown>)
      | undefined
    const [profileUsername, setProfileUsername] = useState<string | null>(null)
    const [showTreasures, setShowTreasures] = useState(false)
    const isMyTurn = Boolean(userId && game?.currentPlayer === userId)
    const phase = game?.phase ?? currentPhase
    const canGoBackToReinforcement = phase === 'attack' && !game?.hasAttackedThisTurn
    const mustCashIn = Boolean(game?.mustCashInTreasures)
    const me = useAppSelector((s) =>
      s.game.currentGame?.players.find(
        (p) => p.userId === s.auth.user?.id || p.id === s.auth.user?.id,
      ),
    )
    const myHandCount = (me?.treasures?.length ?? 0) as number
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

    // Auto-open treasures if required
    useEffect(() => {
      if (isMyTurn && mustCashIn) setShowTreasures(true)
    }, [isMyTurn, mustCashIn])

    const treasurePayout = useMemo(() => {
      const mode = (treasureConfig?.payoutMode || '').toLowerCase()
      if (!mode || mode === 'none') return null
      const idx =
        (game?.treasureState as { nextPayoutIndex?: number } | undefined)?.nextPayoutIndex ?? 0
      if (mode === 'fixed') {
        const val = Math.max(
          1,
          Math.min(50, (treasureConfig?.fixedValue as number | undefined) ?? 8),
        )
        return val
      }
      if (mode === 'classic') {
        const classicSeq = [4, 6, 8, 10, 12, 15, 20, 25, 30, 35]
        return idx < classicSeq.length
          ? classicSeq[idx]
          : classicSeq[classicSeq.length - 1] + (idx - classicSeq.length + 1) * 5
      }
      // triangular default
      const safeIdx = Math.max(0, Math.floor(idx))
      if (safeIdx === 0) return 4
      let payout = 4
      let delta = 2
      for (let i = 1; i <= safeIdx; i++) {
        payout += delta
        delta += 1
      }
      return payout
    }, [game?.treasureState, treasureConfig])

    return (
      <div className="bg-[color:var(--surface-2)] border-b border-[color:var(--panel-border)] px-4 py-3">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-center gap-4 text-sm flex-1">
            {isMyTurn ? (
              <fieldset
                aria-label="Turn phases"
                className="flex items-center gap-2 m-0 p-0 border-0"
              >
                <legend className="sr-only">Turn phases</legend>
                {(['reinforcement', 'attack', 'fortify'] as const).map((p) => {
                  const active = phase === p
                  const label =
                    p === 'reinforcement' ? 'Reinforce' : p.charAt(0).toUpperCase() + p.slice(1)
                  return (
                    <span
                      key={p}
                      className={
                        'inline-flex items-center gap-1 px-2 py-1 rounded font-medium ' +
                        (active
                          ? 'bg-[color:var(--color-accent)]/20 ring-1 ring-[color:var(--color-accent)] text-[color:var(--heading)]'
                          : 'bg-[color:var(--surface-1)] text-muted')
                      }
                    >
                      {label}
                    </span>
                  )
                })}
              </fieldset>
            ) : null}
          </div>
          {/* Current turn label removed; show End Phase button when it's my turn */}
          <div className="flex items-center gap-2">
            {typeof treasurePayout === 'number' && treasurePayout > 0 && (
              <span className="chip text-[10px]" title="Next treasure set payout">
                💰 +{treasurePayout}
              </span>
            )}
            {/* Undo controls */}
            {isMyTurn && phase === 'reinforcement' && placementHistoryLen > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void dispatch(undoLastPlacement())}
                title="Undo last placement (Z)"
              >
                ↶ Undo
              </button>
            )}
            {isMyTurn &&
              phase === 'fortify' &&
              Object.keys(game?.movementTracking ?? {}).length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void dispatch(undoFortify())}
                  title="Undo last fortify (Z)"
                >
                  ↶ Undo
                </button>
              )}
            {/* Treasures modal trigger */}
            {isMyTurn && (myHandCount > 0 || mustCashIn) && (
              <button
                type="button"
                className={`btn btn-secondary btn-sm ${mustCashIn ? 'ring-1 ring-yellow-400' : ''}`}
                onClick={() => setShowTreasures(true)}
                title={mustCashIn ? 'You must trade a set' : 'View/trade treasures'}
              >
                <img
                  src={resolveAssetPath('static/icons/treasures/diamond.svg')}
                  alt=""
                  width={14}
                  height={14}
                  className="inline-block align-middle mr-1"
                  aria-hidden
                />
                Treasures
              </button>
            )}
            {isMyTurn && canGoBackToReinforcement && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void dispatch(goBackToReinforcement())}
                title="Go back to reinforcement"
              >
                ↩ Reinforce
              </button>
            )}
            {isMyTurn && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleEndTurn}
                title={endPhaseLabel}
              >
                {endPhaseLabel}
              </button>
            )}
          </div>
        </div>
        {/* Dice recap bar (last battle) */}
        <DiceResultsBar />
        {/* Treasures modal */}
        <TreasureTradeModal isOpen={showTreasures} onClose={() => setShowTreasures(false)} />
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
