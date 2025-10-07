import { useEffect, useMemo, useRef, useState } from 'react'
import { getColorValue } from '@/constants/colors'
import { useAppSelector } from '@/hooks/redux'
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
  const room = useAppSelector((s) => s.room.currentRoom)

  // Only consider active gameplay phases (exclude lobby/initializing/finished)
  const phase = game?.phase as string | undefined
  const isActivePhase = phase === 'reinforcement' || phase === 'attack' || phase === 'fortify'
  const isRoomActive = room?.status === 'active'
  const isMyTurn = Boolean(
    userId && isRoomActive && isActivePhase && game?.currentPlayer === userId,
  )
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const seenTurnRef = useRef<number | null>(null)
  const closingRef = useRef(false)
  closingRef.current = closing
  const activeKey = useMemo(() => {
    const rid = game?.roomId ?? null
    return rid && userId ? `ui.turnModal.active:${rid}:${userId}` : null
  }, [game?.roomId, userId])

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
    const roomId = game?.roomId ?? null
    if (currentTurn === null || !roomId || !userId) return

    const storageKey = `ui.turnModal.seen:${roomId}:${userId}`
    let seenForTurn: number | null = null
    try {
      const raw = localStorage.getItem(storageKey)
      const n = raw ? Number.parseInt(raw, 10) : NaN
      seenForTurn = Number.isFinite(n) ? n : null
    } catch {
      // ignore storage errors
    }

    const alreadySeen = seenForTurn === currentTurn
    if (!alreadySeen && seenTurnRef.current !== currentTurn) {
      seenTurnRef.current = currentTurn
      setVisible(true)
      // Mark as seen immediately to avoid popping again on refresh
      try {
        localStorage.setItem(storageKey, String(currentTurn))
      } catch {
        // ignore storage errors
      }
    }
  }, [isMyTurn, game?.turn, game?.roomId, userId])

  // Broadcast active flag for gating other modals (e.g., treasure trade)
  useEffect(() => {
    if (!activeKey) return
    if (visible) {
      try {
        sessionStorage.setItem(activeKey, '1')
      } catch {
        /* no-op */
      }
      try {
        window.dispatchEvent(new CustomEvent('turn-intro-active', { detail: { active: true } }))
      } catch {
        /* no-op */
      }
    } else if (!closingRef.current) {
      // If closed due to state change (not user fade-out), deactivate immediately
      try {
        sessionStorage.removeItem(activeKey)
      } catch {
        /* no-op */
      }
      try {
        window.dispatchEvent(new CustomEvent('turn-intro-active', { detail: { active: false } }))
      } catch {
        /* no-op */
      }
    }
    return () => {
      try {
        sessionStorage.removeItem(activeKey)
      } catch {
        /* no-op */
      }
    }
  }, [activeKey, visible])

  const handleClose = () => {
    const currentTurn = game?.turn ?? null
    const roomId = game?.roomId ?? null
    if (currentTurn !== null && roomId && userId) {
      try {
        localStorage.setItem(`ui.turnModal.seen:${roomId}:${userId}`, String(currentTurn))
      } catch {
        // ignore
      }
    }
    setClosing(true)
    window.setTimeout(() => {
      // After fade-out, deactivate and hide
      try {
        if (activeKey) sessionStorage.removeItem(activeKey)
      } catch {
        /* no-op */
      }
      try {
        window.dispatchEvent(new CustomEvent('turn-intro-active', { detail: { active: false } }))
      } catch {
        /* no-op */
      }
      setVisible(false)
      setClosing(false)
    }, 180)
  }

  if (!visible || !isMyTurn) return null

  const phaseLabel = game?.phase ? game.phase.charAt(0).toUpperCase() + game.phase.slice(1) : 'Turn'

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label="Your turn"
    >
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${closing ? 'opacity-0' : 'opacity-100'}`}
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
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              Later
            </button>
            <button type="button" className="btn btn-primary" onClick={handleClose}>
              Begin Turn
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
