import { useEffect, useMemo, useRef, useState } from 'react'
import { getColorValue } from '@/constants/colors'
import { useAppSelector } from '@/hooks/redux'
import audioService from '@/services/audioService'
import { extractFirstHexColor, isGradientValue, pickTextOnColor } from '@/utils/color'
import { TurnTimer } from './TurnTimer'

type Props = {
  className?: string
}

/**
 * A lightweight modal that pops once at the start of your turn.
 * It dims the screen and invites you to begin your move.
 */
export function YourTurnModal({ className = '' }: Props) {
  const userId = useAppSelector((s) => s.auth.user?.id)
  const game = useAppSelector((s) => s.game.currentGame)
  // Room currently unused; keep logic self-contained

  const isMyTurn = Boolean(userId && game?.currentPlayer === userId && game?.phase !== 'finished')
  const [visible, setVisible] = useState(false)
  const seenTurnRef = useRef<number | null>(null)

  const myColor = useMemo(() => {
    if (!userId || !game) return '#DC2626'
    const me = game.players.find((p) => (p.userId ?? p.id) === userId)
    const val = me ? getColorValue(me.color) : '#DC2626'
    const hex = isGradientValue(val) ? (extractFirstHexColor(val) ?? '#DC2626') : val
    return hex
  }, [game, userId])

  const text = pickTextOnColor(myColor)

  useEffect(() => {
    if (!isMyTurn) {
      setVisible(false)
      return
    }
    const currentTurn = game?.turn ?? null
    if (currentTurn !== null && seenTurnRef.current !== currentTurn) {
      seenTurnRef.current = currentTurn
      setVisible(true)
      // Play a soft chime if not already handled by socket handler
      try {
        audioService.playEffect('turn')
      } catch {
        // ignore
      }
    }
  }, [isMyTurn, game?.turn])

  if (!visible || !isMyTurn) return null

  const phaseLabel = game?.phase ? game.phase.charAt(0).toUpperCase() + game.phase.slice(1) : 'Turn'

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label="Your turn"
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-[min(92vw,520px)] rounded-xl overflow-hidden shadow-2xl border"
        style={{ borderColor: myColor }}
      >
        <div
          className="px-5 py-4"
          style={{
            background: `color-mix(in srgb, ${myColor} 28%, var(--surface-1))`,
            color: text,
          }}
        >
          <div className="text-sm opacity-90">It’s your turn</div>
          <div className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <span>Begin {phaseLabel}</span>
          </div>
        </div>
        <div className="bg-[color:var(--surface-1)] px-5 py-4">
          <div className="text-sm text-[color:var(--muted)] mb-3">
            Make your move before the timer runs out.
          </div>
          <div className="flex items-center justify-between gap-3">
            <TurnTimer showBank={true} />
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setVisible(false)}>
              Later
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setVisible(false)}>
              Begin Turn
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
