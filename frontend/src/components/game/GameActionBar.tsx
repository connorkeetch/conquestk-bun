import { computeRollOdds } from '@shared/utils/combatOdds'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import InfoTooltip from '@/components/InfoTooltip'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import {
  deployArmies,
  endTurn,
  executeAttack,
  executeFortify,
  goBackToReinforcement,
  undoFortify,
} from '@/store/gameActions'
import { selectTargetTerritory, selectTerritory, setPendingAction } from '@/store/gameSlice'
import { setAutoAttacking } from '@/store/uiRoomSlice'
import { TreasureTradeModal } from './TreasureTradeModal'

/**
 * Delay between consecutive auto-attacks (in milliseconds)
 * Provides time for battle animation and user feedback
 */
const AUTO_ATTACK_DELAY_MS = 150

export function GameActionBar({
  mode = 'fixed' as 'fixed' | 'inline',
  hidePhaseChip = false,
  hideTreasures = false,
  hideEndPhase = false,
}: {
  mode?: 'fixed' | 'inline'
  hidePhaseChip?: boolean
  hideTreasures?: boolean
  hideEndPhase?: boolean
}) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game.currentGame)
  const selected = useAppSelector((s) => s.game.selectedTerritory)
  const target = useAppSelector((s) => s.game.selectedTargetTerritory)
  const validTargets = useAppSelector((s) => s.game.validTargets)
  const userId = useAppSelector((s) => s.auth.user?.id)
  const me = useAppSelector((s) =>
    s.game.currentGame?.players.find(
      (p) => p.userId === s.auth.user?.id || p.id === s.auth.user?.id,
    ),
  )
  const mustCashIn = useAppSelector((s) => s.game.currentGame?.mustCashInTreasures)
  const myHandCount = (me?.treasures?.length ?? 0) as number
  // Trust server-provided reinforcement armies - no fallback, no local tracking
  const remaining = useAppSelector((s) => s.game.reinforcementArmies)

  const isMyTurn = Boolean(userId && game?.currentPlayer === userId)
  const phase = game?.phase ?? 'reinforcement'
  const canGoBackToReinforcement = phase === 'attack' && !game?.hasAttackedThisTurn

  const movementType = game?.gameConfig?.movementType ?? 'classic_adjacent'
  const movementTracking = game?.movementTracking ?? {}
  const singleMoveFortify = movementType === 'classic_adjacent' || movementType === 'path_single'
  const fortifyLimitReached = singleMoveFortify && Object.keys(movementTracking).length > 0
  const selectedHasMoved = Boolean(selected && movementTracking[selected])

  // Auto-populate with max troops when a territory is selected in reinforcement phase
  const [reinforce, setReinforce] = useState(remaining > 0 ? remaining : 1)

  // Update reinforce to max when remaining changes
  useEffect(() => {
    if (phase === 'reinforcement' && remaining > 0) {
      setReinforce(remaining)
    }
  }, [remaining, phase])

  const [fortify, setFortify] = useState(1)
  // Default fortify to maximum available from selected source (all but 1)
  useEffect(() => {
    if (phase !== 'fortify' || !selected || !game) return
    const src = game.board.find((t) => t.id === selected)
    const maxMovable = Math.max(1, Math.max(0, (src?.armies ?? 1) - 1))
    setFortify(maxMovable)
  }, [phase, selected, game])
  // Auto-attack is global so it can be toggled from map tooltip
  const auto = useAppSelector((s) => s.uiRoom.autoAttacking ?? false)
  const [showTreasures, setShowTreasures] = useState(false)
  const lastTargetRef = useRef<string | null>(null)
  const reinforceId = useId()
  const fortifyId = useId()

  const selectedName = useMemo(
    () => game?.board.find((t) => t.id === selected)?.name ?? selected ?? '',
    [game?.board, selected],
  )
  const targetName = useMemo(
    () => game?.board.find((t) => t.id === target)?.name ?? target ?? '',
    [game?.board, target],
  )

  const pendingText = () => {
    if (!game) return ''
    if (game.phase === 'reinforcement' && selected) return 'deploy'
    if (game.phase === 'attack' && selected && !target) return 'choose target'
    if (game.phase === 'attack' && selected && target) return 'attack'
    if (game.phase === 'fortify' && selected && !target) return 'choose destination'
    if (game.phase === 'fortify' && selected && target) return 'fortify'
    return ''
  }

  const cannotEndReinforcement = phase === 'reinforcement' && (remaining > 0 || mustCashIn)

  const odds = useMemo(() => {
    if (!game || !selected || !target) return null
    const src = game.board.find((t) => t.id === selected)
    const dst = game.board.find((t) => t.id === target)
    if (!src || !dst) return null
    // Always use max dice
    const attDice = Math.max(1, Math.min(3, (src.armies ?? 0) - 1)) as 1 | 2 | 3
    const defDice = Math.max(1, Math.min(2, dst.armies > 1 ? 2 : 1)) as 1 | 2
    return computeRollOdds(attDice, defDice)
  }, [game, selected, target])

  // Auto-attack loop
  const battle = useAppSelector((s) => s.game.battleResult)
  const autoRef = useRef(auto)
  useEffect(() => {
    autoRef.current = auto
  }, [auto])

  useEffect(() => {
    if (!auto) return
    if (!game || !selected || !target) return
    if (!battle) return
    if (battle.gameEnded) {
      void dispatch(setAutoAttacking(false))
      return
    }
    const fromId =
      typeof battle.fromTerritory === 'string' ? battle.fromTerritory : battle.fromTerritory.id
    const toId = typeof battle.toTerritory === 'string' ? battle.toTerritory : battle.toTerritory.id
    if (fromId !== selected || toId !== target) return
    const src = game.board.find((t) => t.id === selected)
    if (!src) return
    if (battle.conquered || (src.armies ?? 0) <= 1) {
      void dispatch(setAutoAttacking(false))
      return
    }
    lastTargetRef.current = target
    const timeoutId = setTimeout(() => {
      if (!autoRef.current) return
      void dispatch(
        executeAttack({
          fromTerritoryId: selected,
          toTerritoryId: lastTargetRef.current || target,
        }),
      )
    }, AUTO_ATTACK_DELAY_MS)

    return () => clearTimeout(timeoutId)
  }, [auto, battle, dispatch, game, selected, target])

  // Auto-open treasure modal if must cash in (only when it's my turn)
  useEffect(() => {
    if (isMyTurn && mustCashIn) setShowTreasures(true)
  }, [isMyTurn, mustCashIn])

  if (!game) return null
  // Only show the action bar when it's my turn
  if (!isMyTurn) return null

  const endTurnBtn = hideEndPhase ? null : (
    <button
      type="button"
      onClick={() => void dispatch(endTurn())}
      disabled={!isMyTurn || cannotEndReinforcement}
      className="btn btn-primary"
      title={
        !isMyTurn
          ? 'Wait for your turn'
          : cannotEndReinforcement
            ? mustCashIn
              ? 'Trade a valid treasure set before ending reinforcement'
              : 'Deploy all reinforcements before ending the phase'
            : `End ${phase} phase${phase === 'reinforcement' ? ' → Attack' : phase === 'attack' ? ' → Fortify' : ' → End Turn'}`
      }
    >
      End Phase
      {phase === 'reinforcement' && ' → Attack'}
      {phase === 'attack' && ' → Fortify'}
      {phase === 'fortify' && ' → End Turn'}
    </button>
  )

  const containerClasses = mode === 'fixed' ? 'p-2' : 'p-2'

  return (
    <div className={containerClasses}>
      <div className={`rounded-xl border border-border bg-surface-1 p-2 shadow-lg`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {!hidePhaseChip && (
              <span className="chip text-xs">{phase.charAt(0).toUpperCase() + phase.slice(1)}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Treasures chip */}
            {isMyTurn && !hideTreasures && (
              <button
                type="button"
                className={`chip text-xs ${mustCashIn ? 'ring-1 ring-yellow-400' : ''}`}
                title={mustCashIn ? 'You must trade a set' : 'View/trade treasures'}
                onClick={() => setShowTreasures(true)}
              >
                Treasures: {myHandCount}
              </button>
            )}
            {/* Primary actions by phase */}
            {phase === 'reinforcement' && (
              <>
                <div className="flex items-center gap-3">
                  <label className="text-xs whitespace-nowrap" htmlFor={reinforceId}>
                    Deploy {reinforce} {reinforce === 1 ? 'army' : 'armies'}
                  </label>
                  <input
                    className="w-32"
                    type="range"
                    min={1}
                    max={remaining > 0 ? remaining : 1}
                    id={reinforceId}
                    value={reinforce}
                    onChange={(e) =>
                      setReinforce(Math.max(1, Number.parseInt(e.target.value, 10) || 1))
                    }
                    disabled={!isMyTurn || !selected || remaining <= 0}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (selected) {
                      const amt = Math.max(1, Math.trunc(reinforce) || 1)
                      const toPlace = Math.min(amt, remaining || 0)
                      if (toPlace > 0)
                        void dispatch(deployArmies({ territoryId: selected, armies: toPlace }))
                    }
                  }}
                  disabled={!isMyTurn || !selected || remaining <= 0}
                  className="btn btn-success"
                  title={
                    selected
                      ? `Deploy ${reinforce} to ${selectedName}`
                      : 'Select a territory to deploy'
                  }
                >
                  Place
                </button>
                {endTurnBtn}
              </>
            )}

            {phase === 'attack' && (
              <>
                {canGoBackToReinforcement && (
                  <button
                    type="button"
                    onClick={() => void dispatch(goBackToReinforcement())}
                    disabled={!isMyTurn}
                    className="btn btn-secondary"
                    title="Return to reinforcement phase"
                  >
                    ← Reinforce
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (selected && target) {
                      lastTargetRef.current = target
                      void dispatch(
                        executeAttack({
                          fromTerritoryId: selected,
                          toTerritoryId: target,
                        }),
                      )
                    }
                  }}
                  disabled={!isMyTurn || !selected || !target || !validTargets.includes(target)}
                  className="btn btn-danger"
                  title={selected && target ? `Attack ${targetName}` : 'Select source and target'}
                >
                  Roll
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isMyTurn || !selected || !target || !validTargets.includes(target)) return
                    lastTargetRef.current = target
                    const next = !auto
                    void dispatch(setAutoAttacking(next))
                    if (next) {
                      void dispatch(
                        executeAttack({
                          fromTerritoryId: selected,
                          toTerritoryId: target,
                        }),
                      )
                    }
                  }}
                  className={`btn btn-secondary ${auto ? 'ring-1 ring-white' : ''}`}
                  title={auto ? 'Stop auto-attack' : 'Auto-attack until stop'}
                  disabled={!isMyTurn || !selected || !target || !validTargets.includes(target)}
                >
                  {auto ? 'Stop' : 'Auto'}
                </button>
                {!game.hasAttackedThisTurn && (
                  <button
                    type="button"
                    onClick={() => void dispatch(goBackToReinforcement())}
                    className="btn btn-secondary"
                    title="Return to reinforcement phase"
                  >
                    Reinforce Again
                  </button>
                )}
                {endTurnBtn}
              </>
            )}

            {phase === 'fortify' && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs" htmlFor={fortifyId}>
                    Move
                  </label>
                  <input
                    className="form-input w-16 text-center"
                    type="number"
                    min={1}
                    max={Math.max(1, (game.board.find((t) => t.id === selected)?.armies ?? 1) - 1)}
                    id={fortifyId}
                    value={fortify}
                    onChange={(e) =>
                      setFortify(Math.max(1, Number.parseInt(e.target.value, 10) || 1))
                    }
                    disabled={fortifyLimitReached || selectedHasMoved}
                  />
                </div>
                {/* Undo button - only show if there's history */}
                {isMyTurn && (game.fortifyHistory?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => void dispatch(undoFortify())}
                    className="btn btn-ghost"
                    title="Undo last fortify"
                  >
                    ↶ Undo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (selected && target) {
                      void dispatch(
                        executeFortify({
                          fromTerritoryId: selected,
                          toTerritoryId: target,
                          armies: fortify,
                        }),
                      )
                    }
                  }}
                  disabled={
                    !isMyTurn ||
                    !selected ||
                    !target ||
                    !validTargets.includes(target) ||
                    fortifyLimitReached ||
                    selectedHasMoved
                  }
                  className="btn btn-primary"
                  title={
                    selected && target ? `Fortify ${targetName}` : 'Select source and destination'
                  }
                >
                  Fortify
                </button>
                {(fortifyLimitReached || selectedHasMoved) && (
                  <span className="text-xs text-muted">
                    {fortifyLimitReached
                      ? 'Fortify limit reached for this phase. Use Undo to adjust.'
                      : `${selectedName} has already moved this phase.`}
                  </span>
                )}
                {endTurnBtn}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            {phase === 'reinforcement' && (
              <span className="chip text-xs" title="Troops remaining to place">
                Remaining: {remaining}
              </span>
            )}
            <InfoTooltip title="Tip: Press Z to undo your last placement during Reinforcement, or your last move during Fortify." />
            {!selected && (
              <span>
                {phase === 'reinforcement' && 'Select a territory to deploy'}
                {phase === 'attack' && 'Select a territory to attack from'}
                {phase === 'fortify' && 'Select a territory to move from'}
              </span>
            )}
            {selected && !target && phase === 'attack' && <span>Select a target territory</span>}
            {selected && !target && phase === 'fortify' && (
              <span>Select a destination territory</span>
            )}
            {(selected || target) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  dispatch(selectTerritory(null))
                  dispatch(selectTargetTerritory(null))
                  dispatch(setPendingAction(null))
                }}
              >
                Clear
              </button>
            )}
            {phase === 'attack' && selected && target && odds && (
              <span
                className="chip text-xs"
                title={`E[def] ${odds.expected.defenderLoss.toFixed(2)} | E[att] ${odds.expected.attackerLoss.toFixed(2)}`}
              >
                Advantage {odds.expected.advantage >= 0 ? '+' : ''}
                {odds.expected.advantage.toFixed(2)}
              </span>
            )}
            {(selected || target || pendingText()) && (
              <span className="chip text-xs">
                {selected ? `From: ${selectedName}` : '—'}
                {target ? ` → To: ${targetName}` : ''}
                {pendingText() ? ` • ${pendingText()}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>
      <TreasureTradeModal isOpen={showTreasures} onClose={() => setShowTreasures(false)} />
    </div>
  )
}
