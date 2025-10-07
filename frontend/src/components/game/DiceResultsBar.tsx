import { useMemo } from 'react'
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
        // Use background so gradients (premium colors) render correctly
        background: color,
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
  const phase = game?.phase

  const last = history.length > 0 ? history[history.length - 1] : null
  const neutralGrey = 'var(--color-gray-500)'

  const { attackerColor, defenderColor } = useMemo(() => {
    if (!game || !last) {
      return { attackerColor: neutralGrey, defenderColor: neutralGrey }
    }

    // Prefer stable ids captured at roll time so colors don't flip post-conquest
    const attackerId = (() => {
      if (last.attackerId) return last.attackerId
      const t = game.board?.find((tt) => tt.id === last.fromId)
      return t?.ownerId ?? game.currentPlayer ?? null
    })()

    const defenderId = (() => {
      if (last.defenderId) return last.defenderId
      const t = game.board?.find((tt) => tt.id === last.toId)
      const owner = t?.ownerId ?? null
      // If owner matches attacker (e.g., after conquest or hidden defender), avoid attacker color
      if (owner && owner === attackerId) return null
      return owner
    })()

    const aPlayer = attackerId ? game.players.find((p) => p.id === attackerId) : undefined
    const dPlayer = defenderId ? game.players.find((p) => p.id === defenderId) : undefined

    const aColor = aPlayer ? getColorValue(aPlayer.color) : neutralGrey
    const dColor = dPlayer ? getColorValue(dPlayer.color) : neutralGrey

    return { attackerColor: aColor, defenderColor: dColor }
  }, [game, last])

  // Hide dice recap outside of the Attack phase
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
                color={attackerColor}
                glow={pairs[i]?.winner === 'A'}
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
