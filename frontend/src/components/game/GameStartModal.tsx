import { useEffect, useMemo, useRef, useState } from 'react'
import { getColorValue } from '@/constants/colors'
import { useAppSelector } from '@/hooks/redux'
import { extractFirstHexColor, isGradientValue, pickTextOnColor } from '@/utils/color'

type Props = {
  className?: string
}

/**
 * Lightweight popup shown once to all players when a lobby transitions to Active.
 * Mirrors the visual style of YourTurnModal but with a simple acknowledge action.
 */
export function GameStartModal({ className = '' }: Props) {
  const userId = useAppSelector((s) => s.auth.user?.id)
  const room = useAppSelector((s) => s.room.currentRoom)
  const game = useAppSelector((s) => s.game.currentGame)

  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const prevStatusRef = useRef<string | null>(null)

  // Prefer the local player's configured color for header styling when available
  const myColor = useMemo(() => {
    if (!userId || !game) return '#2563EB' // blue as a neutral default
    const me = game.players.find((p) => (p.userId ?? p.id) === userId)
    const val = me ? getColorValue(me.color) : '#2563EB'
    const hex = isGradientValue(val) ? (extractFirstHexColor(val) ?? '#2563EB') : val
    return hex
  }, [game, userId])

  const text = pickTextOnColor(myColor)

  // Show when we observe a transition from lobby/initializing -> active for this room
  useEffect(() => {
    const current = room?.status ?? null
    const prev = prevStatusRef.current
    prevStatusRef.current = current

    if (!userId || !room?.id) {
      setVisible(false)
      return
    }

    // Only trigger on a fresh transition into active
    const becameActive = (prev === 'lobby' || prev === 'initializing') && current === 'active'
    if (!becameActive) return

    const storageKey = `ui.gameStart.seen:${room.id}:${userId}`
    try {
      const seen = localStorage.getItem(storageKey) === '1'
      if (!seen) {
        // Mark as seen immediately to avoid duplication on refreshes
        localStorage.setItem(storageKey, '1')
        setVisible(true)
      }
    } catch {
      setVisible(true)
    }
  }, [room?.status, room?.id, userId])

  // Avoid stacking with the YourTurn modal for the opening player
  const isOpeningPlayerTurn = useMemo(() => {
    if (!userId || !game) return false
    const isActive = room?.status === 'active'
    const myTurn = game.currentPlayer === userId
    const phase = game.phase
    const isGameplayPhase = phase === 'reinforcement' || phase === 'attack' || phase === 'fortify'
    return Boolean(isActive && isGameplayPhase && myTurn)
  }, [game, room?.status, userId])

  const handleClose = () => {
    setClosing(true)
    window.setTimeout(() => {
      setVisible(false)
      setClosing(false)
    }, 180)
  }

  if (!visible || isOpeningPlayerTurn) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label="Game started"
    >
      <div
        className={`absolute inset-0 bg-[color:color-mix(in_srgb,var(--surface-1)_8%,black)] backdrop-blur-sm transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${closing ? 'opacity-0' : 'opacity-100'}`}
      />
      <div
        className={`relative w-[min(92vw,520px)] rounded-xl overflow-hidden shadow-2xl border transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${closing ? 'opacity-0 translate-y-1 scale-95' : 'opacity-100 translate-y-0 scale-100'}`}
        style={{ borderColor: myColor }}
      >
        <div
          className="px-5 py-4"
          style={{
            background: `color-mix(in srgb, ${myColor} 28%, var(--surface-1))`,
            color: text,
          }}
        >
          <div className="text-sm opacity-90">Game update</div>
          <div className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <span>The game has started</span>
          </div>
        </div>
        <div className="bg-[color:var(--surface-1)] px-5 py-4">
          <div className="text-sm text-[color:var(--muted)] mb-3">
            All players are in. Good luck and have fun!
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button type="button" className="btn btn-primary" onClick={handleClose}>
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
