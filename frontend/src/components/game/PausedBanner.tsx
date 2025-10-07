import { useAppSelector } from '@/hooks/redux'

export function PausedBanner() {
  const room = useAppSelector((s) => s.room.currentRoom)
  const isPaused = room?.status === 'paused'

  if (!isPaused) return null

  const msg =
    (room as { statusMessage?: string | null } | null)?.statusMessage ||
    'Game paused by admin. Timers are stopped.'

  return (
    <div className="fixed top-10 inset-x-0 z-40" role="alert" aria-live="assertive">
      <div className="mx-auto max-w-7xl px-4 py-2">
        <div className="rounded bg-[color:color-mix(in srgb, var(--color-warning) 20%, transparent)] border border-[color:var(--color-warning)] text-[color:var(--color-warning)] px-3 py-2 text-sm">
          {msg}
        </div>
      </div>
    </div>
  )
}
