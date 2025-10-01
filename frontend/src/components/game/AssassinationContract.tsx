import type { FC } from 'react'
import { getColorValue } from '@/constants/colors'
import type { GamePlayer } from '@/types/game'

type AssassinationContractProps = {
  target?: GamePlayer
  territoryCount: number
  armyCount: number
  awaiting?: boolean
  eliminated?: boolean
  isSpectator?: boolean
  onPing?: () => void
  canPing?: boolean
}

/**
 * Displays the active assassination target for the local player.
 */
export const AssassinationContract: FC<AssassinationContractProps> = ({
  target,
  territoryCount,
  armyCount,
  awaiting = false,
  eliminated = false,
  isSpectator = false,
  onPing,
  canPing = false,
}) => {
  const colorValue = target ? (getColorValue(target.color) ?? target.color) : undefined

  return (
    <div className="border-b border-[color:var(--panel-border)] bg-[color:var(--surface-2)] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--panel-border)] text-lg"
            style={{
              backgroundColor: colorValue ? `${colorValue}1a` : 'var(--surface-1)',
              color: colorValue ?? 'var(--text)',
            }}
            aria-hidden="true"
          >
            🎯
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Your contract
            </p>
            {isSpectator ? (
              <p className="text-sm text-muted">Spectators cannot view assassination contracts.</p>
            ) : awaiting ? (
              <p className="text-sm text-muted">Waiting for assignment…</p>
            ) : target ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[color:var(--heading)]">
                  {target.username}
                </p>
                <p className="text-xs text-muted">
                  {eliminated
                    ? 'Target eliminated. Victory will resolve shortly.'
                    : `${territoryCount} ${territoryCount === 1 ? 'territory' : 'territories'} • ${armyCount} armies`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">Contract unavailable.</p>
            )}
          </div>
        </div>
        {!isSpectator && target && (
          <div className="flex items-center gap-2">
            {eliminated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-3)] px-3 py-1 text-xs font-medium text-[color:var(--heading)]">
                ✅ Target neutralized
              </span>
            )}
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={!canPing || eliminated}
              onClick={() => onPing?.()}
            >
              {eliminated
                ? 'Await results'
                : canPing
                  ? 'Ping last known location'
                  : 'No territory to ping'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
