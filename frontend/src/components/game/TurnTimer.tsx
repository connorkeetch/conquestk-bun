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

  if (!expiresAt) return null

  const total = Math.max(1, (game?.settings?.turnTimer ?? game?.gameConfig?.turnTimer ?? 60) * 1000)
  const ratio = Math.max(0, Math.min(1, (remainingMs ?? 0) / total))
  const seconds = Math.ceil((remainingMs ?? 0) / 1000)

  const color = ratio > 0.5 ? 'text-green-400' : ratio > 0.2 ? 'text-yellow-300' : 'text-red-400'
  const bar = ratio > 0.5 ? 'bg-green-500' : ratio > 0.2 ? 'bg-yellow-500' : 'bg-red-500'

  // Optional: time bank display if the backend provides it
  const bankSeconds = (() => {
    if (!room) return null
    const anyRoom = room as unknown as Record<string, unknown>
    const ms = Number(anyRoom.timeBankMs ?? anyRoom.timeBankRemainingMs ?? 0)
    if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms / 1000)
    const sec = Number(anyRoom.timeBankSecondsRemaining ?? anyRoom.timeBankSeconds ?? 0)
    if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec)
    return null
  })()

  return (
    <div className={`flex items-center gap-2 min-w-[140px] ${className}`} title="Turn timer">
      <div className="w-24 h-2 rounded bg-surface-2 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className={`text-xs tabular-nums ${color}`}>{seconds}s</div>
      {typeof bankSeconds === 'number' && bankSeconds > 0 && (
        <span className="chip text-[10px]" title="Time bank remaining">
          +{bankSeconds}s
        </span>
      )}
    </div>
  )
}
