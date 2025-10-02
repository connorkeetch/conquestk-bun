import { useId, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { hideConquestOverlay, setAttackCommit } from '@/store/uiRoomSlice'
import type { TerritoryDisplayMap } from './territoryDisplay'

type Props = {
  territories: TerritoryDisplayMap
  mapWidth: number
  mapHeight: number
}

export function ConquestTransferOverlay({ territories, mapWidth, mapHeight }: Props) {
  const overlay = useAppSelector((s) => s.uiRoom.conquestOverlay)
  const commitDefault = useAppSelector((s) => s.uiRoom.attackCommit)
  const dispatch = useAppDispatch()
  const [value, setValue] = useState(commitDefault)
  const sliderId = useId()

  const pos = useMemo(() => {
    if (!overlay) return null
    const from = territories[overlay.fromId]
    const to = territories[overlay.toId]
    if (!from || !to) return null
    const mx = (from.armyPosition.x + to.armyPosition.x) / 2
    const my = (from.armyPosition.y + to.armyPosition.y) / 2
    const left = (mx / mapWidth) * 100
    const top = (my / mapHeight) * 100
    const max = Math.max(1, (from.armies ?? 1) - 1)
    return { left, top, max }
  }, [overlay, territories, mapWidth, mapHeight])

  if (!overlay || !pos) return null

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: `${pos.left}%`, top: `${pos.top}%`, transform: 'translate(-50%, -50%)' }}
    >
      <div className="pointer-events-auto panel-outline bg-surface-1/90 p-2 rounded shadow-lg min-w-[220px]">
        <div className="text-xs text-muted mb-1">Commit on next conquest</div>
        <div className="flex items-center gap-2">
          <input
            id={sliderId}
            type="range"
            min={1}
            max={pos.max}
            value={Math.min(value, pos.max)}
            onChange={(e) => setValue(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
            className="w-40"
          />
          <div className="w-10 text-right text-sm">{Math.min(value, pos.max)}</div>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => dispatch(hideConquestOverlay())}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => {
              dispatch(setAttackCommit(Math.min(value, pos.max)))
              dispatch(hideConquestOverlay())
            }}
            title="Save default move amount"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
