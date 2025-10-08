import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppSelector } from '@/hooks/redux'
import audioService from '@/services/audioService'

type Props = {
  className?: string
  showBank?: boolean
}

export function TurnTimer({ className = '', showBank = true }: Props) {
  const room = useAppSelector((s) => s.room.currentRoom)
  const game = useAppSelector((s) => s.game.currentGame)
  const userId = useAppSelector((s) => s.auth.user?.id)
  const [now, setNow] = useState<number>(() => Date.now())
  const warnedRef = useRef(false)
  const isPaused = useAppSelector((s) => s.room.currentRoom?.status === 'paused')
  const isFinished = game?.phase === 'finished' || room?.status === 'completed'

  const isCurrentTurn = Boolean(userId && game?.currentPlayer === userId)
  const usingTimeBank = room?.usingTimeBank === true

  const expiresAt = useMemo(() => {
    if (!room?.turnExpiresAt) return null
    const ms = Date.parse(room.turnExpiresAt)
    return Number.isFinite(ms) ? ms : null
  }, [room?.turnExpiresAt])

  const remainingMs = useMemo(() => {
    if (!expiresAt) return null
    return Math.max(0, expiresAt - now)
  }, [expiresAt, now])

  useEffect(() => {
    if (!expiresAt || isPaused || isFinished) return
    warnedRef.current = false
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [expiresAt, isPaused, isFinished])

  useEffect(() => {
    if (!remainingMs || isFinished) return
    if (isCurrentTurn && remainingMs <= 10_000 && !warnedRef.current) {
      warnedRef.current = true
      audioService.playEffect('timer')
    }
  }, [isCurrentTurn, remainingMs, isFinished])

  const total = Math.max(1, (game?.settings?.turnTimer ?? game?.gameConfig?.turnTimer ?? 60) * 1000)
  const ratioBase = Math.max(0, Math.min(1, (remainingMs ?? 0) / total))
  const ratio = usingTimeBank ? 0 : ratioBase
  const totalSeconds = Math.ceil((remainingMs ?? 0) / 1000)

  // Worded time format: e.g., "1h 02m 03s", "2m 05s", "45s"
  const formatWorded = (secs: number) => {
    const s = Math.max(0, Math.trunc(secs))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const r = s % 60
    const parts: string[] = []
    if (h > 0) parts.push(`${h}h`)
    if (m > 0) parts.push(`${m}m`)
    if (r > 0 || parts.length === 0) parts.push(`${r}s`)
    return parts.join(' ')
  }

  const color = isPaused
    ? 'text-amber-300'
    : ratio > 0.5
      ? 'text-green-400'
      : ratio > 0.2
        ? 'text-yellow-300'
        : 'text-red-400'

  const availableBankSeconds =
    typeof room?.timeBankSecondsRemaining === 'number'
      ? Math.max(0, Math.trunc(room.timeBankSecondsRemaining))
      : null

  const activeBankSeconds =
    usingTimeBank && expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null

  const displaySeconds =
    usingTimeBank && typeof activeBankSeconds === 'number' ? activeBankSeconds : totalSeconds
  const timerClass = usingTimeBank
    ? 'text-xs tabular-nums text-red-400 font-semibold animate-pulse'
    : `text-xs tabular-nums ${color}`

  // After hooks are defined, early-return if no timer expiry provided
  if (isFinished) {
    // Game complete: stop and replace the ticking timer with a static label
    return (
      <div className={`text-xs text-green-300 ${className}`} title="Game complete">
        Completed
      </div>
    )
  }

  if (!expiresAt) return null

  return (
    <div className={`flex items-center gap-2 min-w-[80px] ${className}`} title="Turn timer">
      {/* Display only time text (no progress bar) */}
      {isPaused ? (
        <div className={`text-xs ${color}`}>Paused</div>
      ) : (
        <>
          <div className={timerClass}>
            {usingTimeBank ? `Bank ${formatWorded(displaySeconds)}` : formatWorded(displaySeconds)}
          </div>
          {showBank &&
            !usingTimeBank &&
            typeof availableBankSeconds === 'number' &&
            availableBankSeconds > 0 && (
              <span className="chip text-[10px]" title="Time bank remaining">
                +{formatWorded(availableBankSeconds)}
              </span>
            )}
          {showBank && usingTimeBank && (
            <span
              className="chip text-[10px] text-red-200 bg-red-500/20 animate-pulse"
              title="Time bank active"
            >
              Time bank
            </span>
          )}
        </>
      )}
    </div>
  )
}
