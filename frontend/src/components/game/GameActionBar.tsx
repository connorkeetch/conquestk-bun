import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { deployArmies, endTurn, executeAttack, executeFortify } from '@/store/gameActions'
import { selectTargetTerritory, selectTerritory, setPendingAction } from '@/store/gameSlice'
import { setAttackCommit, setDice } from '@/store/uiRoomSlice'
import { computeRollOdds } from '@/utils/odds'

/**
 * Delay between consecutive auto-attacks (in milliseconds)
 * Provides time for battle animation and user feedback
 */
const AUTO_ATTACK_DELAY_MS = 150

export function GameActionBar() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game.currentGame)
  const selected = useAppSelector((s) => s.game.selectedTerritory)
  const target = useAppSelector((s) => s.game.selectedTargetTerritory)
  const validTargets = useAppSelector((s) => s.game.validTargets)
  const dice = useAppSelector((s) => s.uiRoom.dice)
  const commit = useAppSelector((s) => s.uiRoom.attackCommit)
  const userId = useAppSelector((s) => s.auth.user?.id)
  const [reinforce, setReinforce] = useState(1)
  const [fortify, setFortify] = useState(1)
  const [auto, setAuto] = useState(false)
  const lastTargetRef = useRef<string | null>(null)
  const reinforceId = useId()
  const fortifyId = useId()

  const isMyTurn = Boolean(userId && game?.currentPlayer === userId)
  const phase = game?.phase ?? 'reinforcement'

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

  const odds = useMemo(() => {
    if (!game || !selected || !target) return null
    const src = game.board.find((t) => t.id === selected)
    const dst = game.board.find((t) => t.id === target)
    if (!src || !dst) return null
    const attDice = Math.max(1, Math.min(3, Math.min(dice, (src.armies ?? 0) - 1))) as 1 | 2 | 3
    const defDice = Math.max(1, Math.min(2, dst.armies > 1 ? 2 : 1)) as 1 | 2
    return computeRollOdds(attDice, defDice)
  }, [game, selected, target, dice])

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
      setAuto(false)
      return
    }
    const fromId =
      typeof battle.fromTerritory === 'string' ? battle.fromTerritory : battle.fromTerritory.id
    const toId = typeof battle.toTerritory === 'string' ? battle.toTerritory : battle.toTerritory.id
    if (fromId !== selected || toId !== target) return
    const src = game.board.find((t) => t.id === selected)
    if (!src) return
    if (battle.conquered || (src.armies ?? 0) <= 1) {
      setAuto(false)
      return
    }
    lastTargetRef.current = target
    const timeoutId = setTimeout(() => {
      if (!autoRef.current) return
      void dispatch(
        executeAttack({
          fromTerritoryId: selected,
          toTerritoryId: lastTargetRef.current || target,
          commitArmies: commit,
        }),
      )
    }, AUTO_ATTACK_DELAY_MS)

    return () => clearTimeout(timeoutId)
  }, [auto, battle, commit, dispatch, game, selected, target])

  if (!game) return null

  const endTurnBtn = (
    <button
      type="button"
      onClick={() => void dispatch(endTurn())}
      disabled={!isMyTurn}
      className="btn btn-primary"
      title={isMyTurn ? 'End your turn' : 'Wait for your turn'}
    >
      End Turn
    </button>
  )

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-7xl p-2">
      <div className="rounded-xl border border-border backdrop-blur supports-[backdrop-filter]:bg-surface-1/80 bg-surface-1/95 p-2 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="chip text-xs">{phase.charAt(0).toUpperCase() + phase.slice(1)}</span>
            {phase === 'attack' && (
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((n) => {
                  const srcTerritory = game.board.find((t) => t.id === selected)
                  const maxDice = srcTerritory
                    ? Math.min(3, Math.max(1, (srcTerritory.armies ?? 1) - 1))
                    : 0
                  const disabled = n > maxDice

                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => dispatch(setDice(n as 1 | 2 | 3))}
                      disabled={disabled}
                      className={`btn btn-ghost btn-sm ${dice === n ? 'ring-1 ring-white' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={disabled ? `Need ${n + 1} armies to roll ${n} dice` : undefined}
                    >
                      {n} die{n === 1 ? '' : 's'}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Primary actions by phase */}
            {phase === 'reinforcement' && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs" htmlFor={reinforceId}>
                    Armies
                  </label>
                  <input
                    className="form-input w-16 text-center"
                    type="number"
                    min={1}
                    max={game.reinforcementArmies ?? 99}
                    id={reinforceId}
                    value={reinforce}
                    onChange={(e) =>
                      setReinforce(Math.max(1, Number.parseInt(e.target.value, 10) || 1))
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (selected) {
                      void dispatch(deployArmies({ territoryId: selected, armies: reinforce }))
                    }
                  }}
                  disabled={!isMyTurn || !selected}
                  className="btn btn-success"
                  title={selected ? `Deploy to ${selectedName}` : 'Select a territory to deploy'}
                >
                  Place
                </button>
                {endTurnBtn}
              </>
            )}

            {phase === 'attack' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (selected && target) {
                      lastTargetRef.current = target
                      void dispatch(
                        executeAttack({
                          fromTerritoryId: selected,
                          toTerritoryId: target,
                          commitArmies: commit,
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
                    setAuto((v) => !v)
                    if (!auto) {
                      void dispatch(
                        executeAttack({
                          fromTerritoryId: selected,
                          toTerritoryId: target,
                          commitArmies: commit,
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
                  />
                </div>
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
                  disabled={!isMyTurn || !selected || !target || !validTargets.includes(target)}
                  className="btn btn-primary"
                  title={
                    selected && target ? `Fortify ${targetName}` : 'Select source and destination'
                  }
                >
                  Fortify
                </button>
                {endTurnBtn}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            {!selected && <span>Select a territory to begin</span>}
            {selected && !target && phase !== 'reinforcement' && (
              <span>Select a target territory</span>
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
          {phase === 'attack' && (
            <div className="flex items-center gap-3 text-xs text-muted w-full mt-1">
              <div>Commit on conquer:</div>
              <input
                type="number"
                min={1}
                max={Math.max(1, (game.board.find((t) => t.id === selected)?.armies ?? 1) - 1)}
                value={commit}
                onChange={(e) =>
                  dispatch(setAttackCommit(Math.max(1, Number.parseInt(e.target.value, 10) || 1)))
                }
                className="form-input w-16 text-center"
                title="Armies to move into conquered territory"
              />
              <div className="text-xs">Select a valid target to roll</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
