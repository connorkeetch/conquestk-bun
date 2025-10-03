import { getColorValue } from '@/constants/colors'
import { useAppSelector } from '@/hooks/redux'

type DiceProps = {
  value: number
  color: string
  glow: boolean
}

function Dice({ value, color, glow }: DiceProps) {
  return (
    <div
      className="w-8 h-8 rounded-md border border-[color:var(--panel-border)] text-white font-bold text-sm flex items-center justify-center shadow-sm"
      style={{
        backgroundColor: color,
        boxShadow: glow ? '0 0 0 2px #fde047, 0 0 12px #fde047' : undefined,
      }}
    >
      {value}
    </div>
  )
}

export function DiceResultsBar() {
  const history = useAppSelector((s) => s.uiRoom.battleHistory ?? [])
  const game = useAppSelector((s) => s.game.currentGame)

  const last = history.length > 0 ? history[history.length - 1] : null
  if (!last) return null

  const attackerColor = (() => {
    if (!game) return '#ef4444'
    const pid = last.attackerId ?? game.currentPlayer
    const player = game.players.find((p) => p.id === pid)
    return getColorValue(player?.color || '#ef4444')
  })()

  const defenderColor = (() => {
    if (!game) return '#3b82f6'
    const pid = last.defenderId ?? null
    const player = pid ? game.players.find((p) => p.id === pid) : undefined
    return getColorValue(player?.color || '#3b82f6')
  })()

  const att = [...last.attackerDice].sort((a, b) => b - a)
  const def = [...last.defenderDice].sort((a, b) => b - a)

  const pairs = Array.from({ length: Math.min(att.length, def.length) }).map((_, i) => {
    const a = att[i] ?? 0
    const d = def[i] ?? 0
    const winner: 'A' | 'D' = a > d ? 'A' : 'D'
    return { a, d, winner }
  })

  return (
    <div className="mt-2 bg-[color:var(--surface-1)] border border-[color:var(--panel-border)] rounded p-2">
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wide text-[10px]">Attacker</span>
          <div className="flex gap-1">
            {att.map((v, i) => (
              <Dice
                key={`a${i}-${v}`}
                value={v}
                color={attackerColor}
                glow={pairs[i]?.winner === 'A'}
              />
            ))}
          </div>
          <span className="text-[10px]">−{last.attackerLosses}</span>
        </div>
        <div className="text-[10px]">{last.conquered ? 'Conquered' : 'Defended'}</div>
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wide text-[10px]">Defender</span>
          <div className="flex gap-1">
            {def.map((v, i) => (
              <Dice
                key={`d${i}-${v}`}
                value={v}
                color={defenderColor}
                glow={pairs[i]?.winner === 'D'}
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
