import { useCallback, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchGameState } from '@/store/gameSlice'
import { setDesyncDetected, setResyncing } from '@/store/uiRoomSlice'
import { logger } from '@/utils/logger'

type Props = { roomId: string; allowSpectate?: boolean }

export function ResyncBanner({ roomId, allowSpectate }: Props) {
  const dispatch = useAppDispatch()
  const desync = useAppSelector((s) => s.uiRoom.desyncDetected)
  const resyncing = useAppSelector((s) => s.uiRoom.resyncing)
  const [error, setError] = useState<string | null>(null)

  const onResync = useCallback(async () => {
    if (!roomId) return
    dispatch(setResyncing(true))
    setError(null)
    try {
      const result = await dispatch(
        fetchGameState({ roomId, allowSpectate: allowSpectate === true }),
      )
      if (fetchGameState.fulfilled.match(result)) {
        dispatch(setDesyncDetected(false))
      } else {
        // Keep desync banner visible and show error to user
        const errorMsg = result.error?.message || 'Failed to resync'
        setError(errorMsg)
        logger.error('Resync failed:', result.error)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to resync'
      setError(errorMsg)
      logger.error('Resync error:', err)
    } finally {
      dispatch(setResyncing(false))
    }
  }, [allowSpectate, dispatch, roomId])

  if (!desync) return null

  return (
    <div className="fixed top-10 inset-x-0 z-40" role="alert" aria-live="assertive">
      <div className="mx-auto max-w-7xl px-4 py-2">
        <div className="rounded bg-[color:color-mix(in srgb, var(--color-warning) 20%, transparent)] border border-[color:var(--color-warning)] text-[color:var(--color-warning)] px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
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
          {error && (
            <div className="mt-2 text-xs opacity-80">
              Error: {error}. Try again or reload the page.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
