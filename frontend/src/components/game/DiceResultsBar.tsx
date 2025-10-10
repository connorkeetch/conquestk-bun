import { Info } from 'lucide-react'
import { useMemo } from 'react'
import { getColorValue, getPremiumColorMeta, isPureWhiteColor } from '@/constants/colors'
import { useAppSelector } from '@/hooks/redux'

type DiceProps = {
  value: number
  color: string
  glow: boolean
  effect?: string
  pureWhite?: boolean
}

function Dice({ value, color, glow, effect, pureWhite }: DiceProps) {
  const premiumEffectClass = effect ? ` premium-effect premium-effect-${effect}` : ''
  return (
    <div
      className={`w-8 h-8 rounded-md border border-[color:var(--panel-border)] font-bold text-sm flex items-center justify-center shadow-sm${premiumEffectClass}`}
      style={{
        // Use background so gradients (premium colors) render correctly
        background: color,
        color: pureWhite ? '#111827' : '#FFFFFF',
        textShadow: pureWhite
          ? '0 1px 1px rgba(255,255,255,0.65)'
          : '0 1px 1px rgba(0,0,0,0.75)',
        boxShadow: glow ? '0 0 0 2px #fde047, 0 0 12px #fde047' : undefined,
      }}
    >
      <span className="relative z-10">{value}</span>
    </div>
  )
}

export function DiceResultsBar() {
  const history = useAppSelector((s) => s.uiRoom.battleHistory ?? [])
  const game = useAppSelector((s) => s.game.currentGame)
  const phase = game?.phase
  const remainingReinforcements = useAppSelector((s) => s.game.reinforcementArmies)
  const placementServerSpent = useAppSelector((s) => s.uiRoom.placementServerSpent ?? 0)
  const placementHistory = useAppSelector((s) => s.uiRoom.placementHistory ?? [])
  const userId = useAppSelector((s) => s.auth.user?.id)
  const isMyTurn = Boolean(userId && game?.currentPlayer === userId)

  const last = history.length > 0 ? history[history.length - 1] : null
  const neutralGrey = 'var(--color-gray-500)'

  const { attacker, defender } = useMemo(() => {
    if (!game || !last) {
      return {
        attacker: { color: neutralGrey, effect: undefined, pureWhite: false },
        defender: { color: neutralGrey, effect: undefined, pureWhite: false },
      }
    }

    // Prefer stable ids captured at roll time so colors don't flip post-conquest
    const attackerId = (() => {
      if (last.attackerId) return last.attackerId
      const t = game.board?.find((tt: { id: string; ownerId?: string | null }) => tt.id === last.fromId)
      return t?.ownerId ?? game.currentPlayer ?? null
    })()

    const defenderId = (() => {
      if (last.defenderId) return last.defenderId
      const t = game.board?.find((tt: { id: string; ownerId?: string | null }) => tt.id === last.toId)
      const owner = t?.ownerId ?? null
      // If owner matches attacker (e.g., after conquest or hidden defender), avoid attacker color
      if (owner && owner === attackerId) return null
      return owner
    })()

    const aPlayer = attackerId
      ? game.players.find((p: { id: string; color: string }) => p.id === attackerId)
      : undefined
    const dPlayer = defenderId
      ? game.players.find((p: { id: string; color: string }) => p.id === defenderId)
      : undefined

    const aColor = aPlayer ? getColorValue(aPlayer.color) : neutralGrey
    const dColor = dPlayer ? getColorValue(dPlayer.color) : neutralGrey
    const aMeta = aPlayer ? getPremiumColorMeta(aPlayer.color) : undefined
    const dMeta = dPlayer ? getPremiumColorMeta(dPlayer.color) : undefined

    return {
      attacker: {
        color: aColor,
        effect: aMeta?.effect,
        pureWhite: isPureWhiteColor(aPlayer?.color ?? aColor),
      },
      defender: {
        color: dColor,
        effect: dMeta?.effect,
        pureWhite: isPureWhiteColor(dPlayer?.color ?? dColor),
      },
    }
  }, [game, last])

  // Reinforcement phase: show deployed/total summary for the active player only
  if (phase === 'reinforcement') {
    // Prefer server-reconciled spent; fallback to client placement history within this session
    const spentFromHistory = placementHistory.reduce(
      (sum: number, p: { armies?: number }) => sum + Math.max(0, p.armies || 0),
      0,
    )
    const spent = placementServerSpent > 0 ? placementServerSpent : spentFromHistory
    const remaining = Math.max(0, Math.trunc(remainingReinforcements || 0))
    const total = Math.max(0, spent + remaining)

    // Only show for active player
    if (!isMyTurn) return null

    return (
      <div className="mt-2 bg-[color:var(--surface-1)] border border-[color:var(--panel-border)] rounded p-2">
        <div className="flex items-center justify-center gap-3 lg:gap-6 xl:gap-8 text-xs text-muted flex-wrap">
          <div className="flex items-center gap-2">
            <span className="uppercase tracking-wide text-[10px]">Reinforcements</span>
            <span className="font-semibold text-[color:var(--heading)]">
              {spent}/{total}
            </span>
            <span className="text-[10px]">Remaining {remaining}</span>
            <span
              className="inline-flex items-center cursor-help text-muted"
              title="Deployed/Total. Deployed = armies placed this phase. Total = deployed + remaining. Remaining = armies left to place."
            >
              <Info className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
              <span className="sr-only">
                Reinforcement info: Deployed over Total. Deployed equals armies placed this phase.
                Total equals deployed plus remaining. Remaining equals armies left to place this
                phase.
              </span>
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Fortify phase: show move count and limit semantics for the active player
  if (phase === 'fortify') {
    if (!isMyTurn || !game) return null
    const movementType =
      (game.gameConfig as { movementType?: string } | null)?.movementType ?? 'classic_adjacent'
    const movedCount = Object.keys(game.movementTracking ?? {}).length

    const limitLabel = (() => {
      switch (movementType) {
        case 'classic_adjacent':
          return 'Limit: 1 move this phase'
        case 'path_single':
          return 'Limit: 1 move (any connected)'
        case 'adjacent_multi':
          return 'Limit: 1 move per territory'
        case 'path_multi':
          return 'Limit: 1 move per territory (any connected)'
        default:
          return 'Fortify rules active'
      }
    })()

    const reachedLimit =
      (movementType === 'classic_adjacent' || movementType === 'path_single') && movedCount >= 1

    return (
      <div className="mt-2 bg-[color:var(--surface-1)] border border-[color:var(--panel-border)] rounded p-2">
        <div className="flex items-center justify-center gap-3 lg:gap-6 xl:gap-8 text-xs text-muted flex-wrap">
          <div className="flex items-center gap-2">
            <span className="uppercase tracking-wide text-[10px]">Fortifications</span>
            <span className="font-semibold text-[color:var(--heading)]">{movedCount}</span>
            <span
              className={`text-[10px] ${reachedLimit ? 'text-[color:var(--color-danger)]' : ''}`}
            >
              {reachedLimit ? 'Limit reached' : limitLabel}
            </span>
            <span className="inline-flex items-center cursor-help text-muted" title={limitLabel}>
              <Info className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
              <span className="sr-only">{limitLabel}</span>
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Hide dice recap outside of the Attack phase or if no battle yet
  if (!last || phase !== 'attack') return null

  const att = [...(last.attackerDice ?? [])].sort((a, b) => b - a)
  const def = [...(last.defenderDice ?? [])].sort((a, b) => b - a)

  const pairs = Array.from({ length: Math.min(att.length, def.length) }).map((_, i) => {
    const a = att[i] ?? 0
    const d = def[i] ?? 0
    const winner: 'A' | 'D' = a > d ? 'A' : 'D'
    return { a, d, winner }
  })

  return (
    <div className="mt-2 bg-[color:var(--surface-1)] border border-[color:var(--panel-border)] rounded p-2">
      <div className="flex items-center justify-center gap-3 lg:gap-6 xl:gap-8 text-xs text-muted flex-wrap">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wide text-[10px]">Attacker</span>
          <div className="flex gap-1">
            {att.map((v, i) => (
              <Dice
                key={`a${i}-${v}`}
                value={v}
                color={attacker.color}
                glow={pairs[i]?.winner === 'A'}
                {...(attacker.effect ? { effect: attacker.effect } : {})}
                pureWhite={attacker.pureWhite}
              />
            ))}
          </div>
          <span className="text-[10px]">−{last.attackerLosses}</span>
        </div>
        <div className="text-[10px] font-semibold px-2">
          {last.conquered ? 'Conquered' : 'Defended'}
        </div>
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wide text-[10px]">Defender</span>
          <div className="flex gap-1">
            {def.map((v, i) => (
              <Dice
                key={`d${i}-${v}`}
                value={v}
                color={defender.color}
                glow={pairs[i]?.winner === 'D'}
                {...(defender.effect ? { effect: defender.effect } : {})}
                pureWhite={defender.pureWhite}
              />
            ))}
          </div>
          <span className="text-[10px]">−{last.defenderLosses}</span>
        </div>
      </div>
    </div>
  )
}

export default DiceResultsBar
