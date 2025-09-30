import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchGameState } from '@/store/gameSlice'
import { setDesyncDetected, setResyncing } from '@/store/uiRoomSlice'

type Props = { roomId: string; allowSpectate?: boolean }

export function ResyncBanner({ roomId, allowSpectate }: Props) {
  const dispatch = useAppDispatch()
  const desync = useAppSelector((s) => s.uiRoom.desyncDetected)
  const resyncing = useAppSelector((s) => s.uiRoom.resyncing)

  const onResync = useCallback(async () => {
    if (!roomId) return
    dispatch(setResyncing(true))
    try {
      await dispatch(fetchGameState({ roomId, allowSpectate: allowSpectate === true }))
      dispatch(setDesyncDetected(false))
    } finally {
      dispatch(setResyncing(false))
    }
  }, [allowSpectate, dispatch, roomId])

  if (!desync) return null

  return (
    <div className="fixed top-10 inset-x-0 z-40">
      <div className="mx-auto max-w-7xl px-4 py-2">
        <div className="rounded bg-[color:color-mix(in srgb, var(--color-warning) 20%, transparent)] border border-[color:var(--color-warning)] text-[color:var(--color-warning)] px-3 py-2 text-sm flex items-center justify-between">
          <span>State out of sync. Refresh to recover.</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void onResync()}
            disabled={resyncing}
          >
            {resyncing ? 'Resyncing…' : 'Resync now'}
          </button>
        </div>
      </div>
    </div>
  )
}
