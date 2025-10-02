import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppSelector } from '@/hooks/redux'
import audioService from '@/services/audioService'

type Props = {
  className?: string
}

export function TurnTimer({ className = '' }: Props) {
  const room = useAppSelector((s) => s.room.currentRoom)
  const game = useAppSelector((s) => s.game.currentGame)
  const userId = useAppSelector((s) => s.auth.user?.id)
  const [now, setNow] = useState<number>(() => Date.now())
  const warnedRef = useRef(false)

  const isCurrentTurn = Boolean(userId && game?.currentPlayer === userId)

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
    if (!expiresAt) return
    warnedRef.current = false
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [expiresAt])

  useEffect(() => {
    if (!remainingMs) return
    if (isCurrentTurn && remainingMs <= 10_000 && !warnedRef.current) {
      warnedRef.current = true
      audioService.playEffect('timer')
    }
  }, [isCurrentTurn, remainingMs])

  const total = Math.max(1, (game?.settings?.turnTimer ?? game?.gameConfig?.turnTimer ?? 60) * 1000)
  const ratio = Math.max(0, Math.min(1, (remainingMs ?? 0) / total))
  const seconds = Math.ceil((remainingMs ?? 0) / 1000)

  const color = ratio > 0.5 ? 'text-green-400' : ratio > 0.2 ? 'text-yellow-300' : 'text-red-400'
  const bar = ratio > 0.5 ? 'bg-green-500' : ratio > 0.2 ? 'bg-yellow-500' : 'bg-red-500'

  // Optional: time bank display if the backend provides it
  const bankSeconds =
    typeof room?.timeBankSecondsRemaining === 'number'
      ? Math.max(0, Math.trunc(room.timeBankSecondsRemaining))
      : null

  // Local approximation: when it's my turn and the main timer is exhausted, show
  // a locally ticking time bank based on how long we've been in overtime.
  const effectiveBankSeconds = useMemo(() => {
    if (typeof bankSeconds !== 'number') return null
    if (!isCurrentTurn) return bankSeconds
    if (!expiresAt) return bankSeconds
    const overMs = now - expiresAt
    if (overMs <= 0) return bankSeconds
    const consumed = Math.floor(overMs / 1000)
    return Math.max(0, bankSeconds - consumed)
  }, [bankSeconds, isCurrentTurn, expiresAt, now])

  // After hooks are defined, early-return if no timer expiry provided
  if (!expiresAt) return null

  return (
    <div className={`flex items-center gap-2 min-w-[140px] ${className}`} title="Turn timer">
      <div className="w-24 h-2 rounded bg-surface-2 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className={`text-xs tabular-nums ${color}`}>{seconds}s</div>
      {typeof effectiveBankSeconds === 'number' && effectiveBankSeconds > 0 && (
        <span className="chip text-[10px]" title="Time bank remaining">
          +{effectiveBankSeconds}s
        </span>
      )}
    </div>
  )
}
